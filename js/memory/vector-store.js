// ============================================================
// vector-store.js — IndexedDB хранилище для ASKI Infinite Memory
// Version: 1.2 — keyword search for cross-language fallback
//
// Хранит эмбеддинги сообщений чата в IndexedDB.
// Выполняет cosine similarity поиск по всем векторам.
//
// Расположение: js/memory/vector-store.js
// ============================================================

class VectorStore {
  constructor() {
    this.dbName = 'droplit_memory';
    this.dbVersion = 1;
    this.storeName = 'chat_vectors';
    this.metaStoreName = 'memory_meta';
    this.db = null;
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────

  async open() {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Основное хранилище векторов
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('role', 'role', { unique: false });
          console.log('[VectorStore] Created chat_vectors store');
        }

        // Мета-данные (статистика, версия модели и т.д.)
        if (!db.objectStoreNames.contains(this.metaStoreName)) {
          db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
          console.log('[VectorStore] Created memory_meta store');
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('[VectorStore] Database opened');
        resolve();
      };

      request.onerror = (e) => {
        console.error('[VectorStore] Open error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ─── ЗАПИСЬ ────────────────────────────────────────────

  /**
   * Добавить один вектор
   * @param {Object} entry - { id, text, role, vector, timestamp, sessionId, metadata }
   */
  async add(entry) {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Добавить массив векторов (батч)
   * @param {Array} entries
   */
  async addBatch(entries) {
    if (!entries || entries.length === 0) return;
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (const entry of entries) {
        store.put(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── ПОИСК ─────────────────────────────────────────────

  /**
   * Семантический поиск по cosine similarity
   * @param {Array<number>} queryVector - эмбеддинг запроса [384]
   * @param {Object} options - настройки поиска
   * @returns {Array} - отсортированные результаты
   */
  async search(queryVector, options = {}) {
    const {
      topK = 10,
      threshold = 0.3,
      roleFilter = null,
      maxAge = null,
      excludeSessionId = null
    } = options;

    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const results = [];
      const now = Date.now();

      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          // Все записи просмотрены — сортируем и возвращаем top-K
          results.sort((a, b) => b.similarity - a.similarity);
          resolve(results.slice(0, topK));
          return;
        }

        const entry = cursor.value;

        // Фильтр по роли
        if (roleFilter && entry.role !== roleFilter) {
          cursor.continue();
          return;
        }

        // Фильтр по возрасту
        if (maxAge && (now - entry.timestamp) > maxAge) {
          cursor.continue();
          return;
        }

        // Исключить текущую сессию
        if (excludeSessionId && entry.sessionId === excludeSessionId) {
          cursor.continue();
          return;
        }

        // Cosine similarity
        const sim = this._cosineSimilarity(queryVector, entry.vector);

        if (sim >= threshold) {
          results.push({
            id: entry.id,
            text: entry.text,
            role: entry.role,
            timestamp: entry.timestamp,
            sessionId: entry.sessionId,
            similarity: sim,
            metadata: entry.metadata || {}
          });
        }

        cursor.continue();
      };

      cursorReq.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── ЧТЕНИЕ ────────────────────────────────────────────

  /**
   * Получить запись по ID
   */
  async get(id) {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Проверить существует ли запись
   */
  async has(id) {
    const entry = await this.get(id);
    return entry !== null;
  }

  // ─── СТАТИСТИКА ────────────────────────────────────────

  /**
   * Общая статистика хранилища
   */
  async getStats() {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const countReq = store.count();

      countReq.onsuccess = () => {
        resolve({
          totalMessages: countReq.result,
          dbName: this.dbName
        });
      };

      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Подробная статистика (роли, сессии)
   */
  async getDetailedStats() {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const stats = {
        total: 0,
        byRole: { user: 0, assistant: 0 },
        sessions: new Set(),
        oldestTimestamp: Infinity,
        newestTimestamp: 0
      };

      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          resolve({
            total: stats.total,
            userMessages: stats.byRole.user,
            assistantMessages: stats.byRole.assistant,
            sessionCount: stats.sessions.size,
            oldestDate: stats.oldestTimestamp === Infinity ? null : new Date(stats.oldestTimestamp),
            newestDate: stats.newestTimestamp === 0 ? null : new Date(stats.newestTimestamp)
          });
          return;
        }

        const entry = cursor.value;
        stats.total++;
        if (entry.role === 'user') stats.byRole.user++;
        else if (entry.role === 'assistant') stats.byRole.assistant++;
        if (entry.sessionId) stats.sessions.add(entry.sessionId);
        if (entry.timestamp < stats.oldestTimestamp) stats.oldestTimestamp = entry.timestamp;
        if (entry.timestamp > stats.newestTimestamp) stats.newestTimestamp = entry.timestamp;

        cursor.continue();
      };

      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── УПРАВЛЕНИЕ ЛИМИТАМИ ──────────────────────────────

  /**
   * Удалить старейшие записи, если превышен лимит
   * @param {number} keepCount - сколько записей оставить
   * @returns {number} - сколько удалено
   */
  async pruneOldest(keepCount = 5000) {
    const stats = await this.getStats();
    if (stats.totalMessages <= keepCount) return 0;

    const toDelete = stats.totalMessages - keepCount;
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const index = store.index('timestamp');
      let deleted = 0;

      index.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || deleted >= toDelete) {
          console.log(`[VectorStore] Pruned ${deleted} old messages`);
          resolve(deleted);
          return;
        }
        cursor.delete();
        deleted++;
        cursor.continue();
      };

      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── ОЧИСТКА ───────────────────────────────────────────

  // ─── KEYWORD SEARCH (v1.2: cross-language fallback) ────

  /**
   * Text-based keyword search — catches cross-language matches
   * that vector search misses (e.g., "P vs NP" in both languages)
   * @param {string} queryText - raw query text
   * @param {number} limit - max results
   * @returns {Array} - matches with keywordScore
   */
  async searchByKeywords(queryText, limit = 5, excludeSessionId = null) {
    if (!queryText || queryText.length < 2) return [];
    await this._ensureOpen();

    // Extract keywords (words > 2 chars, no common stop words)
    const stopWords = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','из','что','как','это','все','они','его','для','при','без']);
    const words = queryText
      .toLowerCase()
      .replace(/[^\w\sа-яё]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // Also extract raw numbers (important for recall queries like "число 5000000")
    const numbers = queryText.match(/\d{3,}/g) || [];
    const keywords = [...new Set([...words, ...numbers])];

    if (keywords.length === 0) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const results = [];

      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          results.sort((a, b) => b.keywordScore - a.keywordScore);
          resolve(results.slice(0, limit));
          return;
        }

        const entry = cursor.value;
        if (!entry.text) { cursor.continue(); return; }

        // Skip current session
        if (excludeSessionId && entry.sessionId === excludeSessionId) {
          cursor.continue();
          return;
        }

        const textLower = entry.text.toLowerCase();
        let matches = 0;
        for (const kw of keywords) {
          if (textLower.includes(kw)) matches++;
        }

        if (matches > 0) {
          // Boost score for number matches (exact recall is critical)
          let boost = 1.0;
          for (const kw of keywords) {
            if (/^\d+$/.test(kw) && textLower.includes(kw)) {
              boost = 2.0; // Double score when a specific number is found
              break;
            }
          }
          const score = Math.min((matches / keywords.length) * boost, 1.0);
          
          results.push({
            id: entry.id,
            text: entry.text,
            role: entry.role,
            timestamp: entry.timestamp,
            sessionId: entry.sessionId,
            keywordScore: score,
            similarity: score, // normalize for MemoryContext compatibility
            metadata: entry.metadata || {}
          });
        }

        cursor.continue();
      };

      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── ОЧИСТКА ───────────────────────────────────────────

  // ─── PROPAGATE: NEIGHBOR EXPANSION ──────────────────────

  /**
   * Get all message IDs (lightweight, no vectors/text loaded)
   * Used for incremental sync with chat history.
   * @returns {Array<string>} array of IDs
   */
  async getAllIds() {
    await this._ensureOpen();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const ids = [];
      
      store.openKeyCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          resolve(ids);
          return;
        }
        ids.push(cursor.key);
        cursor.continue();
      };
      
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * PROPAGATE phase: expand results with temporal neighbors.
   * When search finds message M, includes M-2, M-1, M+1, M+2.
   * Captures: answer after question, decision after discussion.
   *
   * @param {Array} results - search results [{id, text, similarity, timestamp, ...}]
   * @param {number} window - messages before/after to include (default: 2)
   * @param {number} decay - score multiplier for neighbors (default: 0.7)
   * @param {number} maxExpanded - max total results (default: 12)
   * @returns {Array} expanded results, sorted by similarity
   */
  async expandWithNeighbors(results, window = 2, decay = 0.7, maxExpanded = 12) {
    if (!results || results.length === 0) return results;

    try {
      await this._ensureOpen();

      // Load all messages (id + timestamp, no vectors) sorted by timestamp
      const timeline = await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const items = [];

        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            items.sort((a, b) => a.timestamp - b.timestamp);
            resolve(items);
            return;
          }
          const v = cursor.value;
          items.push({
            id: v.id,
            text: v.text,
            role: v.role,
            timestamp: v.timestamp,
            sessionId: v.sessionId,
            metadata: v.metadata || {}
          });
          cursor.continue();
        };
        tx.onerror = (e) => reject(e.target.error);
      });

      if (timeline.length === 0) return results;

      // Build position index: id → position in timeline
      const posMap = new Map();
      for (let i = 0; i < timeline.length; i++) {
        posMap.set(timeline[i].id, i);
      }

      // Collect expanded set
      const expanded = new Map();

      // Add original results
      for (const r of results) {
        expanded.set(r.id, { ...r, _source: 'direct' });
      }

      // For each original, add temporal neighbors
      for (const r of results) {
        const pos = posMap.get(r.id);
        if (pos === undefined) continue;

        for (let offset = -window; offset <= window; offset++) {
          if (offset === 0) continue;

          const nPos = pos + offset;
          if (nPos < 0 || nPos >= timeline.length) continue;

          const neighbor = timeline[nPos];
          if (expanded.has(neighbor.id)) continue;

          // Score decays with distance from hit
          const distFactor = 1.0 - (Math.abs(offset) - 1) * 0.15;
          const nScore = (r.similarity || r.keywordScore || 0.5) * decay * distFactor;

          expanded.set(neighbor.id, {
            ...neighbor,
            similarity: nScore,
            _source: 'propagate',
            _parentId: r.id,
            _offset: offset
          });
        }
      }

      // Sort by similarity, return top results
      const result = [...expanded.values()]
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, maxExpanded);

      const propagatedCount = result.filter(r => r._source === 'propagate').length;
      if (propagatedCount > 0) {
        console.log(`[VectorStore] PROPAGATE: ${results.length} → ${result.length} results (+${propagatedCount} neighbors)`);
      }

      return result;

    } catch (err) {
      console.warn('[VectorStore] expandWithNeighbors failed:', err.message);
      return results; // graceful fallback
    }
  }

  /**
   * Полная очистка хранилища
   */
  async clear() {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).clear();
      tx.oncomplete = () => {
        console.log('[VectorStore] Cleared all data');
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Удалить запись по ID
   */
  async delete(id) {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── МЕТА-ДАННЫЕ ──────────────────────────────────────

  /**
   * Сохранить мета-значение
   */
  async setMeta(key, value) {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.metaStoreName, 'readwrite');
      tx.objectStore(this.metaStoreName).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Получить мета-значение
   */
  async getMeta(key) {
    await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.metaStoreName, 'readonly');
      const req = tx.objectStore(this.metaStoreName).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ─── ПРИВАТНЫЕ МЕТОДЫ ──────────────────────────────────

  /**
   * Гарантировать что БД открыта (v1.1: resilient to closed connections)
   */
  async _ensureOpen() {
    // If db reference exists but connection was closed by another module, reopen
    if (this.db) {
      try {
        // Test if connection is alive by attempting a transaction
        this.db.transaction(this.storeName, 'readonly');
        return; // Connection is alive
      } catch (e) {
        // Connection is dead (closing/closed) — reset and reopen
        console.warn('[VectorStore] Connection lost, reopening...');
        this.db = null;
      }
    }
    await this.open();
  }

  /**
   * Cosine similarity между двумя векторами
   * Оптимизирован для ~384 измерений
   */
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = a.length;

    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

// Экспорт для использования другими модулями
if (typeof window !== 'undefined') {
  window.VectorStore = VectorStore;
}
