// ============================================================
// infinite-memory.js — Главный фасад ASKI Infinite Memory
// Version: 1.0
//
// Объединяет EmbeddingEngine, VectorStore и MemoryContext
// в единый API для интеграции с chat.js
//
// Расположение: js/memory/infinite-memory.js
// Зависимости: embedding-engine.js, vector-store.js, memory-context.js
// ============================================================

class InfiniteMemory {
  constructor() {
    this.engine = new EmbeddingEngine();
    this.store = new VectorStore();
    this.ready = false;
    this.initializing = false;
    this.initPromise = null;
    this._lazyMobile = false; // Set by auto-init on mobile devices
    
    // Настройки
    this.config = {
      maxMessages: 5000,      // Лимит перед auto-prune
      hardLimit: 7000,        // Абсолютный лимит
      searchTopK: 10,         // Результатов поиска
      searchThreshold: 0.3,   // Минимальный similarity
      contextMaxTokens: 1500, // Лимит токенов в промпте
      enabled: true           // Можно отключить
    };

    // Статус для UI
    this.status = {
      modelLoaded: false,
      dbReady: false,
      totalMessages: 0,
      lastSearchTime: 0,
      lastSearchResults: 0
    };
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────

  /**
   * Инициализация системы памяти
   * Вызывается при открытии чата (non-blocking для UI)
   * @returns {Promise<boolean>}
   */
  async init() {
    if (this.ready) return true;
    if (this.initializing) return this.initPromise;

    this.initializing = true;
    console.log('[InfiniteMemory] Initializing...');

    this.initPromise = (async () => {
      try {
        // 1. Открываем IndexedDB
        await this.store.open();
        this.status.dbReady = true;
        console.log('[InfiniteMemory] IndexedDB ready');

        // 2. Получаем статистику
        const stats = await this.store.getStats();
        this.status.totalMessages = stats.totalMessages;
        console.log(`[InfiniteMemory] ${stats.totalMessages} messages in memory`);

        // 3. Загружаем модель эмбеддингов (может занять 2-15с)
        await this.engine.init();
        this.status.modelLoaded = true;
        console.log('[InfiniteMemory] Embedding model ready');

        // 4. Auto-prune если нужно
        if (stats.totalMessages > this.config.hardLimit) {
          const pruned = await this.store.pruneOldest(this.config.maxMessages);
          this.status.totalMessages -= pruned;
          console.log(`[InfiniteMemory] Auto-pruned ${pruned} old messages`);
        }

        this.ready = true;
        this.initializing = false;

        // 5. Диспатчим событие готовности
        window.dispatchEvent(new CustomEvent('memory-ready', {
          detail: { totalMessages: this.status.totalMessages }
        }));

        return true;

      } catch (error) {
        console.error('[InfiniteMemory] Init failed:', error);
        this.initializing = false;
        
        window.dispatchEvent(new CustomEvent('memory-error', {
          detail: { error: error.message }
        }));
        
        return false;
      }
    })();

    return this.initPromise;
  }

  // ─── ОСНОВНЫЕ ОПЕРАЦИИ ─────────────────────────────────

  /**
   * Индексировать сообщение (вызывается после каждого сообщения)
   * @param {string} text - текст сообщения
   * @param {string} role - 'user' | 'assistant'
   * @param {string} sessionId - ID текущей сессии чата
   * @returns {Promise<boolean>}
   */
  async indexMessage(text, role, sessionId = null) {
    if (!this.ready || !this.config.enabled) return false;
    if (!text || text.length < 5) return false;

    try {
      const startTime = performance.now();

      // Генерируем эмбеддинг
      const vector = await this.engine.embedPassage(text);

      // Создаём запись
      const entry = {
        id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        text: text.substring(0, 2000), // Лимит на длину текста
        role: role,
        vector: vector,
        timestamp: Date.now(),
        sessionId: sessionId || this._getCurrentSessionId(),
        metadata: {
          textLength: text.length,
          indexed: new Date().toISOString()
        }
      };

      // Сохраняем
      await this.store.add(entry);
      this.status.totalMessages++;

      const elapsed = (performance.now() - startTime).toFixed(1);
      console.log(`[InfiniteMemory] Indexed ${role} message (${elapsed}ms), total: ${this.status.totalMessages}`);

      return true;

    } catch (error) {
      console.error('[InfiniteMemory] Index error:', error);
      return false;
    }
  }

  /**
   * Получить релевантный контекст для промпта
   * @param {string} query - текст запроса пользователя
   * @param {string} currentSessionId - текущая сессия (для исключения)
   * @returns {Promise<string>} - форматированный блок для system prompt
   */
  async getContextForPrompt(query, currentSessionId = null) {
    if (!this.ready || !this.config.enabled) return '';
    if (!query || query.length < 3) return '';

    try {
      const startTime = performance.now();

      // Генерируем эмбеддинг запроса
      const queryVector = await this.engine.embedQuery(query);

      // Ищем в памяти
      const results = await this.store.search(queryVector, {
        topK: this.config.searchTopK,
        threshold: this.config.searchThreshold,
        excludeSessionId: null // Включаем текущую сессию тоже — могут быть полезные ранние сообщения
      });

      const elapsed = (performance.now() - startTime).toFixed(1);
      this.status.lastSearchTime = parseFloat(elapsed);
      this.status.lastSearchResults = results.length;

      if (results.length === 0) {
        console.log(`[InfiniteMemory] Search: 0 results (${elapsed}ms)`);
        return '';
      }

      console.log(`[InfiniteMemory] Search: ${results.length} results, top similarity: ${results[0].similarity.toFixed(3)} (${elapsed}ms)`);

      // Форматируем для промпта
      const contextBlock = MemoryContext.formatForPrompt(results, this.config.contextMaxTokens);

      // UI уведомление
      window.dispatchEvent(new CustomEvent('memory-search-done', {
        detail: {
          count: results.length,
          topSimilarity: results[0]?.similarity || 0,
          searchTime: parseFloat(elapsed)
        }
      }));

      return contextBlock;

    } catch (error) {
      console.error('[InfiniteMemory] Search error:', error);
      return '';
    }
  }

  // ─── ИМПОРТ СУЩЕСТВУЮЩЕЙ ИСТОРИИ ──────────────────────

  /**
   * Импортировать существующую историю чата из localStorage
   * Вызывается один раз для миграции
   * @returns {Promise<number>} - количество импортированных сообщений
   */
  async importFromChatHistory() {
    if (!this.ready) {
      console.warn('[InfiniteMemory] Not ready for import');
      return 0;
    }

    try {
      const history = JSON.parse(localStorage.getItem('droplit_chat_history') || '[]');

      if (history.length === 0) {
        console.log('[InfiniteMemory] No chat history to import');
        return 0;
      }

      // Проверяем была ли уже миграция
      const lastImport = await this.store.getMeta('last_import');
      if (lastImport && lastImport.count === history.length) {
        console.log('[InfiniteMemory] History already imported');
        return 0;
      }

      console.log(`[InfiniteMemory] Importing ${history.length} messages from chat history...`);

      // Фильтруем — только текстовые сообщения длиннее 5 символов
      const textMessages = history.filter(m => m.text && m.text.length > 5);
      const texts = textMessages.map(m => m.text.substring(0, 2000));

      // Батч-эмбеддинг
      const vectors = await this.engine.embedBatch(texts, 'passage');

      // Создаём записи
      const entries = textMessages.map((m, i) => ({
        id: 'imp_' + (m.id || Date.now() + '_' + i),
        text: m.text.substring(0, 2000),
        role: m.role || 'user',
        vector: vectors[i],
        timestamp: m.ts ? new Date(m.ts).getTime() : Date.now() - (textMessages.length - i) * 60000,
        sessionId: 'imported',
        metadata: { source: 'chat_history_import' }
      }));

      // Сохраняем батчем
      await this.store.addBatch(entries);

      // Запоминаем что импорт был
      await this.store.setMeta('last_import', {
        count: history.length,
        imported: entries.length,
        date: new Date().toISOString()
      });

      this.status.totalMessages += entries.length;
      console.log(`[InfiniteMemory] Imported ${entries.length} messages`);

      return entries.length;

    } catch (error) {
      console.error('[InfiniteMemory] Import error:', error);
      return 0;
    }
  }

  // ─── УТИЛИТЫ ──────────────────────────────────────────

  /**
   * Получить статистику
   */
  async getStats() {
    if (!this.status.dbReady) return this.status;

    try {
      const detailed = await this.store.getDetailedStats();
      return {
        ...this.status,
        ...detailed
      };
    } catch (e) {
      return this.status;
    }
  }

  /**
   * Очистить всю память
   */
  async clear() {
    await this.store.clear();
    this.status.totalMessages = 0;
    console.log('[InfiniteMemory] Memory cleared');
  }

  /**
   * Включить/выключить
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;
    localStorage.setItem('droplit_infinite_memory', enabled ? 'true' : 'false');
    console.log(`[InfiniteMemory] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Проверить включена ли память
   */
  isEnabled() {
    return this.config.enabled && this.ready;
  }

  /**
   * Освободить ресурсы
   */
  destroy() {
    this.engine.destroy();
    this.ready = false;
    console.log('[InfiniteMemory] Destroyed');
  }

  // ─── ПРИВАТНЫЕ МЕТОДЫ ──────────────────────────────────

  _getCurrentSessionId() {
    if (typeof currentChatSessionId !== 'undefined' && currentChatSessionId) {
      return currentChatSessionId;
    }
    // Fallback: используем дату как сессию
    return 'session_' + new Date().toISOString().split('T')[0];
  }
}

// ─── ГЛОБАЛЬНЫЙ СИНГЛТОН ─────────────────────────────────

// Единственный экземпляр для всего приложения
window.InfiniteMemory = new InfiniteMemory();

// Автоматическая инициализация
(function() {
  const enabled = localStorage.getItem('droplit_infinite_memory') !== 'false';
  if (!enabled) return;

  window.InfiniteMemory.config.enabled = true;

  // Detect mobile: touchscreen + small viewport
  const isMobile = ('ontouchstart' in window) && window.innerWidth < 768;

  if (isMobile) {
    // Mobile: delayed init to let UI settle first
    console.log('[InfiniteMemory] Mobile detected — delayed init (Web Worker mode)');
    setTimeout(() => {
      window.InfiniteMemory.init().then(ok => {
        if (ok) {
          console.log('[InfiniteMemory] Auto-initialized (mobile, Worker)');
          window.InfiniteMemory.importFromChatHistory();
        }
      });
    }, 5000); // 5 sec delay on mobile for UI to fully load
  } else {
    // Desktop: как раньше, автоматически через 3 секунды
    setTimeout(() => {
      window.InfiniteMemory.init().then(ok => {
        if (ok) {
          console.log('[InfiniteMemory] Auto-initialized');
          window.InfiniteMemory.importFromChatHistory();
        }
      });
    }, 3000);
  }
})();
