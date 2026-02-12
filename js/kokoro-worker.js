// ============================================================
// kokoro-worker.js — Web Worker for Kokoro TTS ONNX Inference
// Version: 1.0
//
// All heavy WASM/WebGPU inference runs in this Worker thread.
// Main thread stays free for UI — no jank, no freezes.
//
// Protocol: postMessage({ id, type, payload }) → response({ id, type, payload })
// Types: init, speak, startStream, pushText, closeStream, stop, setVoice, setSpeed
//
// Audio data is transferred back via Transferable (zero-copy).
//
// Расположение: js/kokoro-worker.js
// Зависимости: kokoro-js (CDN), onnxruntime-web (via kokoro-js)
// ============================================================

let kokoroInstance = null;
let kokoroModule = null;
let TextSplitterStream = null;
let isReady = false;
let isLoading = false;

let currentVoice = 'af_heart';
let currentSpeed = 1.0;
let isSpeaking = false;
let abortFlag = false;

// Active stream state
let activeSplitter = null;
let activeStreamPromise = null;

const CONFIG = {
  cdnUrl: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  trimSilence: true,
  trimThreshold: 0.01,
};

// ─── MESSAGE HANDLER ─────────────────────────────────────

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'init':
        await handleInit(id, payload);
        break;

      case 'speak':
        await handleSpeak(id, payload);
        break;

      case 'startStream':
        handleStartStream(id, payload);
        break;

      case 'pushText':
        handlePushText(id, payload);
        break;

      case 'closeStream':
        handleCloseStream(id);
        break;

      case 'stop':
        handleStop(id);
        break;

      case 'setVoice':
        currentVoice = payload.voice;
        respond(id, 'voiceSet', { voice: currentVoice });
        break;

      case 'setSpeed':
        currentSpeed = Math.max(0.5, Math.min(2.0, parseFloat(payload.speed) || 1.0));
        respond(id, 'speedSet', { speed: currentSpeed });
        break;

      case 'ping':
        respond(id, 'pong', { ready: isReady, loading: isLoading, speaking: isSpeaking });
        break;

      default:
        respond(id, 'error', { message: `Unknown type: ${type}` });
    }
  } catch (error) {
    console.error('[Kokoro Worker] Error:', error);
    respond(id, 'error', { message: error.message });
  }
};

// ─── INIT: Load kokoro-js + model ────────────────────────

async function handleInit(id, payload = {}) {
  if (isReady) {
    respond(id, 'ready', { cached: true });
    return;
  }

  if (isLoading) {
    respond(id, 'error', { message: 'Already loading' });
    return;
  }

  isLoading = true;
  const t0 = performance.now();

  const backend = payload.backend || { device: 'wasm', dtype: 'q8' };
  currentVoice = payload.voice || 'af_heart';
  currentSpeed = payload.speed || 1.0;

  try {
    // 1. Import kokoro-js
    sendProgress({ stage: 'importing', percent: 0, message: 'Loading kokoro-js...' });
    kokoroModule = await import(CONFIG.cdnUrl);

    TextSplitterStream = kokoroModule.TextSplitterStream || null;
    console.log('[Kokoro Worker] Module imported, TextSplitterStream:', !!TextSplitterStream);

    // 2. Load model with progress
    sendProgress({ stage: 'downloading', percent: 5, message: 'Downloading model...' });

    kokoroInstance = await kokoroModule.KokoroTTS.from_pretrained(
      CONFIG.modelId,
      {
        dtype: backend.dtype,
        device: backend.device,
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            const pct = Math.min(Math.round(progress.progress), 99);
            sendProgress({
              stage: 'downloading',
              percent: pct,
              file: progress.file || '',
              message: `Downloading: ${pct}%`
            });
          }
        }
      }
    );

    // 3. Warmup
    sendProgress({ stage: 'warmup', percent: 99, message: 'Warming up...' });
    await kokoroInstance.generate('Hi.', { voice: currentVoice });

    isReady = true;
    isLoading = false;

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    sendProgress({ stage: 'ready', percent: 100, message: 'Ready' });

    console.log(`[Kokoro Worker] ✅ Ready in ${elapsed}s (${backend.device}/${backend.dtype})`);
    respond(id, 'ready', {
      elapsed: parseFloat(elapsed),
      backend: `${backend.device}/${backend.dtype}`,
      hasNativeStream: !!TextSplitterStream
    });

  } catch (error) {
    isLoading = false;
    console.error('[Kokoro Worker] Init failed:', error);
    respond(id, 'error', { message: 'Model load failed: ' + error.message });
  }
}

// ─── SPEAK: Full text → audio chunks ─────────────────────

async function handleSpeak(id, payload) {
  if (!isReady || !kokoroInstance) {
    respond(id, 'error', { message: 'Model not loaded' });
    return;
  }

  const text = payload.text;
  const voice = payload.voice || currentVoice;
  const speed = payload.speed || currentSpeed;

  if (!text) {
    respond(id, 'error', { message: 'No text provided' });
    return;
  }

  isSpeaking = true;
  abortFlag = false;
  const t0 = performance.now();
  let firstChunk = true;

  try {
    if (TextSplitterStream) {
      // ── Native streaming path ──
      const splitter = new TextSplitterStream();
      splitter.push(text);
      splitter.close();

      const stream = kokoroInstance.stream(splitter, { voice, speed });

      for await (const chunk of stream) {
        if (!isSpeaking || abortFlag) break;

        const audio = chunk.audio;
        if (!audio) continue;

        let audioData = audio.data ?? audio.audio ?? audio;
        const sr = audio.sampling_rate ?? audio.sampleRate ?? 24000;

        if (CONFIG.trimSilence) {
          audioData = trimTrailingSilence(audioData, sr);
        }

        if (!audioData || !audioData.length) continue;

        // Convert to Float32Array for transfer
        const f32 = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);

        if (firstChunk) {
          const ms = (performance.now() - t0).toFixed(0);
          console.log(`[Kokoro Worker] ⚡ First sound in ${ms}ms`);
          firstChunk = false;
        }

        // Transfer buffer (zero-copy to main thread)
        respond(null, 'audioChunk', { audio: f32.buffer, sampleRate: sr, first: firstChunk }, [f32.buffer]);
      }

    } else {
      // ── Fallback: sentence splitting ──
      const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];

      for (let i = 0; i < sentences.length; i++) {
        if (!isSpeaking || abortFlag) break;

        const result = await kokoroInstance.generate(sentences[i].trim(), { voice, speed });
        const audioData = result.audio ?? result.data;
        const sr = result.sampling_rate || 24000;
        const trimmed = CONFIG.trimSilence ? trimTrailingSilence(audioData, sr) : audioData;

        if (!trimmed || !trimmed.length) continue;

        const f32 = trimmed instanceof Float32Array ? trimmed : new Float32Array(trimmed);

        if (firstChunk) {
          const ms = (performance.now() - t0).toFixed(0);
          console.log(`[Kokoro Worker] ⚡ First sound in ${ms}ms (fallback)`);
          firstChunk = false;
        }

        respond(null, 'audioChunk', { audio: f32.buffer, sampleRate: sr }, [f32.buffer]);
      }
    }
  } catch (e) {
    if (isSpeaking) {
      console.error('[Kokoro Worker] Speak error:', e);
    }
  }

  isSpeaking = false;
  respond(id, 'speakDone', {});
}

// ─── REAL-TIME LLM STREAMING ─────────────────────────────
// startStream → pushText (many) → closeStream
// Audio chunks sent back as they're generated

function handleStartStream(id, payload = {}) {
  if (!isReady || !kokoroInstance || !TextSplitterStream) {
    respond(id, 'error', { message: 'Cannot stream — not ready or no TextSplitterStream' });
    return;
  }

  const voice = payload.voice || currentVoice;
  const speed = payload.speed || currentSpeed;

  isSpeaking = true;
  abortFlag = false;

  activeSplitter = new TextSplitterStream();
  const stream = kokoroInstance.stream(activeSplitter, { voice, speed });

  const t0 = performance.now();
  let firstChunk = true;

  // Run playback loop in background
  activeStreamPromise = (async () => {
    try {
      for await (const chunk of stream) {
        if (!isSpeaking || abortFlag) break;

        const audio = chunk.audio;
        if (!audio) continue;

        let audioData = audio.data ?? audio.audio ?? audio;
        const sr = audio.sampling_rate ?? audio.sampleRate ?? 24000;

        if (CONFIG.trimSilence) {
          audioData = trimTrailingSilence(audioData, sr);
        }

        if (!audioData || !audioData.length) continue;

        const f32 = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);

        if (firstChunk) {
          const ms = (performance.now() - t0).toFixed(0);
          console.log(`[Kokoro Worker] ⚡ Stream first sound in ${ms}ms`);
          firstChunk = false;
          respond(null, 'streamStart', {});
        }

        respond(null, 'audioChunk', { audio: f32.buffer, sampleRate: sr }, [f32.buffer]);
      }
    } catch (e) {
      if (isSpeaking) {
        console.error('[Kokoro Worker] Stream error:', e);
      }
    }

    isSpeaking = false;
    activeSplitter = null;
    activeStreamPromise = null;
    respond(null, 'streamDone', {});
  })();

  respond(id, 'streamStarted', { hasNativeStream: true });
}

function handlePushText(id, payload) {
  if (!activeSplitter || !isSpeaking) return;
  activeSplitter.push(payload.text);
}

function handleCloseStream(id) {
  if (!activeSplitter) return;
  activeSplitter.close();
  console.log('[Kokoro Worker] Stream closed (flushing)');
  respond(id, 'streamClosing', {});
}

// ─── STOP ────────────────────────────────────────────────

function handleStop(id) {
  isSpeaking = false;
  abortFlag = true;
  if (activeSplitter) {
    try { activeSplitter.close(); } catch (e) {}
    activeSplitter = null;
  }
  respond(id, 'stopped', {});
}

// ─── AUDIO UTILITIES ─────────────────────────────────────

function trimTrailingSilence(audioData, sampleRate) {
  if (!audioData || !audioData.length) return audioData;
  const threshold = CONFIG.trimThreshold;

  let end = audioData.length - 1;
  while (end > 0 && Math.abs(audioData[end]) < threshold) end--;
  end = Math.min(audioData.length - 1, end + Math.floor(sampleRate * 0.05));
  if (end >= audioData.length - 100) return audioData;

  return audioData.slice(0, end + 1);
}

// ─── MESSAGING HELPERS ───────────────────────────────────

function respond(id, type, payload, transfer) {
  const msg = { id, type, payload };
  if (transfer && transfer.length) {
    self.postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

function sendProgress(data) {
  self.postMessage({ id: null, type: 'progress', payload: data });
}
