// ============================================================
// memory-worker.js — Web Worker для ASKI Infinite Memory
// Version: 1.0
// 
// Работает в отдельном потоке. Загружает модель Transformers.js
// и генерирует эмбеддинги без блокировки UI.
//
// Расположение: js/memory/memory-worker.js
// ============================================================

// Transformers.js загружается через CDN (importScripts для Worker)
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');

// Настройки Transformers.js для Worker
self.TransformersApi = self.Transformers || {};

let pipeline = null;
let embedder = null;
let isReady = false;

// ─── ОБРАБОТЧИК СООБЩЕНИЙ ────────────────────────────────

self.onmessage = async function(e) {
  const { type, id, text, texts, modelId } = e.data;

  try {
    switch (type) {

      // ─── ИНИЦИАЛИЗАЦИЯ МОДЕЛИ ──────────────────────────
      case 'init':
        if (isReady) {
          self.postMessage({ type: 'ready' });
          return;
        }

        self.postMessage({ 
          type: 'progress', 
          data: { stage: 'loading', percent: 0, message: 'Загрузка модели...' } 
        });

        try {
          // Используем Transformers.js pipeline API
          const { pipeline: pipelineFn, env } = self.Transformers || {};
          
          // Если Transformers.js загрузился через importScripts
          const tf = self.Transformers || self;
          
          // Настройки
          if (tf.env) {
            tf.env.allowLocalModels = false;
            tf.env.useBrowserCache = true;
          }

          const model = modelId || 'Xenova/multilingual-e5-small';
          
          embedder = await tf.pipeline('feature-extraction', model, {
            progress_callback: (progress) => {
              if (progress.status === 'progress' && progress.total) {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                self.postMessage({
                  type: 'progress',
                  data: {
                    stage: 'downloading',
                    percent: percent,
                    file: progress.file || '',
                    message: `Загрузка: ${percent}%`
                  }
                });
              } else if (progress.status === 'done') {
                self.postMessage({
                  type: 'progress',
                  data: { stage: 'loaded', percent: 100, message: 'Модель загружена' }
                });
              }
            }
          });

          isReady = true;
          self.postMessage({ type: 'ready' });
          
        } catch (initError) {
          self.postMessage({ 
            type: 'error', 
            id: 'init', 
            error: 'Model init failed: ' + initError.message 
          });
        }
        break;

      // ─── ОДИНОЧНЫЙ ЭМБЕДДИНГ ──────────────────────────
      case 'embed':
        if (!isReady || !embedder) {
          self.postMessage({ 
            type: 'error', 
            id, 
            error: 'Model not ready' 
          });
          return;
        }

        const output = await embedder(text, { 
          pooling: 'mean', 
          normalize: true 
        });
        
        // Конвертируем в обычный массив для передачи через postMessage
        const vector = Array.from(output.data);
        
        self.postMessage({
          type: 'result',
          id,
          data: vector
        });
        break;

      // ─── БАТЧ ЭМБЕДДИНГОВ ─────────────────────────────
      case 'embedBatch':
        if (!isReady || !embedder) {
          self.postMessage({ 
            type: 'error', 
            id, 
            error: 'Model not ready' 
          });
          return;
        }

        const results = [];
        const total = texts.length;

        for (let i = 0; i < total; i++) {
          const out = await embedder(texts[i], { 
            pooling: 'mean', 
            normalize: true 
          });
          results.push(Array.from(out.data));

          // Прогресс каждые 5 элементов
          if (i % 5 === 0 || i === total - 1) {
            self.postMessage({
              type: 'progress',
              data: { 
                stage: 'indexing', 
                current: i + 1, 
                total: total,
                message: `Индексация: ${i + 1}/${total}`
              }
            });
          }
        }

        self.postMessage({ 
          type: 'result', 
          id, 
          data: results 
        });
        break;

      // ─── ПРОВЕРКА СТАТУСА ─────────────────────────────
      case 'status':
        self.postMessage({
          type: 'result',
          id,
          data: { ready: isReady }
        });
        break;

      default:
        self.postMessage({ 
          type: 'error', 
          id, 
          error: 'Unknown command: ' + type 
        });
    }

  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      id, 
      error: error.message || 'Unknown error' 
    });
  }
};
