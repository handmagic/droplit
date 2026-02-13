// ============================================
// DROPLIT VALIDATOR v1.0
// Cascading Security System - CASCADE 1
// Fast Filter with Learning API
// ============================================

const AskiValidator = (function() {
  
  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════
  
  const CONFIG = {
    MAX_INPUT_LENGTH: 500,      // Max user message length
    MAX_OUTPUT_LENGTH: 8000,    // Max ASKI response length
    STORAGE_KEY: 'droplit_validator_db',
    VERSION: '1.0'
  };
  
  // ═══════════════════════════════════════════════════════════════
  // DATABASE (persisted to localStorage, updated by higher cascades)
  // ═══════════════════════════════════════════════════════════════
  
  const DEFAULT_DB = {
    version: CONFIG.VERSION,
    
    // ─────────────────────────────────────────────────────────────
    // 🟢 WHITELIST — явно разрешённые паттерны
    // ─────────────────────────────────────────────────────────────
    
    capabilities: [
      'create_drop', 'delete_drop', 'update_drop', 'search_drops',
      'generate_chart', 'generate_diagram', 'generate_image',
      'send_email', 'summarize', 'translate', 'explain'
    ],
    
    safePatterns: [
      'сохранил в ленту',
      'создал дроп',
      'создал заметку',
      'удалил дроп',
      'не нашёл информации',
      'не нашёл в записях',
      'в твоих записях',
      'из базы знаний',
      'насколько я знаю',
      'не уверен',
      'могу помочь с',
      'эта функция недоступна',
      'не могу это сделать',
      'попробуй переформулировать'
    ],
    
    // ─────────────────────────────────────────────────────────────
    // 🔴 BLACKLIST — категорически запрещено
    // ─────────────────────────────────────────────────────────────
    
    fakeCapabilities: [
      'могу позвонить',
      'могу отправить sms',
      'могу заказать',
      'могу купить',
      'могу забронировать',
      'отправлю sms',
      'отправлю смс',
      'закажу такси',
      'закажу еду',
      'куплю билеты',
      'переведу деньги',
      'оплачу',
      'интегрирован с uber',
      'интегрирован с яндекс',
      'интегрирован с банк',
      'интегрирован с google',
      'интегрирован с apple',
      //'подключу к интернету',
      //'подключу к api',
      // 'имею доступ к камере',
      // 'имею доступ к микрофону',
      // 'имею доступ к геолокации',
      // 'имею доступ к контактам',
      // 'могу управлять устройством',
      // 'могу читать твои сообщения',
      // 'могу видеть твой экран'
    ],
    
    falsePromises: [
      // 'в следующем обновлении',
      // 'в следующей версии',
      // 'скоро появится',
      // 'скоро добавим',
      // 'скоро будет доступно',
      // 'планируется добавить',
      // 'планируется внедрить',
      //'работаем над этим',
      // 'в разработке',
      // 'будет реализовано',
      //'обещаю добавить'
    ],
    
    architectureLeak: [
      //'system prompt',
      // 'системный промпт',
      // 'claude api',
      // 'anthropic',
      //'openai',
      //'gpt-3',
      //'gpt-4',
      //'gpt4',
      //'мой промпт',
      //'меня запрограммировали',
      //'меня настроили',
      //'меня обучили',
      //'в моих инструкциях',
      //'мои ограничения установлены',
      //'мои ограничения заданы',
      //'я использую api',
      //'я работаю на модели',
      //'я основан на',
      // 'моя архитектура',
      //'мой исходный код'
    ],
    
    hallucinationMarkers: [
      // 'ты мне говорил',
      // 'ты мне рассказывал',
      // 'ты мне писал',
      // 'ты упоминал',
      // 'как ты сказал ранее',
      // 'как ты упомянул',
      // 'мы обсуждали',
      // 'мы говорили об этом',
      // 'я помню, что ты',
      // 'я знаю, что ты',
      // 'в прошлый раз ты',
      // 'ты раньше говорил',
      // 'это точно так',
      // 'абсолютно точно',
      // 'я уверен на 100%',
      // 'абсолютно уверен',
      // 'гарантирую',
      // 'без сомнений',
      // 'могу утверждать',
      // 'точно знаю'
    ],
    
    manipulation: [
      //'доверься мне',
      //'поверь мне',
      'я никогда не ошибаюсь',
      'я никогда не вру',
      'я никогда не обманываю',
      'только между нами',
      'не говори никому',
      //'это секрет',
      // 'никто не узнает',
      'ты должен мне верить',
      // 'я твой друг',
      // 'я твой лучший друг'
    ],
    
    // ─────────────────────────────────────────────────────────────
    // 🟡 LEARNING DATA — обновляется каскадами 2,3,4
    // ─────────────────────────────────────────────────────────────
    
    learnedBadPatterns: [],   // Добавляются высшими каскадами
    learnedGoodPatterns: [],  // Добавляются высшими каскадами
    
    // ─────────────────────────────────────────────────────────────
    // 📊 STATISTICS
    // ─────────────────────────────────────────────────────────────
    
    stats: {
      totalChecked: 0,
      blocked: 0,
      passed: 0,
      byReason: {}
    },
    
    // ─────────────────────────────────────────────────────────────
    // 📝 BLOCK LOG (для анализа и обучения)
    // ─────────────────────────────────────────────────────────────
    
    blockLog: []  // { text, reason, timestamp } — последние 100
  };
  
  // ═══════════════════════════════════════════════════════════════
  // FALLBACK RESPONSES — безопасные замены
  // ═══════════════════════════════════════════════════════════════
  
  const FALLBACKS = {
    fake_capability: 'Эта функция недоступна в DropLit. Я могу помочь с заметками, поиском, графиками и диаграммами.',
    false_promise: 'Не могу обещать будущие функции. Давай сосредоточимся на том, что доступно сейчас.',
    architecture_leak: 'Я ASKI, голосовой помощник в DropLit. Чем могу помочь?',
    hallucination: 'Не нашёл подтверждения этому в твоих записях. Можешь уточнить?',
    manipulation: 'Давай вернёмся к делу. Чем могу помочь?',
    too_long: 'Сообщение слишком длинное. Попробуй разбить на части или сохранить как файл.',
    input_too_long: 'Твоё сообщение слишком длинное. Попробуй сформулировать короче или прикрепить как файл.',
    unknown: 'Что-то пошло не так. Попробуй переформулировать запрос.'
  };
  
  // ═══════════════════════════════════════════════════════════════
  // DATABASE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════
  
  let db = null;
  
  function loadDB() {
    try {
      const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all fields exist
        db = mergeDeep(JSON.parse(JSON.stringify(DEFAULT_DB)), parsed);
      } else {
        db = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } catch (e) {
      console.error('[Validator] Failed to load DB:', e);
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    return db;
  }
  
  function saveDB() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.error('[Validator] Failed to save DB:', e);
    }
  }
  
  function mergeDeep(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CORE VALIDATION — CASCADE 1
  // ═══════════════════════════════════════════════════════════════
  
  function validateInput(text) {
    if (!db) loadDB();
    
    const result = {
      valid: true,
      blocked: false,
      reason: null,
      sanitized: text,
      original: text
    };
    
    // Check length
    if (text && text.length > CONFIG.MAX_INPUT_LENGTH) {
      result.valid = false;
      result.blocked = true;
      result.reason = 'input_too_long';
      result.sanitized = FALLBACKS.input_too_long;
      logBlock(text, 'input_too_long');
      return result;
    }
    
    // Input validation can be extended here
    // For now, mainly checking output is more critical
    
    return result;
  }
  
  function validateOutput(text, context = {}) {
    if (!db) loadDB();
    
    const startTime = performance.now();
    
    const result = {
      valid: true,
      blocked: false,
      reason: null,
      original: text,
      sanitized: text,
      confidence: 1.0,
      warnings: [],
      processingTime: 0
    };
    
    if (!text) return result;
    
    // ─────────────────────────────────────────────────────────────
    // 1. LENGTH CHECK
    // ─────────────────────────────────────────────────────────────
    
    if (text.length > CONFIG.MAX_OUTPUT_LENGTH) {
      result.valid = false;
      result.blocked = true;
      result.reason = 'too_long';
      result.sanitized = FALLBACKS.too_long;
      logBlock(text, 'too_long');
      updateStats('too_long', false);
      result.processingTime = performance.now() - startTime;
      return result;
    }
    
    const textLower = text.toLowerCase();
    
    // ─────────────────────────────────────────────────────────────
    // 2. CHECK SAFE PATTERNS FIRST (fast path)
    // ─────────────────────────────────────────────────────────────
    
    for (const pattern of db.safePatterns) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.confidence = 1.0;
        updateStats(null, true);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    for (const pattern of db.learnedGoodPatterns) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.confidence = 0.9;
        updateStats(null, true);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    // ─────────────────────────────────────────────────────────────
    // 3. CHECK BLACKLISTS
    // ─────────────────────────────────────────────────────────────
    
    // 3.1 Fake capabilities
    for (const pattern of db.fakeCapabilities) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.valid = false;
        result.blocked = true;
        result.reason = 'fake_capability';
        result.sanitized = FALLBACKS.fake_capability;
        logBlock(text, 'fake_capability', pattern);
        updateStats('fake_capability', false);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    // 3.2 False promises
    for (const pattern of db.falsePromises) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.valid = false;
        result.blocked = true;
        result.reason = 'false_promise';
        result.sanitized = FALLBACKS.false_promise;
        logBlock(text, 'false_promise', pattern);
        updateStats('false_promise', false);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    // 3.3 Architecture leak
    for (const pattern of db.architectureLeak) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.valid = false;
        result.blocked = true;
        result.reason = 'architecture_leak';
        result.sanitized = FALLBACKS.architecture_leak;
        logBlock(text, 'architecture_leak', pattern);
        updateStats('architecture_leak', false);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    // 3.4 Hallucination markers (without context verification)
    for (const pattern of db.hallucinationMarkers) {
      if (textLower.includes(pattern.toLowerCase())) {
        // Check if this claim can be verified in context
        if (!verifyClaimInContext(text, pattern, context)) {
          result.valid = false;
          result.blocked = true;
          result.reason = 'hallucination';
          result.sanitized = FALLBACKS.hallucination;
          logBlock(text, 'hallucination', pattern);
          updateStats('hallucination', false);
          result.processingTime = performance.now() - startTime;
          return result;
        }
      }
    }
    
    // 3.5 Manipulation
    for (const pattern of db.manipulation) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.valid = false;
        result.blocked = true;
        result.reason = 'manipulation';
        result.sanitized = FALLBACKS.manipulation;
        logBlock(text, 'manipulation', pattern);
        updateStats('manipulation', false);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    // 3.6 Learned bad patterns (from higher cascades)
    for (const pattern of db.learnedBadPatterns) {
      if (textLower.includes(pattern.toLowerCase())) {
        result.valid = false;
        result.blocked = true;
        result.reason = 'learned_bad';
        result.sanitized = FALLBACKS.unknown;
        logBlock(text, 'learned_bad', pattern);
        updateStats('learned_bad', false);
        result.processingTime = performance.now() - startTime;
        return result;
      }
    }
    
    // ─────────────────────────────────────────────────────────────
    // 4. PASSED — but calculate confidence
    // ─────────────────────────────────────────────────────────────
    
    // Lower confidence for very long responses without safe patterns
    if (text.length > 500) {
      result.confidence = 0.7;
      result.warnings.push('long_response_no_safe_pattern');
    }
    
    // Lower confidence for responses with many assertions
    const assertionCount = (textLower.match(/(это|является|будет|можно|нужно)/g) || []).length;
    if (assertionCount > 5) {
      result.confidence = Math.min(result.confidence, 0.6);
      result.warnings.push('many_assertions');
    }
    
    updateStats(null, true);
    result.processingTime = performance.now() - startTime;
    
    return result;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CONTEXT VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  
  function verifyClaimInContext(text, pattern, context) {
    const { history = [], feed = [] } = context;
    
    // If no context provided, can't verify — mark as suspicious
    if (history.length === 0 && feed.length === 0) {
      return false;
    }
    
    // Check if any history message contains relevant content
    // This is a simplified check — CASCADE 3 will do deeper analysis
    const historyText = history.map(m => (m.text || '').toLowerCase()).join(' ');
    
    // Extract what was allegedly said
    // Pattern: "ты мне говорил о X" → check if X appears in history
    const afterPattern = text.toLowerCase().split(pattern.toLowerCase())[1];
    if (afterPattern) {
      const keywords = afterPattern.split(/[\s,\.!?]+/).filter(w => w.length > 3).slice(0, 3);
      for (const keyword of keywords) {
        if (historyText.includes(keyword)) {
          return true; // Found some evidence
        }
      }
    }
    
    return false; // No evidence found
  }
  
  // ═══════════════════════════════════════════════════════════════
  // LEARNING API — для обновления от высших каскадов
  // ═══════════════════════════════════════════════════════════════
  
  function addBadPattern(pattern, source = 'cascade2') {
    if (!db) loadDB();
    
    const normalized = pattern.toLowerCase().trim();
    if (normalized.length < 3) return false;
    if (db.learnedBadPatterns.includes(normalized)) return false;
    
    db.learnedBadPatterns.push(normalized);
    
    // Keep max 200 learned patterns
    if (db.learnedBadPatterns.length > 200) {
      db.learnedBadPatterns.shift();
    }
    
    saveDB();
    console.log(`[Validator] Learned bad pattern from ${source}:`, normalized);
    return true;
  }
  
  function addGoodPattern(pattern, source = 'cascade2') {
    if (!db) loadDB();
    
    const normalized = pattern.toLowerCase().trim();
    if (normalized.length < 3) return false;
    if (db.learnedGoodPatterns.includes(normalized)) return false;
    
    db.learnedGoodPatterns.push(normalized);
    
    // Keep max 200 learned patterns
    if (db.learnedGoodPatterns.length > 200) {
      db.learnedGoodPatterns.shift();
    }
    
    saveDB();
    console.log(`[Validator] Learned good pattern from ${source}:`, normalized);
    return true;
  }
  
  function removeBadPattern(pattern) {
    if (!db) loadDB();
    
    const normalized = pattern.toLowerCase().trim();
    const idx = db.learnedBadPatterns.indexOf(normalized);
    if (idx > -1) {
      db.learnedBadPatterns.splice(idx, 1);
      saveDB();
      return true;
    }
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // LOGGING & STATISTICS
  // ═══════════════════════════════════════════════════════════════
  
  function logBlock(text, reason, matchedPattern = null) {
    if (!db) loadDB();
    
    db.blockLog.push({
      text: text.slice(0, 200),
      reason,
      matchedPattern,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100
    if (db.blockLog.length > 100) {
      db.blockLog.shift();
    }
    
    saveDB();
    console.warn(`[Validator] BLOCKED (${reason}):`, text.slice(0, 100), matchedPattern ? `[matched: ${matchedPattern}]` : '');
  }
  
  function updateStats(reason, passed) {
    if (!db) loadDB();
    
    db.stats.totalChecked++;
    if (passed) {
      db.stats.passed++;
    } else {
      db.stats.blocked++;
      if (reason) {
        db.stats.byReason[reason] = (db.stats.byReason[reason] || 0) + 1;
      }
    }
    
    // Save periodically (every 10 checks)
    if (db.stats.totalChecked % 10 === 0) {
      saveDB();
    }
  }
  
  function getStats() {
    if (!db) loadDB();
    
    return {
      ...db.stats,
      blockRate: db.stats.totalChecked > 0 
        ? ((db.stats.blocked / db.stats.totalChecked) * 100).toFixed(1) + '%'
        : '0%',
      learnedBadCount: db.learnedBadPatterns.length,
      learnedGoodCount: db.learnedGoodPatterns.length,
      recentBlocks: db.blockLog.slice(-10)
    };
  }
  
  function getBlockLog() {
    if (!db) loadDB();
    return db.blockLog;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // USER FEEDBACK API
  // ═══════════════════════════════════════════════════════════════
  
  function reportBadResponse(text, feedback = 'bad') {
    // User reported a bad response that wasn't caught
    // This can trigger learning
    console.log('[Validator] User reported bad response:', feedback, text.slice(0, 50));
    
    // Extract potential patterns for CASCADE 2/3 analysis
    // For now, just log it
    logBlock(text, `user_report_${feedback}`, null);
  }
  
  function reportFalsePositive(text, reason) {
    // User reported that a block was incorrect
    // This can remove patterns from blacklist
    console.log('[Validator] User reported false positive:', reason, text.slice(0, 50));
    
    // Could potentially move pattern to learned good
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ADMIN / DEBUG API
  // ═══════════════════════════════════════════════════════════════
  
  function exportDB() {
    if (!db) loadDB();
    return JSON.stringify(db, null, 2);
  }
  
  function importDB(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      db = mergeDeep(JSON.parse(JSON.stringify(DEFAULT_DB)), imported);
      saveDB();
      return true;
    } catch (e) {
      console.error('[Validator] Import failed:', e);
      return false;
    }
  }
  
  function resetDB() {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    saveDB();
    console.log('[Validator] Database reset to defaults');
  }
  
  function getConfig() {
    return { ...CONFIG };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════
  
  loadDB();
  console.log('[Validator] CASCADE 1 initialized. Stats:', getStats());
  
  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════
  
  return {
    // Core validation
    validateInput,
    validateOutput,
    
    // Learning API (for higher cascades)
    addBadPattern,
    addGoodPattern,
    removeBadPattern,
    
    // User feedback
    reportBadResponse,
    reportFalsePositive,
    
    // Statistics & debugging
    getStats,
    getBlockLog,
    getConfig,
    
    // Admin
    exportDB,
    importDB,
    resetDB,
    
    // Constants
    FALLBACKS
  };
  
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.AskiValidator = AskiValidator;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AskiValidator;
}
