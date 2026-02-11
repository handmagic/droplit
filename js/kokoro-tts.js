// ============================================================
// kokoro-tts.js — Kokoro TTS Provider for DropLit
// Version: 1.2 — Native Streaming via TextSplitterStream
//
// v1.2 Changes:
//   - Uses native tts.stream() + TextSplitterStream (kokoro-js API)
//   - Fix: TextSplitterStream.close() called properly (kokoro-js bug)
//   - Real-time LLM streaming: pushText() as chunks arrive
//   - AudioContext direct PCM playback (from v1.1)
//   - Overlap pipeline: native stream handles prefetch internally
//
// Local browser TTS: 82M params, StyleTTS 2, Apache 2.0
// Lazy loading via dynamic import from CDN
// Compatible with AudioSession Manager (tts.js v1.4+)
//
// Расположение: js/kokoro-tts.js
// Зависимости: kokoro-js (loaded from CDN), tts.js (AudioSession)
// ============================================================

(function() {
  'use strict';

  // ── State ──
  let kokoroInstance = null;    // KokoroTTS instance
  let kokoroModule = null;      // Imported module (kokoro-js)
  let TextSplitterStream = null; // TextSplitterStream class from kokoro-js
  let isLoading = false;
  let isReady = false;
  let isSpeaking = false;
  let currentSource = null;     // AudioBufferSourceNode
  let audioCtx = null;          // Persistent AudioContext
  let loadPromise = null;
  let abortController = null;   // For cancelling stream playback

  // ── Config ──
  const CONFIG = {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
    modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    defaultVoice: 'af_heart',
    defaultSpeed: 1.0,
    preferWebGPU: true,
    trimSilence: true,
    trimThreshold: 0.01,
    sentenceGap: 5, // v1.2: Minimal gap, native stream handles timing
  };

  // ── Available Voices ──
  const KOKORO_VOICES = {
    af_heart:   { name: 'Heart',    lang: 'EN-US', gender: 'female', desc: 'Warm, default' },
    af_sky:     { name: 'Sky',      lang: 'EN-US', gender: 'female', desc: 'Clear, bright' },
    af_bella:   { name: 'Bella',    lang: 'EN-US', gender: 'female', desc: 'Soft, gentle' },
    af_nicole:  { name: 'Nicole',   lang: 'EN-US', gender: 'female', desc: 'Professional' },
    af_sarah:   { name: 'Sarah',    lang: 'EN-US', gender: 'female', desc: 'Natural, casual' },
    af_nova:    { name: 'Nova',     lang: 'EN-US', gender: 'female', desc: 'Energetic' },
    am_adam:    { name: 'Adam',     lang: 'EN-US', gender: 'male',   desc: 'Deep, calm' },
    am_michael: { name: 'Michael',  lang: 'EN-US', gender: 'male',   desc: 'Neutral, clear' },
    bf_emma:    { name: 'Emma',     lang: 'EN-GB', gender: 'female', desc: 'British RP' },
    bf_isabella:{ name: 'Isabella', lang: 'EN-GB', gender: 'female', desc: 'Warm British' },
    bm_george:  { name: 'George',   lang: 'EN-GB', gender: 'male',   desc: 'British male' },
    bm_lewis:   { name: 'Lewis',    lang: 'EN-GB', gender: 'male',   desc: 'Authoritative' },
  };

  // ── Persistent AudioContext ──
  function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // ── Device Detection ──
  async function detectBestBackend() {
    if (CONFIG.preferWebGPU && 'gpu' in navigator) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          console.log('[Kokoro] WebGPU available');
          return { device: 'webgpu', dtype: 'fp32' };
        }
      } catch(e) {
        console.log('[Kokoro] WebGPU check failed:', e.message);
      }
    }
    console.log('[Kokoro] Using WASM q8 backend');
    return { device: 'wasm', dtype: 'q8' };
  }

  // ── Load Model (lazy, cached) ──
  async function loadModel(onProgress) {
    if (isReady && kokoroInstance) return true;
    if (loadPromise) return loadPromise;

    loadPromise = _doLoadModel(onProgress);
    try {
      await loadPromise;
      return true;
    } catch(e) {
      loadPromise = null;
      throw e;
    }
  }

  async function _doLoadModel(onProgress) {
    if (isLoading) return;
    isLoading = true;

    console.log('[Kokoro] Loading model...');
    const t0 = performance.now();

    try {
      // 1. Dynamic import kokoro-js (includes TextSplitterStream)
      if (!kokoroModule) {
        console.log('[Kokoro] Importing kokoro-js from CDN...');
        kokoroModule = await import(CONFIG.cdnUrl);
        
        // Extract TextSplitterStream class
        TextSplitterStream = kokoroModule.TextSplitterStream;
        if (!TextSplitterStream) {
          console.warn('[Kokoro] TextSplitterStream not found in module, will use manual splitting');
        } else {
          console.log('[Kokoro] TextSplitterStream available ✓');
        }
        console.log('[Kokoro] Module imported');
      }

      // 2. Detect best backend
      const backend = await detectBestBackend();
      console.log(`[Kokoro] Backend: ${backend.device}/${backend.dtype}`);

      // 3. Load model
      kokoroInstance = await kokoroModule.KokoroTTS.from_pretrained(
        CONFIG.modelId,
        {
          dtype: backend.dtype,
          device: backend.device,
          progress_callback: (progress) => {
            if (progress.status === 'progress' && progress.progress) {
              const pct = Math.min(progress.progress, 99);
              if (onProgress) onProgress(pct, progress.file || '');
              if (Math.round(pct) % 25 === 0) {
                console.log(`[Kokoro] Download: ${Math.round(pct)}%`);
              }
            }
          }
        }
      );

      // 4. Short warmup + AudioContext pre-init
      console.log('[Kokoro] Warming up...');
      const voice = localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
      await kokoroInstance.generate('Hi.', { voice });
      getAudioContext();

      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`[Kokoro] ✅ Ready in ${elapsed}s (${backend.device}/${backend.dtype})`);

      isReady = true;
      isLoading = false;
      if (onProgress) onProgress(100, 'ready');

    } catch(e) {
      console.error('[Kokoro] Load failed:', e);
      isLoading = false;
      isReady = false;
      kokoroInstance = null;
      throw e;
    }
  }

  // ── Audio Utilities ──

  function trimTrailingSilence(audioData, sampleRate) {
    if (!audioData || !audioData.length) return audioData;
    const threshold = CONFIG.trimThreshold;

    let end = audioData.length - 1;
    while (end > 0 && Math.abs(audioData[end]) < threshold) end--;
    end = Math.min(audioData.length - 1, end + Math.floor(sampleRate * 0.05));
    if (end >= audioData.length - 100) return audioData;

    return audioData.slice(0, end + 1);
  }

  // WAV blob for external/fallback use
  function audioToWavBlob(rawAudio) {
    const data = rawAudio.audio ?? rawAudio.data;
    if (!data || !data.length) return null;
    const sr = rawAudio.sampling_rate || 24000;

    const dataSize = data.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
    w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, dataSize, true);

    const out = new Int16Array(buffer, 44);
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767)));
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ══════════════════════════════════════════════════════════════
  // Direct PCM Playback via AudioContext
  // ══════════════════════════════════════════════════════════════

  function playPCM(audioData, sampleRate) {
    return new Promise((resolve) => {
      if (!audioData || !audioData.length) { resolve(); return; }
      
      const sr = sampleRate || 24000;
      const ctx = getAudioContext();
      
      const audioBuffer = ctx.createBuffer(1, audioData.length, sr);
      const channelData = audioBuffer.getChannelData(0);
      
      if (audioData instanceof Float32Array) {
        channelData.set(audioData);
      } else {
        for (let i = 0; i < audioData.length; i++) {
          channelData[i] = audioData[i];
        }
      }
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      currentSource = source;
      
      source.onended = () => {
        currentSource = null;
        resolve();
      };
      
      source.start(0);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // speak() — Uses native tts.stream() with TextSplitterStream fix
  // The bug in kokoro-js: close() never called on internal splitter
  // Fix: create TextSplitterStream ourselves, push text, close()
  // ══════════════════════════════════════════════════════════════

  async function speak(text, options = {}) {
    if (!isReady || !kokoroInstance) {
      console.warn('[Kokoro] Not ready. Call loadModel() first.');
      return false;
    }

    const voice = options.voice || localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
    const speed = options.speed || parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
    const onEnd = options.onEnd || null;
    const onStart = options.onStart || null;
    const sessionId = options.sessionId || (window.getAudioSessionId ? window.getAudioSessionId() : 0);

    isSpeaking = true;
    abortController = { aborted: false };
    const t0 = performance.now();
    let firstSoundLogged = false;

    try {
      if (TextSplitterStream) {
        // ── Native streaming path (preferred) ──
        const splitter = new TextSplitterStream();
        splitter.push(text);
        splitter.close(); // ← THE FIX: flush last sentence

        const stream = kokoroInstance.stream(splitter, { voice, speed });

        for await (const chunk of stream) {
          if (!isSpeaking || abortController.aborted) break;
          if (window.canPlayAudio && !window.canPlayAudio(sessionId)) break;

          const audio = chunk.audio;
          if (!audio) continue;

          // Extract raw Float32 data
          let audioData = audio.data ?? audio.audio ?? audio;
          const sr = audio.sampling_rate ?? audio.sampleRate ?? 24000;

          if (CONFIG.trimSilence) {
            audioData = trimTrailingSilence(audioData, sr);
          }

          if (!firstSoundLogged) {
            const ms = (performance.now() - t0).toFixed(0);
            console.log(`[Kokoro] ⚡ First sound in ${ms}ms (native stream)`);
            if (onStart) onStart();
            firstSoundLogged = true;
          }

          if (!isSpeaking || abortController.aborted) break;
          await playPCM(audioData, sr);

          if (CONFIG.sentenceGap > 0 && isSpeaking) {
            await new Promise(r => setTimeout(r, CONFIG.sentenceGap));
          }
        }
      } else {
        // ── Fallback: manual sentence splitting + generate() ──
        console.log('[Kokoro] Fallback: manual sentence splitting');
        const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
        const gen = (s) => kokoroInstance.generate(s.trim(), { voice, speed });
        
        let nextGen = gen(sentences[0]);
        for (let i = 0; i < sentences.length; i++) {
          if (!isSpeaking || abortController.aborted) break;
          if (window.canPlayAudio && !window.canPlayAudio(sessionId)) break;

          const result = await nextGen;
          if (i + 1 < sentences.length) nextGen = gen(sentences[i + 1]);

          const audioData = result.audio ?? result.data;
          const sr = result.sampling_rate || 24000;
          const trimmed = CONFIG.trimSilence ? trimTrailingSilence(audioData, sr) : audioData;

          if (!firstSoundLogged) {
            console.log(`[Kokoro] ⚡ First sound in ${(performance.now() - t0).toFixed(0)}ms (fallback)`);
            if (onStart) onStart();
            firstSoundLogged = true;
          }

          if (!isSpeaking) break;
          await playPCM(trimmed, sr);
        }
      }
    } catch(e) {
      console.error('[Kokoro] Speak error:', e);
    }

    isSpeaking = false;
    if (onEnd) onEnd();
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // REAL-TIME LLM STREAMING
  //
  // For Ollama/Claude streaming: push text chunks as they arrive
  // Kokoro's TextSplitterStream handles sentence detection
  //
  // Usage:
  //   startStream({ onEnd, onStart })
  //   pushText("Hello, ")         // chunk from LLM
  //   pushText("how are you? ")   // another chunk
  //   pushText("I'm ASKI.")       // final chunk
  //   closeStream()               // LLM done, flush remaining
  // ══════════════════════════════════════════════════════════════

  let activeSplitter = null;
  let activeStreamLoop = null;
  let streamOnEnd = null;
  let streamOnStart = null;
  let streamFirstSound = false;
  let streamT0 = 0;
  let streamSessionId = 0;

  function startStream(options = {}) {
    if (!isReady || !kokoroInstance || !TextSplitterStream) {
      console.warn('[Kokoro] Cannot start stream — not ready or no TextSplitterStream');
      return false;
    }

    const voice = options.voice || localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
    const speed = options.speed || parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
    streamSessionId = options.sessionId || (window.getAudioSessionId ? window.getAudioSessionId() : 0);
    streamOnEnd = options.onEnd || null;
    streamOnStart = options.onStart || null;
    streamFirstSound = false;
    streamT0 = performance.now();
    isSpeaking = true;
    abortController = { aborted: false };

    // Create the splitter — we'll push text to it as it arrives
    activeSplitter = new TextSplitterStream();
    
    // Start the async playback loop
    const stream = kokoroInstance.stream(activeSplitter, { voice, speed });
    
    activeStreamLoop = (async () => {
      try {
        for await (const chunk of stream) {
          if (!isSpeaking || abortController.aborted) break;
          if (window.canPlayAudio && !window.canPlayAudio(streamSessionId)) break;

          const audio = chunk.audio;
          if (!audio) continue;

          let audioData = audio.data ?? audio.audio ?? audio;
          const sr = audio.sampling_rate ?? audio.sampleRate ?? 24000;

          if (CONFIG.trimSilence) {
            audioData = trimTrailingSilence(audioData, sr);
          }

          if (!streamFirstSound) {
            const ms = (performance.now() - streamT0).toFixed(0);
            console.log(`[Kokoro] ⚡ Stream first sound in ${ms}ms`);
            streamFirstSound = true;
            if (streamOnStart) streamOnStart();
          }

          if (!isSpeaking || abortController.aborted) break;
          await playPCM(audioData, sr);

          if (CONFIG.sentenceGap > 0 && isSpeaking) {
            await new Promise(r => setTimeout(r, CONFIG.sentenceGap));
          }
        }
      } catch(e) {
        if (isSpeaking) {
          console.error('[Kokoro] Stream playback error:', e);
        }
      }

      isSpeaking = false;
      activeSplitter = null;
      activeStreamLoop = null;
      if (streamOnEnd) streamOnEnd();
    })();

    console.log('[Kokoro] Stream started (native TextSplitterStream)');
    return true;
  }

  // Push raw text from LLM stream — TextSplitterStream detects sentences
  function pushText(text) {
    if (!activeSplitter || !isSpeaking) return;
    activeSplitter.push(text);
  }

  // LLM done — close splitter to flush remaining text
  function closeStream() {
    if (!activeSplitter) return;
    activeSplitter.close(); // ← Flushes last sentence
    console.log('[Kokoro] Stream closed (flushing remaining text)');
  }

  // Legacy aliases for compatibility with v1.1
  function feedSentence(sentence) {
    pushText(sentence + ' ');
  }
  function finishStream() {
    closeStream();
  }

  // ── Stop ──

  function stop() {
    isSpeaking = false;
    if (abortController) abortController.aborted = true;
    if (activeSplitter) {
      try { activeSplitter.close(); } catch(e) {}
      activeSplitter = null;
    }
    if (currentSource) {
      try { currentSource.stop(); } catch(e) {}
      currentSource = null;
    }
  }

  // ── Generate single blob (external use) ──

  async function generateBlob(text, options = {}) {
    if (!isReady || !kokoroInstance) return null;
    const voice = options.voice || localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
    const speed = options.speed || parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);

    let audio = await kokoroInstance.generate(text, { voice, speed });
    if (CONFIG.trimSilence) {
      const data = audio.audio ?? audio.data;
      const sr = audio.sampling_rate || 24000;
      // Use audioToWavBlob which expects the raw format
    }
    return audioToWavBlob(audio);
  }

  // ── Settings helpers ──

  function getVoice() {
    return localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
  }

  function setVoice(voiceId) {
    if (KOKORO_VOICES[voiceId]) {
      localStorage.setItem('kokoro_voice', voiceId);
      console.log('[Kokoro] Voice set:', voiceId, KOKORO_VOICES[voiceId].name);
    }
  }

  function getSpeed() {
    return parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
  }

  function setSpeed(speed) {
    const s = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));
    localStorage.setItem('kokoro_speed', s.toString());
  }

  // ── Public API ──
  window.KokoroTTS = {
    loadModel,
    stop,
    speak,
    
    // v1.2: Native streaming API
    startStream,
    pushText,      // Push raw LLM chunks
    closeStream,   // Flush when LLM done
    
    // v1.1 compat aliases
    feedSentence,
    finishStream,

    generateBlob,
    getVoice,
    setVoice,
    getSpeed,
    setSpeed,

    get isReady() { return isReady; },
    get isLoading() { return isLoading; },
    get isSpeaking() { return isSpeaking; },
    get voices() { return KOKORO_VOICES; },
    get hasNativeStream() { return !!TextSplitterStream; },

    CONFIG,
  };

  console.log('[Kokoro] Provider v1.2 loaded (native TextSplitterStream)');
})();
