
// ============================================================
// kokoro-tts.js — Kokoro TTS Provider for DropLit
// Version: 2.0 — Web Worker Architecture
//
// v2.0 Changes:
//   - All ONNX/WASM inference moved to Web Worker (kokoro-worker.js)
//   - Main thread stays free — zero UI jank on mobile
//   - Smart backend detection: GPU capability check + caching
//   - AudioContext playback remains in main thread (required by browsers)
//   - Same public API as v1.2 — drop-in replacement
//
// v1.2 was: Native TextSplitterStream in main thread (blocked UI)
// v2.0 is:  Worker inference + main thread audio playback
//
// Local browser TTS: 82M params, StyleTTS 2, Apache 2.0
// Compatible with AudioSession Manager (tts.js v1.4+)
//
// Расположение: js/kokoro-tts.js
// Зависимости: js/kokoro-worker.js, tts.js (AudioSession)
// ============================================================

(function() {
  'use strict';

  // ── State ──
  let worker = null;
  let isLoading = false;
  let isReady = false;
  let isSpeaking = false;
  let hasNativeStream = false;
  let audioCtx = null;
  let currentSource = null;
  let pendingCallbacks = {};     // id → { resolve, reject }
  let callbackId = 0;
  let audioQueue = [];           // Queue of { buffer, sampleRate } for playback
  let isPlayingQueue = false;
  let speakOnEnd = null;         // Callback when speak/stream finishes
  let speakOnStart = null;       // Callback when first audio arrives
  let speakFirstSound = false;
  let speakSessionId = 0;

  // ── Config ──
  const CONFIG = {
    workerUrl: 'js/kokoro-worker.js',
    defaultVoice: 'af_heart',
    defaultSpeed: 1.0,
    preferWebGPU: true,
    sentenceGap: 5,
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

  // ══════════════════════════════════════════════════════════════
  // SMART BACKEND DETECTION
  // ══════════════════════════════════════════════════════════════

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
  }

  async function detectBestBackend() {
    // Check localStorage cache
    const cached = localStorage.getItem('kokoro_backend');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        console.log(`[Kokoro] Cached backend: ${parsed.device}/${parsed.dtype} (${parsed.reason})`);
        return parsed;
      } catch (e) {}
    }

    let result;

    if (isMobileDevice()) {
      // Mobile: check if GPU is high-end enough for fp32
      if (CONFIG.preferWebGPU && 'gpu' in navigator) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            const info = await adapter.requestAdapterInfo?.() || {};
            const desc = (info.description || info.device || '').toLowerCase();
            console.log(`[Kokoro] Mobile GPU: ${desc}`);

            // High-end: Adreno 7xx+, Mali-G7xx+, Apple GPU
            const isHighEnd = /adreno 7|adreno 8|mali-g7|mali-g8|apple/i.test(desc);
            if (isHighEnd) {
              result = { device: 'webgpu', dtype: 'fp32', reason: 'high-end mobile GPU: ' + desc };
            } else {
              result = { device: 'wasm', dtype: 'q8', reason: 'mobile GPU not high-end: ' + desc };
            }
          } else {
            result = { device: 'wasm', dtype: 'q8', reason: 'no WebGPU adapter on mobile' };
          }
        } catch (e) {
          result = { device: 'wasm', dtype: 'q8', reason: 'mobile WebGPU error' };
        }
      } else {
        result = { device: 'wasm', dtype: 'q8', reason: 'mobile, no WebGPU API' };
      }
    } else {
      // Desktop: prefer WebGPU
      if (CONFIG.preferWebGPU && 'gpu' in navigator) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            result = { device: 'webgpu', dtype: 'fp32', reason: 'desktop WebGPU' };
          } else {
            result = { device: 'wasm', dtype: 'q8', reason: 'desktop, no WebGPU adapter' };
          }
        } catch (e) {
          result = { device: 'wasm', dtype: 'q8', reason: 'desktop WebGPU error' };
        }
      } else {
        result = { device: 'wasm', dtype: 'q8', reason: 'WebGPU disabled/unavailable' };
      }
    }

    localStorage.setItem('kokoro_backend', JSON.stringify(result));
    console.log(`[Kokoro] Backend: ${result.device}/${result.dtype} (${result.reason})`);
    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // AUDIO CONTEXT & PLAYBACK (main thread — browser requirement)
  // ══════════════════════════════════════════════════════════════

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playPCM(float32Buffer, sampleRate) {
    return new Promise((resolve) => {
      if (!float32Buffer || !float32Buffer.byteLength) { resolve(); return; }

      const sr = sampleRate || 24000;
      const ctx = getAudioContext();
      const audioData = new Float32Array(float32Buffer);

      const audioBuffer = ctx.createBuffer(1, audioData.length, sr);
      audioBuffer.getChannelData(0).set(audioData);

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

  async function processAudioQueue() {
    if (isPlayingQueue) return;
    isPlayingQueue = true;

    while (audioQueue.length > 0) {
      if (!isSpeaking) { audioQueue = []; break; }

      if (window.canPlayAudio && !window.canPlayAudio(speakSessionId)) {
        audioQueue = [];
        break;
      }

      const { buffer, sampleRate } = audioQueue.shift();
      await playPCM(buffer, sampleRate);

      if (CONFIG.sentenceGap > 0 && isSpeaking && audioQueue.length > 0) {
        await new Promise(r => setTimeout(r, CONFIG.sentenceGap));
      }
    }

    isPlayingQueue = false;
  }

  // ══════════════════════════════════════════════════════════════
  // WORKER COMMUNICATION
  // ══════════════════════════════════════════════════════════════

  function initWorker() {
    if (worker) return;

    worker = new Worker(CONFIG.workerUrl, { type: 'module' });

    worker.onmessage = (event) => {
      const { id, type, payload } = event.data;

      // Responses with id → resolve pending promise
      if (id !== null && id !== undefined && pendingCallbacks[id]) {
        const { resolve, reject } = pendingCallbacks[id];
        delete pendingCallbacks[id];

        if (type === 'error') {
          reject(new Error(payload.message));
        } else {
          resolve({ type, payload });
        }
        return;
      }

      // Events (no id) — fire-and-forget from worker
      switch (type) {
        case 'progress':
          handleProgress(payload);
          break;

        case 'audioChunk':
          handleAudioChunk(payload);
          break;

        case 'streamStart':
          if (speakOnStart && !speakFirstSound) {
            speakFirstSound = true;
            speakOnStart();
          }
          break;

        case 'speakDone':
        case 'streamDone':
          handlePlaybackDone();
          break;

        case 'error':
          console.error('[Kokoro] Worker error:', payload.message);
          break;
      }
    };

    worker.onerror = (e) => {
      console.error('[Kokoro] Worker fatal:', e.message);
    };
  }

  function sendToWorker(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++callbackId;
      pendingCallbacks[id] = { resolve, reject };
      worker.postMessage({ id, type, payload });
    });
  }

  function fireToWorker(type, payload = {}) {
    worker.postMessage({ id: null, type, payload });
  }

  // ── Progress ──
  let progressCallback = null;

  function handleProgress(data) {
    if (progressCallback) {
      progressCallback(data.percent || 0, data.file || data.message || '');
    }
    if (data.percent && Math.round(data.percent) % 25 === 0) {
      console.log(`[Kokoro] ${data.message || data.stage}: ${Math.round(data.percent)}%`);
    }
  }

  // ── Audio chunk from worker ──
  function handleAudioChunk(payload) {
    if (!speakFirstSound && speakOnStart) {
      speakFirstSound = true;
      speakOnStart();
    }

    audioQueue.push({ buffer: payload.audio, sampleRate: payload.sampleRate || 24000 });
    processAudioQueue();
  }

  // ── Playback finished ──
  function handlePlaybackDone() {
    const checkDone = () => {
      if (audioQueue.length === 0 && !isPlayingQueue) {
        isSpeaking = false;
        if (speakOnEnd) {
          speakOnEnd();
          speakOnEnd = null;
        }
        speakOnStart = null;
      } else {
        setTimeout(checkDone, 50);
      }
    };
    checkDone();
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API — Same interface as v1.2 (drop-in replacement)
  // ══════════════════════════════════════════════════════════════

  async function loadModel(onProgress) {
    if (isReady) return true;

    isLoading = true;
    progressCallback = onProgress || null;

    try {
      initWorker();

      const backend = await detectBestBackend();
      getAudioContext(); // Pre-init (needs user gesture)

      const voice = localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
      const speed = parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);

      const result = await sendToWorker('init', { backend, voice, speed });

      isReady = true;
      isLoading = false;
      hasNativeStream = result.payload.hasNativeStream;
      progressCallback = null;

      console.log(`[Kokoro] ✅ Ready (${result.payload.backend}), stream: ${hasNativeStream}`);
      if (onProgress) onProgress(100, 'ready');
      return true;

    } catch (e) {
      isLoading = false;
      progressCallback = null;
      console.error('[Kokoro] Load failed:', e);
      throw e;
    }
  }

  async function speak(text, options = {}) {
    if (!isReady || !worker) {
      console.warn('[Kokoro] Not ready. Call loadModel() first.');
      return false;
    }

    const voice = options.voice || localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
    const speed = options.speed || parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
    speakSessionId = options.sessionId || (window.getAudioSessionId ? window.getAudioSessionId() : 0);
    speakOnEnd = options.onEnd || null;
    speakOnStart = options.onStart || null;
    speakFirstSound = false;
    isSpeaking = true;
    audioQueue = [];

    try {
      await sendToWorker('speak', { text, voice, speed });
    } catch (e) {
      console.error('[Kokoro] Speak error:', e);
      isSpeaking = false;
      if (speakOnEnd) speakOnEnd();
    }
    return true;
  }

  // ── Real-time LLM streaming ──

  function startStream(options = {}) {
    if (!isReady || !worker || !hasNativeStream) {
      console.warn('[Kokoro] Cannot stream — not ready or no TextSplitterStream');
      return false;
    }

    const voice = options.voice || localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
    const speed = options.speed || parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
    speakSessionId = options.sessionId || (window.getAudioSessionId ? window.getAudioSessionId() : 0);
    speakOnEnd = options.onEnd || null;
    speakOnStart = options.onStart || null;
    speakFirstSound = false;
    isSpeaking = true;
    audioQueue = [];

    sendToWorker('startStream', { voice, speed }).catch(e => {
      console.error('[Kokoro] Stream start error:', e);
    });

    console.log('[Kokoro] Stream started (Worker)');
    return true;
  }

  function pushText(text) {
    if (!isSpeaking || !worker) return;
    fireToWorker('pushText', { text });
  }

  function closeStream() {
    if (!worker) return;
    fireToWorker('closeStream');
    console.log('[Kokoro] Stream close requested');
  }

  // Legacy aliases
  function feedSentence(sentence) { pushText(sentence + ' '); }
  function finishStream() { closeStream(); }

  // ── Stop ──

  function stop() {
    isSpeaking = false;
    audioQueue = [];

    if (currentSource) {
      try { currentSource.stop(); } catch (e) {}
      currentSource = null;
    }
    if (worker) fireToWorker('stop');
  }

  // ── Generate blob (rarely used) ──

  async function generateBlob(text, options = {}) {
    console.warn('[Kokoro] generateBlob: use speak() instead in v2.0');
    return null;
  }

  // ── Settings ──

  function getVoice() {
    return localStorage.getItem('kokoro_voice') || CONFIG.defaultVoice;
  }

  function setVoice(voiceId) {
    if (KOKORO_VOICES[voiceId]) {
      localStorage.setItem('kokoro_voice', voiceId);
      if (worker && isReady) fireToWorker('setVoice', { voice: voiceId });
      console.log('[Kokoro] Voice:', voiceId, KOKORO_VOICES[voiceId].name);
    }
  }

  function getSpeed() {
    return parseFloat(localStorage.getItem('kokoro_speed') || CONFIG.defaultSpeed);
  }

  function setSpeed(speed) {
    const s = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));
    localStorage.setItem('kokoro_speed', s.toString());
    if (worker && isReady) fireToWorker('setSpeed', { speed: s });
  }

  function resetBackendCache() {
    localStorage.removeItem('kokoro_backend');
    console.log('[Kokoro] Backend cache cleared — will re-detect on next load');
  }

  // ── Public API ──
  window.KokoroTTS = {
    loadModel,
    stop,
    speak,

    // Streaming API
    startStream,
    pushText,
    closeStream,

    // Legacy aliases
    feedSentence,
    finishStream,

    generateBlob,
    getVoice,
    setVoice,
    getSpeed,
    setSpeed,
    resetBackendCache,

    get isReady() { return isReady; },
    get isLoading() { return isLoading; },
    get isSpeaking() { return isSpeaking; },
    get voices() { return KOKORO_VOICES; },
    get hasNativeStream() { return hasNativeStream; },

    CONFIG,
  };

  console.log('[Kokoro] Provider v2.0 loaded (Web Worker architecture)');
})();
