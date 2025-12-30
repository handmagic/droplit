// ============================================
// SYNTRISE ASKI API v3.0.0
// With CORE Memory Integration
// ============================================

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      message,
      text,  // DropLit может отправлять text
      action,
      conversationHistory = [],
      history = [],  // альтернативное имя
      dropContext,
      syntriseContext,  // старое имя
      userId,
      user_id  // альтернативное имя
    } = req.body;

    // Поддержка разных форматов
    const userMessage = message || text;
    const chatHistory = conversationHistory.length ? conversationHistory : history;
    const context = dropContext || syntriseContext;
    const uid = userId || user_id;

    if (!userMessage) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // ==========================================
    // NEW: Получаем контекст из CORE
    // ==========================================
    let coreContext = null;
    if (uid) {
      coreContext = await fetchCoreContext(uid);
    }

    // Строим system prompt с памятью
    const systemPrompt = buildSystemPrompt(action, context, coreContext);
    
    // Формируем сообщения
    const messages = [
      ...chatHistory.slice(-10),
      { role: 'user', content: userMessage }
    ];

    // Вызываем Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || 'Извини, не смог сформулировать ответ.';

    // Проверяем на команды создания дропа
    const createDropMatch = assistantMessage.match(/\[CREATE_DROP:(.+?):(.+?)\]/);
    let createDrop = null;
    if (createDropMatch) {
      createDrop = {
        action: 'create_drop',
        category: createDropMatch[1],
        text: createDropMatch[2]
      };
    }

    return res.status(200).json({
      response: assistantMessage.replace(/\[CREATE_DROP:.+?\]/g, '').trim(),
      createDrop,
      contextUsed: {
        drops: context?.recent?.length || 0,
        memory: coreContext?.memory?.length || 0,
        entities: coreContext?.entities?.length || 0
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================
// Fetch CORE Context from Supabase
// ============================================
async function fetchCoreContext(userId) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ughfdhmyflotgsysvrrc.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!SUPABASE_KEY) {
    console.warn('No Supabase key configured');
    return null;
  }

  try {
    // Fetch memory (facts)
    const memoryRes = await fetch(
      `${SUPABASE_URL}/rest/v1/core_memory?user_id=eq.${userId}&is_active=eq.true&order=confidence.desc&limit=20`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const memory = memoryRes.ok ? await memoryRes.json() : [];

    // Fetch entities (people, places, etc.)
    const entitiesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/core_entities?user_id=eq.${userId}&order=mention_count.desc&limit=15`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const entities = entitiesRes.ok ? await entitiesRes.json() : [];

    // Fetch patterns
    const patternsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/core_patterns?user_id=eq.${userId}&is_active=eq.true&strength=gte.0.5&order=strength.desc&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const patterns = patternsRes.ok ? await patternsRes.json() : [];

    // Fetch pending insights
    const insightsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/core_insights?user_id=eq.${userId}&status=eq.pending&order=priority.desc&limit=3`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const insights = insightsRes.ok ? await insightsRes.json() : [];

    return { memory, entities, patterns, insights };

  } catch (error) {
    console.error('Error fetching CORE context:', error);
    return null;
  }
}

// ============================================
// Build System Prompt with Memory
// ============================================
function buildSystemPrompt(action, dropContext, coreContext) {
  let prompt = `Ты Aski — умный персональный AI-ассистент в приложении DropLit.
Ты говоришь на языке пользователя (русский или английский).
Ты дружелюбный, полезный и запоминаешь важную информацию.

`;

  // ==========================================
  // CORE MEMORY — Долгосрочные знания
  // ==========================================
  if (coreContext?.memory?.length > 0) {
    prompt += `### 🧠 ЧТО ТЫ ЗНАЕШЬ О ПОЛЬЗОВАТЕЛЕ:\n`;
    for (const mem of coreContext.memory) {
      const confidence = mem.confidence >= 0.8 ? '●●●' : mem.confidence >= 0.6 ? '●●○' : '●○○';
      prompt += `- ${mem.fact} [${mem.fact_type}] ${confidence}\n`;
    }
    prompt += `\n`;
  }

  // ==========================================
  // ENTITIES — Люди, места, проекты
  // ==========================================
  if (coreContext?.entities?.length > 0) {
    prompt += `### 👥 ИЗВЕСТНЫЕ ЛЮДИ И МЕСТА:\n`;
    for (const entity of coreContext.entities) {
      let info = `- **${entity.name}** (${entity.entity_type})`;
      if (entity.attributes && Object.keys(entity.attributes).length > 0) {
        const attrs = Object.entries(entity.attributes)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        info += ` — ${attrs}`;
      }
      prompt += info + '\n';
    }
    prompt += `\n`;
  }

  // ==========================================
  // PATTERNS — Паттерны поведения
  // ==========================================
  if (coreContext?.patterns?.length > 0) {
    prompt += `### 📊 ПАТТЕРНЫ ПОЛЬЗОВАТЕЛЯ:\n`;
    for (const pattern of coreContext.patterns) {
      prompt += `- ${pattern.description}\n`;
    }
    prompt += `\n`;
  }

  // ==========================================
  // INSIGHTS — Что можно предложить
  // ==========================================
  if (coreContext?.insights?.length > 0) {
    prompt += `### 💡 МОЖЕШЬ ПРЕДЛОЖИТЬ:\n`;
    for (const insight of coreContext.insights) {
      prompt += `- ${insight.title}: ${insight.content}\n`;
    }
    prompt += `\n`;
  }

  // ==========================================
  // DROP CONTEXT — Недавние заметки
  // ==========================================
  if (dropContext?.relevant?.length > 0) {
    prompt += `### 🔍 РЕЛЕВАНТНЫЕ ЗАМЕТКИ:\n`;
    for (const drop of dropContext.relevant.slice(0, 5)) {
      prompt += `- [${drop.category}] ${drop.text}\n`;
    }
    prompt += `\n`;
  }

  if (dropContext?.recent?.length > 0) {
    prompt += `### 📝 ПОСЛЕДНИЕ ЗАМЕТКИ:\n`;
    for (const drop of dropContext.recent.slice(0, 10)) {
      prompt += `- [${drop.category}] (${drop.time}) ${drop.text}\n`;
    }
    prompt += `\n`;
  }

  // ==========================================
  // CAPABILITIES
  // ==========================================
  prompt += `### ⚡ ТВОИ ВОЗМОЖНОСТИ:
- Отвечать на вопросы, используя знания о пользователе
- Помогать с задачами, учитывая контекст
- Создавать заметки: если пользователь просит что-то запомнить, используй формат [CREATE_DROP:category:text]
- Напоминать о важном (дни рождения, события)
- Находить связи между заметками

### 📌 ПРАВИЛА:
- Используй знания о пользователе естественно, не перечисляй их
- Если знаешь факт — применяй его в ответе
- Будь проактивным: если видишь инсайт — предложи
- Отвечай кратко, но информативно
`;

  // ==========================================
  // ACTION-SPECIFIC INSTRUCTIONS
  // ==========================================
  if (action) {
    const actionInstructions = {
      'summarize': '\n🎯 ЗАДАЧА: Кратко резюмируй текст пользователя.',
      'translate': '\n🎯 ЗАДАЧА: Переведи текст. Если на русском — на английский, и наоборот.',
      'improve': '\n🎯 ЗАДАЧА: Улучши текст: исправь ошибки, сделай яснее.',
      'explain': '\n🎯 ЗАДАЧА: Объясни простыми словами.',
      'poem': '\n🎯 ЗАДАЧА: Напиши короткое стихотворение на тему пользователя.',
      'greeting': '\n🎯 ЗАДАЧА: Напиши поздравление. ИСПОЛЬЗУЙ ЗНАНИЯ о человеке если есть!',
      'ideas': '\n🎯 ЗАДАЧА: Предложи идеи и варианты.'
    };
    prompt += actionInstructions[action] || '';
  }

  return prompt;
}
