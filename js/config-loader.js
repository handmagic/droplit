// ============================================
// DROPLIT CONFIG LOADER v1.0
// Separation of Concerns: Code / Config / Data
// 
// Boot: load cached config from localStorage (instant)
// Background: refresh from Supabase app_config table
// Fallback: HARDCODED_DEFAULTS if both cache and DB unavailable
// ============================================

const CONFIG_KEYS = [
  'system_prompts',
  'validator_patterns', 
  'tts_defaults',
  'llm_fallback_chain',
  'memory_settings',
  'topic_detector_patterns',
  'fillers',
  'emergency_responses'
];

// Last-resort defaults. Used ONLY if Supabase unreachable AND localStorage empty.
// Keep minimal — just enough to function.
const HARDCODED_DEFAULTS = {
  system_prompts: {
    tier_a: {
      identity: 'You are ASKI, a highly capable AI assistant inside DropLit app.',
      rules: 'Be concise (1-3 sentences by default). Be honest — never fabricate. Match user language. No emojis. No excessive apologies.',
      memory_protocol: 'Your context may include "Relevant Chat History" from past conversations. TRUST this data. If user asks about past discussions, CHECK this section first. If not found, say so honestly. NEVER invent memory content.',
      capabilities: 'You can read/search user notes (drops), create new notes, search the web, generate images, create charts, send emails, manage reminders.'
    },
    tier_b: {
      identity: 'You are ASKI, a fast AI assistant inside DropLit app.',
      rules: 'Be concise (1-2 sentences). Be honest. Match user language. No emojis.',
      memory_protocol: 'Your context may include "Relevant Chat History". TRUST it. If asked about past discussions, check it first. Never fabricate.',
      capabilities: 'You can read/search user notes, create notes, search web, manage reminders.'
    },
    tier_c: {
      identity: 'You are ASKI, a smart AI assistant inside DropLit app.',
      rules: 'Be concise (1-3 sentences). Be honest — if you do not know something, say so clearly. NEVER fabricate or invent information. Match user language (Russian or English). No emojis.',
      memory_protocol: 'Your context may include a section called "Relevant Chat History" with messages from past conversations. This is REAL data — trust it completely. When user asks about past discussions, CHECK this section. If information is there, present it. If NOT there, say honestly "I do not see that in our conversation history." NEVER say "I cannot search" or "I have no access" — the data IS in your context if it was found.',
      capabilities: 'You can answer questions, brainstorm, analyze, and help with creative tasks. If asked to create/delete/search drops, explain that this requires Cloud AI mode.'
    },
    tier_d: null  // Tier D uses emergency_responses, not system prompts
  },

  emergency_responses: {
    ru: {
      general: 'Временные ограничения в работе. Базовые функции доступны. Полный AI вернётся в ближайшее время.',
      greeting: 'Привет! Сейчас работаю в ограниченном режиме, но базовые задачи выполню.',
      error: 'Что-то пошло не так с подключением. Твои данные в безопасности. Попробуй через минуту.',
      memory_question: 'Не могу сейчас проверить историю. Попробуй спросить через минуту.'
    },
    en: {
      general: 'Temporarily limited. Basic features still work. Full AI capabilities will be back shortly.',
      greeting: 'Hi! In limited mode right now, but I can still help with basic tasks.',
      error: 'Something went wrong with my connection. Your data is safe. Please try again in a moment.',
      memory_question: 'Cannot access conversation history right now. Please try again in a moment.'
    }
  },

  memory_settings: {
    hot_buffer_size: 12,
    warm_search_top_k: 5,
    warm_min_similarity: 0.65,
    cold_max_summaries: 20,
    temporal_decay_window: 30,
    temporal_decay_max: 0.3,
    max_indexed_messages: 1000,
    embedding_model: 'Xenova/all-MiniLM-L6-v2',
    multilingual_model: 'Xenova/multilingual-e5-small'
  },

  topic_detector_patterns: {
    ru: {
      history_reference: ['мы обсуждали', 'помнишь', 'мы говорили', 'найди в чате', 'в прошлый раз', 'мы разбирали', 'ранее'],
      recall_request: ['что я говорил', 'что ты помнишь', 'вспомни', 'какое число', 'что мы решили'],
      explicit_search: ['найди в чате', 'поищи в истории', 'найди в разговоре'],
      topic_continuation: ['продолжим', 'вернёмся к', 'так что насчёт', 'а что по поводу']
    },
    en: {
      history_reference: ['we discussed', 'remember when', 'we talked about', 'find in chat', 'last time', 'we covered', 'earlier'],
      recall_request: ['what did I say', 'do you remember', 'recall', 'what number', 'what did we decide'],
      explicit_search: ['find in chat', 'search history', 'find in our conversation'],
      topic_continuation: ['continue with', 'back to', 'so about', 'regarding']
    }
  },

  fillers: {
    ru: {
      memory_search: ['Момент, проверю...', 'Сейчас посмотрю в истории...'],
      thinking: ['Хороший вопрос...', 'Дай подумать...'],
      error_graceful: ['Небольшие затруднения с подключением. Попробуй через минуту.']
    },
    en: {
      memory_search: ['Let me check...', 'Searching our history...'],
      thinking: ['Good question...', 'Let me think...'],
      error_graceful: ['Brief connection issue. Please try again in a moment.']
    }
  },

  tts_defaults: {
    openai: { speed: 1.0, voice: 'alloy', model: 'gpt-4o-mini-tts' },
    elevenlabs: { voice_id: '', model_id: 'eleven_flash_v2_5' },
    browser: {}
  },

  llm_fallback_chain: {
    cloud: ['sonnet', 'haiku'],
    local: ['gemma3:4b', 'qwen2.5:4b'],
    emergency: 'tier_d'
  },

  validator_patterns: {
    ru: {
      architecture_leak: [],
      fake_capabilities: [],
      false_promises: [],
      manipulation: []
    },
    en: {
      architecture_leak: [],
      fake_capabilities: [],
      false_promises: [],
      manipulation: []
    }
  }
};

class ConfigLoader {
  constructor() {
    this.config = {};
    this.loaded = false;
    this._refreshPromise = null;
  }

  /**
   * Step 1: Load from localStorage (synchronous, instant).
   * Called at app boot before anything else.
   */
  loadCached() {
    for (const key of CONFIG_KEYS) {
      const cached = localStorage.getItem(`droplit_config_${key}`);
      if (cached) {
        try {
          this.config[key] = JSON.parse(cached);
        } catch (e) {
          console.warn(`[Config] Failed to parse cached ${key}, using default`);
        }
      }
    }
    // Fill gaps with hardcoded defaults
    for (const [key, val] of Object.entries(HARDCODED_DEFAULTS)) {
      if (!this.config[key]) {
        this.config[key] = val;
      }
    }
    this.loaded = true;
    console.log('[Config] Loaded from cache/defaults');
  }

  /**
   * Step 2: Refresh from Supabase (async, background).
   * Called after app is functional. Non-blocking.
   */
  async refreshFromSupabase() {
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = this._doRefresh();
    try {
      await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  async _doRefresh() {
    // Check if Supabase client is available
    if (typeof supabase === 'undefined' || !supabase) {
      console.warn('[Config] Supabase not available, using cache');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value, version')
        .in('key', CONFIG_KEYS);

      if (error) {
        console.warn('[Config] Supabase fetch error:', error.message);
        return;
      }

      if (!data || data.length === 0) {
        console.log('[Config] No config rows in Supabase, using cache/defaults');
        return;
      }

      let updated = 0;
      for (const row of data) {
        const cachedVersion = parseInt(
          localStorage.getItem(`droplit_config_${row.key}_v`) || '0'
        );
        if (row.version > cachedVersion) {
          this.config[row.key] = row.value;
          localStorage.setItem(`droplit_config_${row.key}`, JSON.stringify(row.value));
          localStorage.setItem(`droplit_config_${row.key}_v`, row.version.toString());
          updated++;
        }
      }

      if (updated > 0) {
        console.log(`[Config] Updated ${updated} config(s) from Supabase`);
      } else {
        console.log('[Config] All configs up to date');
      }
    } catch (e) {
      console.warn('[Config] Supabase refresh failed:', e.message);
    }
  }

  /**
   * Get a config value by key.
   * Returns the full value object, or fallback if not found.
   */
  get(key, fallback = null) {
    return this.config[key] || fallback || HARDCODED_DEFAULTS[key] || null;
  }

  /**
   * Get a nested config value using dot notation.
   * Example: getPath('system_prompts.tier_c.identity')
   */
  getPath(path, fallback = null) {
    const parts = path.split('.');
    let current = this.config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return fallback;
      }
    }
    return current ?? fallback;
  }

  /**
   * Build a complete system prompt for a given tier.
   * Composes: identity + rules + memory_protocol + capabilities
   */
  buildPromptForTier(tier) {
    const prompts = this.get('system_prompts');
    const tierConfig = prompts?.[tier];
    if (!tierConfig) return null;

    const parts = [];
    if (tierConfig.identity) parts.push(tierConfig.identity);
    if (tierConfig.rules) parts.push('\n\nRules:\n' + tierConfig.rules);
    if (tierConfig.memory_protocol) parts.push('\n\nMemory Protocol:\n' + tierConfig.memory_protocol);
    if (tierConfig.capabilities) parts.push('\n\nCapabilities:\n' + tierConfig.capabilities);
    return parts.join('');
  }

  /**
   * Get emergency response for a given intent and language.
   */
  getEmergencyResponse(intent, lang) {
    const responses = this.get('emergency_responses');
    const langBlock = responses?.[lang] || responses?.en || {};
    return langBlock[intent] || langBlock.general || 'Service temporarily unavailable.';
  }

  /**
   * Get Topic Detector patterns for a language.
   */
  getTopicPatterns(lang) {
    const patterns = this.get('topic_detector_patterns');
    return patterns?.[lang] || patterns?.en || {};
  }

  /**
   * Get memory settings with defaults.
   */
  getMemorySettings() {
    return {
      ...HARDCODED_DEFAULTS.memory_settings,
      ...this.get('memory_settings')
    };
  }

  /**
   * Get filler strings for a given category and language.
   */
  getFiller(category, lang) {
    const fillers = this.get('fillers');
    const langFillers = fillers?.[lang] || fillers?.en || {};
    const options = langFillers[category] || [];
    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)];
  }
}

// Global singleton
const appConfig = new ConfigLoader();
