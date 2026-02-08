// ============================================================
// embedding-engine.js — Обёртка Transformers.js для ASKI Infinite Memory
// Version: 1.0
//
// Управляет Web Worker, предоставляет async API для эмбеддингов.
// Модель multilingual-e5-small требует префиксы:
//   "query: " для запросов пользователя
//   "passage: " для индексируемых текстов
//
// Расположение: js/memory/embedding-engine.js
// ============================================================

class EmbeddingEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.loading = false;
    this.modelId = 'Xenova/multilingual-e5-small';
    this.pendingCallbacks = new Map();
    this.callbackId = 0;
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────

  /**
   * Загрузить модель через Web Worker
   * @param {number} timeout - таймаут загрузки в мс (default: 60s)
   * @returns {Promise<void>}
   */
  async init(timeout = 60000) {
    if (this.ready) return;
    if (this.loading) {
      // Ждём завершения текущей загрузки
      return this._waitForReady(timeout);
    }

    this.loading = true;

    return new Promise((resolve, reject) => {
      // Определяем путь к worker
      const workerPath = this._resolveWorkerPath();
      
      try {
        this.worker = new Worker(workerPath);
      } catch (e) {
        this.loading = false;
        reject(new Error('Worker creation failed: ' + e.message));
        return;
      }

      const timeoutId = setTimeout(() => {
        this.loading = false;
        reject(new Error('Model load timeout (' + (timeout/1000) + 's)'));
      }, timeout);

      this.worker.onmessage = (e) => {
        const { type, id, data, error } = e.data;

        switch (type) {
          case 'ready':
            clearTimeout(timeoutId);
            this.ready = true;
            this.loading = false;
            console.log('[EmbeddingEngine] Model ready');
            resolve();
            break;

          case 'result':
            this._resolveCallback(id, data);
            break;

          case 'error':
            if (id === 'init') {
              clearTimeout(timeoutId);
              this.loading = false;
              reject(new Error(error));
            } else {
              this._rejectCallback(id, new Error(error));
            }
            break;

          case 'progress':
            // Прокидываем прогресс в UI
            this._emitProgress(data);
            break;
        }
      };

      this.worker.onerror = (e) => {
        clearTimeout(timeoutId);
        this.loading = false;
        console.error('[EmbeddingEngine] Worker error:', e);
        reject(new Error('Worker error: ' + (e.message || 'unknown')));
      };

      // Запускаем загрузку модели
      this.worker.postMessage({ type: 'init', modelId: this.modelId });
    });
  }

  // ─── ЭМБЕДДИНГИ ────────────────────────────────────────

  /**
   * Получить эмбеддинг для passage (индексируемый текст)
   * Добавляет префикс "passage: " для E5 модели
   * @param {string} text
   * @returns {Promise<Array<number>>} - вектор [384]
   */
  async embedPassage(text) {
    this._checkReady();
    return this._callWorker('embed', { text: 'passage: ' + text });
  }

  /**
   * Получить эмбеддинг для query (поисковый запрос)
   * Добавляет префикс "query: " для E5 модели
   * @param {string} text
   * @returns {Promise<Array<number>>} - вектор [384]
   */
  async embedQuery(text) {
    this._checkReady();
    return this._callWorker('embed', { text: 'query: ' + text });
  }

  /**
   * Батч-эмбеддинг для множества текстов
   * @param {Array<string>} texts
   * @param {string} type - 'passage' или 'query'
   * @returns {Promise<Array<Array<number>>>}
   */
  async embedBatch(texts, type = 'passage') {
    this._checkReady();
    const prefix = type === 'query' ? 'query: ' : 'passage: ';
    return this._callWorker('embedBatch', {
      texts: texts.map(t => prefix + t)
    });
  }

  // ─── УПРАВЛЕНИЕ ────────────────────────────────────────

  /**
   * Проверить готовность
   */
  isReady() {
    return this.ready;
  }

  /**
   * Проверить идёт ли загрузка
   */
  isLoading() {
    return this.loading;
  }

  /**
   * Освободить ресурсы
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.loading = false;
    this.pendingCallbacks.clear();
    console.log('[EmbeddingEngine] Destroyed');
  }

  // ─── ПРИВАТНЫЕ МЕТОДЫ ──────────────────────────────────

  _checkReady() {
    if (!this.ready || !this.worker) {
      throw new Error('EmbeddingEngine not initialized. Call init() first.');
    }
  }

  _callWorker(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.callbackId;
      this.pendingCallbacks.set(id, { resolve, reject });
      this.worker.postMessage({ type: method, id, ...params });

      // Таймаут на каждый вызов (30 сек)
      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error('Worker call timeout'));
        }
      }, 30000);
    });
  }

  _resolveCallback(id, data) {
    const cb = this.pendingCallbacks.get(id);
    if (cb) {
      cb.resolve(data);
      this.pendingCallbacks.delete(id);
    }
  }

  _rejectCallback(id, error) {
    const cb = this.pendingCallbacks.get(id);
    if (cb) {
      cb.reject(error);
      this.pendingCallbacks.delete(id);
    }
  }

  _emitProgress(data) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('memory-progress', { detail: data }));
    }
  }

  _waitForReady(timeout) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (this.ready) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error('Wait for ready timeout'));
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  _resolveWorkerPath() {
    // Пытаемся определить корректный путь к worker
    // Worker должен быть в js/memory/memory-worker.js
    return '/js/memory/memory-worker.js';
  }
}

// Экспорт
if (typeof window !== 'undefined') {
  window.EmbeddingEngine = EmbeddingEngine;
}
