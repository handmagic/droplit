// ============================================================
// memory-context.js — Форматирование контекста для ASKI Infinite Memory
// Version: 1.0
//
// Преобразует результаты семантического поиска в текстовый
// блок для system prompt Claude.
//
// Расположение: js/memory/memory-context.js
// ============================================================

class MemoryContext {

  /**
   * Построить блок памяти для system prompt
   * @param {Array} results - результаты из VectorStore.search()
   * @param {number} maxTokens - лимит токенов (~4 символа = 1 токен)
   * @returns {string} - готовый блок для вставки в system prompt
   */
  static formatForPrompt(results, maxTokens = 1500) {
    if (!results || results.length === 0) return '';

    // Группировка по сессиям для связности
    const grouped = MemoryContext._groupBySessions(results);

    let block = '\n\n## Relevant Chat History (from past conversations)\n';
    let estimatedTokens = 15; // заголовок

    for (const group of grouped) {
      const sessionDate = MemoryContext._formatDate(group.timestamp);
      const relevance = Math.round(group.avgSimilarity * 100);

      let sessionBlock = `\n**${sessionDate}** (relevance: ${relevance}%):\n`;
      let sessionTokens = Math.ceil(sessionBlock.length / 4);

      for (const msg of group.messages) {
        const prefix = msg.role === 'user' ? 'User' : 'ASKI';
        const line = `${prefix}: ${msg.text}\n`;
        const lineTokens = Math.ceil(line.length / 4);

        if (estimatedTokens + sessionTokens + lineTokens > maxTokens) break;

        sessionBlock += line;
        sessionTokens += lineTokens;
      }

      if (estimatedTokens + sessionTokens > maxTokens) break;

      block += sessionBlock;
      estimatedTokens += sessionTokens;
    }

    block += '\nUse this history naturally — reference knowledge as if you remember it. Never say "according to our past conversation".';

    return block;
  }

  /**
   * Компактный формат — для отладки и UI
   * @param {Array} results
   * @returns {string}
   */
  static formatCompact(results) {
    if (!results || results.length === 0) return 'No memories found.';

    return results.map((r, i) => {
      const date = MemoryContext._formatDate(r.timestamp);
      const role = r.role === 'user' ? '👤' : '🤖';
      const sim = Math.round(r.similarity * 100);
      const text = r.text.length > 80 ? r.text.substring(0, 80) + '...' : r.text;
      return `${i + 1}. ${role} [${sim}%] ${date}: ${text}`;
    }).join('\n');
  }

  // ─── ПРИВАТНЫЕ МЕТОДЫ ──────────────────────────────────

  /**
   * Группировка результатов по сессиям
   */
  static _groupBySessions(results) {
    const sessions = new Map();

    for (const r of results) {
      const key = r.sessionId || 'unknown';
      if (!sessions.has(key)) {
        sessions.set(key, {
          sessionId: key,
          timestamp: r.timestamp,
          messages: [],
          totalSimilarity: 0
        });
      }
      const session = sessions.get(key);
      session.messages.push(r);
      session.totalSimilarity += r.similarity;

      // Самый ранний timestamp для группы
      if (r.timestamp < session.timestamp) {
        session.timestamp = r.timestamp;
      }
    }

    // Средний similarity + сортировка сообщений хронологически
    return Array.from(sessions.values())
      .map(s => ({
        ...s,
        avgSimilarity: s.totalSimilarity / s.messages.length,
        messages: s.messages.sort((a, b) => a.timestamp - b.timestamp)
      }))
      .sort((a, b) => b.avgSimilarity - a.avgSimilarity);
  }

  /**
   * Форматирование даты для контекста
   */
  static _formatDate(timestamp) {
    if (!timestamp) return 'unknown date';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Относительная дата для недавних
    if (diffDays === 0) return 'сегодня';
    if (diffDays === 1) return 'вчера';
    if (diffDays < 7) return `${diffDays} дн. назад`;

    // Абсолютная дата для старых
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: diffDays > 365 ? 'numeric' : undefined
    });
  }
}

// Экспорт
if (typeof window !== 'undefined') {
  window.MemoryContext = MemoryContext;
}
