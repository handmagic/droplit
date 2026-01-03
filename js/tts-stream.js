// ============================================
// DROPLIT TTS STREAM v1.0
// ElevenLabs WebSocket Streaming
// Real-time text-to-speech with minimal latency
// ============================================

class TTSStream {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.isConnected = false;
    this.voiceId = null;
    this.apiKey = null;
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    
    // Audio playback state
    this.nextStartTime = 0;
    this.scheduledBuffers = [];
  }
  
  // Initialize with API key and voice
  init(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId || 'gedzfqL7OGdPbwm0ynTP'; // Default: Nadia
    
    // Create AudioContext
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    console.log('[TTS Stream] Initialized with voice:', this.voiceId);
  }
  
  // Connect to ElevenLabs WebSocket
  async connect() {
    if (!this.apiKey) {
      throw new Error('API key not set. Call init() first.');
    }
    
    if (this.isConnected) {
      console.log('[TTS Stream] Already connected');
      return;
    }
    
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_multilingual_v2`;
      
      console.log('[TTS Stream] Connecting to:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[TTS Stream] WebSocket connected');
        
        // Send BOS (Beginning of Stream) message with settings
        const bosMessage = {
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          },
          xi_api_key: this.apiKey
        };
        
        this.ws.send(JSON.stringify(bosMessage));
        this.isConnected = true;
        resolve();
      };
      
      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.audio) {
            // Decode base64 audio and queue for playback
            const audioData = this.base64ToArrayBuffer(data.audio);
            await this.queueAudio(audioData);
          }
          
          if (data.isFinal) {
            console.log('[TTS Stream] Received final chunk');
          }
          
          if (data.error) {
            console.error('[TTS Stream] Server error:', data.error);
            if (this.onError) this.onError(data.error);
          }
          
        } catch (e) {
          console.error('[TTS Stream] Error processing message:', e);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[TTS Stream] WebSocket error:', error);
        this.isConnected = false;
        if (this.onError) this.onError(error);
        reject(error);
      };
      
      this.ws.onclose = (event) => {
        console.log('[TTS Stream] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;
        if (this.onEnd) this.onEnd();
      };
    });
  }
  
  // Send text chunk for synthesis
  sendText(text) {
    if (!this.isConnected || !this.ws) {
      console.warn('[TTS Stream] Not connected, cannot send text');
      return false;
    }
    
    if (!text || text.trim() === '') {
      return false;
    }
    
    console.log('[TTS Stream] Sending text:', text.substring(0, 50) + '...');
    
    const message = {
      text: text,
      try_trigger_generation: true
    };
    
    this.ws.send(JSON.stringify(message));
    return true;
  }
  
  // Signal end of text input
  flush() {
    if (!this.isConnected || !this.ws) {
      return;
    }
    
    console.log('[TTS Stream] Flushing (EOS)');
    
    // Send EOS (End of Stream) message
    const eosMessage = {
      text: ''
    };
    
    this.ws.send(JSON.stringify(eosMessage));
  }
  
  // Close connection
  disconnect() {
    if (this.ws) {
      console.log('[TTS Stream] Disconnecting');
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.stopPlayback();
  }
  
  // Convert base64 to ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  // Queue audio chunk for playback
  async queueAudio(arrayBuffer) {
    try {
      // Resume AudioContext if suspended (mobile browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Decode audio data (MP3)
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      
      // Schedule playback
      this.scheduleBuffer(audioBuffer);
      
      // Notify start on first chunk
      if (!this.isPlaying) {
        this.isPlaying = true;
        console.log('[TTS Stream] Audio playback started');
        if (this.onStart) this.onStart();
      }
      
    } catch (e) {
      console.error('[TTS Stream] Error decoding audio:', e);
    }
  }
  
  // Schedule audio buffer for gapless playback
  scheduleBuffer(audioBuffer) {
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    // Calculate start time for gapless playback
    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    
    // Track for cleanup
    this.scheduledBuffers.push(source);
    
    // Cleanup when done
    source.onended = () => {
      const index = this.scheduledBuffers.indexOf(source);
      if (index > -1) {
        this.scheduledBuffers.splice(index, 1);
      }
      
      // Check if all playback finished
      if (this.scheduledBuffers.length === 0 && !this.isConnected) {
        this.isPlaying = false;
        console.log('[TTS Stream] Audio playback ended');
        if (this.onEnd) this.onEnd();
      }
    };
  }
  
  // Stop all playback
  stopPlayback() {
    console.log('[TTS Stream] Stopping playback');
    
    this.scheduledBuffers.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors from already stopped sources
      }
    });
    
    this.scheduledBuffers = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
  }
  
  // Full stop - disconnect and stop audio
  stop() {
    this.disconnect();
    this.stopPlayback();
  }
}

// ============================================
// STREAMING TTS HELPER
// Integrates with ASKI streaming responses
// ============================================

class StreamingTTSHelper {
  constructor() {
    this.ttsStream = new TTSStream();
    this.buffer = '';
    this.sentenceEnders = /[.!?。！？\n]/;
    this.minChunkLength = 20; // Minimum chars before sending
    this.isActive = false;
  }
  
  // Start streaming session
  async start() {
    const apiKey = localStorage.getItem('elevenlabs_tts_key');
    const voiceId = localStorage.getItem('elevenlabs_voice_id') || 'gedzfqL7OGdPbwm0ynTP';
    
    if (!apiKey) {
      console.error('[Streaming TTS] No API key');
      return false;
    }
    
    try {
      this.ttsStream.init(apiKey, voiceId);
      await this.ttsStream.connect();
      this.isActive = true;
      this.buffer = '';
      console.log('[Streaming TTS] Session started');
      return true;
    } catch (e) {
      console.error('[Streaming TTS] Failed to start:', e);
      return false;
    }
  }
  
  // Feed text chunk from ASKI streaming
  feedText(text) {
    if (!this.isActive) return;
    
    this.buffer += text;
    
    // Check if we have a complete sentence or enough text
    const lastChar = this.buffer.trim().slice(-1);
    const isSentenceEnd = this.sentenceEnders.test(lastChar);
    const isLongEnough = this.buffer.length >= this.minChunkLength;
    
    if (isSentenceEnd || (isLongEnough && this.buffer.includes(' '))) {
      // Send buffer to TTS
      this.ttsStream.sendText(this.buffer);
      this.buffer = '';
    }
  }
  
  // Finish streaming - send remaining buffer
  finish() {
    if (!this.isActive) return;
    
    // Send any remaining text
    if (this.buffer.trim()) {
      this.ttsStream.sendText(this.buffer);
      this.buffer = '';
    }
    
    // Signal end of input
    this.ttsStream.flush();
    this.isActive = false;
    
    console.log('[Streaming TTS] Session finished');
  }
  
  // Cancel streaming
  cancel() {
    this.ttsStream.stop();
    this.isActive = false;
    this.buffer = '';
    console.log('[Streaming TTS] Session cancelled');
  }
  
  // Set callbacks
  onStart(callback) {
    this.ttsStream.onStart = callback;
  }
  
  onEnd(callback) {
    this.ttsStream.onEnd = callback;
  }
  
  onError(callback) {
    this.ttsStream.onError = callback;
  }
}

// ============================================
// GLOBAL INSTANCE
// ============================================
const streamingTTS = new StreamingTTSHelper();

// Export for use in chat.js
window.StreamingTTS = streamingTTS;
window.TTSStream = TTSStream;

console.log('[TTS Stream] Module loaded');
