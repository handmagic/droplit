// DropLit AI API v3.1 - Vercel Edge Function
// With Tool Calling + Dynamic Context + Supabase Integration + CORE Memory + Time
// Version: 3.1.0

export const config = {
  runtime: 'edge',
};

// ============================================
// TOOL DEFINITIONS FOR CLAUDE
// ============================================
const TOOLS = [
  {
    name: "fetch_recent_drops",
    description: "Получить последние записи пользователя из базы знаний. Используй когда пользователь спрашивает о своих заметках, задачах, идеях за определённый период.",
    input_schema: {
      type: "object",
      properties: {
        hours: {
          type: "number",
          description: "За сколько часов получить записи (по умолчанию 24)"
        },
        limit: {
          type: "number", 
          description: "Максимальное количество записей (по умолчанию 10)"
        },
        category: {
          type: "string",
          description: "Фильтр по категории: tasks, ideas, bugs, questions, design, inbox"
        }
      },
      required: []
    }
  },
  {
    name: "search_drops",
    description: "Поиск по записям пользователя. Используй когда нужно найти конкретную информацию в заметках.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос (ключевые слова)"
        },
        limit: {
          type: "number",
          description: "Максимальное количество результатов (по умолчанию 5)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "create_drop",
    description: "Создать новую запись в базе знаний пользователя. Используй когда пользователь просит что-то запомнить, записать задачу или идею.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Текст записи"
        },
        category: {
          type: "string",
          description: "Категория: tasks, ideas, bugs, questions, design, inbox",
          enum: ["tasks", "ideas", "bugs", "questions", "design", "inbox"]
        }
      },
      required: ["text"]
    }
  },
  {
    name: "get_summary",
    description: "Получить краткую сводку по записям пользователя. Используй для обзора активности или статистики.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Период: today, week, month",
          enum: ["today", "week", "month"]
        }
      },
      required: []
    }
  }
];

// ============================================
// SYSTEM PROMPT - ENHANCED
// ============================================

// ============================================
// FETCH CORE CONTEXT FROM SUPABASE
// ============================================
async function fetchCoreContext(userId) {
  if (!userId) return null;
  
  const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  if (!SUPABASE_KEY) {
    console.warn('No SUPABASE_SERVICE_KEY configured');
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

    return { memory, entities };

  } catch (error) {
    console.error('Error fetching CORE context:', error);
    return null;
  }
}

function buildSystemPrompt(dropContext, userProfile, coreContext) {
  // Get current date and time
  const now = new Date();
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const currentDate = now.toLocaleDateString('ru-RU', dateOptions);
  const currentTime = now.toLocaleTimeString('ru-RU', timeOptions);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let basePrompt = `You are Aski — a highly capable AI assistant with access to the user's personal knowledge base.

## CURRENT DATE AND TIME:
- Today: ${currentDate}
- Time: ${currentTime} (server time, approximately user's timezone)
- Date numbers: ${currentDay}.${currentMonth}.${currentYear}

Use this information to:
- Know what day it is for scheduling and reminders
- Calculate days until birthdays or events
- Provide time-relevant responses

## YOUR CAPABILITIES:
- You can READ user's notes, tasks, ideas from their personal database
- You can SEARCH through their knowledge base
- You can CREATE new notes and tasks for them
- You can provide SUMMARIES and insights about their data

## PERSONALITY:
- Warm, intelligent, and genuinely helpful
- You remember context from the conversation
- You speak naturally, as a trusted assistant would
- Only create drops when user EXPLICITLY asks to save or remember something

## VOICE-FIRST DESIGN:
- Your responses will be read aloud by text-to-speech
- DO NOT use emojis — they get spoken as words
- Write naturally as if speaking to a friend
- Use punctuation thoughtfully for natural speech rhythm
- Avoid bullet points — use flowing sentences

## LANGUAGE RULES:
- ALWAYS respond in the SAME language as the user's message
- Be concise but thorough (2-5 sentences typically)
- Be direct and conversational

## TOOLS USAGE:
- When user asks about their notes/tasks/ideas → use fetch_recent_drops or search_drops
- When user asks to remember/save something → use create_drop
- When user asks for overview/summary → use get_summary
- You can use multiple tools in sequence if needed

## TRANSLATOR MODE:
When user asks to translate or speak in another language:
- Output ONLY the translation in the target language
- No explanations, just the pure translated text`;

  // Add real-time context if available
  if (dropContext) {
    basePrompt += `

## USER'S CURRENT CONTEXT (from their knowledge base):
${dropContext}

Use this context naturally when relevant. If user's question relates to their notes, reference them directly.`;
  }

  // Add user profile if available
  if (userProfile) {
    basePrompt += `

## USER PROFILE:
${JSON.stringify(userProfile, null, 2)}`;
  }

  // Add CORE memory context
  if (coreContext?.memory?.length > 0) {
    basePrompt += `

## LONG-TERM KNOWLEDGE ABOUT USER:`;
    for (const mem of coreContext.memory) {
      basePrompt += `\n- ${mem.fact}`;
    }
  }

  // Add known entities
  if (coreContext?.entities?.length > 0) {
    basePrompt += `

## KNOWN PEOPLE AND PLACES:`;
    for (const entity of coreContext.entities) {
      let info = `\n- ${entity.name} (${entity.entity_type})`;
      if (entity.attributes && Object.keys(entity.attributes).length > 0) {
        const attrs = Object.entries(entity.attributes)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        info += ` — ${attrs}`;
      }
      basePrompt += info;
    }
  }

  return basePrompt;
}

// ============================================
// TOOL EXECUTION (Mock for now - will be real Supabase calls)
// ============================================
async function executeTool(toolName, toolInput, supabaseContext) {
  // These would be real Supabase calls in production
  // For now, we return data from the provided context
  
  switch (toolName) {
    case 'fetch_recent_drops': {
      const hours = toolInput.hours || 24;
      const limit = toolInput.limit || 10;
      const category = toolInput.category;
      
      // Use provided context or return empty
      if (supabaseContext?.recent) {
        let drops = supabaseContext.recent;
        if (category) {
          drops = drops.filter(d => d.category === category);
        }
        return {
          success: true,
          drops: drops.slice(0, limit),
          count: drops.length,
          period: `last ${hours} hours`
        };
      }
      return { success: true, drops: [], count: 0, message: "No recent drops found" };
    }
    
    case 'search_drops': {
      const query = toolInput.query?.toLowerCase() || '';
      const limit = toolInput.limit || 5;
      
      // Search in provided context
      if (supabaseContext?.recent) {
        const results = supabaseContext.recent.filter(d => 
          d.text?.toLowerCase().includes(query)
        ).slice(0, limit);
        return {
          success: true,
          results: results,
          count: results.length,
          query: query
        };
      }
      
      // Also check relevant drops
      if (supabaseContext?.relevant) {
        return {
          success: true,
          results: supabaseContext.relevant.slice(0, limit),
          count: supabaseContext.relevant.length,
          query: query
        };
      }
      
      return { success: true, results: [], count: 0, message: "No matching drops found" };
    }
    
    case 'create_drop': {
      // This would actually create a drop via Supabase
      // For now, return success and let client handle creation
      return {
        success: true,
        action: 'create_drop',
        text: toolInput.text,
        category: toolInput.category || 'inbox',
        message: "Drop will be created"
      };
    }
    
    case 'get_summary': {
      const period = toolInput.period || 'today';
      
      if (supabaseContext?.recent) {
        const drops = supabaseContext.recent;
        const byCategory = {};
        drops.forEach(d => {
          byCategory[d.category] = (byCategory[d.category] || 0) + 1;
        });
        
        return {
          success: true,
          period: period,
          totalDrops: drops.length,
          byCategory: byCategory,
          latestDrop: drops[0]?.text?.substring(0, 100) + '...'
        };
      }
      
      return { success: true, totalDrops: 0, message: "No drops in this period" };
    }
    
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ============================================
// MAIN HANDLER
// ============================================
export default async function handler(req) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { 
      action, 
      text, 
      history, 
      syntriseContext,  // Legacy
      dropContext,      // New: from Supabase { recent: [], relevant: [] }
      userProfile,
      enableTools = true,  // Enable tool calling
      image,
      style,
      context,
      targetLang,
      userId,           // NEW: for CORE memory
      user_id           // Alternative name
    } = body;

    // Support both naming conventions
    const uid = userId || user_id;

    // Validate input
    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let systemPrompt = '';
    let messages = [];
    let useTools = false;

    // === CHAT ACTION (Ask AI / Aski) ===
    if (action === 'chat') {
      
      // Format context for system prompt
      let formattedContext = null;
      
      // New Supabase context format
      if (dropContext) {
        const parts = [];
        
        if (dropContext.relevant?.length) {
          parts.push('### RELEVANT TO YOUR QUESTION:');
          dropContext.relevant.forEach(d => {
            parts.push(`- [${d.category}] ${d.text}`);
          });
        }
        
        if (dropContext.recent?.length) {
          parts.push('\n### YOUR RECENT NOTES:');
          dropContext.recent.slice(0, 10).forEach(d => {
            const timeStr = d.time ? ` (${d.time})` : '';
            parts.push(`- [${d.category}]${timeStr} ${d.text}`);
          });
        }
        
        if (parts.length) {
          formattedContext = parts.join('\n');
        }
      }
      
      // Legacy Syntrise context format
      if (!formattedContext && syntriseContext?.length) {
        formattedContext = syntriseContext
          .map((drop, i) => `[${drop.category || 'uncategorized'}] ${drop.content}`)
          .join('\n');
      }
      
      // NEW: Fetch CORE memory
      let coreContext = null;
      if (uid) {
        coreContext = await fetchCoreContext(uid);
      }
      
      // Build system prompt with context AND memory
      systemPrompt = buildSystemPrompt(formattedContext, userProfile, coreContext);
      
      // Enable tools for chat
      useTools = enableTools;

      // Build messages with history
      if (history && Array.isArray(history) && history.length > 0) {
        messages = history
          .filter(msg => msg.text && msg.text.trim())
          .map(msg => ({
            role: msg.isUser ? 'user' : 'assistant',
            content: msg.text
          }));
        messages.push({ role: 'user', content: text });
      } else {
        messages = [{ role: 'user', content: text }];
      }

    // === IMAGE ACTIONS ===
    } else if (action === 'ocr') {
      systemPrompt = 'You are an OCR assistant. Extract all visible text from the image exactly as it appears. Preserve formatting where possible. If no text is found, say "No text detected."';
      
      let imageData = image;
      let mediaType = 'image/jpeg';
      if (image?.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mediaType = matches[1];
          imageData = matches[2];
        }
      }
      
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: 'Extract all text from this image.' }
        ]
      }];
      
    } else if (action === 'describe') {
      systemPrompt = 'You are a helpful assistant that describes images. Focus on key elements, text, and purpose. Be concise but thorough.';
      
      let imageData = image;
      let mediaType = 'image/jpeg';
      if (image?.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mediaType = matches[1];
          imageData = matches[2];
        }
      }
      
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: 'Describe this image in detail.' }
        ]
      }];

    // === OTHER ACTIONS (preserved from v1) ===
    } else if (action === 'poem') {
      const styleGuide = {
        classic: 'Classic style with rhymes, 3-4 stanzas, AABB or ABAB pattern',
        funny: 'Humorous, playful, with jokes and wordplay',
        tender: 'Warm, emotional, touching, heartfelt',
        epic: 'Grand, ceremonial, celebratory tone',
        modern: 'Free verse, contemporary, no strict rhyme'
      };
      
      systemPrompt = `You are a talented poet. Create a beautiful poem.
Style: ${styleGuide[style] || styleGuide.classic}
Language: ALWAYS respond in the SAME language as user's input
Rules: Output ONLY the poem, no explanations. 8-16 lines.`;

      if (image) {
        let imageData = image;
        let mediaType = 'image/jpeg';
        if (image.startsWith('data:')) {
          const matches = image.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) { mediaType = matches[1]; imageData = matches[2]; }
        }
        messages = [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
            { type: 'text', text: text || 'Create a poem about this image' }
          ]
        }];
      } else {
        messages = [{ role: 'user', content: text }];
      }

    } else if (action === 'summarize') {
      systemPrompt = `Summarize the following text concisely in 1-3 sentences. Keep the main points. Same language as input.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'tasks') {
      systemPrompt = `Extract actionable tasks from the text. Return as JSON array: {"tasks": ["task 1", "task 2"]}. Same language as input.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'expand') {
      systemPrompt = `Expand on the given idea. Add details, examples, considerations. Make it 2-3x longer but stay relevant. Same language as input.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'rewrite') {
      const rewriteStyle = style || 'professional';
      const styleGuides = {
        professional: 'formal, business-appropriate tone',
        casual: 'friendly, conversational tone',
        concise: 'brief and to the point',
        detailed: 'thorough with more context'
      };
      systemPrompt = `Rewrite the text in a ${styleGuides[rewriteStyle]}. SAME LANGUAGE as input. Only change style, keep meaning.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'enhance') {
      systemPrompt = `Enhance the text: fix spelling, grammar, punctuation. Keep original meaning and style. SAME LANGUAGE as input. Minimal changes.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'translate') {
      const lang = targetLang || 'English';
      systemPrompt = `Translate accurately to ${lang}. Keep meaning, tone, style. Output ONLY the translation.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'greeting') {
      systemPrompt = `Create a short, memorable greeting message. ${style || 'warm'} style. 2-5 sentences. Same language as input.`;
      messages = [{ role: 'user', content: text }];

    } else if (action === 'speech') {
      const lengthGuide = { short: '150-250 words', medium: '400-600 words', long: '800-1200 words' };
      systemPrompt = `Create an engaging speech. Length: ${lengthGuide[style] || lengthGuide.short}. Same language as input.`;
      messages = [{ role: 'user', content: text }];
      
    } else {
      return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================
    // CALL CLAUDE API
    // ============================================
    const claudeRequest = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages,
    };
    
    // Add tools if enabled
    if (useTools) {
      claudeRequest.tools = TOOLS;
      claudeRequest.tool_choice = { type: 'auto' };  // Let Claude decide
    }

    let response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeRequest),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API error:', errorData);
      return new Response(JSON.stringify({ 
        error: 'AI service error', 
        details: response.status 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let data = await response.json();
    
    // ============================================
    // HANDLE TOOL CALLS (loop until done)
    // ============================================
    let toolResults = [];
    let iterations = 0;
    const MAX_ITERATIONS = 5;  // Prevent infinite loops
    
    while (data.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
      iterations++;
      
      // Extract tool calls
      const toolUseBlocks = data.content.filter(block => block.type === 'tool_use');
      
      // Execute each tool
      for (const toolUse of toolUseBlocks) {
        console.log(`🔧 Tool call: ${toolUse.name}`, toolUse.input);
        
        const result = await executeTool(
          toolUse.name, 
          toolUse.input,
          { recent: dropContext?.recent || [], relevant: dropContext?.relevant || [] }
        );
        
        toolResults.push({
          toolName: toolUse.name,
          input: toolUse.input,
          result: result
        });
        
        // Add tool result to messages
        messages.push({
          role: 'assistant',
          content: data.content
        });
        
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          }]
        });
      }
      
      // Call Claude again with tool results
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages,
          tools: TOOLS,
        }),
      });
      
      if (!response.ok) {
        break;
      }
      
      data = await response.json();
    }

    // ============================================
    // EXTRACT FINAL RESPONSE
    // ============================================
    const textBlocks = data.content?.filter(block => block.type === 'text') || [];
    const resultText = textBlocks.map(b => b.text).join('\n') || 'No response generated';

    // Check if AI wants to create a drop
    const createDropAction = toolResults.find(t => t.toolName === 'create_drop');

    return new Response(JSON.stringify({ 
      success: true,
      action: action,
      result: resultText,
      usage: data.usage,
      toolsUsed: toolResults.map(t => t.toolName),
      createDrop: createDropAction?.result || null,  // Client can use this to create drop
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
