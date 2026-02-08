// ============================================================
// embedding-engine.js — Transformers.js для ASKI Infinite Memory
// Version: 1.2 — MiniLM model (23MB, fast load)
//
// Uses Xenova/all-MiniLM-L6-v2 — same model as local-embeddings.js
// Small (23MB), 384 dimensions, good for EN+basic RU
// Future: switch to multilingual-e5-small when preloading is ready
//
// Расположение: js/memory/embedding-engine.js
// ============================================================

class EmbeddingEngine {
  constructor() {
    this.pipeline = null;
    this.ready = false;
    this.loading = false;
    this.modelId = 'Xenova/all-MiniLM-L6-v2'; // 23MB, same as local-embeddings.js
    this._initPromise = null;
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────

  async init(timeout = 180000) {
    if (this.ready) return;
    if (this.loading) return this._initPromise;

    this.loading = true;
    console.log('[EmbeddingEngine] Loading model:', this.modelId);

    this._initPromise = this._loadModel(timeout);

    try {
      await this._initPromise;
    } catch (e) {
      this.loading = false;
      this._initPromise = null;
      throw e;
    }
  }

  async _loadModel(timeout) {
    const startTime = Date.now();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Model load timeout (' + (timeout/1000) + 's)')), timeout);
    });

    const loadPromise = (async () => {
      try {
        // Dynamic import — same approach as local-embeddings.js
        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');

        env.allowLocalModels = false;
        env.useBrowserCache = true;

        this._emitProgress({ stage: 'downloading', percent: 0, message: 'Загрузка модели...' });

        this.pipeline = await pipeline('feature-extraction', this.modelId, {
          progress_callback: (progress) => {
            if (progress.status === 'progress' && progress.total) {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              this._emitProgress({
                stage: 'downloading',
                percent,
                file: progress.file || '',
                message: `Загрузка: ${percent}%`
              });
            }
          }
        });

        this.ready = true;
        this.loading = false;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[EmbeddingEngine] Model ready (${elapsed}s)`);

        this._emitProgress({ stage: 'ready', percent: 100, message: 'Модель готова' });

      } catch (error) {
        this.loading = false;
        console.error('[EmbeddingEngine] Load failed:', error);
        throw error;
      }
    })();

    return Promise.race([loadPromise, timeoutPromise]);
  }

  // ─── ЭМБЕДДИНГИ ────────────────────────────────────────

  /**
   * Эмбеддинг для passage (индексируемый текст)
   * MiniLM не требует префиксов (в отличие от E5)
   */
  async embedPassage(text) {
    this._checkReady();
    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  /**
   * Эмбеддинг для query (поисковый запрос)
   */
  async embedQuery(text) {
    this._checkReady();
    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  /**
   * Батч-эмбеддинг
   */
  async embedBatch(texts, type = 'passage') {
    this._checkReady();
    const results = [];

    for (let i = 0; i < texts.length; i++) {
      const output = await this.pipeline(texts[i], {
        pooling: 'mean',
        normalize: true
      });
      results.push(Array.from(output.data));

      // Прогресс каждые 5 элементов
      if (i % 5 === 0 || i === texts.length - 1) {
        this._emitProgress({
          stage: 'indexing',
          current: i + 1,
          total: texts.length,
          message: `Индексация: ${i + 1}/${texts.length}`
        });
      }

      // Yield to UI thread каждые 3 элемента
      if (i % 3 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return results;
  }

  // ─── УПРАВЛЕНИЕ ────────────────────────────────────────

  isReady() { return this.ready; }
  isLoading() { return this.loading; }

  destroy() {
    this.pipeline = null;
    this.ready = false;
    this.loading = false;
    console.log('[EmbeddingEngine] Destroyed');
  }

  // ─── ПРИВАТНЫЕ МЕТОДЫ ──────────────────────────────────

  _checkReady() {
    if (!this.ready || !this.pipeline) {
      throw new Error('EmbeddingEngine not initialized. Call init() first.');
    }
  }

  _emitProgress(data) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('memory-progress', { detail: data }));
    }
  }
}

// Экспорт
if (typeof window !== 'undefined') {
  window.EmbeddingEngine = EmbeddingEngine;
}
