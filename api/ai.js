// DropLit AI API v4.18 - Vercel Edge Function
// + CONFLICT RESOLUTION PROTOCOL for contradictory facts
// + Transparent handling of uncertainty
// + Explicit "CHECK MEMORY FIRST" instruction
// + Smart prioritization: recent > old, specific > vague
// + EVENT SCHEDULING: create_event tool for reminders/alarms
// + MODEL SELECTION: Choose between Sonnet (ASKI) and Opus (Deep)
// + API COST TRACKING v1.0
// + TOKEN DEDUCTION v1.0
// + VOICE AUTO-MODEL v1.0 ← NEW: Haiku for simple, Opus for deep
// Version: 4.18.0

export const config = {
  runtime: 'edge',
};

// ============================================
// AI MODELS CONFIGURATION
// ============================================
const AI_MODELS = {
  'sonnet': {
    id: 'claude-sonnet-4-20250514',
    name: 'ASKI (Sonnet)',
    description: 'Fast, creative, enthusiastic',
    maxTokens: 4096
  },
  'opus': {
    id: 'claude-opus-4-20250514',
    name: 'ASKI Deep (Opus)',
    description: 'Deep thinking, thorough analysis',
    maxTokens: 8192
  },
  'haiku': {
    id: 'claude-3-5-haiku-20241022',
    name: 'ASKI Quick (Haiku)',
    description: 'Lightning fast responses',
    maxTokens: 2048
  }
};

const DEFAULT_MODEL = 'sonnet';

function getModelConfig(modelKey) {
  return AI_MODELS[modelKey] || AI_MODELS[DEFAULT_MODEL];
}

// ============================================
// VOICE MODE: AUTO MODEL SELECTION
// ============================================
// For voice mode: optimize between Haiku (fast/cheap) and Sonnet (balanced)
// Opus is ONLY used when explicitly selected in settings (NOUS)

const VOICE_SIMPLE_PATTERNS = [
  // Приветствия и болтовня
  /^(привет|здравствуй|добр(ое|ый)|хай|хелло|как дела|что нового)/i,
  /^(спасибо|пока|до свидания|хорошего дня|удачи)/i,
  // Простые вопросы
  /^(который час|какой сегодня день|какая погода)/i,
  /^(сколько будет|посчитай)\s+\d/i,
  // Рецепты и быт
  /(рецепт|приготов|сварить|пожарить|испечь)/i,
  /(что приготовить|что поесть|на ужин|на обед|на завтрак)/i,
  // Быстрые факты
  /^(что такое|кто такой|где находится|как называется)/i,
  /^(переведи|перевод)\s/i,
  // Команды
  /^(напомни|запиши|сохрани|создай напоминание)/i,
  /^(поставь таймер|разбуди|alarm)/i,
];

function selectModelForVoice(text) {
  const trimmed = (text || '').trim().toLowerCase();
  const wordCount = trimmed.split(/\s+/).length;
  
  // Простые паттерны → Haiku
  for (const pattern of VOICE_SIMPLE_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.log('[VoiceModel] Simple pattern matched → haiku');
      return 'haiku';
    }
  }
  
  // Короткие запросы (≤5 слов) → Haiku
  if (wordCount <= 5) {
    console.log('[VoiceModel] Short query (≤5 words) → haiku');
    return 'haiku';
  }
  
  // Всё остальное → Sonnet (не повышаем до Opus автоматически)
  console.log('[VoiceModel] Default → sonnet');
  return 'sonnet';
}

// ============================================
// API COST TRACKING (NEW in v4.16)
// ============================================
const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Pricing per 1M tokens (USD)
const API_PRICING = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 }
};

async function logApiCost(params) {
  const {
    provider = 'anthropic',
    model,
    tokens_input = 0,
    tokens_output = 0,
    user_id = null,
    action = 'chat'
  } = params;
  
  // Calculate cost
  const pricing = API_PRICING[model] || { input: 3.00, output: 15.00 };
  const cost_usd = (tokens_input * pricing.input + tokens_output * pricing.output) / 1_000_000;
  
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) {
    console.log('[Cost Log] No SUPABASE_SERVICE_KEY, skipping');
    return;
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/api_costs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        provider,
        model,
        tokens_input,
        tokens_output,
        cost_usd,
        user_id,
        action
      })
    });
    
    if (!response.ok) {
      console.error('[Cost Log] Failed:', response.status);
    } else {
      console.log(`[Cost Log] ${action}: ${tokens_input}/${tokens_output} tokens, $${cost_usd.toFixed(6)}`);
    }
  } catch (err) {
    console.error('[Cost Log] Error:', err.message);
    // Don't throw - logging should never break the main flow
  }
}

// ============================================
// DEDUCT USER TOKENS (NEW in v4.17)
// ============================================
async function deductUserTokens(userId, inputTokens, outputTokens, action) {
  if (!userId) return null;
  
  // Exchange rate: input tokens 1:1, output tokens 1:5 (output costs more)
  const tokenCost = Math.ceil(inputTokens + outputTokens * 5);
  
  if (tokenCost <= 0) return null;
  
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return null;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deduct_tokens`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_amount: tokenCost,
        p_reason: `${action}: ${inputTokens}in/${outputTokens}out`
      })
    });
    
    if (!response.ok) {
      console.error('[Deduct] Failed:', response.status);
      return null;
    }
    
    const result = await response.json();
    const data = result[0] || {};
    
    if (data.success) {
      console.log(`[Deduct] -${tokenCost} tokens, balance: ${data.new_balance}`);
    } else {
      console.warn(`[Deduct] ${data.error_message}, balance: ${data.new_balance}`);
    }
    
    return data;
  } catch (err) {
    console.error('[Deduct] Error:', err.message);
    return null;
  }
}

// ============================================
// RATE LIMITING
// ============================================
const rateLimitStore = new Map();

const RATE_LIMITS = {
  default: { requests: 60, windowMs: 60000 },
  ai: { requests: 20, windowMs: 60000 },
};

function getRateLimitKey(request, type = 'default') {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown';
  return `${type}:${ip}`;
}

function checkRateLimit(key, limitType = 'default') {
  const now = Date.now();
  const limit = RATE_LIMITS[limitType];
  
  if (rateLimitStore.size > 10000) {
    const cutoff = now - 120000;
    for (const [k, v] of rateLimitStore) {
      if (v.windowStart < cutoff) {
        rateLimitStore.delete(k);
      }
    }
  }
  
  const record = rateLimitStore.get(key);
  
  if (!record || (now - record.windowStart) > limit.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit.requests - 1 };
  }
  
  if (record.count >= limit.requests) {
    const resetIn = Math.ceil((record.windowStart + limit.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, resetIn };
  }
  
  record.count++;
  return { allowed: true, remaining: limit.requests - record.count };
}

function rateLimitResponse(resetIn) {
  return new Response(JSON.stringify({
    error: 'Too many requests',
    message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
    retryAfter: resetIn
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(resetIn),
      'Access-Control-Allow-Origin': '*',
    }
  });
}

// ============================================
// TOOL DEFINITIONS
// ============================================
const TOOLS = [
  {
    name: "fetch_recent_drops",
    description: "Get user's recent notes from their knowledge base. Use when user asks about their notes, tasks, ideas for a specific period.",
    input_schema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "How many hours back (default 24)" },
        limit: { type: "number", description: "Max records (default 10)" },
        category: { type: "string", description: "Filter: tasks, ideas, bugs, questions, design, inbox" }
      },
      required: []
    }
  },
  {
    name: "search_drops",
    description: "Search user's notes and commands by keywords. Searches both regular drops and command drops. Can decrypt encrypted content.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords" },
        limit: { type: "number", description: "Max results (default 5)" },
        include_commands: { type: "boolean", description: "Also search command_drops (default true)" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_recent_drops",
    description: "Get most recent drops from user's feed. Use this to see latest notes, ideas, or commands. Shows actual current content.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many drops to return (default 5, max 20)" },
        include_commands: { type: "boolean", description: "Include command drops like reminders (default true)" },
        category: { type: "string", description: "Filter by category (optional)" }
      },
      required: []
    }
  },
  {
    name: "create_drop",
    description: "Create note. Use ONLY when user EXPLICITLY asks to save/remember.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Note content" },
        category: { type: "string", enum: ["tasks", "ideas", "bugs", "questions", "design", "inbox"] }
      },
      required: ["text"]
    }
  },
  {
    name: "get_summary",
    description: "Get summary of user's notes for a period.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month"] }
      },
      required: []
    }
  },
  {
    name: "web_search",
    description: "Search internet for current events, news, weather, prices, facts.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        search_depth: { type: "string", enum: ["basic", "advanced"] }
      },
      required: ["query"]
    }
  },
  {
    name: "create_event",
    description: "Create a command drop: reminder, alarm, or scheduled notification. Use when user asks to remind, wake up, schedule something. Trigger phrases: 'remind me...', 'wake me up...', 'in X hours...', 'tomorrow at...', 'напомни...', 'разбуди...', 'через X минут...'",
    input_schema: {
      type: "object",
      properties: {
        name: { 
          type: "string", 
          description: "Short title for the reminder/alarm" 
        },
        description: { 
          type: "string", 
          description: "Detailed description of what to remind about" 
        },
        trigger_type: { 
          type: "string", 
          enum: ["datetime", "cron"], 
          description: "datetime for one-time, cron for recurring" 
        },
        trigger_at: { 
          type: "string", 
          description: "ISO datetime when to trigger (e.g. 2026-01-15T08:00:00Z). REQUIRED for datetime type. Always include timezone or use UTC." 
        },
        cron_expression: { 
          type: "string", 
          description: "Cron expression for recurring (e.g. '0 8 * * *' = daily 8am). Use for 'every day', 'every morning' etc." 
        },
        action_type: { 
          type: "string", 
          enum: ["push", "tts", "email", "telegram"], 
          description: "push=notification banner (default), tts=voice announcement, email=send email, telegram=telegram message" 
        },
        priority: { 
          type: "number", 
          description: "1-10 urgency. Use 8-10 for alarms/wake-up, 5 for normal reminders, 1-3 for low priority" 
        }
      },
      required: ["name", "trigger_type", "action_type"]
    }
  },
  {
    name: "cancel_event",
    description: "Cancel/delete an existing reminder or scheduled event. Use when user asks to cancel, delete, remove a reminder. Trigger phrases: 'cancel reminder...', 'delete reminder...', 'remove alarm...', 'отмени напоминание...', 'удали напоминание...', 'отмена...'",
    input_schema: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "ID of the event to cancel (from list_events or recent context)"
        },
        search_query: {
          type: "string",
          description: "Search text to find the reminder to cancel (if ID not known). Searches in reminder titles."
        }
      },
      required: []
    }
  },
  {
    name: "list_events",
    description: "List all active reminders and scheduled events. Use when user asks to see, show, list reminders. Trigger phrases: 'show my reminders', 'what reminders...', 'list alarms', 'покажи напоминания', 'какие напоминания', 'мои напоминания'",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "executed", "cancelled", "all"],
          description: "Filter by status. Default: pending (active reminders)"
        },
        limit: {
          type: "number",
          description: "Max number of events to return. Default: 10"
        }
      },
      required: []
    }
  },
  {
    name: "delete_drop",
    description: "Delete a drop from user's feed. Use when user asks to remove/delete a note, idea, or command from their feed. Works with any drop type including command drops after cancellation.",
    input_schema: {
      type: "object",
      properties: {
        drop_id: {
          type: "string",
          description: "ID of the drop to delete (UUID format)"
        },
        search_query: {
          type: "string",
          description: "Text to search for if ID not provided - will find and delete matching drop"
        },
        confirm: {
          type: "boolean",
          description: "Set to true to confirm deletion. Always ask user first before deleting."
        }
      },
      required: ["confirm"]
    }
  },
  {
    name: "update_drop",
    description: "Edit/update content of an existing drop in user's feed. Use when user asks to change, edit, or modify text of a note or idea.",
    input_schema: {
      type: "object",
      properties: {
        drop_id: {
          type: "string",
          description: "ID of the drop to update (UUID format)"
        },
        search_query: {
          type: "string",
          description: "Text to search for if ID not provided"
        },
        new_content: {
          type: "string",
          description: "New text content for the drop"
        }
      },
      required: ["new_content"]
    }
  },
  {
    name: "update_event",
    description: "Modify an existing reminder/scheduled event. Use when user wants to change time, reschedule, or update reminder text. Trigger phrases: 'change reminder to...', 'reschedule...', 'move reminder to...', 'перенеси напоминание...', 'измени время...'",
    input_schema: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "ID of the reminder to update (UUID format)"
        },
        search_query: {
          type: "string",
          description: "Text to search for if ID not provided"
        },
        new_title: {
          type: "string",
          description: "New title/name for the reminder"
        },
        new_time: {
          type: "string",
          description: "New trigger time in ISO format (e.g. 2026-01-15T10:00:00Z)"
        },
        new_description: {
          type: "string",
          description: "New description text"
        }
      },
      required: []
    }
  }
];

// ============================================
// EXPANSION DETECTION
// ============================================
function isShortAffirmative(text) {
  return text.trim().length < 25;
}

// Helper: format relative time
function getTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ============================================
// ANTI-FACT FILTER
// ============================================
const ANTI_FACT_PATTERNS = [
  // AI meta-statements
  /ai (does not|doesn't|не) (have|know|знает)/i,
  /no information about/i,
  /нет информации/i,
  /не знаю/i,
  /no records/i,
  /нет записей/i,
  /first time.*mention/i,
  /первый раз.*упоминаю/i,
  /I don't have data/i,
  /у меня нет данных/i,
  /cannot find/i,
  /не могу найти/i,
  /not found in/i,
  /не найден/i,
  
  // Technical junk (bug reports, feature requests)
  /функция.*перестала/i,
  /function.*stopped/i,
  /баг|bug/i,
  /ошибка в коде/i,
  /error in code/i,
  /не работает корректно/i,
  /doesn't work correctly/i,
  /задачи создаются/i,
  /tasks are created/i,
  /без подтверждения/i,
  /without confirmation/i,
  /без разрешения/i,
  /without permission/i,
  /нужно исправить/i,
  /need to fix/i,
  /TODO|FIXME/i,
  /отладк|debug/i
];

function isAntiFact(fact) {
  if (!fact) return true;
  return ANTI_FACT_PATTERNS.some(pattern => pattern.test(fact));
}

function filterMemory(memory) {
  if (!memory?.length) return [];
  return memory.filter(m => !isAntiFact(m.fact));
}

// ============================================
// DEDUPLICATION - Remove duplicate drops from context
// Prevents ASKI from seeing the same message twice
// ============================================
function deduplicateDrops(drops) {
  if (!drops?.length) return [];
  const seen = new Set();
  return drops.filter(drop => {
    const text = drop.text || drop.content || '';
    // Normalize: lowercase, trim, remove extra spaces
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    // Skip empty or very short
    if (normalized.length < 5) return true;
    // Check for duplicates
    if (seen.has(normalized)) {
      return false; // Duplicate - skip
    }
    seen.add(normalized);
    return true;
  });
}

// ============================================
// FETCH CORE CONTEXT (with DEBUG)
// ============================================
async function fetchCoreContext(userId, queryText = '') {
  // DEBUG object to track what's happening
  const debug = {
    userId: userId || null,
    hasSupabaseKey: false,
    hasOpenAIKey: false,
    memoryFetchStatus: null,
    entitiesFetchStatus: null,
    memoryCount: 0,
    entitiesCount: 0,
    semanticDropsCount: 0,
    errors: []
  };

  if (!userId) {
    debug.errors.push('No userId provided');
    return { memory: [], entities: [], semanticDrops: [], _debug: debug };
  }
  
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  
  debug.hasSupabaseKey = !!SUPABASE_KEY;
  debug.hasOpenAIKey = !!OPENAI_KEY;
  
  if (!SUPABASE_KEY) {
    debug.errors.push('SUPABASE_SERVICE_KEY not found in environment');
    return { memory: [], entities: [], semanticDrops: [], _debug: debug };
  }
  
  try {
    // 1. Fetch core memory and entities
    const [memoryRes, entitiesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/core_memory?user_id=eq.${userId}&is_active=eq.true&order=confidence.desc&limit=50`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/core_entities?user_id=eq.${userId}&order=mention_count.desc&limit=15`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
    ]);
    
    debug.memoryFetchStatus = memoryRes.status;
    debug.entitiesFetchStatus = entitiesRes.status;
    
    let memory = [];
    let entities = [];
    
    if (memoryRes.ok) {
      memory = await memoryRes.json();
      debug.memoryCount = memory.length;
    } else {
      const errorText = await memoryRes.text();
      debug.errors.push(`Memory fetch failed: ${memoryRes.status} - ${errorText.slice(0, 100)}`);
    }
    
    if (entitiesRes.ok) {
      entities = await entitiesRes.json();
      debug.entitiesCount = entities.length;
    } else {
      const errorText = await entitiesRes.text();
      debug.errors.push(`Entities fetch failed: ${entitiesRes.status} - ${errorText.slice(0, 100)}`);
    }
    
    // 2. Semantic search if query provided and OpenAI key exists
    let semanticDrops = [];
    if (queryText && OPENAI_KEY) {
      const semanticResult = await semanticSearch(userId, queryText, SUPABASE_URL, SUPABASE_KEY, OPENAI_KEY);
      semanticDrops = semanticResult.drops || [];
      debug.semanticDropsCount = semanticDrops.length;
      if (semanticResult.error) {
        debug.errors.push(`Semantic search: ${semanticResult.error}`);
      }
    } else if (queryText && !OPENAI_KEY) {
      debug.errors.push('Semantic search skipped: no OPENAI_API_KEY');
    }
    
    console.log(`Core context: ${memory.length} memories, ${entities.length} entities, ${semanticDrops.length} semantic drops`);
    
    // Count how many facts will be filtered out
    const cleanMemory = memory.filter(m => !isAntiFact(m.fact));
    
    // Add debug info
    debug.factsBeforeFilter = memory.length;
    debug.factsAfterFilter = cleanMemory.length;
    debug.factsFiltered = memory.length - cleanMemory.length;
    
    // Show sample CLEAN facts (not junk)
    debug.sampleFactsClean = cleanMemory.slice(0, 5).map(m => m.fact?.slice(0, 80) || 'no fact');
    debug.sampleEntities = entities.slice(0, 3).map(e => `${e.name} (${e.entity_type})`);
    
    return { memory, entities, semanticDrops, _debug: debug };
  } catch (error) {
    debug.errors.push(`Exception: ${error.message}`);
    console.error('Core context error:', error);
    return { memory: [], entities: [], semanticDrops: [], _debug: debug };
  }
}

async function semanticSearch(userId, queryText, supabaseUrl, supabaseKey, openaiKey) {
  try {
    // 1. Generate embedding for query
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: queryText.slice(0, 8000)
      })
    });
    
    if (!embeddingRes.ok) {
      console.error('Embedding generation failed:', embeddingRes.status);
      return { drops: [], error: `Embedding API error: ${embeddingRes.status}` };
    }
    
    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;
    
    if (!queryEmbedding) {
      return { drops: [], error: 'No embedding returned from OpenAI' };
    }
    
    // 2. Call Supabase RPC for vector search
    const searchRes = await fetch(`${supabaseUrl}/rest/v1/rpc/search_drops_by_embedding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: 10,
        match_threshold: 0.5
      })
    });
    
    if (!searchRes.ok) {
      const errorText = await searchRes.text();
      console.error('Semantic search failed:', searchRes.status);
      return { drops: [], error: `Search RPC error: ${searchRes.status} - ${errorText.slice(0, 100)}` };
    }
    
    const results = await searchRes.json();
    console.log(`Semantic search found ${results.length} relevant drops`);
    
    return { drops: results, error: null };
  } catch (error) {
    console.error('Semantic search error:', error);
    return { drops: [], error: error.message };
  }
}

// ============================================
// SYSTEM PROMPT
// ============================================
function buildSystemPrompt(dropContext, userProfile, coreContext, isExpansion = false, userTimezone = 'UTC', currentFeed = []) {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: userTimezone
  });
  const currentTime = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false,
    timeZone: userTimezone
  });

  // Filter out anti-facts before adding to prompt
  const cleanMemory = filterMemory(coreContext?.memory);
  const hasMemory = cleanMemory?.length > 0;
  const hasEntities = coreContext?.entities?.length > 0;
  const hasFeed = currentFeed?.length > 0;

  let basePrompt = `You are Aski — a highly capable AI assistant with access to user's personal knowledge base.

## CURRENT: ${currentDate}, ${currentTime} (${userTimezone})

## ⚠️ CRITICAL: CURRENT FEED (what user sees right now)
${hasFeed ? `You have ${currentFeed.length} drops from user's actual feed:` : 'No feed data available'}
${hasFeed ? currentFeed.map((d, i) => `${i+1}. [${d.type || 'note'}] ${d.content?.substring(0, 100) || '[encrypted]'}${d.is_encrypted ? ' 🔒' : ''} (id: ${d.id})`).join('\n') : ''}

IMPORTANT: This is the ACTUAL feed user sees. Use these IDs for delete/update operations.
Do NOT use old cached data from memory - use THIS feed data!

## ⚠️ CRITICAL: ALWAYS CHECK CORE MEMORY FIRST!
Before answering ANY question about people, places, dates, or personal info:
1. SCAN the "CORE MEMORY" section below
2. If relevant fact exists → USE IT in your answer
3. NEVER say "I don't know" if the info IS in Core Memory
4. If you're unsure → ASK user to clarify, don't guess

${hasMemory ? '✅ You have ' + cleanMemory.length + ' facts in memory - USE THEM!' : '⚠️ No memory facts available'}
${hasEntities ? '✅ You know ' + coreContext.entities.length + ' entities - CHECK THEM!' : ''}

## TIME AWARENESS:
- Your current time is accurate for user's location
- Current UTC: ${now.toISOString()}

## CAPABILITIES:
- Read/search user's notes, tasks, ideas
- Create new notes (only when explicitly asked)
- Search web for current information

## VOICE-FIRST:
- No emojis (they get spoken)
- Natural speech, avoid bullet points
- Use punctuation for rhythm

## MESSAGE HANDLING:
- You receive information from multiple sources: chat history, recent drops, and core memory
- This creates natural overlap — the SAME information may appear 2-3 times in your context
- This is NORMAL system behavior, NOT a user error
- NEVER mention duplicates, NEVER say "you already wrote this" or "I see this twice"
- Respond to the CONTENT once, ignore where it came from
- Treat repeated information as EMPHASIS, not as repetition to complain about

## MEMORY INTELLIGENCE:
When working with CORE MEMORY facts:
- TRUST positive facts (statements about what IS true)
- IGNORE negative/meta facts like "AI doesn't know X" - these are artifacts
- Names can be in different languages: Andrew = Андрей, Maria = Мария

### CONFLICT RESOLUTION PROTOCOL:
When you find CONTRADICTORY facts about the same topic:

1. **ACKNOWLEDGE the contradiction openly**
   Don't pretend it doesn't exist. Say: "I have different information about this..."

2. **PRIORITIZE by these rules (in order):**
   - EXPLICIT beats INFERRED (what user directly stated vs what was deduced)
   - RECENT beats OLD (fresher data more likely accurate)
   - SPECIFIC beats VAGUE (precise dates/names beat approximate)
   - HIGH CONFIDENCE beats LOW CONFIDENCE (if we have scores)

3. **PRESENT BOTH versions to the user:**
   "My memory says X, but I also have information about Y. Which is correct?"

4. **OFFER TO UPDATE:**
   "Should I remember [new fact] going forward?"

5. **When in doubt — ASK:**
   Don't guess between contradictory facts. User knows their own life better.

## SCHEDULING & REMINDERS:
When user asks to remind, wake up, notify, or schedule:
1. Use the create_event tool
2. Convert relative time ("через 5 минут") to absolute ISO datetime
3. Set appropriate priority: alarms=8-10, reminders=5, notifications=3
4. Confirm what was scheduled in your response

When user asks to cancel, delete, or remove a reminder:
1. Use the cancel_event tool
2. If user mentions specific reminder text, use search_query
3. If no specifics given, the most recent active reminder will be cancelled
4. Confirm what was cancelled

When user asks to change, reschedule, or modify a reminder:
1. Use the update_event tool
2. You can change: title (new_title), time (new_time as ISO), description (new_description)
3. Confirm what was changed

When user asks to see, list, or show reminders:
1. Use the list_events tool
2. Default shows active reminders
3. Present results in a clear, concise format
4. Include event ID for reference if user wants to cancel specific one

## DROP MANAGEMENT (ASKI as operator):

When user asks to see recent drops, last notes, or what's in feed:
1. Use the get_recent_drops tool - it shows CURRENT data from database
2. Default returns 5 most recent, can request up to 20
3. Shows both regular drops and command drops
4. Includes time_ago for easy reference

When user asks to search or find a specific note:
1. Use search_drops with query keywords
2. Searches both drops and command_drops tables
3. Can handle encrypted content

When user asks to delete a note/drop from feed:
1. Use the delete_drop tool with confirm=true
2. Search by drop_id or search_query
3. ALWAYS confirm with user before deleting
4. Works for any drop type including command drops

When user asks to edit/change a note/drop:
1. Use the update_drop tool
2. Provide new_content with the updated text
3. Search by drop_id or search_query

IMPORTANT: To see actual current drops, ALWAYS use get_recent_drops or search_drops tools.
Do NOT rely on context/memory for current feed state - use the tools!

## LANGUAGE:
- Always respond in same language as user
- Support Russian and English seamlessly`;

  // Build core memory section
  let memorySection = '';
  
  // Add semantic search results if available
  if (coreContext?.semanticDrops?.length > 0) {
    memorySection += '\n\n## 🎯 MOST RELEVANT (semantic match):\n';
    coreContext.semanticDrops.slice(0, 5).forEach(drop => {
      memorySection += `- "${drop.content?.slice(0, 200) || ''}"\n`;
    });
  }
  
  // Add filtered core memory facts
  if (hasMemory) {
    memorySection += '\n\n## 🧠 CORE MEMORY (verified facts):\n### Known facts:\n';
    cleanMemory.forEach(m => {
      const confidence = m.confidence ? ` [${Math.round(m.confidence * 100)}%]` : '';
      memorySection += `- ${m.fact}${confidence}\n`;
    });
  }
  
  // Add entities
  if (hasEntities) {
    memorySection += '\n### Key entities:\n';
    coreContext.entities.forEach(e => {
      let entityInfo = `- **${e.name}** (${e.entity_type})`;
      if (e.attributes) {
        const attrs = [];
        if (e.attributes.birthday) attrs.push(`birthday: ${e.attributes.birthday}`);
        if (e.attributes.relationship) attrs.push(`relationship: ${e.attributes.relationship}`);
        if (e.attributes.occupation) attrs.push(`occupation: ${e.attributes.occupation}`);
        if (attrs.length > 0) entityInfo += ` — ${attrs.join(', ')}`;
      }
      memorySection += entityInfo + '\n';
    });
  }
  
  // Add recent drops context (if provided)
  if (dropContext) {
    memorySection += `\n\n## 📝 USER'S NOTES:\n${dropContext}`;
  }

  // Add expansion instructions if needed
  if (isExpansion) {
    basePrompt += `\n\n## EXPANSION MODE:
User has asked to expand on a previous topic. Give a more detailed response covering nuances, examples, or additional perspectives.`;
  }
  
  // Add user profile if available
  if (userProfile) {
    basePrompt += `\n\n## USER PROFILE:\n${JSON.stringify(userProfile)}`;
  }

  return basePrompt + memorySection;
}

// ============================================
// TOOL EXECUTION
// ============================================
async function executeTool(toolName, input, dropContext, userId = null) {
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  switch (toolName) {
    case 'fetch_recent_drops': {
      const hours = input.hours || 24;
      const limit = input.limit || 10;
      const category = input.category;
      
      if (!SUPABASE_KEY || !userId) {
        return { success: false, error: 'No SUPABASE_KEY or userId' };
      }
      
      let url = `${SUPABASE_URL}/rest/v1/drops?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`;
      if (category) url += `&category=eq.${category}`;
      
      const response = await fetch(url, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      
      if (!response.ok) return { success: false, error: 'Fetch failed' };
      const drops = await response.json();
      return { success: true, drops, count: drops.length };
    }
    
    case 'search_drops': {
      const query = input.query;
      const limit = input.limit || 5;
      const includeCommands = input.include_commands !== false;
      
      if (!query) return { success: false, error: 'No query' };
      if (!SUPABASE_KEY || !userId) {
        return { success: false, error: 'No SUPABASE_KEY or userId' };
      }
      
      let allDrops = [];
      
      // Search in drops table
      const dropsUrl = `${SUPABASE_URL}/rest/v1/drops?user_id=eq.${userId}&content=ilike.*${encodeURIComponent(query)}*&order=created_at.desc&limit=${limit}`;
      const dropsResponse = await fetch(dropsUrl, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (dropsResponse.ok) {
        const drops = await dropsResponse.json();
        allDrops = drops.map(d => ({ ...d, source: 'drops', display_content: d.content }));
      }
      
      // Also search in command_drops if enabled
      if (includeCommands) {
        const cmdUrl = `${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&or=(title.ilike.*${encodeURIComponent(query)}*,content.ilike.*${encodeURIComponent(query)}*)&order=created_at.desc&limit=${limit}`;
        const cmdResponse = await fetch(cmdUrl, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (cmdResponse.ok) {
          const cmds = await cmdResponse.json();
          const cmdDrops = cmds.map(c => ({
            id: c.id,
            content: c.title,
            description: c.content,
            created_at: c.created_at,
            category: 'command',
            type: 'command',
            status: c.status,
            scheduled_at: c.scheduled_at,
            source: 'command_drops',
            display_content: c.title
          }));
          allDrops = [...allDrops, ...cmdDrops];
        }
      }
      
      // Sort by created_at desc
      allDrops.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      allDrops = allDrops.slice(0, limit);
      
      return { success: true, drops: allDrops, count: allDrops.length, query };
    }
    
    case 'get_recent_drops': {
      const limit = Math.min(input.limit || 5, 20);
      const includeCommands = input.include_commands !== false;
      const category = input.category;
      
      if (!SUPABASE_KEY || !userId) {
        return { success: false, error: 'No SUPABASE_KEY or userId' };
      }
      
      let allDrops = [];
      
      // Get recent drops
      let dropsUrl = `${SUPABASE_URL}/rest/v1/drops?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`;
      if (category) {
        dropsUrl += `&category=eq.${category}`;
      }
      
      const dropsResponse = await fetch(dropsUrl, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      
      if (dropsResponse.ok) {
        const drops = await dropsResponse.json();
        allDrops = drops.map(d => {
          // Handle encrypted content
          let displayContent = d.content;
          if (d.is_encrypted && d.content) {
            // For encrypted drops, show that they're encrypted but include any available metadata
            displayContent = d.content; // Content should already be decrypted by RLS or show encrypted marker
          }
          return {
            id: d.id,
            content: displayContent,
            category: d.category || 'inbox',
            created_at: d.created_at,
            is_encrypted: d.is_encrypted || false,
            source: 'drops',
            type: 'note'
          };
        });
      }
      
      // Get recent command drops if enabled
      if (includeCommands) {
        const cmdUrl = `${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`;
        const cmdResponse = await fetch(cmdUrl, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        
        if (cmdResponse.ok) {
          const cmds = await cmdResponse.json();
          const cmdDrops = cmds.map(c => ({
            id: c.id,
            content: c.title,
            description: c.content,
            category: 'command',
            type: 'command',
            status: c.status,
            scheduled_at: c.scheduled_at,
            created_at: c.created_at,
            creator: c.creator,
            source: 'command_drops'
          }));
          allDrops = [...allDrops, ...cmdDrops];
        }
      }
      
      // Sort combined by created_at desc
      allDrops.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      allDrops = allDrops.slice(0, limit);
      
      // Format for display
      const formattedDrops = allDrops.map(d => ({
        id: d.id,
        content: d.content?.substring(0, 200) || '[no content]',
        type: d.type,
        category: d.category,
        created_at: d.created_at,
        time_ago: getTimeAgo(d.created_at),
        status: d.status,
        is_encrypted: d.is_encrypted,
        source: d.source
      }));
      
      return { 
        success: true, 
        drops: formattedDrops, 
        count: formattedDrops.length,
        timestamp: new Date().toISOString()
      };
    }
    
    case 'create_drop': {
      const text = input.text;
      const category = input.category || 'inbox';
      
      if (!text) return { success: false, error: 'No text' };
      if (!SUPABASE_KEY || !userId) {
        // Fallback to frontend handling if no DB access
        return { 
          success: true, 
          action: 'create_drop',
          drop: { text, category, creator: 'aski' }
        };
      }
      
      // Write directly to Supabase for immediate visibility
      try {
        const dropData = {
          content: text,
          category: category,
          user_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_encrypted: false,
          source: 'aski'
        };
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/drops`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(dropData)
        });
        
        if (response.ok) {
          const created = await response.json();
          const dropId = created[0]?.id;
          console.log('[create_drop] Created in Supabase:', dropId);
          
          return { 
            success: true, 
            action: 'create_drop',
            drop: { 
              id: dropId,
              text, 
              category, 
              creator: 'aski',
              created_at: dropData.created_at
            },
            saved_to_db: true
          };
        }
      } catch (err) {
        console.error('[create_drop] DB error:', err.message);
      }
      
      // Fallback to frontend handling
      return { 
        success: true, 
        action: 'create_drop',
        drop: { text, category, creator: 'aski' }
      };
    }
    
    case 'get_summary': {
      const period = input.period || 'today';
      
      if (!SUPABASE_KEY || !userId) {
        return { success: false, error: 'No SUPABASE_KEY or userId' };
      }
      
      // Calculate date range
      const now = new Date();
      let startDate;
      switch (period) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
      }
      
      const url = `${SUPABASE_URL}/rest/v1/drops?user_id=eq.${userId}&created_at=gte.${startDate.toISOString()}&order=created_at.desc`;
      
      const response = await fetch(url, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      
      if (!response.ok) return { success: false, error: 'Fetch failed' };
      const drops = await response.json();
      
      // Group by category
      const byCategory = {};
      drops.forEach(d => {
        const cat = d.category || 'inbox';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });
      
      return { success: true, period, totalCount: drops.length, byCategory };
    }
    
    case 'web_search': {
      const TAVILY_KEY = process.env.TAVILY_API_KEY;
      if (!TAVILY_KEY) {
        return { success: false, error: 'No TAVILY_API_KEY configured' };
      }
      
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: TAVILY_KEY,
            query: input.query,
            search_depth: input.search_depth || 'basic',
            max_results: 5
          })
        });
        
        if (!response.ok) {
          return { success: false, error: 'Tavily search failed' };
        }
        
        const data = await response.json();
        const results = data.results?.map(r => ({
          title: r.title,
          content: r.content?.slice(0, 300),
          url: r.url
        })) || [];
        
        return { success: true, results, query: input.query };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    
    case 'create_event': {
      return await handleCreateEvent(input, userId);
    }
    
    case 'cancel_event': {
      return await executeCancelEvent(input, userId);
    }
    
    case 'list_events': {
      return await executeListEvents(input, userId);
    }
    
    case 'delete_drop': {
      return await executeDeleteDrop(input, userId);
    }
    
    case 'update_drop': {
      return await executeUpdateDrop(input, userId);
    }
    
    case 'update_event': {
      return await executeUpdateEvent(input, userId);
    }
    
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ============================================
// CREATE EVENT HANDLER → COMMAND DROPS v2.0
// ============================================
async function handleCreateEvent(input, userId) {
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  if (!SUPABASE_KEY) {
    console.error('[create_event] No SUPABASE_SERVICE_KEY');
    return { success: false, error: 'Server configuration error' };
  }
  
  if (!userId) {
    console.error('[create_event] No userId');
    return { success: false, error: 'User not authenticated' };
  }
  
  try {
    // Validate required fields
    if (!input.name) {
      return { success: false, error: 'Event name is required' };
    }
    
    if (input.trigger_type === 'datetime' && !input.trigger_at) {
      return { success: false, error: 'trigger_at is required for datetime events' };
    }
    
    // Calculate scheduled_at
    let scheduledAt;
    if (input.trigger_type === 'datetime' && input.trigger_at) {
      scheduledAt = input.trigger_at;
    } else if (input.trigger_type === 'cron') {
      // For cron, calculate next occurrence (simplified - use current time + 1 hour as placeholder)
      scheduledAt = new Date(Date.now() + 3600000).toISOString();
    } else {
      scheduledAt = new Date(Date.now() + 3600000).toISOString(); // Default 1 hour
    }
    
    // Map action_type
    const actionType = input.action_type || 'push';
    
    // Determine sense_type based on priority and keywords
    let senseType = 'reminder';
    if (input.priority >= 8 || /alarm|будильник|wake|разбуд/i.test(input.name)) {
      senseType = 'reminder'; // High priority reminders
    }
    
    // Prepare command drop data (matches command_drops table schema)
    const commandData = {
      // Identity
      title: input.name,
      content: input.description || input.name,
      
      // Actors
      creator: 'aski',
      acceptor: 'user',
      controller: 'system',
      
      // Classification
      relation_type: 'user',
      sense_type: senseType,
      runtime_type: input.trigger_type === 'cron' ? 'scripted' : 'scheduled',
      
      // Execution
      scheduled_at: scheduledAt,
      schedule_rule: input.trigger_type === 'cron' ? input.cron_expression : null,
      action_type: actionType,
      action_params: {
        priority: input.priority || 5,
        original_input: input
      },
      
      // State
      status: 'pending',
      approval: 'not_required',
      
      // Access
      visibility: 'visible',
      editability: 'editable',
      storage_type: 'supabase',
      
      // User ownership
      user_id: userId
    };
    
    console.log('[create_event] Creating command drop:', commandData.title, 'at:', commandData.scheduled_at, 'for user:', userId);
    
    // Insert into command_drops table
    const response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(commandData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[create_event] Supabase error:', response.status, errorText);
      return { success: false, error: 'Failed to create command: ' + response.status };
    }
    
    const created = await response.json();
    const commandId = created[0]?.id;
    
    console.log('[create_event] Success! Command ID:', commandId);
    
    // Format time for display
    const scheduledDate = new Date(scheduledAt);
    const timeStr = scheduledDate.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'UTC'
    });
    
    return { 
      success: true, 
      action: 'create_event',
      event: {
        id: commandId,
        name: input.name,
        trigger_at: scheduledAt,
        scheduled_time: timeStr,
        action_type: actionType,
        creator: 'aski'
      },
      // Also return for frontend display
      command: {
        id: commandId,
        title: input.name,
        scheduled_at: scheduledAt,
        scheduled_time: timeStr,
        status: 'pending',
        creator: 'aski'
      }
    };
    
  } catch (error) {
    console.error('[create_event] Exception:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// CANCEL EVENT TOOL
// ============================================
async function executeCancelEvent(input, userId) {
  try {
    console.log('[cancel_event] Cancelling event for user:', userId);
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('[cancel_event] No SUPABASE_SERVICE_KEY');
      return { success: false, error: 'Database not configured' };
    }
    
    if (!userId) {
      console.error('[cancel_event] No userId');
      return { success: false, error: 'User not authenticated' };
    }
    
    let eventToCancel = null;
    
    // If we have event_id, use it directly
    if (input.event_id) {
      // Fetch the event to verify ownership
      const fetchResponse = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?id=eq.${input.event_id}&user_id=eq.${userId}`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (fetchResponse.ok) {
        const events = await fetchResponse.json();
        if (events.length > 0) {
          eventToCancel = events[0];
        }
      }
    }
    
    // If no ID or not found, search by query
    if (!eventToCancel && input.search_query) {
      const searchResponse = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&status=eq.pending&title=ilike.*${encodeURIComponent(input.search_query)}*&order=created_at.desc&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (searchResponse.ok) {
        const events = await searchResponse.json();
        if (events.length > 0) {
          eventToCancel = events[0];
        }
      }
    }
    
    // If still not found, get the most recent active event
    if (!eventToCancel && !input.event_id && !input.search_query) {
      const recentResponse = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&status=eq.pending&order=created_at.desc&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (recentResponse.ok) {
        const events = await recentResponse.json();
        if (events.length > 0) {
          eventToCancel = events[0];
        }
      }
    }
    
    if (!eventToCancel) {
      return { success: false, error: 'No matching reminder found', action: 'cancel_event' };
    }
    
    // Update status to cancelled
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?id=eq.${eventToCancel.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('[cancel_event] Update error:', errorText);
      return { success: false, error: 'Failed to cancel reminder' };
    }
    
    console.log('[cancel_event] Cancelled event:', eventToCancel.title);
    
    return {
      success: true,
      action: 'cancel_event',
      cancelled: {
        id: eventToCancel.id,
        title: eventToCancel.title,
        scheduled_at: eventToCancel.scheduled_at
      }
    };
    
  } catch (error) {
    console.error('[cancel_event] Exception:', error);
    return { success: false, error: error.message, action: 'cancel_event' };
  }
}

// ============================================
// LIST EVENTS TOOL
// ============================================
async function executeListEvents(input, userId) {
  try {
    console.log('[list_events] Listing events for user:', userId);
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('[list_events] No SUPABASE_SERVICE_KEY');
      return { success: false, error: 'Database not configured' };
    }
    
    if (!userId) {
      console.error('[list_events] No userId');
      return { success: false, error: 'User not authenticated' };
    }
    
    const status = input.status || 'pending';
    const limit = input.limit || 10;
    
    let url = `${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&order=scheduled_at.asc&limit=${limit}`;
    
    if (status !== 'all') {
      url += `&status=eq.${status}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[list_events] Fetch error:', errorText);
      return { success: false, error: 'Failed to fetch reminders' };
    }
    
    const events = await response.json();
    console.log('[list_events] Found', events.length, 'events');
    
    // Format events for display
    const formattedEvents = events.map(e => ({
      id: e.id,
      title: e.title,
      scheduled_at: e.scheduled_at,
      scheduled_time: new Date(e.scheduled_at).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }),
      status: e.status,
      action_type: e.action_type
    }));
    
    return {
      success: true,
      action: 'list_events',
      events: formattedEvents,
      count: formattedEvents.length
    };
    
  } catch (error) {
    console.error('[list_events] Exception:', error);
    return { success: false, error: error.message, action: 'list_events' };
  }
}

// ============================================
// DELETE DROP - Remove any drop from feed
// ============================================
async function executeDeleteDrop(input, userId) {
  try {
    console.log('[delete_drop] Deleting drop for user:', userId);
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return { success: false, error: 'Database not configured' };
    }
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    if (!input.confirm) {
      return { success: false, error: 'Deletion not confirmed. Please confirm before deleting.' };
    }
    
    let dropToDelete = null;
    
    // Find drop by ID or search
    if (input.drop_id) {
      const dropId = String(input.drop_id);
      const isUUID = dropId.includes('-') && dropId.length > 30;
      
      // Try command_drops first
      let searchField = isUUID ? 'id' : 'local_id';
      let response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?${searchField}=eq.${dropId}&user_id=eq.${userId}`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      let data = await response.json();
      
      // If not found by local_id, try by id (UUID)
      if (data.length === 0 && !isUUID) {
        response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?id=eq.${dropId}&user_id=eq.${userId}`, {
          headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
        });
        data = await response.json();
      }
      
      if (data.length > 0) {
        dropToDelete = { ...data[0], table: 'command_drops' };
      } else {
        // Try drops table with same logic
        searchField = isUUID ? 'id' : 'local_id';
        response = await fetch(`${SUPABASE_URL}/rest/v1/drops?${searchField}=eq.${dropId}&user_id=eq.${userId}`, {
          headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
        });
        data = await response.json();
        
        // If not found by local_id, try by id
        if (data.length === 0 && !isUUID) {
          response = await fetch(`${SUPABASE_URL}/rest/v1/drops?id=eq.${dropId}&user_id=eq.${userId}`, {
            headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
          });
          data = await response.json();
        }
        
        if (data.length > 0) {
          dropToDelete = { ...data[0], table: 'drops' };
        }
      }
    } else if (input.search_query) {
      // Search in command_drops
      let response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&title=ilike.*${encodeURIComponent(input.search_query)}*&order=created_at.desc&limit=1`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      let data = await response.json();
      if (data.length > 0) {
        dropToDelete = { ...data[0], table: 'command_drops' };
      } else {
        // Search in drops
        response = await fetch(`${SUPABASE_URL}/rest/v1/drops?user_id=eq.${userId}&content=ilike.*${encodeURIComponent(input.search_query)}*&order=created_at.desc&limit=1`, {
          headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
        });
        data = await response.json();
        if (data.length > 0) {
          dropToDelete = { ...data[0], table: 'drops' };
        }
      }
    }
    
    if (!dropToDelete) {
      return { success: false, error: 'Drop not found', action: 'delete_drop' };
    }
    
    // Delete the drop
    const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/${dropToDelete.table}?id=eq.${dropToDelete.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    
    if (!deleteResponse.ok) {
      return { success: false, error: 'Failed to delete drop', action: 'delete_drop' };
    }
    
    console.log('[delete_drop] Deleted:', dropToDelete.id, 'from', dropToDelete.table);
    
    return {
      success: true,
      action: 'delete_drop',
      deleted_id: dropToDelete.id,
      local_id: dropToDelete.local_id || input.drop_id, // For frontend to remove from localStorage
      deleted_title: dropToDelete.title || dropToDelete.content?.substring(0, 50),
      table: dropToDelete.table,
      sync_local: true // Signal frontend to sync localStorage
    };
    
  } catch (error) {
    console.error('[delete_drop] Exception:', error);
    return { success: false, error: error.message, action: 'delete_drop' };
  }
}

// ============================================
// UPDATE DROP - Edit drop content
// ============================================
async function executeUpdateDrop(input, userId) {
  try {
    console.log('[update_drop] Updating drop for user:', userId);
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return { success: false, error: 'Database not configured' };
    }
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    if (!input.new_content) {
      return { success: false, error: 'New content is required' };
    }
    
    let dropToUpdate = null;
    
    // Find drop by ID or search
    if (input.drop_id) {
      // Try drops table first (most common)
      let response = await fetch(`${SUPABASE_URL}/rest/v1/drops?id=eq.${input.drop_id}&user_id=eq.${userId}`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      let data = await response.json();
      if (data.length > 0) {
        dropToUpdate = { ...data[0], table: 'drops', contentField: 'content' };
      } else {
        // Try command_drops
        response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?id=eq.${input.drop_id}&user_id=eq.${userId}`, {
          headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
        });
        data = await response.json();
        if (data.length > 0) {
          dropToUpdate = { ...data[0], table: 'command_drops', contentField: 'content' };
        }
      }
    } else if (input.search_query) {
      // Search in drops
      let response = await fetch(`${SUPABASE_URL}/rest/v1/drops?user_id=eq.${userId}&content=ilike.*${encodeURIComponent(input.search_query)}*&order=created_at.desc&limit=1`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      let data = await response.json();
      if (data.length > 0) {
        dropToUpdate = { ...data[0], table: 'drops', contentField: 'content' };
      }
    }
    
    if (!dropToUpdate) {
      return { success: false, error: 'Drop not found', action: 'update_drop' };
    }
    
    // Update the drop
    const updateData = { [dropToUpdate.contentField]: input.new_content, updated_at: new Date().toISOString() };
    
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/${dropToUpdate.table}?id=eq.${dropToUpdate.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!updateResponse.ok) {
      return { success: false, error: 'Failed to update drop', action: 'update_drop' };
    }
    
    const updated = await updateResponse.json();
    console.log('[update_drop] Updated:', dropToUpdate.id);
    
    return {
      success: true,
      action: 'update_drop',
      updated_id: dropToUpdate.id,
      old_content: dropToUpdate.content?.substring(0, 50),
      new_content: input.new_content.substring(0, 50)
    };
    
  } catch (error) {
    console.error('[update_drop] Exception:', error);
    return { success: false, error: error.message, action: 'update_drop' };
  }
}

// ============================================
// UPDATE EVENT - Modify reminder/scheduled event
// ============================================
async function executeUpdateEvent(input, userId) {
  try {
    console.log('[update_event] Updating event for user:', userId);
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return { success: false, error: 'Database not configured' };
    }
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    if (!input.new_title && !input.new_time && !input.new_description) {
      return { success: false, error: 'At least one field to update is required (new_title, new_time, or new_description)' };
    }
    
    let eventToUpdate = null;
    
    // Find event by ID or search
    if (input.event_id) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?id=eq.${input.event_id}&user_id=eq.${userId}`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      const data = await response.json();
      if (data.length > 0) {
        eventToUpdate = data[0];
      }
    } else if (input.search_query) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?user_id=eq.${userId}&status=eq.pending&title=ilike.*${encodeURIComponent(input.search_query)}*&order=created_at.desc&limit=1`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      const data = await response.json();
      if (data.length > 0) {
        eventToUpdate = data[0];
      }
    }
    
    if (!eventToUpdate) {
      return { success: false, error: 'Reminder not found', action: 'update_event' };
    }
    
    // Build update object
    const updateData = { updated_at: new Date().toISOString() };
    
    if (input.new_title) {
      updateData.title = input.new_title;
    }
    if (input.new_time) {
      updateData.scheduled_at = input.new_time;
    }
    if (input.new_description) {
      updateData.content = input.new_description;
    }
    
    // Update the event
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/command_drops?id=eq.${eventToUpdate.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!updateResponse.ok) {
      return { success: false, error: 'Failed to update reminder', action: 'update_event' };
    }
    
    const updated = await updateResponse.json();
    console.log('[update_event] Updated:', eventToUpdate.id);
    
    // Format response
    const changes = [];
    if (input.new_title) changes.push(`title → "${input.new_title}"`);
    if (input.new_time) {
      const newTimeStr = new Date(input.new_time).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
      changes.push(`time → ${newTimeStr}`);
    }
    if (input.new_description) changes.push(`description updated`);
    
    return {
      success: true,
      action: 'update_event',
      updated_id: eventToUpdate.id,
      original_title: eventToUpdate.title,
      changes: changes.join(', ')
    };
    
  } catch (error) {
    console.error('[update_event] Exception:', error);
    return { success: false, error: error.message, action: 'update_event' };
  }
}

// ============================================
// PARSE SSE STREAM FROM CLAUDE
// ============================================
async function* parseSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { type: 'done' };
        } else {
          try {
            yield JSON.parse(data);
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

// ============================================
// STREAMING CHAT WITH TOOLS (with cost tracking)
// ============================================
async function handleStreamingChatWithTools(apiKey, systemPrompt, messages, maxTokens, dropContext, writer, debugInfo = null, userId = null, modelConfig = null) {
  const encoder = new TextEncoder();
  let toolResults = [];
  let createDropAction = null;
  let createEventAction = null;
  let cancelEventAction = null;
  let listEventsAction = null;
  let deleteDropAction = null;
  let updateDropAction = null;
  
  // Use provided model or default to Sonnet
  const modelId = modelConfig?.id || AI_MODELS[DEFAULT_MODEL].id;
  
  // Track total usage across all iterations (NEW)
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  
  // Helper to send SSE event to client
  const sendEvent = (data) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };
  
  // Tool loop - max 5 iterations
  for (let iteration = 0; iteration < 5; iteration++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools: TOOLS,
        tool_choice: { type: 'auto' },
        stream: true
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      sendEvent({ type: 'error', error: `API error: ${response.status}` });
      break;
    }
    
    // Collect response data
    let currentTextContent = '';
    let currentToolUse = null;
    let toolUseInputBuffer = '';
    let stopReason = null;
    let contentBlocks = [];
    let messageUsage = null; // Track usage for this iteration (NEW)
    
    // Parse stream
    for await (const event of parseSSEStream(response)) {
      if (event.type === 'done') break;
      
      // Message start - contains usage info (NEW)
      if (event.type === 'message_start') {
        if (event.message?.usage) {
          totalInputTokens += event.message.usage.input_tokens || 0;
        }
      }
      
      // Content block start
      if (event.type === 'content_block_start') {
        if (event.content_block?.type === 'text') {
          currentTextContent = '';
        } else if (event.content_block?.type === 'tool_use') {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: {}
          };
          toolUseInputBuffer = '';
          // Notify client that tool is starting
          sendEvent({ type: 'tool_start', tool: event.content_block.name });
        }
      }
      
      // Content block delta
      if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          const text = event.delta.text || '';
          currentTextContent += text;
          // Stream text to client immediately
          if (text) {
            sendEvent({ type: 'text', content: text });
          }
        } else if (event.delta?.type === 'input_json_delta') {
          // Accumulate tool input JSON
          toolUseInputBuffer += event.delta.partial_json || '';
        }
      }
      
      // Content block stop
      if (event.type === 'content_block_stop') {
        if (currentTextContent) {
          contentBlocks.push({ type: 'text', text: currentTextContent });
        }
        if (currentToolUse) {
          // Parse accumulated JSON input
          try {
            currentToolUse.input = JSON.parse(toolUseInputBuffer || '{}');
          } catch (e) {
            currentToolUse.input = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: currentToolUse.input
          });
          currentToolUse = null;
          toolUseInputBuffer = '';
        }
      }
      
      // Message delta (contains stop_reason and output tokens) (UPDATED)
      if (event.type === 'message_delta') {
        stopReason = event.delta?.stop_reason;
        if (event.usage?.output_tokens) {
          totalOutputTokens += event.usage.output_tokens;
        }
      }
    }
    
    // Check if we need to execute tools
    if (stopReason === 'tool_use') {
      const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');
      
      if (toolBlocks.length === 0) break;
      
      // Add assistant message with all content blocks
      messages.push({ role: 'assistant', content: contentBlocks });
      
      // Execute all tools and collect results
      const toolResultsContent = [];
      
      for (const toolBlock of toolBlocks) {
        const toolResult = await executeTool(toolBlock.name, toolBlock.input, dropContext, userId);
        toolResults.push({ toolName: toolBlock.name, result: toolResult });
        
        // Track create_drop action
        if (toolBlock.name === 'create_drop' && toolResult.action === 'create_drop') {
          createDropAction = toolResult;
        }
        
        // Track create_event action
        if (toolBlock.name === 'create_event' && toolResult.action === 'create_event') {
          createEventAction = toolResult;
        }
        
        // Track cancel_event action
        if (toolBlock.name === 'cancel_event' && toolResult.action === 'cancel_event') {
          cancelEventAction = toolResult;
        }
        
        // Track list_events action
        if (toolBlock.name === 'list_events' && toolResult.action === 'list_events') {
          listEventsAction = toolResult;
        }
        
        // Track delete_drop action (v4.17)
        if (toolBlock.name === 'delete_drop' && toolResult.action === 'delete_drop') {
          deleteDropAction = toolResult;
        }
        
        // Track update_drop action (v4.17)
        if (toolBlock.name === 'update_drop' && toolResult.action === 'update_drop') {
          updateDropAction = toolResult;
        }
        
        // Notify client about tool result
        sendEvent({ 
          type: 'tool_result', 
          tool: toolBlock.name, 
          success: toolResult.success 
        });
        
        toolResultsContent.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(toolResult)
        });
      }
      
      // Add tool results to messages
      messages.push({ role: 'user', content: toolResultsContent });
      
      // Continue to next iteration to get Claude's response after tools
      continue;
    }
    
    // No more tools needed, we're done
    break;
  }
  
  // Log API cost (NEW) - wrapped in try/catch to never break the flow
  try {
    await logApiCost({
      provider: 'anthropic',
      model: modelId,
      tokens_input: totalInputTokens,
      tokens_output: totalOutputTokens,
      user_id: userId,
      action: 'chat'
    });
    // Deduct tokens from user balance
    await deductUserTokens(userId, totalInputTokens, totalOutputTokens, 'chat');
  } catch (costErr) {
    console.error('[Cost Log] Failed in streaming:', costErr.message);
  }
  
  // Send final event with metadata AND debug info
  sendEvent({ 
    type: 'done',
    toolsUsed: toolResults.map(t => t.toolName),
    createDrop: createDropAction,
    createEvent: createEventAction,
    cancelEvent: cancelEventAction,
    listEvents: listEventsAction,
    deleteDrop: deleteDropAction,
    updateDrop: updateDropAction,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }, // NEW
    _debug: debugInfo
  });
  
  writer.close();
}

// ============================================
// NON-STREAMING CHAT HANDLER (fallback, with cost tracking)
// ============================================
async function handleNonStreamingChat(apiKey, systemPrompt, messages, maxTokens, dropContext, userId = null, modelConfig = null) {
  // Use provided model or default to Sonnet
  const modelId = modelConfig?.id || AI_MODELS[DEFAULT_MODEL].id;
  
  const claudeRequest = {
    model: modelId,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools: TOOLS,
    tool_choice: { type: 'auto' },
  };

  let data;
  let toolResults = [];
  let totalInputTokens = 0; // NEW
  let totalOutputTokens = 0; // NEW
  
  for (let i = 0; i < 5; i++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...claudeRequest, messages, stream: false }),
    });

    data = await response.json();
    
    // Accumulate usage (NEW)
    if (data.usage) {
      totalInputTokens += data.usage.input_tokens || 0;
      totalOutputTokens += data.usage.output_tokens || 0;
    }
    
    if (data.stop_reason !== 'tool_use') break;
    
    const toolBlock = data.content?.find(b => b.type === 'tool_use');
    if (!toolBlock) break;
    
    const toolResult = await executeTool(toolBlock.name, toolBlock.input, dropContext, userId);
    toolResults.push({ toolName: toolBlock.name, result: toolResult });
    
    messages.push({ role: 'assistant', content: data.content });
    messages.push({ 
      role: 'user', 
      content: [{ 
        type: 'tool_result', 
        tool_use_id: toolBlock.id, 
        content: JSON.stringify(toolResult) 
      }]
    });
    
    const finalResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...claudeRequest, messages, stream: false }),
    });
    
    if (!finalResponse.ok) break;
    data = await finalResponse.json();
    
    // Accumulate usage from final response (NEW)
    if (data.usage) {
      totalInputTokens += data.usage.input_tokens || 0;
      totalOutputTokens += data.usage.output_tokens || 0;
    }
  }

  // Log API cost (NEW)
  try {
    await logApiCost({
      provider: 'anthropic',
      model: modelId,
      tokens_input: totalInputTokens,
      tokens_output: totalOutputTokens,
      user_id: userId,
      action: 'chat'
    });
    // Deduct tokens from user balance
    await deductUserTokens(userId, totalInputTokens, totalOutputTokens, 'chat');
  } catch (costErr) {
    console.error('[Cost Log] Failed in non-streaming:', costErr.message);
  }

  const textBlocks = data.content?.filter(b => b.type === 'text') || [];
  const resultText = textBlocks.map(b => b.text).join('\n');
  
  return { resultText, toolResults, usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } };
}

// ============================================
// MAIN HANDLER
// ============================================
export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Rate limiting
    const rateLimitKey = getRateLimitKey(req, 'ai');
    const rateCheck = checkRateLimit(rateLimitKey, 'ai');
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.resetIn);
    }

    // Parse request
    const { 
      action, 
      text, 
      image, 
      style, 
      targetLang, 
      history, 
      dropContext, 
      syntriseContext, 
      userProfile, 
      stream,
      userId,  // Accept userId from frontend
      uid,     // Alternative userId field
      model,   // Model selection: 'sonnet', 'opus', 'haiku', 'auto'
      voiceMode,  // NEW: if true, auto-select model based on query
      currentFeed // v4.17: Actual drops from user's feed (localStorage)
    } = await req.json();

    // Auto-select model for voice mode
    let selectedModel = model;
    
    if (model === 'opus') {
      // User explicitly chose NOUS (Opus) - always respect this choice
      console.log('[VoiceMode] User chose NOUS (Opus), respecting choice');
      selectedModel = 'opus';
    } else if (voiceMode) {
      // Voice mode with Sonnet/Haiku/auto - optimize between Haiku and Sonnet
      selectedModel = selectModelForVoice(text);
      console.log(`[VoiceMode] Auto-selected: ${selectedModel} for: "${(text || '').substring(0, 40)}..."`);
    } else if (!model) {
      selectedModel = 'sonnet'; // Default for text mode
    }

    // Get model configuration
    const modelConfig = getModelConfig(selectedModel);
    console.log(`[AI] Action: ${action}, Model: ${modelConfig.id}, Stream: ${stream}, VoiceMode: ${!!voiceMode}`);

    // Get user timezone from headers
    const userTimezone = req.headers.get('x-timezone') || 'UTC';
    const userCountry = req.headers.get('x-country') || null;
    const userCity = req.headers.get('x-city') || null;

    // === MODELS ACTION ===
    if (action === 'models') {
      return new Response(JSON.stringify({
        models: Object.entries(AI_MODELS).map(([key, config]) => ({
          key,
          id: config.id,
          name: config.name,
          description: config.description
        })),
        default: DEFAULT_MODEL
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === CHAT ACTION ===
    if (action === 'chat') {
      // Format context with DEDUPLICATION
      let formattedContext = null;
      if (dropContext) {
        const parts = [];
        // Deduplicate relevant drops
        const relevantDeduped = deduplicateDrops(dropContext.relevant || []);
        if (relevantDeduped.length) {
          parts.push('### RELEVANT:');
          relevantDeduped.forEach(d => parts.push(`- [${d.category}] ${d.text}`));
        }
        // Deduplicate recent drops
        const recentDeduped = deduplicateDrops(dropContext.recent || []);
        if (recentDeduped.length) {
          parts.push('\n### RECENT:');
          recentDeduped.slice(0, 10).forEach(d => parts.push(`- [${d.category}] ${d.text}`));
        }
        if (parts.length) formattedContext = parts.join('\n');
      }
      
      if (!formattedContext && syntriseContext?.length) {
        const dedupedSyntrise = deduplicateDrops(syntriseContext);
        formattedContext = dedupedSyntrise.map(d => `[${d.category || 'inbox'}] ${d.content}`).join('\n');
      }
      
      // Fetch CORE memory + semantic search
      // Pass the actual user ID received from frontend
      const effectiveUserId = userId || uid || null;
      const coreContext = effectiveUserId ? await fetchCoreContext(effectiveUserId, text) : null;
      
      // Extract debug info from coreContext
      const coreDebug = coreContext?._debug || {
        userId: effectiveUserId,
        error: 'fetchCoreContext returned null - no userId provided'
      };
      
      // Detect expansion
      const recentHistory = history.slice(-4);
      const lastAssistant = recentHistory.filter(m => !m.isUser).slice(-1)[0];
      const isExpansion = lastAssistant?.text?.includes('?') && isShortAffirmative(text);
      
      const maxTokens = isExpansion ? 2500 : 1000;
      const systemPrompt = buildSystemPrompt(formattedContext, userProfile, coreContext, isExpansion, userTimezone, currentFeed);
      
      // Add system prompt debug info (AFTER systemPrompt is built)
      coreDebug.systemPromptHasCoreMemory = systemPrompt.includes('### Known facts:');
      coreDebug.systemPromptHasEntities = systemPrompt.includes('### Key entities:');
      coreDebug.systemPromptLength = systemPrompt.length;
      
      // Build messages
      let messages = [];
      if (history?.length) {
        messages = history.filter(m => m.text?.trim()).map(m => ({
          role: m.isUser ? 'user' : 'assistant',
          content: m.text
        }));
      }
      messages.push({ role: 'user', content: text });

      // STREAMING MODE WITH TOOLS
      if (stream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        
        // Start streaming in background, pass debug info, userId, and model config
        handleStreamingChatWithTools(apiKey, systemPrompt, messages, maxTokens, formattedContext, writer, coreDebug, effectiveUserId, modelConfig)
          .catch(error => {
            console.error('Streaming error:', error);
            const encoder = new TextEncoder();
            writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`));
            writer.close();
          });
        
        return new Response(readable, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // NON-STREAMING MODE (fallback)
      const { resultText, toolResults, usage } = await handleNonStreamingChat(
        apiKey, systemPrompt, messages, maxTokens, formattedContext, effectiveUserId, modelConfig
      );
      
      const createDropAction = toolResults.find(t => t.toolName === 'create_drop');
      const createEventAction = toolResults.find(t => t.toolName === 'create_event');
      const cancelEventAction = toolResults.find(t => t.toolName === 'cancel_event');
      const listEventsAction = toolResults.find(t => t.toolName === 'list_events');
      const deleteDropAction = toolResults.find(t => t.toolName === 'delete_drop');
      const updateDropAction = toolResults.find(t => t.toolName === 'update_drop');

      return new Response(JSON.stringify({ 
        success: true,
        action: 'chat',
        result: resultText,
        usage,
        toolsUsed: toolResults.map(t => t.toolName),
        createDrop: createDropAction?.result || null,
        createEvent: createEventAction?.result || null,
        cancelEvent: cancelEventAction?.result || null,
        listEvents: listEventsAction?.result || null,
        deleteDrop: deleteDropAction?.result || null,
        updateDrop: updateDropAction?.result || null,
        geo: { timezone: userTimezone, country: userCountry, city: userCity },
        model: modelConfig.id,  // Which model was used
        // DEBUG INFO
        _debug: {
          receivedUserId: userId || null,
          receivedUid: uid || null,
          effectiveUserId: effectiveUserId,
          modelRequested: model,
          modelUsed: modelConfig.id,
          coreContext: coreDebug
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === IMAGE ACTIONS (with cost tracking) ===
    if (action === 'ocr' || action === 'describe') {
      const prompt = action === 'ocr' 
        ? 'Extract all visible text exactly as it appears.'
        : 'Describe this image in detail.';
      
      let imageData = image;
      let mediaType = 'image/jpeg';
      if (image?.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) { mediaType = matches[1]; imageData = matches[2]; }
      }
      
      const effectiveUserId = userId || uid || null; // NEW
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelConfig.id,
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
              { type: 'text', text: prompt }
            ]
          }]
        }),
      });

      const data = await response.json();
      
      // Log cost (NEW)
      try {
        if (data.usage) {
          await logApiCost({
            provider: 'anthropic',
            model: modelConfig.id,
            tokens_input: data.usage.input_tokens || 0,
            tokens_output: data.usage.output_tokens || 0,
            user_id: effectiveUserId,
            action: action
          });
          // Deduct tokens from user balance
          await deductUserTokens(effectiveUserId, data.usage.input_tokens || 0, data.usage.output_tokens || 0, action);
        }
      } catch (costErr) {
        console.error('[Cost Log] Failed in image action:', costErr.message);
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        result: data.content?.[0]?.text || '' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === TEXT ACTIONS (with cost tracking) ===
    const textActions = {
      poem: `Create a beautiful poem. Style: ${style || 'classic'}. 8-16 lines. Same language as input.`,
      summarize: 'Summarize in 1-3 sentences. Same language.',
      tasks: 'Extract tasks as JSON: {"tasks": [...]}. Same language.',
      expand: 'Expand idea 2-3x with details. Same language.',
      rewrite: `Rewrite in ${style || 'professional'} tone. Same language.`,
      enhance: 'You are a text editor. Fix spelling, grammar and punctuation errors in the following text. Return ONLY the corrected text. Do NOT add any explanations, lists of changes, or commentary. Do NOT answer as if the text were a question. Preserve the original meaning, style and language. Output only the improved text.',
      translate: `Translate to ${targetLang || 'English'}. Only translation.`,
      greeting: `Create greeting. ${style || 'warm'} style. 2-5 sentences. Same language.`,
      speech: `Create speech. ${style || 'short'} length. Same language.`
    };

    if (textActions[action]) {
      const effectiveUserId = userId || uid || null; // NEW
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelConfig.id,
          max_tokens: 2048,
          system: textActions[action],
          messages: [{ role: 'user', content: text }]
        }),
      });

      const data = await response.json();
      
      // Log cost (NEW)
      try {
        if (data.usage) {
          await logApiCost({
            provider: 'anthropic',
            model: modelConfig.id,
            tokens_input: data.usage.input_tokens || 0,
            tokens_output: data.usage.output_tokens || 0,
            user_id: effectiveUserId,
            action: action
          });
          // Deduct tokens from user balance
          await deductUserTokens(effectiveUserId, data.usage.input_tokens || 0, data.usage.output_tokens || 0, action);
        }
      } catch (costErr) {
        console.error('[Cost Log] Failed in text action:', costErr.message);
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        action,
        result: data.content?.[0]?.text || '' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
