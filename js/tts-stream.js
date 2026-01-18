// ============================================
// DROPLIT TTS STREAM v1.4
// ElevenLabs WebSocket Streaming
// Real-time text-to-speech with minimal latency
// v1.2: flash model, auto_mode, jitter buffer
// v1.3: Fixed callback architecture, cleanup helper
// v1.4: Auto-end when all chunks played (don't wait for isFinal)
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
    this.audioEndedCount = 0;
    this.totalChunksReceived = 0;
    this.isFinalReceived = false;
    
    // FIX v1.2: Jitter buffer - collect chunks before playing
    this.pendingBuffers = [];
    this.jitterBufferSize = 2; // Wait for 2 chunks before starting
    this.playbackStarted = false;
  }
  
  // Initialize with API key and voice
  init(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId || 'gedzfqL7OGdPbwm0ynTP'; // Default: Nadia
    
    // Create AudioContext
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Reset state
    this.audioEndedCount = 0;
    this.totalChunksReceived = 0;
    this.isFinalReceived = false;
    this.scheduledBuffers = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
    
    // FIX v1.2: Reset jitter buffer
    this.pendingBuffers = [];
    this.playbackStarted = false;
    
    // FIX v1.4: Reset end detection
    this.endTimeout = null;
    this.endTriggered = false;
    
    console.log('[TTS Stream v1.4] Initialized with voice:', this.voiceId);
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
      // FIX v1.2: Use flash model for lowest latency + auto_mode
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_flash_v2_5&auto_mode=true`;
      
      console.log('[TTS Stream] Connecting to:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[TTS Stream] WebSocket connected');
        
        // Send BOS (Beginning of Stream) message with settings
        // FIX v1.2: Simplified settings, let auto_mode handle chunking
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
            this.totalChunksReceived++;
            console.log('[TTS Stream] Audio chunk received:', this.totalChunksReceived);
            // Decode base64 audio and queue for playback
            const audioData = this.base64ToArrayBuffer(data.audio);
            await this.queueAudio(audioData);
          }
          
          if (data.isFinal) {
            console.log('[TTS Stream] Received final marker');
            this.isFinalReceived = true;
            
            // FIX v1.2: Flush any pending buffers on final
            if (this.pendingBuffers.length > 0 && !this.playbackStarted) {
              this.playbackStarted = true;
              console.log('[TTS Stream] Final received, flushing', this.pendingBuffers.length, 'pending chunks');
              for (const buf of this.pendingBuffers) {
                this.scheduleBuffer(buf);
              }
              this.pendingBuffers = [];
              this.isPlaying = true;
              if (this.onStart) this.onStart();
            }
            
            this.checkPlaybackComplete();
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
    
    console.log('[TTS Stream] Sending text:', text.substring(0, 60) + (text.length > 60 ? '...' : ''));
    
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
    
    // Send flush to force generation of remaining text
    const flushMessage = {
      text: '',
      flush: true
    };
    
    this.ws.send(JSON.stringify(flushMessage));
  }
  
  // Close connection
  disconnect() {
    if (this.ws) {
      console.log('[TTS Stream] Disconnecting');
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
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
      
      // FIX v1.2: Jitter buffer - collect chunks before playing
      if (!this.playbackStarted) {
        this.pendingBuffers.push(audioBuffer);
        console.log('[TTS Stream] Buffering chunk:', this.pendingBuffers.length, '/', this.jitterBufferSize);
        
        // Start playback when we have enough chunks OR final received
        if (this.pendingBuffers.length >= this.jitterBufferSize || this.isFinalReceived) {
          this.playbackStarted = true;
          console.log('[TTS Stream] Jitter buffer full, starting playback');
          
          // Schedule all pending buffers
          for (const buf of this.pendingBuffers) {
            this.scheduleBuffer(buf);
          }
          this.pendingBuffers = [];
          
          // Notify start
          this.isPlaying = true;
          if (this.onStart) this.onStart();
        }
      } else {
        // Already playing - schedule immediately
        this.scheduleBuffer(audioBuffer);
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
      this.audioEndedCount++;
      console.log('[TTS Stream] Chunk ended:', this.audioEndedCount, '/', this.totalChunksReceived);
      
      // Check if all playback finished
      this.checkPlaybackComplete();
    };
  }
  
  // Check if all audio has finished playing
  checkPlaybackComplete() {
    console.log('[TTS Stream] Check complete:', {
      isFinal: this.isFinalReceived,
      scheduled: this.scheduledBuffers.length,
      ended: this.audioEndedCount,
      total: this.totalChunksReceived,
      playbackStarted: this.playbackStarted
    });
    
    // FIX v1.3: More robust completion check
    const allChunksPlayed = this.audioEndedCount >= this.totalChunksReceived && this.totalChunksReceived > 0;
    const noMoreBuffers = this.scheduledBuffers.length === 0;
    const noPendingBuffers = this.pendingBuffers.length === 0;
    
    // Original condition: wait for isFinal
    if (this.isFinalReceived && allChunksPlayed && noMoreBuffers && noPendingBuffers) {
      console.log('[TTS Stream] *** All audio playback completed (with isFinal) ***');
      this.triggerEnd();
    }
    // FIX v1.4: If all chunks played but no isFinal yet, wait 500ms then trigger
    else if (allChunksPlayed && noMoreBuffers && noPendingBuffers && !this.isFinalReceived && !this.endTimeout) {
      console.log('[TTS Stream] All chunks played, waiting 500ms for isFinal...');
      this.endTimeout = setTimeout(() => {
        if (!this.isFinalReceived) {
          console.log('[TTS Stream] *** Timeout - triggering end without isFinal ***');
          this.triggerEnd();
        }
      }, 500);
    }
    // FIX v1.2: If isFinal received but no audio came, trigger onEnd after short delay
    else if (this.isFinalReceived && this.totalChunksReceived === 0 && !this.endTimeout) {
      console.log('[TTS Stream] isFinal received but no audio chunks - triggering onEnd');
      this.endTimeout = setTimeout(() => {
        this.triggerEnd();
      }, 500);
    }
  }
  
  // Helper to trigger end callback
  triggerEnd() {
    if (this.endTriggered) return; // Prevent double trigger
    this.endTriggered = true;
    
    console.log('[TTS Stream] *** triggerEnd called ***');
    this.isPlaying = false;
    
    // Clear any pending timeouts
    if (this.endTimeout) {
      clearTimeout(this.endTimeout);
      this.endTimeout = null;
    }
    
    // Disconnect WebSocket
    this.disconnect();
    
    if (this.onEnd) {
      this.onEnd();
    }
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
    this.isFinalReceived = true; // Prevent onEnd from firing again
  }
  
  // Full stop - disconnect and stop audio
  stop() {
    this.stopPlayback();
    this.disconnect();
    if (this.onEnd) {
      this.onEnd();
    }
  }
}

// ============================================
// STREAMING TTS HELPER
// Integrates with ASKI streaming responses
// ============================================

class StreamingTTSHelper {
  constructor() {
    this.ttsStream = null;
    this.buffer = '';
    // Sentence endings including Russian
    this.sentenceEnders = /[.!?。！？\n]/;
    // Minimum chars before sending - larger = better quality
    this.minChunkLength = 80;
    this.isActive = false;
    this.endCallback = null;
    this.startCallback = null;
    this.errorCallback = null;
    this.fallbackTimeout = null;
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
      // Create fresh TTSStream for each session
      this.ttsStream = new TTSStream();
      
      // Set up callbacks BEFORE connecting
      this.ttsStream.onStart = () => {
        console.log('[Streaming TTS] Audio started');
        if (this.startCallback) this.startCallback();
      };
      
      this.ttsStream.onEnd = () => {
        console.log('[Streaming TTS] *** TTSStream.onEnd fired ***');
        this.cleanup();
        if (this.endCallback) {
          console.log('[Streaming TTS] Calling endCallback');
          this.endCallback();
        }
      };
      
      this.ttsStream.onError = (err) => {
        console.error('[Streaming TTS] Error:', err);
        this.cleanup();
        if (this.errorCallback) this.errorCallback(err);
        // On error, also call endCallback to unlock voice mode
        if (this.endCallback) this.endCallback();
      };
      
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
  
  // Cleanup helper
  cleanup() {
    if (this.fallbackTimeout) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }
    this.isActive = false;
  }
  
  // Feed text chunk from ASKI streaming
  feedText(text) {
    if (!this.isActive || !this.ttsStream) return;
    
    this.buffer += text;
    
    // Check if we have a complete sentence AND enough text
    const trimmed = this.buffer.trim();
    const lastChar = trimmed.slice(-1);
    const isSentenceEnd = this.sentenceEnders.test(lastChar);
    const isLongEnough = this.buffer.length >= this.minChunkLength;
    
    // Only send when we have a complete sentence with good length
    // This ensures better audio quality and natural speech
    if (isSentenceEnd && isLongEnough) {
      console.log('[Streaming TTS] Sending buffer:', this.buffer.length, 'chars');
      if (this.ttsStream) {
        this.ttsStream.sendText(this.buffer);
      }
      this.buffer = '';
    }
  }
  
  // Finish streaming - send remaining buffer
  finish() {
    if (!this.isActive) {
      console.log('[Streaming TTS] finish() called but not active');
      return;
    }
    
    console.log('[Streaming TTS] Finishing, remaining buffer:', this.buffer.length, 'chars');
    
    // Send any remaining text
    if (this.buffer.trim() && this.ttsStream) {
      this.ttsStream.sendText(this.buffer);
      this.buffer = '';
    }
    
    // Signal end of input
    if (this.ttsStream) {
      this.ttsStream.flush();
    }
    
    console.log('[Streaming TTS] Session finished, waiting for audio to complete');
    
    // FIX v1.2: Fallback timeout - if onEnd doesn't fire in 30s, force it
    this.fallbackTimeout = setTimeout(() => {
      console.log('[Streaming TTS] *** Fallback timeout triggered - forcing onEnd ***');
      this.cleanup();
      if (this.ttsStream) {
        this.ttsStream.disconnect();
      }
      if (this.endCallback) {
        this.endCallback();
      }
    }, 30000);
  }
  
  // Cancel streaming
  cancel() {
    this.cleanup();
    if (this.ttsStream) {
      this.ttsStream.stop();
    }
    this.buffer = '';
    console.log('[Streaming TTS] Session cancelled');
  }
  
  // Set callbacks - these are stored and applied when start() is called
  onStart(callback) {
    this.startCallback = callback;
  }
  
  onEnd(callback) {
    console.log('[Streaming TTS] onEnd callback registered');
    this.endCallback = callback;
  }
  
  onError(callback) {
    this.errorCallback = callback;
  }
}

// ============================================
// GLOBAL INSTANCE
// ============================================
const streamingTTS = new StreamingTTSHelper();

// Export for use in chat.js
window.StreamingTTS = streamingTTS;
window.TTSStream = TTSStream;

console.log('[TTS Stream] Module v1.4 loaded - auto-end when chunks complete');
