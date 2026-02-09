// ============================================================
// embedding-engine.js — Proxy to Web Worker for Transformers.js
// Version: 2.0 — Web Worker architecture (zero main thread blocking)
//
// Same API as v1.2 but all WASM inference runs in a Web Worker.
// Main thread only sends/receives messages — never blocks UI.
//
// Расположение: js/memory/embedding-engine.js
// Зависимости: embedding-worker.js (loaded as Web Worker)
// ============================================================

class EmbeddingEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.loading = false;
    this.modelId = 'Xenova/all-MiniLM-L6-v2';
    this._initPromise = null;
    this._pendingRequests = new Map(); // id → { resolve, reject }
    this._nextId = 1;
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────

  async init(timeout = 180000) {
    if (this.ready) return;
    if (this.loading) return this._initPromise;

    this.loading = true;
    console.log('[EmbeddingEngine] Loading model via Worker:', this.modelId);

    this._initPromise = this._initWorker(timeout);

    try {
      await this._initPromise;
    } catch (e) {
      this.loading = false;
      this._initPromise = null;
      throw e;
    }
  }

  async _initWorker(timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Worker init timeout (' + (timeout / 1000) + 's)'));
      }, timeout);

      try {
        // Create Web Worker
        this.worker = new Worker('/js/memory/embedding-worker.js', { type: 'module' });

        // Listen for all messages from worker
        this.worker.onmessage = (event) => {
          this._handleWorkerMessage(event.data);
        };

        this.worker.onerror = (error) => {
          console.error('[EmbeddingEngine] Worker error:', error.message);
          clearTimeout(timer);
          this.loading = false;
          reject(new Error('Worker failed: ' + error.message));
        };

        // Send init command
        const initId = this._nextId++;
        this._pendingRequests.set(initId, {
          resolve: (data) => {
            clearTimeout(timer);
            this.ready = true;
            this.loading = false;
            const elapsed = data.elapsed || '?';
            console.log(`[EmbeddingEngine] Model ready via Worker (${elapsed}s)`);
            this._emitProgress({ stage: 'ready', percent: 100, message: 'Model ready' });
            resolve();
          },
          reject: (error) => {
            clearTimeout(timer);
            this.loading = false;
            reject(error);
          }
        });

        this.worker.postMessage({ id: initId, type: 'init', payload: {} });

      } catch (error) {
        clearTimeout(timer);
        this.loading = false;
        reject(error);
      }
    });
  }

  // ─── WORKER MESSAGE HANDLER ────────────────────────────

  _handleWorkerMessage(data) {
    const { id, type, payload } = data;

    // Progress events (no id, broadcast)
    if (type === 'progress') {
      this._emitProgress(payload);
      return;
    }

    // Error from worker
    if (type === 'error') {
      const pending = id ? this._pendingRequests.get(id) : null;
      if (pending) {
        this._pendingRequests.delete(id);
        pending.reject(new Error(payload.message));
      } else {
        console.error('[EmbeddingEngine] Worker error:', payload.message);
      }
      return;
    }

    // Response to a request
    if (id && this._pendingRequests.has(id)) {
      const pending = this._pendingRequests.get(id);
      this._pendingRequests.delete(id);
      pending.resolve(payload);
    }
  }

  // ─── REQUEST HELPER ────────────────────────────────────

  _sendRequest(type, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.ready || !this.worker) {
        reject(new Error('EmbeddingEngine not initialized'));
        return;
      }

      const id = this._nextId++;
      const timer = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`Worker request timeout (${type})`));
      }, timeout);

      this._pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      this.worker.postMessage({ id, type, payload });
    });
  }

  // ─── ЭМБЕДДИНГИ (same API as v1.2) ────────────────────

  /**
   * Эмбеддинг для passage (индексируемый текст)
   */
  async embedPassage(text) {
    const result = await this._sendRequest('embed', { text });
    return result.vector;
  }

  /**
   * Эмбеддинг для query (поисковый запрос)
   */
  async embedQuery(text) {
    const result = await this._sendRequest('embed', { text });
    return result.vector;
  }

  /**
   * Батч-эмбеддинг (для импорта истории)
   */
  async embedBatch(texts, type = 'passage') {
    // Longer timeout for batches: 5 min
    const result = await this._sendRequest('embedBatch', { texts }, 300000);
    return result.vectors;
  }

  // ─── УПРАВЛЕНИЕ ────────────────────────────────────────

  isReady() { return this.ready; }
  isLoading() { return this.loading; }

  destroy() {
    if (this.worker) {
      this.worker.postMessage({ id: this._nextId++, type: 'destroy', payload: {} });
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.loading = false;
    this._pendingRequests.clear();
    console.log('[EmbeddingEngine] Worker terminated');
  }

  // ─── ПРИВАТНЫЕ МЕТОДЫ ──────────────────────────────────

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
