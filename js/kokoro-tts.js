// ============================================================
// kokoro-tts.js — Kokoro TTS Provider for DropLit
// Version: 1.0
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
  let isLoading = false;
  let isReady = false;
  let isSpeaking = false;
  let currentAudio = null;
  let loadPromise = null;

  // ── Config ──
  const CONFIG = {
    // CDN source for kokoro-js (ESM)
    cdnUrl: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
    // Model
    modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    // Default settings
    defaultVoice: 'af_heart',
    defaultSpeed: 1.0,
    // Backend selection (auto-detected)
    // webgpu = best quality, wasm = wider support
    preferWebGPU: true,
    // Trim trailing silence
    trimSilence: true,
    trimThreshold: 0.01,
    // Inter-sentence gap (ms)
    sentenceGap: 30,
  };

  // ── Available Voices ──
  const KOKORO_VOICES = {
    // American Female
    af_heart:   { name: 'Heart',    lang: 'EN-US', gender: 'female', desc: 'Warm, default' },
    af_sky:     { name: 'Sky',      lang: 'EN-US', gender: 'female', desc: 'Clear, bright' },
    af_bella:   { name: 'Bella',    lang: 'EN-US', gender: 'female', desc: 'Soft, gentle' },
    af_nicole:  { name: 'Nicole',   lang: 'EN-US', gender: 'female', desc: 'Professional' },
    af_sarah:   { name: 'Sarah',    lang: 'EN-US', gender: 'female', desc: 'Natural, casual' },
    af_nova:    { name: 'Nova',     lang: 'EN-US', gender: 'female', desc: 'Energetic' },
    // American Male
    am_adam:    { name: 'Adam',     lang: 'EN-US', gender: 'male',   desc: 'Deep, calm' },
    am_michael: { name: 'Michael',  lang: 'EN-US', gender: 'male',   desc: 'Neutral, clear' },
    // British Female
    bf_emma:    { name: 'Emma',     lang: 'EN-GB', gender: 'female', desc: 'British RP' },
    bf_isabella:{ name: 'Isabella', lang: 'EN-GB', gender: 'female', desc: 'Warm British' },
    // British Male
    bm_george:  { name: 'George',   lang: 'EN-GB', gender: 'male',   desc: 'British male' },
    bm_lewis:   { name: 'Lewis',    lang: 'EN-GB', gender: 'male',   desc: 'Authoritative' },
  };

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
      // 1. Dynamic import kokoro-js from CDN
      if (!kokoroModule) {
        console.log('[Kokoro] Importing kokoro-js from CDN...');
        kokoroModule = await import(CONFIG.cdnUrl);
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

      // 4. Warmup
      console.log('[Kokoro] Warming up...');
      const voice = localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
      await kokoroInstance.generate('test', { voice });

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

    // Add 50ms natural tail
    end = Math.min(data.length - 1, end + Math.floor(sr * 0.05));
    if (end >= data.length - 100) return rawAudio;

    const trimmed = data.slice(0, end + 1);
    return {
      audio: trimmed,
      data: trimmed,
      sampling_rate: sr
    };
  }

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
    // Split by sentence-ending punctuation, keeping the punctuation
    const raw = text.match(/[^.!?]+[.!?]+[\s]*/g);
    if (!raw) return [text.trim()].filter(Boolean);

    const sentences = raw.map(s => s.trim()).filter(s => s.length > 0);

    // If there's remaining text without ending punctuation, add it
    const joined = sentences.join('');
    const remainder = text.slice(joined.length).trim();
    if (remainder) sentences.push(remainder);

    return sentences;
  }

  // ── Speak (main function) ──
  // Generates sentence-by-sentence with prefetch pipeline
  // Compatible with AudioSession Manager

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

    // Split text into sentences
    const sentences = splitIntoSentences(text);
    console.log(`[Kokoro] Speaking ${sentences.length} sentence(s), voice=${voice}, speed=${speed}`);

    isSpeaking = true;

    try {
      let nextGenPromise = null;
      let nextGenStart = 0;
      let firstSoundLogged = false;
      const t0 = performance.now();

      const gen = (s) => kokoroInstance.generate(s, { voice, speed });

      for (let i = 0; i < sentences.length; i++) {
        // Session check — abort if session changed (new message, stop pressed)
        if (!isSpeaking) break;
        if (window.canPlayAudio && !window.canPlayAudio(sessionId)) {
          console.log('[Kokoro] Session expired, stopping');
          break;
        }

        const sentence = sentences[i];

        // Get audio (from prefetch or generate now)
        let audio;
        if (nextGenPromise) {
          audio = await nextGenPromise;
          nextGenPromise = null;
        } else {
          audio = await gen(sentence);
        }

        // Trim silence
        if (CONFIG.trimSilence) {
          audio = trimTrailingSilence(audio);
        }

        // Start prefetch for NEXT sentence (runs during playback)
        if (i + 1 < sentences.length && isSpeaking) {
          nextGenPromise = gen(sentences[i + 1]);
        }

        if (!firstSoundLogged) {
          const firstSoundMs = (performance.now() - t0).toFixed(0);
          console.log(`[Kokoro] First sound in ${firstSoundMs}ms`);
          if (onStart) onStart();
          firstSoundLogged = true;
        }

        // Convert to WAV blob and play
        const blob = audioToWavBlob(audio);
        if (!blob) continue;

        // Session check before play
        if (!isSpeaking) break;
        if (window.canPlayAudio && !window.canPlayAudio(sessionId)) break;

        await playBlob(blob);

        // Inter-sentence gap
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

  // ── Play single blob via Audio element ──

  function playBlob(blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);

      currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve();
      };
      currentAudio.onerror = (e) => {
        console.error('[Kokoro] Playback error:', e);
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve();
      };

      currentAudio.play().catch(e => {
        console.error('[Kokoro] Play failed:', e);
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve();
      });
    });
  }

  // ── Stop ──

  function stop() {
    isSpeaking = false;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }

  // ── Generate single blob (for external use) ──
  // Returns WAV Blob without playing

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
    // Lifecycle
    loadModel,
    stop,

    // Main speak function (sentence-by-sentence with prefetch)
    speak,

    // Generate blob without playing
    generateBlob,

    // Settings
    getVoice,
    setVoice,
    getSpeed,
    setSpeed,

    // Read-only state
    get isReady() { return isReady; },
    get isLoading() { return isLoading; },
    get isSpeaking() { return isSpeaking; },
    get voices() { return KOKORO_VOICES; },

    // Config access
    CONFIG,
  };

  console.log('[Kokoro] Provider module loaded (lazy — model loads on first use)');
})();
