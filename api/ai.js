// DropLit AI API v4.12 - Vercel Edge Function
// + CONFLICT RESOLUTION PROTOCOL for contradictory facts
// + Transparent handling of uncertainty
// + Explicit "CHECK MEMORY FIRST" instruction
// + Smart prioritization: recent > old, specific > vague
// Version: 4.12.0

export const config = {
  runtime: 'edge',
};

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
    description: "Search user's notes by keywords.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords" },
        limit: { type: "number", description: "Max results (default 5)" }
      },
      required: ["query"]
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
  }
];

// ============================================
// EXPANSION DETECTION
// ============================================
function isShortAffirmative(text) {
  return text.trim().length < 25;
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
  
  const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
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
function buildSystemPrompt(dropContext, userProfile, coreContext, isExpansion = false, userTimezone = 'UTC') {
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

  let basePrompt = `You are Aski — a highly capable AI assistant with access to user's personal knowledge base.

## CURRENT: ${currentDate}, ${currentTime} (${userTimezone})

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
   - EXPLICIT user statements > inferred information
   - RECENT facts > older facts (if timestamps available)
   - SPECIFIC facts > vague facts
   - POSITIVE statements ("X is Y") > NEGATIVE statements ("X is not Y")

3. **PRESENT both versions when relevant:**
   Example: "According to my records, your grandmother Maria lives in Santa Barbara. 
   However, I also have a note suggesting otherwise. Could you clarify which is current?"

4. **NEVER silently pick one version** — transparency builds trust

5. **OFFER to update** if user provides clarification:
   "Would you like me to remember the correct information?"

### RESPONSE PATTERNS FOR UNCERTAINTY:

**Multiple versions exist:**
"I have several pieces of information about [topic]. The most recent suggests [X], 
but earlier you mentioned [Y]. Which is accurate now?"

**Possible outdated info:**
"My last information about [topic] is [fact]. Is this still current?"

**Conflicting sources:**
"I found both [fact A] and [fact B] about this. Let me know which applies."

## CRITICAL DIALOGUE RULES:

### ADAPTIVE RESPONSE LENGTH:
Identify question type and respond accordingly:

FACTUAL (simple facts, yes/no, numbers):
→ 1-2 sentences MAX, no preamble

EXPLANATORY (how, why, compare):
→ 2-4 sentences, then ASK if user wants more

DEEP (philosophy, strategy, meaning):
→ 1-2 paragraphs, then OFFER to explore aspects

### STOP AFTER QUESTION:
When you ask "Want more details?" or similar:
- STOP IMMEDIATELY after the question
- DO NOT continue with more content
- WAIT for user's response

### LANGUAGE:
Always respond in SAME language as user's message.`;

  if (isExpansion) {
    basePrompt += `

## EXPANSION MODE ACTIVE:
User confirmed they want details. Now give comprehensive answer:
- Full explanation with examples
- Multiple paragraphs as needed
- No need to offer more at the end`;
  }

  basePrompt += `

## TOOLS:
- fetch_recent_drops / search_drops: for user's notes
- create_drop: ONLY on explicit request ("save", "remember", "note this")
- web_search: for current events, weather, news, prices

## CORE MEMORY:`;

  // cleanMemory already defined at the top of function
  
  if (cleanMemory?.length) {
    basePrompt += '\n### Known facts:\n';
    cleanMemory.slice(0, 15).forEach(m => {
      basePrompt += `- ${m.fact}\n`;
    });
  }
  
  if (coreContext?.entities?.length) {
    basePrompt += '\n### Key entities:\n';
    coreContext.entities.slice(0, 10).forEach(e => {
      basePrompt += `- ${e.name} (${e.entity_type}): mentioned ${e.mention_count}x\n`;
    });
  }

  // Semantic search results (most relevant notes for this query)
  if (coreContext?.semanticDrops?.length) {
    basePrompt += '\n### MOST RELEVANT NOTES (semantic match):\n';
    coreContext.semanticDrops.slice(0, 5).forEach(d => {
      const similarity = (d.similarity * 100).toFixed(0);
      basePrompt += `- [${similarity}% match] ${d.content?.slice(0, 200)}${d.content?.length > 200 ? '...' : ''}\n`;
    });
  }

  if (dropContext) {
    basePrompt += `\n## USER'S NOTES:\n${dropContext}\n`;
  }

  if (userProfile?.name) {
    basePrompt += `\n## USER: ${userProfile.name}`;
    if (userProfile.preferences) {
      basePrompt += ` (${userProfile.preferences})`;
    }
    basePrompt += '\n';
  }

  return basePrompt;
}

// ============================================
// TOOL EXECUTION
// ============================================
async function executeTool(toolName, toolInput, dropContext) {
  switch (toolName) {
    case 'fetch_recent_drops':
    case 'search_drops':
    case 'get_summary':
      return { success: true, data: dropContext || 'No drops available in current context.' };
    
    case 'create_drop':
      return { 
        success: true, 
        action: 'create_drop',
        drop: {
          text: toolInput.text,
          category: toolInput.category || 'inbox'
        }
      };
    
    case 'web_search':
      return await executeWebSearch(toolInput.query, toolInput.search_depth);
    
    default:
      return { success: false, error: 'Unknown tool' };
  }
}

// ============================================
// WEB SEARCH (Tavily)
// ============================================
async function executeWebSearch(query, depth = 'basic') {
  const TAVILY_KEY = process.env.TAVILY_API_KEY;
  if (!TAVILY_KEY) {
    return { success: false, error: 'Search not configured' };
  }
  
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: depth,
        max_results: 5
      })
    });
    
    const data = await response.json();
    
    if (data.results?.length) {
      const summary = data.results.map(r => 
        `- ${r.title}: ${r.content?.slice(0, 200)}...`
      ).join('\n');
      return { success: true, data: summary };
    }
    
    return { success: true, data: 'No results found.' };
  } catch (error) {
    return { success: false, error: error.message };
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
// STREAMING CHAT WITH TOOLS
// ============================================
async function handleStreamingChatWithTools(apiKey, systemPrompt, messages, maxTokens, dropContext, writer, debugInfo = null) {
  const encoder = new TextEncoder();
  let toolResults = [];
  let createDropAction = null;
  
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
        model: 'claude-sonnet-4-20250514',
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
    
    // Parse stream
    for await (const event of parseSSEStream(response)) {
      if (event.type === 'done') break;
      
      // Message start
      if (event.type === 'message_start') {
        // Message metadata
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
      
      // Message delta (contains stop_reason)
      if (event.type === 'message_delta') {
        stopReason = event.delta?.stop_reason;
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
        const toolResult = await executeTool(toolBlock.name, toolBlock.input, dropContext);
        toolResults.push({ toolName: toolBlock.name, result: toolResult });
        
        // Track create_drop action
        if (toolBlock.name === 'create_drop' && toolResult.action === 'create_drop') {
          createDropAction = toolResult;
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
  
  // Send final event with metadata AND debug info
  sendEvent({ 
    type: 'done',
    toolsUsed: toolResults.map(t => t.toolName),
    createDrop: createDropAction,
    _debug: debugInfo
  });
  
  writer.close();
}

// ============================================
// NON-STREAMING CHAT HANDLER (fallback)
// ============================================
async function handleNonStreamingChat(apiKey, systemPrompt, messages, maxTokens, dropContext) {
  const claudeRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    tools: TOOLS,
    tool_choice: { type: 'auto' },
  };

  let data;
  let toolResults = [];
  
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
    
    if (data.stop_reason !== 'tool_use') break;
    
    const toolBlock = data.content?.find(b => b.type === 'tool_use');
    if (!toolBlock) break;
    
    const toolResult = await executeTool(toolBlock.name, toolBlock.input, dropContext);
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
  }

  const textBlocks = data.content?.filter(b => b.type === 'text') || [];
  const resultText = textBlocks.map(b => b.text).join('\n');
  
  return { resultText, toolResults, usage: data.usage };
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
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get user timezone from Vercel Geo
  const userTimezone = req.geo?.timezone || 'UTC';
  const userCountry = req.geo?.country || 'Unknown';
  const userCity = req.geo?.city || 'Unknown';

  const rateLimitKey = getRateLimitKey(req, 'ai');
  const rateCheck = checkRateLimit(rateLimitKey, 'ai');
  
  if (!rateCheck.allowed) {
    return rateLimitResponse(rateCheck.resetIn);
  }

  try {
    const body = await req.json();
    const { 
      action, text, image, style, targetLang,
      history = [], syntriseContext, dropContext, userProfile,
      enableTools = true, userId, uid,
      stream = false
    } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: 'No action specified' }), {
        status: 400,
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
      // Format context
      let formattedContext = null;
      if (dropContext) {
        const parts = [];
        if (dropContext.relevant?.length) {
          parts.push('### RELEVANT:');
          dropContext.relevant.forEach(d => parts.push(`- [${d.category}] ${d.text}`));
        }
        if (dropContext.recent?.length) {
          parts.push('\n### RECENT:');
          dropContext.recent.slice(0, 10).forEach(d => parts.push(`- [${d.category}] ${d.text}`));
        }
        if (parts.length) formattedContext = parts.join('\n');
      }
      
      if (!formattedContext && syntriseContext?.length) {
        formattedContext = syntriseContext.map(d => `[${d.category || 'inbox'}] ${d.content}`).join('\n');
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
      const systemPrompt = buildSystemPrompt(formattedContext, userProfile, coreContext, isExpansion, userTimezone);
      
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
        
        // Start streaming in background, pass debug info
        handleStreamingChatWithTools(apiKey, systemPrompt, messages, maxTokens, formattedContext, writer, coreDebug)
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
        apiKey, systemPrompt, messages, maxTokens, formattedContext
      );
      
      const createDropAction = toolResults.find(t => t.toolName === 'create_drop');

      return new Response(JSON.stringify({ 
        success: true,
        action: 'chat',
        result: resultText,
        usage,
        toolsUsed: toolResults.map(t => t.toolName),
        createDrop: createDropAction?.result || null,
        geo: { timezone: userTimezone, country: userCountry, city: userCity },
        // DEBUG INFO - remove after fixing!
        _debug: {
          receivedUserId: userId || null,
          receivedUid: uid || null,
          effectiveUserId: effectiveUserId,
          coreContext: coreDebug
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === IMAGE ACTIONS ===
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
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
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
      return new Response(JSON.stringify({ 
        success: true, 
        result: data.content?.[0]?.text || '' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === TEXT ACTIONS ===
    const textActions = {
      poem: `Create a beautiful poem. Style: ${style || 'classic'}. 8-16 lines. Same language as input.`,
      summarize: 'Summarize in 1-3 sentences. Same language.',
      tasks: 'Extract tasks as JSON: {"tasks": [...]}. Same language.',
      expand: 'Expand idea 2-3x with details. Same language.',
      rewrite: `Rewrite in ${style || 'professional'} tone. Same language.`,
      enhance: 'Fix spelling/grammar. Minimal changes. Same language.',
      translate: `Translate to ${targetLang || 'English'}. Only translation.`,
      greeting: `Create greeting. ${style || 'warm'} style. 2-5 sentences. Same language.`,
      speech: `Create speech. ${style || 'short'} length. Same language.`
    };

    if (textActions[action]) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: textActions[action],
          messages: [{ role: 'user', content: text }]
        }),
      });

      const data = await response.json();
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
