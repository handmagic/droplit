// ============================================
// DROPLIT TTS OpenAI Stream v1.0
// Sentence-by-sentence streaming via gpt-4o-mini-tts
// Integrates with ASKI streaming responses
// 
// Architecture:
//   SSE stream → sentence buffer → parallel TTS fetch → AudioContext gapless playback
//
// Key features:
//   - ~800ms to first sound (vs 18-25s waiting for full text)
//   - gpt-4o-mini-tts with instructions for tone control
//   - Gapless AudioContext scheduling (no pauses between sentences)
//   - Session-aware (respects audio session for stop/cancel)
//   - Automatic fallback if fetch fails
// ============================================

class OpenAIStreamingTTS {
  constructor() {
    // State
    this.isActive = false;
    this.buffer = '';
    this.sentenceQueue = [];       // Sentences waiting for TTS
    this.audioQueue = [];          // Decoded AudioBuffers waiting for playback
    this.scheduledSources = [];    // Currently scheduled AudioBufferSource nodes
    this.nextStartTime = 0;        // For gapless scheduling
    this.playbackStarted = false;
    this.allTextReceived = false;   // flush() was called
    this.pendingFetches = 0;        // In-flight TTS requests
    this.totalSentences = 0;
    this.playedSentences = 0;
    this.sessionId = 0;            // Audio session for cancel detection
    
    // Callbacks
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    
    // Config
    this.minChunkLength = 30;      // Min chars before sending (short sentences OK for streaming)
    this.maxChunkLength = 500;     // Max chars per TTS request (gpt-4o-mini-tts limit ~1500 chars)
    this.maxParallelFetches = 3;   // Parallel TTS requests
    // Sentence endings: English, Russian, Chinese, Japanese
    this.sentenceEndRegex = /[.!?;…\n。！？]/;
    // Also break on colon/dash if chunk is long enough
    this.softBreakRegex = /[:–—,]/;
    
    // AudioContext (reuse global if available)
    this.audioContext = null;
    
    console.log('[OpenAI Stream TTS v1.0] Module created');
  }
  
  // ─── PUBLIC API ───
  
  /**
   * Start a new streaming session.
   * Call this BEFORE feeding text.
   * Returns true if ready.
   */
  start() {
    const apiKey = localStorage.getItem('openai_tts_key');
    if (!apiKey || !apiKey.startsWith('sk-')) {
      console.error('[OpenAI Stream TTS] No valid API key');
      return false;
    }
    
    // Get or create AudioContext
    if (typeof getAudioContext === 'function') {
      this.audioContext = getAudioContext();
    } else if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Capture audio session
    this.sessionId = window.getAudioSessionId ? window.getAudioSessionId() : 0;
    
    // Reset state
    this.isActive = true;
    this.buffer = '';
    this.sentenceQueue = [];
    this.audioQueue = [];
    this.scheduledSources = [];
    this.nextStartTime = 0;
    this.playbackStarted = false;
    this.allTextReceived = false;
    this.pendingFetches = 0;
    this.totalSentences = 0;
    this.playedSentences = 0;
    
    console.log('[OpenAI Stream TTS] Session started');
    return true;
  }
  
  /**
   * Feed text chunk from SSE stream.
   * Automatically buffers and sends complete sentences to TTS.
   */
  feedText(text) {
    if (!this.isActive) return;
    
    this.buffer += text;
    
    // Try to extract complete sentences from buffer
    this._extractSentences();
  }
  
  /**
   * Signal end of text input.
   * Sends remaining buffer to TTS and waits for all audio to finish.
   */
  finish() {
    if (!this.isActive) return;
    
    console.log('[OpenAI Stream TTS] Finishing, remaining buffer:', this.buffer.length, 'chars');
    
    // Send any remaining text as final sentence
    if (this.buffer.trim().length > 0) {
      this._sendSentence(this.buffer.trim());
      this.buffer = '';
    }
    
    this.allTextReceived = true;
    
    // If no sentences were sent at all, signal completion
    if (this.totalSentences === 0) {
      console.log('[OpenAI Stream TTS] No sentences to speak');
      this.isActive = false;
      if (this.onEnd) this.onEnd();
    }
    
    // Otherwise, _checkComplete() will fire onEnd when all audio finishes
  }
  
  /**
   * Cancel everything — stop playback, abort fetches, reset.
   */
  stop() {
    console.log('[OpenAI Stream TTS] Stopping');
    
    // Stop all scheduled audio
    this.scheduledSources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.scheduledSources = [];
    
    // Reset
    this.isActive = false;
    this.buffer = '';
    this.sentenceQueue = [];
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.playbackStarted = false;
    this.allTextReceived = true;
    this.pendingFetches = 0;
    
    // Don't call onEnd — this is a forced stop
  }
  
  /**
   * Alias for stop() — compatibility with StreamingTTS interface.
   */
  cancel() {
    this.stop();
  }
  
  // ─── PRIVATE METHODS ───
  
  /**
   * Extract complete sentences from buffer and queue them for TTS.
   */
  _extractSentences() {
    while (true) {
      const trimmed = this.buffer.trim();
      if (trimmed.length === 0) break;
      
      // Look for sentence end
      let breakIndex = -1;
      
      for (let i = 0; i < this.buffer.length; i++) {
        const char = this.buffer[i];
        
        if (this.sentenceEndRegex.test(char)) {
          // Found sentence end — check if we have enough text
          const candidate = this.buffer.substring(0, i + 1).trim();
          if (candidate.length >= this.minChunkLength) {
            breakIndex = i + 1;
            break;
          }
          // If sentence is too short, continue accumulating
          // But if the next char starts a new sentence (uppercase or space), break anyway
          if (candidate.length > 0 && i + 2 < this.buffer.length) {
            const nextChar = this.buffer[i + 1];
            const charAfter = this.buffer[i + 2];
            if (nextChar === ' ' && /[A-ZА-ЯЁ]/.test(charAfter)) {
              breakIndex = i + 1;
              break;
            }
          }
        }
        
        // Soft break for long chunks (comma, colon, dash)
        if (this.buffer.length > this.maxChunkLength * 0.7 && this.softBreakRegex.test(char)) {
          const candidate = this.buffer.substring(0, i + 1).trim();
          if (candidate.length >= this.minChunkLength) {
            breakIndex = i + 1;
            break;
          }
        }
      }
      
      // Hard break if buffer exceeds max
      if (breakIndex === -1 && this.buffer.length > this.maxChunkLength) {
        // Find last space within limit
        const lastSpace = this.buffer.lastIndexOf(' ', this.maxChunkLength);
        breakIndex = lastSpace > this.minChunkLength ? lastSpace + 1 : this.maxChunkLength;
      }
      
      if (breakIndex === -1) {
        // No complete sentence yet — keep buffering
        break;
      }
      
      // Extract sentence
      const sentence = this.buffer.substring(0, breakIndex).trim();
      this.buffer = this.buffer.substring(breakIndex);
      
      if (sentence.length > 0) {
        this._sendSentence(sentence);
      }
    }
  }
  
  /**
   * Send a sentence to gpt-4o-mini-tts and queue result for playback.
   */
  _sendSentence(sentence) {
    if (!this.isActive) return;
    
    // Session check
    if (window.canPlayAudio && !window.canPlayAudio(this.sessionId)) {
      console.log('[OpenAI Stream TTS] Session expired, skipping sentence');
      return;
    }
    
    const sentenceIndex = this.totalSentences++;
    console.log(`[OpenAI Stream TTS] Sending sentence ${sentenceIndex}: "${sentence.substring(0, 60)}${sentence.length > 60 ? '...' : ''}" (${sentence.length} chars)`);
    
    this.pendingFetches++;
    this._fetchTTS(sentence, sentenceIndex);
  }
  
  /**
   * Fetch audio from OpenAI TTS API.
   */
  async _fetchTTS(sentence, index) {
    const apiKey = localStorage.getItem('openai_tts_key');
    const voice = localStorage.getItem('aski_voice') || 'nova';
    const instructions = localStorage.getItem('openai_tts_instructions') || '';
    
    try {
      const body = {
        model: 'gpt-4o-mini-tts',
        input: sentence,
        voice: voice,
        response_format: 'mp3'
      };
      
      // Add instructions if set
      if (instructions.trim()) {
        body.instructions = instructions.trim();
      }
      
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`TTS API error ${response.status}: ${errData.error?.message || 'unknown'}`);
      }
      
      // Session check after fetch
      if (!this.isActive) return;
      if (window.canPlayAudio && !window.canPlayAudio(this.sessionId)) {
        console.log('[OpenAI Stream TTS] Session expired after fetch');
        return;
      }
      
      // Decode audio
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      // Resume AudioContext if needed
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      console.log(`[OpenAI Stream TTS] Sentence ${index} audio ready: ${audioBuffer.duration.toFixed(2)}s`);
      
      // Schedule for playback
      this._scheduleAudio(audioBuffer, index);
      
    } catch (error) {
      console.error(`[OpenAI Stream TTS] Sentence ${index} failed:`, error);
      if (this.onError) this.onError(error);
    } finally {
      this.pendingFetches--;
      this._checkComplete();
    }
  }
  
  /**
   * Schedule audio buffer for gapless playback.
   */
  _scheduleAudio(audioBuffer, index) {
    if (!this.isActive) return;
    
    // Session check
    if (window.canPlayAudio && !window.canPlayAudio(this.sessionId)) {
      return;
    }
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    // Calculate gapless start time
    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    
    // Track source for cleanup
    this.scheduledSources.push(source);
    
    // First audio — notify start
    if (!this.playbackStarted) {
      this.playbackStarted = true;
      console.log('[OpenAI Stream TTS] ▶ First audio playing');
      if (this.onStart) this.onStart();
    }
    
    // Cleanup when buffer finishes
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx > -1) this.scheduledSources.splice(idx, 1);
      this.playedSentences++;
      
      console.log(`[OpenAI Stream TTS] Sentence done: ${this.playedSentences}/${this.totalSentences}`);
      this._checkComplete();
    };
  }
  
  /**
   * Check if all audio has finished playing.
   */
  _checkComplete() {
    if (!this.allTextReceived) return;
    if (this.pendingFetches > 0) return;
    if (this.scheduledSources.length > 0) return;
    if (this.playedSentences < this.totalSentences) return;
    
    // All done!
    console.log('[OpenAI Stream TTS] ★ All audio complete');
    this.isActive = false;
    if (this.onEnd) this.onEnd();
  }
}

// ============================================
// GLOBAL INSTANCE — same interface as StreamingTTS (ElevenLabs)
// ============================================
const openAIStreamingTTS = new OpenAIStreamingTTS();

// Export globally for chat.js
window.OpenAIStreamingTTS = openAIStreamingTTS;

console.log('[TTS OpenAI Stream] Module v1.0 loaded');
