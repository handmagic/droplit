// ============================================
// DROPLIT TTS OpenAI Stream v1.1
// Sentence-by-sentence streaming via gpt-4o-mini-tts
// Integrates with ASKI streaming responses
// 
// Architecture:
//   SSE stream → sentence buffer → parallel TTS fetch → ORDERED playback
//
// v1.0: Initial implementation
// v1.1: FIX ordered playback (sentences play in correct order)
//       FIX default instructions (neutral)
// ============================================

const OPENAI_TTS_DEFAULT_INSTRUCTIONS = 'Speak naturally at a normal conversational pace.';

class OpenAIStreamingTTS {
  constructor() {
    // State
    this.isActive = false;
    this.buffer = '';
    this.scheduledSources = [];    // Currently scheduled AudioBufferSource nodes
    this.nextStartTime = 0;        // For gapless scheduling
    this.playbackStarted = false;
    this.allTextReceived = false;   // flush() was called
    this.pendingFetches = 0;        // In-flight TTS requests
    this.totalSentences = 0;
    this.playedSentences = 0;
    this.sessionId = 0;            // Audio session for cancel detection
    
    // ORDERED QUEUE: stores {index, audioBuffer} — plays in order 0,1,2...
    this.readyBuffers = {};        // index → audioBuffer (arrived but not yet playable)
    this.nextPlayIndex = 0;        // Next sentence index to play
    
    // Callbacks
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    
    // Config
    this.minChunkLength = 30;
    this.maxChunkLength = 500;
    // Sentence endings: English, Russian, Chinese, Japanese
    this.sentenceEndRegex = /[.!?;…\n。！？]/;
    this.softBreakRegex = /[:–—,]/;
    
    // AudioContext (reuse global if available)
    this.audioContext = null;
    
    console.log('[OpenAI Stream TTS v1.1] Module created');
  }
  
  // ─── PUBLIC API ───
  
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
    this.scheduledSources = [];
    this.nextStartTime = 0;
    this.playbackStarted = false;
    this.allTextReceived = false;
    this.pendingFetches = 0;
    this.totalSentences = 0;
    this.playedSentences = 0;
    this.readyBuffers = {};
    this.nextPlayIndex = 0;
    
    console.log('[OpenAI Stream TTS] Session started');
    return true;
  }
  
  feedText(text) {
    if (!this.isActive) return;
    this.buffer += text;
    this._extractSentences();
  }
  
  finish() {
    if (!this.isActive) return;
    
    console.log('[OpenAI Stream TTS] Finishing, remaining buffer:', this.buffer.length, 'chars');
    
    if (this.buffer.trim().length > 0) {
      this._sendSentence(this.buffer.trim());
      this.buffer = '';
    }
    
    this.allTextReceived = true;
    
    if (this.totalSentences === 0) {
      console.log('[OpenAI Stream TTS] No sentences to speak');
      this.isActive = false;
      if (this.onEnd) this.onEnd();
    }
  }
  
  stop() {
    console.log('[OpenAI Stream TTS] Stopping');
    this.scheduledSources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.scheduledSources = [];
    this.isActive = false;
    this.buffer = '';
    this.readyBuffers = {};
    this.nextStartTime = 0;
    this.playbackStarted = false;
    this.allTextReceived = true;
    this.pendingFetches = 0;
  }
  
  cancel() { this.stop(); }
  
  // ─── PRIVATE: SENTENCE EXTRACTION ───
  
  _extractSentences() {
    while (true) {
      const trimmed = this.buffer.trim();
      if (trimmed.length === 0) break;
      
      let breakIndex = -1;
      
      for (let i = 0; i < this.buffer.length; i++) {
        const char = this.buffer[i];
        
        // Hard sentence end (.!? etc)
        if (this.sentenceEndRegex.test(char)) {
          const candidate = this.buffer.substring(0, i + 1).trim();
          if (candidate.length >= this.minChunkLength) {
            breakIndex = i + 1;
            break;
          }
          // Short sentence but next word starts with uppercase → still break
          if (candidate.length > 0 && i + 2 < this.buffer.length) {
            const nextChar = this.buffer[i + 1];
            const charAfter = this.buffer[i + 2];
            if (nextChar === ' ' && /[A-ZА-ЯЁ]/.test(charAfter)) {
              breakIndex = i + 1;
              break;
            }
          }
        }
        
        // Soft break for long chunks
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
        const lastSpace = this.buffer.lastIndexOf(' ', this.maxChunkLength);
        breakIndex = lastSpace > this.minChunkLength ? lastSpace + 1 : this.maxChunkLength;
      }
      
      if (breakIndex === -1) break;
      
      const sentence = this.buffer.substring(0, breakIndex).trim();
      this.buffer = this.buffer.substring(breakIndex);
      
      if (sentence.length > 0) {
        this._sendSentence(sentence);
      }
    }
  }
  
  // ─── PRIVATE: TTS FETCH ───
  
  _sendSentence(sentence) {
    if (!this.isActive) return;
    if (window.canPlayAudio && !window.canPlayAudio(this.sessionId)) return;
    
    const sentenceIndex = this.totalSentences++;
    console.log(`[OpenAI Stream TTS] → Sentence ${sentenceIndex}: "${sentence.substring(0, 60)}${sentence.length > 60 ? '...' : ''}" (${sentence.length} chars)`);
    
    this.pendingFetches++;
    this._fetchTTS(sentence, sentenceIndex);
  }
  
  async _fetchTTS(sentence, index) {
    const apiKey = localStorage.getItem('openai_tts_key');
    const voice = localStorage.getItem('aski_voice') || 'nova';
    const instructions = localStorage.getItem('openai_tts_instructions') || OPENAI_TTS_DEFAULT_INSTRUCTIONS;
    
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          input: sentence,
          voice: voice,
          response_format: 'mp3',
          instructions: instructions.trim()
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`TTS API error ${response.status}: ${errData.error?.message || 'unknown'}`);
      }
      
      if (!this.isActive) return;
      if (window.canPlayAudio && !window.canPlayAudio(this.sessionId)) return;
      
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      console.log(`[OpenAI Stream TTS] ✓ Sentence ${index} ready: ${audioBuffer.duration.toFixed(2)}s`);
      
      // Store in ordered queue and try to play next in sequence
      this.readyBuffers[index] = audioBuffer;
      this._playNextInOrder();
      
    } catch (error) {
      console.error(`[OpenAI Stream TTS] ✗ Sentence ${index} failed:`, error);
      // Mark as done (failed) so queue doesn't get stuck
      this.readyBuffers[index] = null;
      this._playNextInOrder();
      if (this.onError) this.onError(error);
    } finally {
      this.pendingFetches--;
      this._checkComplete();
    }
  }
  
  // ─── PRIVATE: ORDERED PLAYBACK ───
  
  /**
   * Play sentences strictly in order: 0, 1, 2, 3...
   * If sentence 2 arrives before sentence 1, it waits in readyBuffers.
   */
  _playNextInOrder() {
    while (this.nextPlayIndex in this.readyBuffers) {
      const audioBuffer = this.readyBuffers[this.nextPlayIndex];
      delete this.readyBuffers[this.nextPlayIndex];
      
      if (audioBuffer) {
        this._scheduleAudio(audioBuffer, this.nextPlayIndex);
      } else {
        // Failed sentence — skip, count as played
        this.playedSentences++;
        console.log(`[OpenAI Stream TTS] Skipping failed sentence ${this.nextPlayIndex}`);
      }
      
      this.nextPlayIndex++;
    }
  }
  
  _scheduleAudio(audioBuffer, index) {
    if (!this.isActive) return;
    if (window.canPlayAudio && !window.canPlayAudio(this.sessionId)) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    // Gapless: schedule right after previous buffer ends
    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    
    this.scheduledSources.push(source);
    
    // First audio — notify start
    if (!this.playbackStarted) {
      this.playbackStarted = true;
      console.log(`[OpenAI Stream TTS] ▶ Playing (sentence ${index} first)`);
      if (this.onStart) this.onStart();
    }
    
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx > -1) this.scheduledSources.splice(idx, 1);
      this.playedSentences++;
      console.log(`[OpenAI Stream TTS] Played: ${this.playedSentences}/${this.totalSentences}`);
      this._checkComplete();
    };
  }
  
  _checkComplete() {
    if (!this.allTextReceived) return;
    if (this.pendingFetches > 0) return;
    if (this.scheduledSources.length > 0) return;
    if (this.playedSentences < this.totalSentences) return;
    
    console.log('[OpenAI Stream TTS] ★ All audio complete');
    this.isActive = false;
    if (this.onEnd) this.onEnd();
  }
}

// ============================================
// GLOBAL INSTANCE
// ============================================
const openAIStreamingTTS = new OpenAIStreamingTTS();
window.OpenAIStreamingTTS = openAIStreamingTTS;

console.log('[TTS OpenAI Stream] Module v1.1 loaded');
