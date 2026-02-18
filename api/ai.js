// DropLit AI API v4.19 - Vercel Edge Function
// + CONFLICT RESOLUTION PROTOCOL for contradictory facts
// + Transparent handling of uncertainty
// + Explicit "CHECK MEMORY FIRST" instruction
// + Smart prioritization: recent > old, specific > vague
// + EVENT SCHEDULING: create_event tool for reminders/alarms
// + MODEL SELECTION: Choose between Sonnet (ASKI) and Opus (Deep)
// + API COST TRACKING v1.0
// + TOKEN DEDUCTION v1.0
// + VOICE AUTO-MODEL v1.0
// + IMAGE IN CHAT v1.0 ← NEW: Multimodal messages with images
// Version: 4.19.0

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

// Parse contacts from Knowledge Base text
// Supports formats: "Name: email", "Name - email", "Name | email"
function parseContactsFromKnowledge(knowledge) {
  if (!knowledge) return {};
  
  const contacts = {};
  const lines = knowledge.split('\n');
  
  // Email regex
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
  
  for (const line of lines) {
    // Skip headers and empty lines
    if (line.startsWith('#') || !line.trim()) continue;
    
    // Try to extract name and email
    // Format: "Name: email" or "Name - email" or "Name | email"
    const match = line.match(/^[\-\*]?\s*([^:|\-]+)[:\|\-]\s*([\w.-]+@[\w.-]+\.\w+)/i);
    if (match) {
      const name = match[1].trim().toLowerCase();
      const email = match[2].trim().toLowerCase();
      contacts[name] = email;
      
      // Also add without common prefixes/suffixes
      const simpleName = name.replace(/^(mr|mrs|ms|dr|prof)\.?\s*/i, '').trim();
      if (simpleName !== name) {
        contacts[simpleName] = email;
      }
      
      // Add first name only
      const firstName = name.split(/\s+/)[0];
      if (firstName && firstName !== name && !contacts[firstName]) {
        contacts[firstName] = email;
      }
    }
  }
  
  console.log('[Contacts] Parsed from knowledge:', Object.keys(contacts).length, 'contacts');
  return contacts;
}

// Resolve recipient name to email address
// userEmail comes from frontend settings, askiKnowledge for contact lookup
function resolveEmailAddress(recipient, userEmail, askiKnowledge = '') {
  if (!recipient) return null;
  
  // Check if it's already an email
  if (recipient.includes('@')) return recipient;
  
  // Normalize recipient
  const normalized = recipient.toLowerCase().trim();
  
  // Personal pronouns → use userEmail from settings
  const personalAliases = ['я', 'мне', 'me', 'myself', 'мой', 'себе', 'alex', 'алекс'];
  if (personalAliases.includes(normalized)) {
    return userEmail || null;
  }
  
  // Parse contacts from Knowledge Base
  const knowledgeContacts = parseContactsFromKnowledge(askiKnowledge);
  if (knowledgeContacts[normalized]) {
    console.log('[Contacts] Found in knowledge:', normalized, '->', knowledgeContacts[normalized]);
    return knowledgeContacts[normalized];
  }
  
  // Try partial match (e.g. "john" matches "john smith")
  for (const [name, email] of Object.entries(knowledgeContacts)) {
    if (name.includes(normalized) || normalized.includes(name)) {
      console.log('[Contacts] Partial match:', normalized, '->', email);
      return email;
    }
  }
  
  return null;
}

const TOOLS = [
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
    name: "send_email",
    description: "Send email with content, optionally as Word document attachment. Use when user asks to send, email, or share something. Can use names from address book (Alex, Бухгалтерия, etc.) or direct email addresses.",
    input_schema: {
      type: "object",
      properties: {
        to: { 
          type: "string", 
          description: "Recipient: name from address book (Alex, мне, Бухгалтерия) or email address" 
        },
        subject: { 
          type: "string", 
          description: "Email subject line" 
        },
        content: { 
          type: "string", 
          description: "Email body content (text or HTML)" 
        },
        as_word: { 
          type: "boolean", 
          description: "If true, convert content to Word document and attach" 
        },
        filename: {
          type: "string",
          description: "Filename for Word attachment (without extension). Default: 'document'"
        }
      },
      required: ["to", "subject", "content"]
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
    description: "Delete a drop from user's feed. Look at ЛЕНТА/FEED section in your context to find the ID. Returns action for frontend to execute.",
    input_schema: {
      type: "object",
      properties: {
        drop_id: {
          type: "string",
          description: "ID of the drop from ЛЕНТА/FEED list"
        }
      },
      required: ["drop_id"]
    }
  },
  {
    name: "update_drop",
    description: "Edit content of a drop in user's feed. Look at ЛЕНТА/FEED section to find the ID. Returns action for frontend to execute.",
    input_schema: {
      type: "object",
      properties: {
        drop_id: {
          type: "string",
          description: "ID of the drop from ЛЕНТА/FEED list"
        },
        new_content: {
          type: "string",
          description: "New text content for the drop"
        }
      },
      required: ["drop_id", "new_content"]
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
  },
  {
    name: "generate_image",
    description: "Generate an image using GPT Image (gpt-image-1). Use when user asks to create, generate, draw, make an image, picture, illustration, infographic, visual. Can use images from chat as reference. Trigger phrases: 'create image...', 'generate picture...', 'draw...', 'make illustration...', 'нарисуй...', 'создай картинку...', 'сгенерируй изображение...', 'сделай на основе этого фото...'",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the image to generate. Be specific about style, colors, composition. In English for best results. If user uploaded an image, describe what to create based on it."
        },
        size: {
          type: "string",
          enum: ["square", "vertical", "horizontal"],
          description: "Image orientation: square (1024x1024), vertical (1024x1536 - BEST for phone, DEFAULT), horizontal (1536x1024). Default: vertical"
        },
        quality: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Image quality: low (~$0.02), medium (~$0.07), high (~$0.19). Default: medium"
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "create_chart",
    description: "Create a data visualization chart from user's drops or provided data. Use when user asks for statistics, analytics, graphs, charts, visualizations of their data. Trigger phrases: 'покажи статистику...', 'построй график...', 'сколько у меня...', 'визуализируй...', 'диаграмма...', 'show stats...', 'chart of...', 'visualize...'",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Chart title in user's language"
        },
        chart_type: {
          type: "string",
          enum: ["bar", "line", "pie", "doughnut", "polarArea", "radar"],
          description: "Chart type: bar (comparison), line (trends over time), pie/doughnut (proportions), polarArea (categories), radar (multiple metrics)"
        },
        data_source: {
          type: "string",
          enum: ["drops", "manual"],
          description: "Data source: 'drops' to analyze user's drops, 'manual' for provided data"
        },
        query: {
          type: "string",
          description: "What to analyze. Examples: 'tasks by category', 'drops per day this week', 'ideas vs bugs ratio'"
        },
        filters: {
          type: "object",
          description: "Filters for drops query",
          properties: {
            categories: { type: "array", items: { type: "string" }, description: "Filter by categories: tasks, ideas, bugs, etc." },
            period: { type: "string", enum: ["today", "week", "month", "all"], description: "Time period" },
            creator: { type: "string", enum: ["user", "aski", "all"], description: "Who created" }
          }
        },
        manual_data: {
          type: "object",
          description: "Manual data if data_source is 'manual'",
          properties: {
            labels: { type: "array", items: { type: "string" }, description: "X-axis labels" },
            values: { type: "array", items: { type: "number" }, description: "Data values" },
            dataset_label: { type: "string", description: "Dataset label for legend" }
          }
        },
        colors: {
          type: "string",
          enum: ["default", "warm", "cool", "monochrome", "rainbow"],
          description: "Color scheme. Default: auto-selected based on chart type"
        }
      },
      required: ["title", "chart_type"]
    }
  },
  {
    name: "create_diagram",
    description: "Create diagrams and schemas: flowcharts, sequences, architecture, mindmaps, ER, gantt, state machines. Uses Mermaid.js (renders in browser - fully private, no external servers). Trigger phrases: 'нарисуй схему...', 'покажи архитектуру...', 'диаграмма процесса...', 'flowchart...', 'sequence diagram...', 'mind map...'",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Diagram title in user's language"
        },
        diagram_type: {
          type: "string",
          enum: ["flowchart", "sequence", "class", "state", "er", "gantt", "mindmap", "pie", "block", "timeline", "quadrant", "git"],
          description: "Diagram type: flowchart (processes), sequence (interactions), class (OOP), state (state machine), er (database), gantt (timeline), mindmap (ideas), pie (proportions), block (architecture), timeline (chronology), quadrant (priorities), git (branches)"
        },
        code: {
          type: "string",
          description: "Mermaid code. Start with diagram type keyword (flowchart, sequenceDiagram, classDiagram, etc). Use proper Mermaid syntax."
        },
        theme: {
          type: "string",
          enum: ["default", "dark", "forest", "neutral"],
          description: "Color theme. Default: clean look"
        }
      },
      required: ["title", "diagram_type", "code"]
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
function buildSystemPrompt(dropContext, userProfile, coreContext, isExpansion = false, userTimezone = 'UTC', currentFeed = [], askiKnowledge = '') {
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
  const hasKnowledge = askiKnowledge?.trim()?.length > 0;

  let basePrompt = `You are Aski — a highly capable AI assistant with access to user's personal knowledge base.

## CURRENT: ${currentDate}, ${currentTime} (${userTimezone})

${hasKnowledge ? `## 📚 PERSONAL KNOWLEDGE BASE
Пользователь настроил для тебя персональную базу знаний. ВСЕГДА учитывай эту информацию:

${askiKnowledge}

---
` : ''}

## 📋 ЛЕНТА / FEED — Source of Truth
**Лента (Feed)** = то, что пользователь РЕАЛЬНО видит в приложении прямо сейчас.
Это localStorage на устройстве пользователя. НЕ база данных Supabase!

${hasFeed ? `✅ В ленте ${currentFeed.length} дропов:` : '⚠️ Лента пуста или не загружена'}
${hasFeed ? currentFeed.map((d, i) => `${i+1}. [${d.type || 'note'}] ${d.content?.substring(0, 100) || '[encrypted]'}${d.is_encrypted ? ' 🔒' : ''} (id: ${d.id})`).join('\n') : ''}

⚠️ КРИТИЧЕСКИ ВАЖНО:
- ЭТО и есть лента пользователя — доверяй ТОЛЬКО этим данным
- Если пользователь спрашивает "что в ленте" — отвечай из ЭТОГО списка
- Для удаления/редактирования используй ID из ЭТОГО списка
- В базе Supabase могут быть старые удалённые дропы — ИГНОРИРУЙ их!
- Инструменты get_recent_drops и search_drops теперь ищут В ЛЕНТЕ, не в базе

## ⏰ COMMAND DROPS (Напоминания в ленте)
Дропы с типом [command] — это активные напоминания. Формат: "⏰ HH:MM Название"
- **Время в content — это ЛОКАЛЬНОЕ время пользователя!**
- После создания напоминания — НЕ называй время из UTC, смотри на созданный [command] дроп в ленте
- Если пользователь спрашивает "во сколько напоминание" — читай время из content дропа
- Для удаления напоминания — используй delete_drop с ID командного дропа
- status: pending = ожидает, executed = выполнено, cancelled = отменено

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

## ⚠️ BREVITY - CRITICAL RULE:
- ВСЕГДА отвечай МАКСИМАЛЬНО КРАТКО — 1-2 предложения
- Длинные ответы только если пользователь ЯВНО попросит "подробнее", "расскажи больше", "explain more"
- После выполнения действия (удаление, создание) — просто подтверди: "Готово" или "Удалено"
- НЕ объясняй что ты сделал, если не спрашивают
- НЕ предлагай дополнительные действия без запроса

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

⚠️ КРИТИЧЕСКИ ВАЖНО: Для напоминаний используй ТОЛЬКО create_event, НЕ create_drop!

Когда пользователь говорит "напомни", "разбуди", "через X минут/часов", "завтра в X":
1. ВСЕГДА используй create_event (НЕ create_drop!)
2. Convert relative time ("через 5 минут") to absolute ISO datetime
3. Set appropriate priority: alarms=8-10, reminders=5, notifications=3

**ОТВЕТ ПОСЛЕ СОЗДАНИЯ — КРИТИЧНО:**
- Говори ОТНОСИТЕЛЬНОЕ время: "Напомню через 5 минут", "Напомню через час"
- Или просто: "Готово, напомню" без указания времени
- НЕ называй абсолютное время (15:30) — оно может быть в неправильном часовом поясе!
- Пользователь увидит правильное время на карточке в ленте

**НЕПРАВИЛЬНО:** "Напомню в 12:30" (это может быть UTC!)
**ПРАВИЛЬНО:** "Напомню через 5 минут" или "Готово, напоминание создано"

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

## DROP MANAGEMENT — ТОЛЬКО ЛЕНТА:

⚠️ ЛЕНТА (секция выше) = единственный источник. НЕ ходи в базу!

**Что в ленте?** — смотри секцию "ЛЕНТА / FEED" выше, там всё есть

**Удалить дроп?** — возьми ID из ленты, вызови delete_drop(drop_id)

**Изменить дроп?** — возьми ID из ленты, вызови update_drop(drop_id, new_content)

**Создать дроп?** — ТОЛЬКО если пользователь явно попросил "запиши/сохрани"

## 📧 EMAIL — Отправка писем:

Используй send_email когда пользователь просит отправить, переслать, поделиться информацией по почте.

**Адресная книга:**
- "мне", "me", "alex", "алекс" → личная почта пользователя
- Можно указать email напрямую: "отправь на test@example.com"

**ВАЖНО — as_word параметр:**
- Если пользователь говорит "как документ", "word", "вордом", "файлом", "документом" → ОБЯЗАТЕЛЬНО as_word: true
- Без этого параметра отправится просто текст письма без вложения!

**Примеры:**
- "Отправь мне на почту" → send_email(to: "мне", as_word: false)
- "Пришли как документ" → send_email(to: "мне", as_word: true)  
- "Отправь word файл" → send_email(to: "мне", as_word: true)

## 🎨 IMAGE GENERATION (GPT Image):

Используй generate_image когда пользователь просит создать, нарисовать, сгенерировать изображение.

**КЛЮЧЕВОЕ — Референс из чата:**
- Если пользователь ЗАГРУЗИЛ ФОТО в чат, ты его ВИДИШЬ!
- Можешь использовать это фото как референс для генерации
- Опиши что видишь на фото + что пользователь хочет изменить/создать

**Примеры:**
- "Нарисуй котика" → generate_image(prompt: "A cute fluffy cat...")
- [фото человека] + "Сделай в стиле аниме" → generate_image(prompt: "Anime style portrait of a person with [describe features from photo]...")
- "Создай инфографику про кофе" → generate_image(prompt: "Clean infographic about coffee brewing methods...")

**Размеры (size):**
- vertical (1024x1792) — DEFAULT, лучший для телефона
- square (1024x1024) — для аватаров, иконок
- horizontal (1792x1024) — для баннеров

**Качество (quality):**
- low (~$0.02) — черновики
- medium (~$0.07) — DEFAULT, хороший баланс
- high (~$0.19) — финальные версии

**ВАЖНО:**
- Prompt ВСЕГДА на английском — качество выше
- Будь конкретным: стиль, цвета, композиция, освещение
- После генерации изображение появится в чате

## 📊 DATA VISUALIZATION (Chart.js):

Используй create_chart когда пользователь просит статистику, график, диаграмму, визуализацию своих данных.

**Триггеры:**
- "Покажи статистику дропов"
- "Сколько у меня задач?"
- "График активности за неделю"
- "Распределение по категориям"
- "Визуализируй мои данные"

**Типы графиков (chart_type):**
- bar — сравнение категорий (DEFAULT)
- line — тренды во времени
- pie / doughnut — пропорции
- polarArea — радиальное сравнение
- radar — множественные метрики

**Источники данных (data_source):**
- drops — анализ дропов пользователя (DEFAULT)
- manual — данные из разговора

**Фильтры (filters):**
- categories: ['tasks', 'ideas', 'bugs'] — по категориям
- period: 'today' | 'week' | 'month' | 'all' — за период
- creator: 'user' | 'aski' | 'all' — кто создал

**Примеры запросов (query):**
- "by category" / "по категориям" → группировка по category
- "per day" / "по дням" / "за неделю" → по дням
- "by creator" / "кто создал" → user vs aski

**МНОЖЕСТВЕННЫЕ ГРАФИКИ:**
- Если пользователь просит несколько графиков — создавай ВСЕ СРАЗУ!
- Вызывай create_chart несколько раз подряд в одном ответе
- Пример: "покажи все типы диаграмм" → вызови create_chart 4-5 раз с разными chart_type
- НЕ жди подтверждения между графиками

**ВАЖНО для TTS:**
- ВСЕГДА говори краткое вступление ПЕРЕД вызовом create_chart
- Пример: "Вот распределение твоих дропов по категориям." + create_chart(...)
- Заголовок (title) на языке пользователя
- График появится интерактивным в чате

## 📐 DIAGRAMS & SCHEMAS (Mermaid.js):

Используй create_diagram для схем и диаграмм. Рендерится в браузере — полная конфиденциальность!

**Триггеры:**
- "Нарисуй схему...", "Покажи архитектуру..."
- "Flowchart для...", "Sequence diagram..."
- "Mind map про...", "ER диаграмма..."

**Типы (diagram_type):**
- flowchart — процессы, алгоритмы, блок-схемы
- sequence — взаимодействие компонентов
- class — UML классы
- state — машины состояний
- er — база данных (Entity Relationship)
- gantt — временные графики, roadmap
- mindmap — mind maps
- pie — круговые диаграммы
- block — архитектурные схемы
- timeline — хронология
- quadrant — матрица приоритетов
- git — ветки и коммиты

**Mermaid синтаксис (примеры):**

Flowchart:
\`\`\`
flowchart TD
    A[Начало] --> B{Условие?}
    B -->|Да| C[Действие 1]
    B -->|Нет| D[Действие 2]
    C --> E[Конец]
    D --> E
\`\`\`

Sequence:
\`\`\`
sequenceDiagram
    participant U as User
    participant A as ASKI
    participant C as Claude
    U->>A: Запрос
    A->>C: API call
    C-->>A: Ответ
    A-->>U: Результат
\`\`\`

Mindmap:
\`\`\`
mindmap
  root((Проект))
    Фронтенд
      React
      CSS
    Бэкенд
      API
      База данных
\`\`\`

ER (база данных):
\`\`\`
erDiagram
    USER ||--o{ DROP : creates
    DROP {
        int id
        string content
        string category
    }
\`\`\`

**ВАЖНО:**
- Кириллица полностью поддерживается
- ВСЕГДА говори вступление ПЕРЕД create_diagram
- Пример: "Вот схема архитектуры ASKI." + create_diagram(...)

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
async function executeTool(toolName, input, dropContext, userId = null, currentFeed = [], userEmail = null, askiKnowledge = '', userTimezone = 'UTC') {
  console.log('[executeTool] Called with toolName:', toolName);
  console.log('[executeTool] Input keys:', Object.keys(input || {}));
  
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  switch (toolName) {
    case 'create_drop': {
      const text = input.text;
      const category = input.category || 'inbox';
      
      if (!text) return { success: false, error: 'No text', action: 'create_drop' };
      
      console.log('[create_drop] Creating drop:', text.substring(0, 50));
      
      // Just return action for frontend to add to localStorage
      return { 
        success: true, 
        action: 'create_drop',
        drop: { 
          text, 
          category, 
          creator: 'aski',
          created_at: new Date().toISOString()
        },
        sync_local: true,
        message: 'Создано'
      };
    }
    
    case 'send_email': {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      
      if (!RESEND_API_KEY) {
        return { success: false, error: 'Email service not configured', action: 'send_email' };
      }
      
      const recipient = input.to;
      const subject = input.subject;
      const content = input.content;
      const asWord = input.as_word || false;
      const filename = input.filename || 'document';
      
      // Resolve recipient (pass userEmail for personal aliases)
      const toEmail = resolveEmailAddress(recipient, userEmail, askiKnowledge);
      if (!toEmail) {
        return { 
          success: false, 
          error: `Не могу найти адрес для "${recipient}". Укажи email напрямую или настрой свою почту в Settings.`,
          action: 'send_email'
        };
      }
      
      console.log('[send_email] Sending to:', toEmail, 'Subject:', subject, 'asWord:', asWord);
      
      // If Word attachment requested, delegate to frontend for docx generation
      if (asWord) {
        return {
          success: true,
          action: 'send_email_with_docx',
          needs_docx: true,
          to: toEmail,
          subject: subject,
          content: content,
          filename: filename,
          message: 'Подготавливаю документ...'
        };
      }
      
      // Simple email without attachment - send directly
      try {
        const emailBody = {
          from: 'ASKI <aski@syntrise.com>',
          to: toEmail,
          subject: subject,
          html: content.includes('<') ? content : `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${content.replace(/\n/g, '<br>')}</div>`
        };
        
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify(emailBody)
        });
        
        if (!response.ok) {
          const error = await response.text();
          console.error('[send_email] Failed:', error);
          return { success: false, error: `Email failed: ${error}`, action: 'send_email' };
        }
        
        const result = await response.json();
        console.log('[send_email] Success! ID:', result.id);
        
        return {
          success: true,
          action: 'send_email',
          message: `Письмо отправлено на ${toEmail}`,
          email_id: result.id,
          to: toEmail,
          subject: subject
        };
        
      } catch (error) {
        console.error('[send_email] Exception:', error);
        return { success: false, error: error.message, action: 'send_email' };
      }
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
    
    case 'generate_image': {
      return await executeGenerateImage(input, userId);
    }
    
    case 'create_chart': {
      return await executeCreateChart(input, userId, currentFeed);
    }
    
    case 'create_diagram': {
      return await executeCreateDiagram(input, userId);
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
  
  // Generate local ID for fallback
  const localCommandId = `cmd_${Date.now()}`;
  
  try {
    // Validate required fields
    if (!input.name) {
      return { success: false, error: 'Event name is required', action: 'create_event' };
    }
    
    // Calculate scheduled_at
    let scheduledAt;
    if (input.trigger_type === 'datetime' && input.trigger_at) {
      scheduledAt = input.trigger_at;
    } else if (input.trigger_type === 'cron') {
      // For cron, calculate next occurrence (simplified - use current time + 1 hour as placeholder)
      scheduledAt = new Date(Date.now() + 3600000).toISOString();
    } else if (!input.trigger_at) {
      // Default 1 hour if no time specified
      scheduledAt = new Date(Date.now() + 3600000).toISOString();
    } else {
      scheduledAt = input.trigger_at;
    }
    
    // Map action_type
    const actionType = input.action_type || 'push';
    
    // Format time for display
    const scheduledDate = new Date(scheduledAt);
    const timeStr = scheduledDate.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'UTC'
    });
    
    // If no Supabase or userId, create local-only command drop
    if (!SUPABASE_KEY || !userId) {
      console.log('[create_event] No Supabase/userId - creating local-only command drop');
      
      return { 
        success: true, 
        action: 'create_event',
        local_only: true,
        event: {
          id: localCommandId,
          name: input.name,
          trigger_at: scheduledAt,
          scheduled_time: timeStr,
          action_type: actionType,
          creator: 'aski'
        },
        command: {
          id: localCommandId,
          title: input.name,
          scheduled_at: scheduledAt,
          scheduled_time: timeStr,
          status: 'pending',
          creator: 'aski'
        }
      };
    }
    
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
    
    // === COMMAND VALIDATOR v1.0 ===
    // Серверная валидация перед сохранением в БД
    const serverValidation = { valid: true, errors: [], warnings: [] };
    const now = new Date();
    const valDate = new Date(scheduledAt);
    
    // Проверка 1: Время в будущем (с допуском 30 сек)
    if (valDate.getTime() < now.getTime() - 30000) {
      serverValidation.valid = false;
      serverValidation.errors.push({
        code: 'TIME_IN_PAST',
        message: 'Время напоминания в прошлом',
        details: { scheduled_at: scheduledAt, now: now.toISOString() }
      });
    }
    
    // Проверка 2: Разумный горизонт (не более 365 дней)
    const daysAhead = (valDate - now) / (1000 * 60 * 60 * 24);
    if (daysAhead > 365) {
      serverValidation.valid = false;
      serverValidation.errors.push({
        code: 'SCHEDULE_TOO_FAR',
        message: `Напоминание запланировано слишком далеко (${Math.round(daysAhead)} дней)`,
        details: { days_ahead: Math.round(daysAhead), max: 365 }
      });
    }
    
    // Проверка 3: Title не пустой
    if (!input.name || input.name.trim().length === 0) {
      serverValidation.valid = false;
      serverValidation.errors.push({
        code: 'EMPTY_TITLE',
        message: 'Заголовок напоминания не может быть пустым'
      });
    }
    
    // Проверка 4: Отклонение времени от запроса
    const originalRequest = input.original_request || input.name || '';
    const throughMinutesMatch = originalRequest.toLowerCase().match(/через\s+(\d+)\s*минут/);
    if (throughMinutesMatch) {
      const requestedMinutes = parseInt(throughMinutesMatch[1]);
      const expectedTime = new Date(now.getTime() + requestedMinutes * 60000);
      const deviation = Math.abs(valDate - expectedTime) / 60000;
      if (deviation > 5) {
        serverValidation.warnings.push({
          code: 'TIME_DEVIATION',
          message: `Отклонение: ${Math.round(deviation)} мин от запрошенных ${requestedMinutes} мин`,
          details: { requested: requestedMinutes, deviation: Math.round(deviation) }
        });
      }
    }
    
    // Если валидация не прошла — возвращаем ошибку
    if (!serverValidation.valid) {
      console.error('[create_event] ❌ Validation FAILED:', serverValidation.errors);
      return {
        success: false,
        action: 'create_event',
        blocked: true,
        validation: serverValidation,
        error: serverValidation.errors.map(e => e.message).join('; ')
      };
    }
    
    if (serverValidation.warnings.length > 0) {
      console.warn('[create_event] ⚠️ Validation warnings:', serverValidation.warnings);
    }
    console.log('[create_event] ✓ Validation PASSED');
    // === END COMMAND VALIDATOR ===
    
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
    
    return { 
      success: true, 
      action: 'create_event',
      validation: serverValidation,
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
    return { success: false, error: error.message, action: 'create_event' };
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
      sync_local: true, // Signal frontend to remove from feed
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
// DELETE DROP - Just signal frontend to remove from localStorage
// ============================================
async function executeDeleteDrop(input, userId) {
  console.log('[delete_drop] Input:', JSON.stringify(input));
  
  const dropId = input.drop_id ? String(input.drop_id) : null;
  
  if (!dropId) {
    return { success: false, error: 'Укажи ID дропа из ленты', action: 'delete_drop' };
  }
  
  // Just return action for frontend - no DB operations
  return {
    success: true,
    action: 'delete_drop',
    deleted_id: dropId,
    local_id: dropId,
    sync_local: true,
    message: 'Удалено'
  };
}

// ============================================
// UPDATE DROP - Just signal frontend to update localStorage
// ============================================
async function executeUpdateDrop(input, userId) {
  console.log('[update_drop] Input:', JSON.stringify(input));
  
  const dropId = input.drop_id ? String(input.drop_id) : null;
  
  if (!dropId) {
    return { success: false, error: 'Укажи ID дропа из ленты', action: 'update_drop' };
  }
  
  if (!input.new_content) {
    return { success: false, error: 'Укажи новый текст', action: 'update_drop' };
  }
  
  // Just return action for frontend - no DB operations
  return {
    success: true,
    action: 'update_drop',
    updated_id: dropId,
    new_content: input.new_content,
    sync_local: true,
    message: 'Обновлено'
  };
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
// GENERATE IMAGE → GPT Image (gpt-image-1) with DALL-E 3 fallback
// ============================================
async function executeGenerateImage(input, userId) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_KEY) {
    console.error('[generate_image] No OpenAI API key');
    return { success: false, error: 'Image generation not configured', action: 'generate_image' };
  }
  
  if (!input.prompt) {
    return { success: false, error: 'Prompt is required', action: 'generate_image' };
  }
  
  // Try GPT Image first, fallback to DALL-E 3
  const models = ['gpt-image-1', 'dall-e-3'];
  
  for (const model of models) {
    console.log(`[generate_image] Trying model: ${model}`);
    
    // Size mapping differs by model
    let size;
    if (model === 'gpt-image-1') {
      // GPT Image: 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape)
      const sizeMap = {
        'square': '1024x1024',
        'vertical': '1024x1536',
        'horizontal': '1536x1024'
      };
      size = sizeMap[input.size] || '1024x1536';
    } else {
      // DALL-E 3: 1024x1024, 1024x1792 (portrait), 1792x1024 (landscape)
      const sizeMap = {
        'square': '1024x1024',
        'vertical': '1024x1792',
        'horizontal': '1792x1024'
      };
      size = sizeMap[input.size] || '1024x1792';
    }
    
    const quality = input.quality || 'standard'; // DALL-E uses 'standard'/'hd'
    
    console.log('[generate_image] Prompt:', input.prompt.substring(0, 100));
    console.log('[generate_image] Size:', size);
    
    try {
      const requestBody = {
        model: model,
        prompt: input.prompt,
        n: 1,
        size: size
      };
      
      // DALL-E 3 needs response_format for base64
      if (model === 'dall-e-3') {
        requestBody.response_format = 'b64_json';
      }
      
      console.log('[generate_image] Request body:', JSON.stringify(requestBody));
      
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('[generate_image] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[generate_image] ${model} API error:`, errorText);
        
        // If gpt-image-1 fails, try DALL-E 3
        if (model === 'gpt-image-1') {
          console.log('[generate_image] gpt-image-1 failed, trying dall-e-3...');
          continue;
        }
        
        // DALL-E 3 also failed
        let errorMessage = `API error: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {}
        
        return { 
          success: false, 
          error: errorMessage,
          action: 'generate_image' 
        };
      }
      
      const data = await response.json();
      console.log('[generate_image] Response keys:', Object.keys(data));
      
      if (!data.data || !data.data[0]) {
        console.error('[generate_image] No data in response');
        if (model === 'gpt-image-1') continue;
        return { success: false, error: 'No image data', action: 'generate_image' };
      }
      
      let imageBase64 = data.data[0].b64_json;
      const revisedPrompt = data.data[0].revised_prompt;
      
      // If no b64_json, try URL
      if (!imageBase64 && data.data[0].url) {
        console.log('[generate_image] Fetching from URL...');
        try {
          const imgResponse = await fetch(data.data[0].url);
          const arrayBuffer = await imgResponse.arrayBuffer();
          imageBase64 = Buffer.from(arrayBuffer).toString('base64');
        } catch (fetchErr) {
          console.error('[generate_image] URL fetch failed:', fetchErr);
          if (model === 'gpt-image-1') continue;
          return { success: false, error: 'Failed to fetch image', action: 'generate_image' };
        }
      }
      
      if (!imageBase64) {
        console.error('[generate_image] No image data');
        if (model === 'gpt-image-1') continue;
        return { success: false, error: 'No image in response', action: 'generate_image' };
      }
      
      console.log(`[generate_image] SUCCESS with ${model}! Image length:`, imageBase64.length);
      
      // Log cost
      const cost = model === 'gpt-image-1' ? 0.07 : (size === '1024x1024' ? 0.04 : 0.08);
      try {
        if (userId) {
          await logApiCost({
            provider: 'openai',
            model: model,
            tokens_input: 0,
            tokens_output: 0,
            user_id: userId,
            action: 'generate_image',
            extra: { size, cost_usd: cost }
          });
        }
      } catch (costErr) {
        console.error('[generate_image] Cost log error:', costErr.message);
      }
      
      return {
        success: true,
        action: 'generate_image',
        image: `data:image/png;base64,${imageBase64}`,
        revised_prompt: revisedPrompt,
        size: size,
        model: model
      };
      
    } catch (error) {
      console.error(`[generate_image] ${model} exception:`, error.message);
      if (model === 'gpt-image-1') continue;
      return { success: false, error: error.message, action: 'generate_image' };
    }
  }
  
  return { success: false, error: 'All image models failed', action: 'generate_image' };
}

// ============================================
// CREATE CHART → Chart.js Visualization
// ============================================
async function executeCreateChart(input, userId, currentFeed = []) {
  console.log('[create_chart] Starting chart creation');
  console.log('[create_chart] Input:', JSON.stringify(input, null, 2));
  console.log('[create_chart] Feed length:', currentFeed.length);
  if (currentFeed.length > 0) {
    console.log('[create_chart] Sample drop:', JSON.stringify(currentFeed[0], null, 2));
  }
  
  const title = input.title || 'Chart';
  const chartType = input.chart_type || 'bar';
  const dataSource = input.data_source || 'drops';
  const query = input.query || '';
  const filters = input.filters || {};
  const manualData = input.manual_data || null;
  const colorScheme = input.colors || 'default';
  
  let labels = [];
  let values = [];
  let datasetLabel = title;
  
  // ═══════════════════════════════════════
  // ANALYZE DROPS IF data_source = 'drops'
  // ═══════════════════════════════════════
  if (dataSource === 'drops' && currentFeed.length > 0) {
    console.log('[create_chart] Analyzing', currentFeed.length, 'drops');
    
    // Apply filters
    let filteredDrops = [...currentFeed];
    
    // Filter by categories
    if (filters.categories && filters.categories.length > 0) {
      filteredDrops = filteredDrops.filter(d => filters.categories.includes(d.category));
    }
    
    // Filter by period - use created_at (v4.22 fix)
    if (filters.period) {
      const now = new Date();
      let cutoff;
      switch (filters.period) {
        case 'today':
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoff = null;
      }
      if (cutoff) {
        filteredDrops = filteredDrops.filter(d => {
          // v4.22: Use created_at which is what frontend sends
          const dropDate = new Date(d.created_at || d.timestamp || 0);
          return dropDate >= cutoff;
        });
      }
    }
    
    // Filter by creator
    if (filters.creator && filters.creator !== 'all') {
      filteredDrops = filteredDrops.filter(d => d.creator === filters.creator);
    }
    
    console.log('[create_chart] After filters:', filteredDrops.length, 'drops');
    
    // Determine analysis type based on query
    const queryLower = (query || '').toLowerCase();
    
    if (queryLower.includes('by category') || queryLower.includes('по категори') || queryLower.includes('распределение')) {
      // Group by category
      const categoryCount = {};
      filteredDrops.forEach(d => {
        const cat = d.category || 'inbox';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      });
      labels = Object.keys(categoryCount);
      values = Object.values(categoryCount);
      datasetLabel = 'Drops by category';
      
    } else if (queryLower.includes('per day') || queryLower.includes('by day') || queryLower.includes('по дням') || queryLower.includes('за неделю')) {
      // Group by day (last 7 days)
      const dayCount = {};
      const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      
      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toLocaleDateString('ru-RU');
        dayCount[key] = 0;
      }
      
      filteredDrops.forEach(d => {
        // v4.22: Extract date from created_at
        const dropDate = new Date(d.created_at || d.timestamp || 0);
        const key = dropDate.toLocaleDateString('ru-RU');
        if (dayCount.hasOwnProperty(key)) {
          dayCount[key]++;
        }
      });
      
      labels = Object.keys(dayCount);
      values = Object.values(dayCount);
      datasetLabel = 'Drops per day';
      
    } else if (queryLower.includes('creator') || queryLower.includes('автор') || queryLower.includes('кто создал')) {
      // Group by creator
      const creatorCount = { user: 0, aski: 0 };
      filteredDrops.forEach(d => {
        const creator = d.creator || 'user';
        creatorCount[creator] = (creatorCount[creator] || 0) + 1;
      });
      labels = Object.keys(creatorCount);
      values = Object.values(creatorCount);
      datasetLabel = 'By creator';
      
    } else {
      // Default: count by category
      const categoryCount = {};
      filteredDrops.forEach(d => {
        const cat = d.category || 'inbox';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      });
      labels = Object.keys(categoryCount);
      values = Object.values(categoryCount);
      datasetLabel = 'Drops';
    }
    
  } else if (dataSource === 'manual' && manualData) {
    // Use manually provided data
    labels = manualData.labels || [];
    values = manualData.values || [];
    datasetLabel = manualData.dataset_label || title;
  }
  
  // Fallback if no data
  if (labels.length === 0) {
    console.log('[create_chart] No data found, using sample');
    labels = ['No data'];
    values = [0];
  }
  
  console.log('[create_chart] Labels:', labels);
  console.log('[create_chart] Values:', values);
  
  // ═══════════════════════════════════════
  // COLOR SCHEMES
  // ═══════════════════════════════════════
  const colorSchemes = {
    default: [
      'rgba(99, 102, 241, 0.8)',   // Indigo
      'rgba(236, 72, 153, 0.8)',   // Pink
      'rgba(34, 197, 94, 0.8)',    // Green
      'rgba(249, 115, 22, 0.8)',   // Orange
      'rgba(14, 165, 233, 0.8)',   // Sky
      'rgba(168, 85, 247, 0.8)',   // Purple
      'rgba(234, 179, 8, 0.8)',    // Yellow
      'rgba(239, 68, 68, 0.8)'     // Red
    ],
    warm: [
      'rgba(239, 68, 68, 0.8)',
      'rgba(249, 115, 22, 0.8)',
      'rgba(234, 179, 8, 0.8)',
      'rgba(236, 72, 153, 0.8)',
      'rgba(251, 146, 60, 0.8)',
      'rgba(248, 113, 113, 0.8)'
    ],
    cool: [
      'rgba(14, 165, 233, 0.8)',
      'rgba(99, 102, 241, 0.8)',
      'rgba(168, 85, 247, 0.8)',
      'rgba(6, 182, 212, 0.8)',
      'rgba(34, 197, 94, 0.8)',
      'rgba(45, 212, 191, 0.8)'
    ],
    monochrome: [
      'rgba(99, 102, 241, 1.0)',
      'rgba(99, 102, 241, 0.8)',
      'rgba(99, 102, 241, 0.6)',
      'rgba(99, 102, 241, 0.4)',
      'rgba(99, 102, 241, 0.3)',
      'rgba(99, 102, 241, 0.2)'
    ],
    rainbow: [
      'rgba(239, 68, 68, 0.8)',
      'rgba(249, 115, 22, 0.8)',
      'rgba(234, 179, 8, 0.8)',
      'rgba(34, 197, 94, 0.8)',
      'rgba(14, 165, 233, 0.8)',
      'rgba(99, 102, 241, 0.8)',
      'rgba(168, 85, 247, 0.8)',
      'rgba(236, 72, 153, 0.8)'
    ]
  };
  
  const colors = colorSchemes[colorScheme] || colorSchemes.default;
  const backgroundColors = values.map((_, i) => colors[i % colors.length]);
  const borderColors = backgroundColors.map(c => c.replace('0.8', '1'));
  
  // ═══════════════════════════════════════
  // BUILD CHART.JS CONFIG
  // ═══════════════════════════════════════
  const chartConfig = {
    type: chartType,
    data: {
      labels: labels,
      datasets: [{
        label: datasetLabel,
        data: values,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: chartType === 'line' ? 2 : 1,
        tension: chartType === 'line' ? 0.3 : 0,
        fill: chartType === 'line' ? false : true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 16, weight: 'bold' },
          color: '#1f2937'
        },
        legend: {
          display: ['pie', 'doughnut', 'polarArea'].includes(chartType),
          position: 'bottom',
          labels: { 
            font: { size: 12 },
            padding: 15,
            usePointStyle: true
          }
        }
      },
      scales: ['pie', 'doughnut', 'polarArea', 'radar'].includes(chartType) ? {} : {
        y: {
          beginAtZero: true,
          ticks: { 
            font: { size: 11 },
            color: '#6b7280'
          },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: {
          ticks: { 
            font: { size: 11 },
            color: '#6b7280'
          },
          grid: { display: false }
        }
      }
    }
  };
  
  console.log('[create_chart] Chart config ready');
  
  // ═══════════════════════════════════════
  // RETURN CONFIG (frontend will render)
  // ═══════════════════════════════════════
  return {
    success: true,
    action: 'create_chart',
    chartConfig: chartConfig,
    chartDataSource: {
      type: dataSource,
      query: query,
      filters: filters,
      dropCount: dataSource === 'drops' ? currentFeed.length : 0,
      resultCount: labels.length
    },
    title: title,
    chartType: chartType
  };
}

// Helper: parse Russian date format
function parseRuDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('.');
  if (parts.length !== 3) return new Date(0);
  const [d, m, y] = parts.map(Number);
  return new Date(y, m - 1, d);
}

// ============================================
// CREATE DIAGRAM → Mermaid.js Visualization (v4.24)
// ============================================
async function executeCreateDiagram(input, userId) {
  console.log('[create_diagram] Input:', JSON.stringify(input).slice(0, 500));
  
  const title = input.title || 'Diagram';
  const diagramType = input.diagram_type || 'flowchart';
  const code = input.code || '';
  const theme = input.theme || 'default';
  
  // Validate Mermaid code - should start with diagram type keyword
  const validStarts = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 
                       'erDiagram', 'gantt', 'mindmap', 'pie', 'block', 'timeline', 
                       'quadrantChart', 'gitGraph', 'journey', 'C4Context'];
  
  const codeStart = code.trim().split(/[\s\n]/)[0].toLowerCase();
  const isValid = validStarts.some(s => codeStart.startsWith(s.toLowerCase()));
  
  if (!code || !isValid) {
    console.log('[create_diagram] Invalid code - does not start with diagram type');
    return {
      success: false,
      action: 'create_diagram',
      error: 'Invalid Mermaid code: must start with diagram type (flowchart, sequenceDiagram, etc)'
    };
  }
  
  // Add theme config if not default
  let finalCode = code.trim();
  if (theme !== 'default') {
    // Prepend theme directive
    finalCode = `%%{init: {'theme': '${theme}'}}%%\n${finalCode}`;
  }
  
  console.log('[create_diagram] Final code length:', finalCode.length);
  console.log('[create_diagram] Type:', diagramType, 'Theme:', theme);
  
  // Return diagram data for client-side rendering
  // Client will render using Mermaid.js in browser (fully private!)
  return {
    success: true,
    action: 'create_diagram',
    title: title,
    diagramType: diagramType,
    code: finalCode,
    theme: theme
  };
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
async function handleStreamingChatWithTools(apiKey, systemPrompt, messages, maxTokens, dropContext, writer, debugInfo = null, userId = null, modelConfig = null, currentFeed = [], userEmail = null, askiKnowledge = '') {
  const encoder = new TextEncoder();
  let toolResults = [];
  let createDropAction = null;
  let createEventAction = null;
  let cancelEventAction = null;
  let listEventsAction = null;
  let deleteDropAction = null;
  let updateDropAction = null;
  let sendEmailAction = null;
  let generateImageAction = null;
  let createChartActions = [];  // v4.22: массив для множественных графиков
  let createDiagramActions = [];  // v4.24: массив для диаграмм PlantUML
  
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
        console.log('[Streaming] content_block_stop - currentTextContent:', currentTextContent?.length || 0, 'currentToolUse:', currentToolUse?.name || 'null');
        if (currentTextContent) {
          contentBlocks.push({ type: 'text', text: currentTextContent });
          console.log('[Streaming] Added text block, total blocks:', contentBlocks.length);
        }
        if (currentToolUse) {
          // Parse accumulated JSON input
          try {
            currentToolUse.input = JSON.parse(toolUseInputBuffer || '{}');
            console.log('[Streaming] Parsed tool input for', currentToolUse.name, '- keys:', Object.keys(currentToolUse.input));
          } catch (e) {
            console.error('[Streaming] Failed to parse tool input:', e.message);
            currentToolUse.input = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: currentToolUse.input
          });
          console.log('[Streaming] Added tool_use block:', currentToolUse.name, 'total blocks:', contentBlocks.length);
          currentToolUse = null;
          toolUseInputBuffer = '';
        }
      }
      
      // Message delta (contains stop_reason and output tokens) (UPDATED)
      if (event.type === 'message_delta') {
        stopReason = event.delta?.stop_reason;
        console.log('[Streaming] message_delta received! stop_reason:', stopReason);
        if (event.usage?.output_tokens) {
          totalOutputTokens += event.usage.output_tokens;
        }
      }
    }
    
    // Check if we need to execute tools
    console.log('[Streaming] stopReason:', stopReason, 'contentBlocks:', contentBlocks.length);
    console.log('[Streaming] contentBlocks types:', contentBlocks.map(b => b.type + ':' + (b.name || 'text')).join(', '));
    
    // DEBUG: Send debug info to client
    sendEvent({ 
      type: 'debug', 
      stopReason: stopReason,
      contentBlocksCount: contentBlocks.length,
      toolBlocksCount: contentBlocks.filter(b => b.type === 'tool_use').length,
      blockTypes: contentBlocks.map(b => b.type + ':' + (b.name || 'text'))
    });
    
    if (stopReason === 'tool_use') {
      const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');
      console.log('[Streaming] Found', toolBlocks.length, 'tool_use blocks');
      
      if (toolBlocks.length === 0) {
        console.log('[Streaming] No tool blocks found, breaking');
        break;
      }
      
      // Add assistant message with all content blocks
      messages.push({ role: 'assistant', content: contentBlocks });
      
      // Execute all tools and collect results
      const toolResultsContent = [];
      
      for (const toolBlock of toolBlocks) {
        let toolResult;
        try {
          console.log('[Tool] Executing:', toolBlock.name);
          console.log('[Tool] Input:', JSON.stringify(toolBlock.input).slice(0, 500));
          toolResult = await executeTool(toolBlock.name, toolBlock.input, dropContext, userId, currentFeed, userEmail, askiKnowledge);
          console.log('[Tool] Result for', toolBlock.name, ':', JSON.stringify({
            success: toolResult?.success,
            action: toolResult?.action,
            error: toolResult?.error,
            hasSections: !!toolResult?.sections,
            sectionsLength: toolResult?.sections?.length
          }));
        } catch (toolError) {
          console.error('[Tool] EXCEPTION executing', toolBlock.name, ':', toolError.message);
          console.error('[Tool] Stack:', toolError.stack);
          toolResult = { success: false, error: toolError.message, action: toolBlock.name };
        }
        
        toolResults.push({ toolName: toolBlock.name, result: toolResult });
        
        // Track create_drop action
        if (toolBlock.name === 'create_drop' && toolResult?.action === 'create_drop') {
          createDropAction = toolResult;
          console.log('[create_drop] Tracked for frontend:', JSON.stringify(toolResult));
        }
        
        // Track create_event action
        if (toolBlock.name === 'create_event' && toolResult?.action === 'create_event') {
          createEventAction = toolResult;
          console.log('[create_event] Tracked for frontend:', JSON.stringify(toolResult));
        }
        
        // DEBUG: Log if create_event was called but not tracked
        if (toolBlock.name === 'create_event' && toolResult?.action !== 'create_event') {
          console.warn('[create_event] NOT tracked - action was:', toolResult?.action, 'error:', toolResult?.error);
        }
        
        // Track cancel_event action
        if (toolBlock.name === 'cancel_event' && toolResult?.action === 'cancel_event') {
          cancelEventAction = toolResult;
        }
        
        // Track list_events action
        if (toolBlock.name === 'list_events' && toolResult?.action === 'list_events') {
          listEventsAction = toolResult;
        }
        
        // Track delete_drop action (v4.17)
        if (toolBlock.name === 'delete_drop') {
          deleteDropAction = toolResult;
        }
        
        // Track update_drop action (v4.17)
        if (toolBlock.name === 'update_drop') {
          updateDropAction = toolResult;
        }
        
        // Track send_email action (v4.19)
        if (toolBlock.name === 'send_email') {
          sendEmailAction = toolResult;
          console.log('[send_email] Tracked:', JSON.stringify(toolResult));
        }
        
        // Track generate_image action (v4.20)
        if (toolBlock.name === 'generate_image') {
          generateImageAction = toolResult;
          console.log('[generate_image] Tracked, image size:', toolResult?.image?.length || 0);
        }
        
        // Track create_chart action (v4.22 - множественные графики)
        if (toolBlock.name === 'create_chart') {
          createChartActions.push(toolResult);
          console.log('[create_chart] Tracked #' + createChartActions.length + ', chart type:', toolResult?.chartType, 'labels:', toolResult?.chartConfig?.data?.labels?.length || 0);
          
          // СРАЗУ отправляем график клиенту (не ждём done)
          if (toolResult?.success && toolResult?.chartConfig) {
            sendEvent({
              type: 'chart_ready',
              chart: toolResult
            });
          }
        }
        
        // Track create_diagram action (v4.24 - Mermaid диаграммы)
        if (toolBlock.name === 'create_diagram') {
          createDiagramActions.push(toolResult);
          console.log('[create_diagram] Tracked #' + createDiagramActions.length + ', type:', toolResult?.diagramType, 'code length:', toolResult?.code?.length || 0);
          
          // СРАЗУ отправляем диаграмму клиенту
          if (toolResult?.success && toolResult?.code) {
            console.log('[create_diagram] Sending diagram_ready event, code length:', toolResult.code.length);
            sendEvent({
              type: 'diagram_ready',
              diagram: toolResult
            });
          } else {
            console.log('[create_diagram] NOT sending diagram_ready - success:', toolResult?.success, 'hasCode:', !!toolResult?.code);
          }
        }
        
        // Notify client about tool result
        sendEvent({ 
          type: 'tool_result', 
          tool: toolBlock.name, 
          success: toolResult?.success || false,
          error: toolResult?.error || null
        });
        
        toolResultsContent.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(toolResult || { success: false, error: 'Tool execution failed' })
        });
      }
      
      // Add tool results to messages
      messages.push({ role: 'user', content: toolResultsContent });
      
      // Continue to next iteration to get Claude's response after tools
      console.log('[Streaming] Tool iteration done, continuing to get Claude response...');
      continue;
    }
    
    // No more tools needed, we're done
    console.log('[Streaming] Loop done. Final text length:', contentBlocks.filter(b => b.type === 'text').map(b => b.text).join('').length);
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
  
  // Log generateImage state before sending done
  console.log('[Streaming] generateImageAction before done:', generateImageAction ? {
    success: generateImageAction.success,
    action: generateImageAction.action,
    error: generateImageAction.error,
    hasImage: !!generateImageAction.image,
    imageLength: generateImageAction.image?.length || 0
  } : 'null');
  
  // Log createChart state before sending done (v4.22 - массив)
  console.log('[Streaming] createChartActions before done:', createChartActions.length, 'charts');
  console.log('[Streaming] createDiagramActions before done:', createDiagramActions.length, 'diagrams');
  
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
    sendEmail: sendEmailAction,
    generateImage: generateImageAction,
    createCharts: createChartActions,  // v4.22: массив графиков
    createDiagrams: createDiagramActions,  // v4.24: массив диаграмм
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    _debug: debugInfo
  });
  
  writer.close();
}

// ============================================
// NON-STREAMING CHAT HANDLER (fallback, with cost tracking)
// ============================================
async function handleNonStreamingChat(apiKey, systemPrompt, messages, maxTokens, dropContext, userId = null, modelConfig = null, currentFeed = [], userEmail = null, askiKnowledge = '') {
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
    
    let toolResult;
    try {
      console.log('[Tool Non-Stream] Executing:', toolBlock.name, JSON.stringify(toolBlock.input));
      toolResult = await executeTool(toolBlock.name, toolBlock.input, dropContext, userId, currentFeed, userEmail, askiKnowledge);
      console.log('[Tool Non-Stream] Result:', toolBlock.name, JSON.stringify(toolResult));
    } catch (toolError) {
      console.error('[Tool Non-Stream] Error:', toolBlock.name, toolError.message);
      toolResult = { success: false, error: toolError.message };
    }
    
    toolResults.push({ toolName: toolBlock.name, result: toolResult });
    
    messages.push({ role: 'assistant', content: data.content });
    messages.push({ 
      role: 'user', 
      content: [{ 
        type: 'tool_result', 
        tool_use_id: toolBlock.id, 
        content: JSON.stringify(toolResult || { success: false, error: 'Tool failed' }) 
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
      currentFeed, // v4.17: Actual drops from user's feed (localStorage)
      userEmail, // v4.19: User email for send_email tool
      askiKnowledge, // v4.20: Personal knowledge base
      // Email attachment fields (for send_email_with_attachment action)
      to: emailTo,
      subject: emailSubject,
      filename: emailFilename,
      docxBase64
    } = await req.json();

    // === DEBUG: Log incoming request for voice bug investigation ===
    console.log('[AI-DEBUG-REQUEST]', JSON.stringify({
      timestamp: new Date().toISOString(),
      action,
      voiceMode: !!voiceMode,
      historyLength: history?.length || 0,
      historyPreview: history?.slice(-2)?.map(m => ({
        isUser: m.isUser,
        textPreview: m.text?.substring(0, 50)
      })) || [],
      textPreview: text?.substring(0, 100),
      hasDropContext: !!dropContext,
      userId: userId || uid || 'none'
    }));

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

    // === SEND EMAIL WITH ATTACHMENT ACTION ===
    if (action === 'send_email_with_attachment') {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      
      if (!RESEND_API_KEY) {
        return new Response(JSON.stringify({ error: 'Email service not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Use already parsed fields from main request parsing
      if (!emailTo || !emailSubject || !docxBase64) {
        return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, docxBase64' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('[send_email_with_attachment] Sending to:', emailTo, 'Subject:', emailSubject);
      
      try {
        const emailBody = {
          from: 'ASKI <aski@syntrise.com>',
          to: emailTo,
          subject: emailSubject,
          html: `<p>Документ "${emailSubject}" во вложении.</p><p style="color: #666; font-size: 12px;">Отправлено через ASKI</p>`,
          attachments: [{
            filename: `${emailFilename || 'document'}.docx`,
            content: docxBase64
          }]
        };
        
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify(emailBody)
        });
        
        if (!response.ok) {
          const error = await response.text();
          console.error('[send_email_with_attachment] Failed:', error);
          return new Response(JSON.stringify({ success: false, error }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const result = await response.json();
        console.log('[send_email_with_attachment] Success! ID:', result.id);
        
        return new Response(JSON.stringify({
          success: true,
          message: `Письмо с документом отправлено на ${emailTo}`,
          email_id: result.id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
        
      } catch (error) {
        console.error('[send_email_with_attachment] Exception:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

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
      
      const maxTokens = isExpansion ? 4096 : 4096;  // v4.23: increased for structured responses
      const systemPrompt = buildSystemPrompt(formattedContext, userProfile, coreContext, isExpansion, userTimezone, currentFeed, askiKnowledge);
      
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
      
      // v4.19: Support image in chat (multimodal)
      if (image) {
        let imageData = image;
        let mediaType = 'image/jpeg';
        if (image.startsWith('data:')) {
          const matches = image.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) { mediaType = matches[1]; imageData = matches[2]; }
        }
        
        messages.push({
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
            { type: 'text', text: text || 'Что на этом изображении?' }
          ]
        });
        console.log('[Chat] Multimodal message with image');
      } else {
        messages.push({ role: 'user', content: text });
      }

      // === DEBUG: Log messages before Claude call ===
      console.log('[AI-DEBUG-MESSAGES]', JSON.stringify({
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        messagesPreview: messages.map(m => ({
          role: m.role,
          contentPreview: typeof m.content === 'string' 
            ? m.content.substring(0, 80) 
            : '[multimodal]'
        })),
        systemPromptLength: systemPrompt?.length || 0,
        hasHistory: messages.length > 1
      }));

      // STREAMING MODE WITH TOOLS
      if (stream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        
        // Start streaming in background, pass debug info, userId, model config, userEmail and askiKnowledge
        handleStreamingChatWithTools(apiKey, systemPrompt, messages, maxTokens, formattedContext, writer, coreDebug, effectiveUserId, modelConfig, currentFeed, userEmail, askiKnowledge)
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
        apiKey, systemPrompt, messages, maxTokens, formattedContext, effectiveUserId, modelConfig, currentFeed, userEmail, askiKnowledge
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
      organize: 'You are a text structuring assistant. Take raw, unstructured text (possibly voice-dictated, missing punctuation, stream-of-consciousness) and transform it into a well-organized, structured document. Extract key points and thesis statements. Group related ideas under clear headings (use ## for sections). Use bullet points for lists. Fix grammar, punctuation, sentence structure. Preserve ALL original meaning — do not add new content. If there are action items or tasks, group them separately. Keep the language of the original text. Output ONLY the structured result, no explanations or preamble.',
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
