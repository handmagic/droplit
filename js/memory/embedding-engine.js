// ============================================================
// embedding-engine.js — Transformers.js для ASKI Infinite Memory
// Version: 1.1 — Direct loading (no Web Worker)
//
// Загружает модель multilingual-e5-small напрямую.
// Web Worker убран — CSP блокирует importScripts в Workers.
// Эмбеддинги генерируются async, не блокируют UI.
//
// Модель multilingual-e5-small требует префиксы:
//   "query: " для поисковых запросов
//   "passage: " для индексируемых текстов
//
// Расположение: js/memory/embedding-engine.js
// ============================================================

class EmbeddingEngine {
  constructor() {
    this.pipeline = null;
    this.ready = false;
    this.loading = false;
    this.modelId = 'Xenova/multilingual-e5-small';
    this._initPromise = null;
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────

  /**
   * Загрузить модель Transformers.js
   * @param {number} timeout - таймаут загрузки в мс (default: 120s)
   * @returns {Promise<void>}
   */
  async init(timeout = 120000) {
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
      setTimeout(() => reject(new Error('Model load timeout')), timeout);
    });

    const loadPromise = (async () => {
      try {
        // Dynamic import — same approach as local-embeddings.js (works with existing CSP)
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
   * @param {string} text
   * @returns {Promise<Array<number>>} - вектор [384]
   */
  async embedPassage(text) {
    this._checkReady();
    const output = await this.pipeline('passage: ' + text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  /**
   * Эмбеддинг для query (поисковый запрос)
   * @param {string} text
   * @returns {Promise<Array<number>>} - вектор [384]
   */
  async embedQuery(text) {
    this._checkReady();
    const output = await this.pipeline('query: ' + text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  /**
   * Батч-эмбеддинг
   * @param {Array<string>} texts
   * @param {string} type - 'passage' или 'query'
   * @returns {Promise<Array<Array<number>>>}
   */
  async embedBatch(texts, type = 'passage') {
    this._checkReady();
    const prefix = type === 'query' ? 'query: ' : 'passage: ';
    const results = [];

    for (let i = 0; i < texts.length; i++) {
      const output = await this.pipeline(prefix + texts[i], {
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
