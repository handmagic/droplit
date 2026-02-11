// ============================================================
// kokoro-tts.js — Kokoro TTS Provider for DropLit
// Version: 1.1 — Optimized latency
//
// v1.1 Changes:
//   - AudioContext direct PCM playback (skip WAV encoding ~100ms)
//   - Persistent AudioContext (no per-sentence setup)
//   - Reduced inter-sentence gap (30ms → 10ms)
//   - Early first-sentence prefetch
//   - streamSpeak() API for streaming LLM integration
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
  let kokoroInstance = null;
  let kokoroModule = null;
  let isLoading = false;
  let isReady = false;
  let isSpeaking = false;
  let currentSource = null;     // v1.1: AudioBufferSourceNode
  let audioCtx = null;          // v1.1: Persistent AudioContext
  let loadPromise = null;

  // ── Config ──
  const CONFIG = {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
    modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    defaultVoice: 'af_heart',
    defaultSpeed: 1.0,
    preferWebGPU: true,
    trimSilence: true,
    trimThreshold: 0.01,
    sentenceGap: 10, // v1.1: Reduced from 30ms
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

  // ── v1.1: Persistent AudioContext ──
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
      if (!kokoroModule) {
        console.log('[Kokoro] Importing kokoro-js from CDN...');
        kokoroModule = await import(CONFIG.cdnUrl);
        console.log('[Kokoro] Module imported');
      }

      const backend = await detectBestBackend();
      console.log(`[Kokoro] Backend: ${backend.device}/${backend.dtype}`);

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

      // v1.1: Short warmup + AudioContext pre-init
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

  function trimTrailingSilence(rawAudio) {
    const data = rawAudio.audio ?? rawAudio.data;
    if (!data || !data.length) return rawAudio;
    const sr = rawAudio.sampling_rate || 24000;
    const threshold = CONFIG.trimThreshold;

    let end = data.length - 1;
    while (end > 0 && Math.abs(data[end]) < threshold) end--;
    end = Math.min(data.length - 1, end + Math.floor(sr * 0.05));
    if (end >= data.length - 100) return rawAudio;

    const trimmed = data.slice(0, end + 1);
    return { audio: trimmed, data: trimmed, sampling_rate: sr };
  }

  // WAV blob for external/fallback use
  function audioToWavBlob(rawAudio) {
    const data = rawAudio.audio ?? rawAudio.data;
    if (!data || !data.length) return null;
    const sr = rawAudio.sampling_rate || 24000;

    const numCh = 1, bps = 16;
    const byteRate = sr * numCh * bps / 8;
    const blockAlign = numCh * bps / 8;
    const dataSize = data.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
    w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, bps, true); w(36, 'data'); view.setUint32(40, dataSize, true);

    const out = new Int16Array(buffer, 44);
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767)));
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ── Sentence Splitting ──

  function splitIntoSentences(text) {
    const raw = text.match(/[^.!?]+[.!?]+[\s]*/g);
    if (!raw) return [text.trim()].filter(Boolean);

    const sentences = raw.map(s => s.trim()).filter(s => s.length > 0);
    const joined = sentences.join('');
    const remainder = text.slice(joined.length).trim();
    if (remainder) sentences.push(remainder);

    return sentences;
  }

  // ══════════════════════════════════════════════════════════════
  // v1.1: Direct PCM Playback via AudioContext
  // Skips WAV encoding entirely — ~100ms faster per sentence
  // ══════════════════════════════════════════════════════════════

  function playPCM(rawAudio) {
    return new Promise((resolve) => {
      const data = rawAudio.audio ?? rawAudio.data;
      if (!data || !data.length) { resolve(); return; }
      
      const sr = rawAudio.sampling_rate || 24000;
      const ctx = getAudioContext();
      
      const audioBuffer = ctx.createBuffer(1, data.length, sr);
      const channelData = audioBuffer.getChannelData(0);
      
      if (data instanceof Float32Array) {
        channelData.set(data);
      } else {
        for (let i = 0; i < data.length; i++) {
          channelData[i] = data[i];
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
  // speak() — Main function (sentence-by-sentence with prefetch)
  // v1.1: Uses direct PCM playback
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

    const sentences = splitIntoSentences(text);
    console.log(`[Kokoro] Speaking ${sentences.length} sentence(s), voice=${voice}, speed=${speed}`);

    isSpeaking = true;

    try {
      let nextGenPromise = null;
      let firstSoundLogged = false;
      const t0 = performance.now();

      const gen = (s) => kokoroInstance.generate(s, { voice, speed });

      // v1.1: Pre-start generating first sentence
      nextGenPromise = gen(sentences[0]);

      for (let i = 0; i < sentences.length; i++) {
        if (!isSpeaking) break;
        if (window.canPlayAudio && !window.canPlayAudio(sessionId)) {
          console.log('[Kokoro] Session expired, stopping');
          break;
        }

        let audio = await nextGenPromise;
        nextGenPromise = null;

        if (CONFIG.trimSilence) {
          audio = trimTrailingSilence(audio);
        }

        // Prefetch NEXT sentence during playback
        if (i + 1 < sentences.length && isSpeaking) {
          nextGenPromise = gen(sentences[i + 1]);
        }

        if (!firstSoundLogged) {
          const firstSoundMs = (performance.now() - t0).toFixed(0);
          console.log(`[Kokoro] ⚡ First sound in ${firstSoundMs}ms`);
          if (onStart) onStart();
          firstSoundLogged = true;
        }

        if (!isSpeaking) break;
        if (window.canPlayAudio && !window.canPlayAudio(sessionId)) break;

        // v1.1: Direct PCM playback
        await playPCM(audio);

        if (CONFIG.sentenceGap > 0 && i + 1 < sentences.length && isSpeaking) {
          await new Promise(r => setTimeout(r, CONFIG.sentenceGap));
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
  // v1.1: Stream Speak — for real-time LLM streaming integration
  // Usage:
  //   startStream({ onEnd, onStart })
  //   feedSentence("First sentence.")  // as sentences arrive
  //   feedSentence("Second sentence.")
  //   finishStream()  // when LLM done
  // ══════════════════════════════════════════════════════════════

  let streamQueue = [];
  let streamProcessing = false;
  let streamVoice = null;
  let streamSpeed = 1.0;
  let streamSessionId = 0;
  let streamOnEnd = null;
  let streamOnStart = null;
  let streamFirstSound = false;
  let streamT0 = 0;
  let streamFinished = false;

  function startStream(options = {}) {
    streamQueue = [];
    streamProcessing = false;
    streamVoice = options.voice || localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
    streamSpeed = options.speed || parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
    streamSessionId = options.sessionId || (window.getAudioSessionId ? window.getAudioSessionId() : 0);
    streamOnEnd = options.onEnd || null;
    streamOnStart = options.onStart || null;
    streamFirstSound = false;
    streamT0 = performance.now();
    streamFinished = false;
    isSpeaking = true;
    console.log('[Kokoro] Stream mode started');
  }

  function feedSentence(sentence) {
    if (!sentence?.trim() || !isSpeaking) return;
    streamQueue.push(sentence.trim());
    if (!streamProcessing) {
      _processStreamQueue();
    }
  }

  async function _processStreamQueue() {
    if (streamProcessing) return;
    streamProcessing = true;

    while (streamQueue.length > 0 && isSpeaking) {
      if (window.canPlayAudio && !window.canPlayAudio(streamSessionId)) break;

      const sentence = streamQueue.shift();
      
      let audio = await kokoroInstance.generate(sentence, { 
        voice: streamVoice, 
        speed: streamSpeed 
      });
      
      if (CONFIG.trimSilence) {
        audio = trimTrailingSilence(audio);
      }

      if (!streamFirstSound) {
        const ms = (performance.now() - streamT0).toFixed(0);
        console.log(`[Kokoro] ⚡ Stream first sound in ${ms}ms`);
        streamFirstSound = true;
        if (streamOnStart) streamOnStart();
      }

      if (!isSpeaking) break;
      if (window.canPlayAudio && !window.canPlayAudio(streamSessionId)) break;

      await playPCM(audio);

      if (CONFIG.sentenceGap > 0 && (streamQueue.length > 0 || !streamFinished) && isSpeaking) {
        await new Promise(r => setTimeout(r, CONFIG.sentenceGap));
      }
    }

    streamProcessing = false;

    if (streamFinished && streamQueue.length === 0) {
      isSpeaking = false;
      if (streamOnEnd) streamOnEnd();
    }
  }

  function finishStream() {
    streamFinished = true;
    if (!streamProcessing && streamQueue.length === 0) {
      isSpeaking = false;
      if (streamOnEnd) streamOnEnd();
    }
  }

  // ── Stop ──

  function stop() {
    isSpeaking = false;
    streamFinished = true;
    streamQueue = [];
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
    if (CONFIG.trimSilence) audio = trimTrailingSilence(audio);
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
    
    // v1.1: Streaming API
    startStream,
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

    CONFIG,
  };

  console.log('[Kokoro] Provider v1.1 loaded (AudioContext direct PCM playback)');
})();
