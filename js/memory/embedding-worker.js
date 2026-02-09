// ============================================================
// embedding-worker.js — Web Worker для Transformers.js WASM
// Version: 1.0
//
// Весь WASM inference выполняется в отдельном потоке.
// Main thread НЕ блокируется при генерации embeddings.
//
// Протокол: postMessage({ id, type, payload }) → response({ id, type, payload })
// Типы: init, embed, embedBatch, destroy
//
// Расположение: js/memory/embedding-worker.js
// ============================================================

let pipeline = null;
let isReady = false;
let isLoading = false;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// ─── MESSAGE HANDLER ─────────────────────────────────────

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'init':
        await handleInit(id, payload);
        break;

      case 'embed':
        await handleEmbed(id, payload);
        break;

      case 'embedBatch':
        await handleEmbedBatch(id, payload);
        break;

      case 'destroy':
        handleDestroy(id);
        break;

      case 'ping':
        respond(id, 'pong', { ready: isReady, loading: isLoading });
        break;

      default:
        respond(id, 'error', { message: `Unknown message type: ${type}` });
    }
  } catch (error) {
    respond(id, 'error', { message: error.message, stack: error.stack });
  }
};

// ─── INIT: Load Transformers.js + Model ──────────────────

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
  const startTime = Date.now();

  try {
    // Dynamic import of Transformers.js inside Worker
    const module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    const { pipeline: createPipeline, env } = module;

    env.allowLocalModels = false;
    env.useBrowserCache = true;

    sendProgress({ stage: 'downloading', percent: 0, message: 'Loading model...' });

    pipeline = await createPipeline('feature-extraction', MODEL_ID, {
      progress_callback: (progress) => {
        if (progress.status === 'progress' && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          sendProgress({
            stage: 'downloading',
            percent,
            file: progress.file || '',
            message: `Loading: ${percent}%`
          });
        }
      }
    });

    isReady = true;
    isLoading = false;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    sendProgress({ stage: 'ready', percent: 100, message: 'Model ready' });

    respond(id, 'ready', { elapsed: parseFloat(elapsed), model: MODEL_ID });

  } catch (error) {
    isLoading = false;
    respond(id, 'error', { message: 'Model load failed: ' + error.message });
  }
}

// ─── EMBED: Single text → vector ─────────────────────────

async function handleEmbed(id, payload) {
  if (!isReady || !pipeline) {
    respond(id, 'error', { message: 'Model not loaded' });
    return;
  }

  const { text } = payload;
  if (!text) {
    respond(id, 'error', { message: 'No text provided' });
    return;
  }

  const output = await pipeline(text, {
    pooling: 'mean',
    normalize: true
  });

  const vector = Array.from(output.data);
  respond(id, 'embedding', { vector });
}

// ─── EMBED BATCH: Multiple texts → vectors ───────────────

async function handleEmbedBatch(id, payload) {
  if (!isReady || !pipeline) {
    respond(id, 'error', { message: 'Model not loaded' });
    return;
  }

  const { texts } = payload;
  if (!texts || !texts.length) {
    respond(id, 'error', { message: 'No texts provided' });
    return;
  }

  const results = [];

  for (let i = 0; i < texts.length; i++) {
    const output = await pipeline(texts[i], {
      pooling: 'mean',
      normalize: true
    });
    results.push(Array.from(output.data));

    // Progress every 5 items
    if (i % 5 === 0 || i === texts.length - 1) {
      sendProgress({
        stage: 'indexing',
        current: i + 1,
        total: texts.length,
        message: `Indexing: ${i + 1}/${texts.length}`
      });
    }
  }

  respond(id, 'embeddings', { vectors: results });
}

// ─── DESTROY: Free resources ─────────────────────────────

function handleDestroy(id) {
  pipeline = null;
  isReady = false;
  isLoading = false;
  respond(id, 'destroyed', {});
}

// ─── MESSAGING HELPERS ───────────────────────────────────

function respond(id, type, payload) {
  self.postMessage({ id, type, payload });
}

function sendProgress(data) {
  self.postMessage({ id: null, type: 'progress', payload: data });
}
