// DropLit AI API - Vercel Edge Function
// Проксирует запросы к Claude API, скрывая ключ

export const config = {
  runtime: 'edge',
};

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
    const { action, image, text, style, context, targetLang } = body;

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

    // Build prompt based on action
    let systemPrompt = '';
    let userPrompt = '';
    let messages = [];

    // === IMAGE ACTIONS ===
    if (action === 'ocr') {
      systemPrompt = 'You are an OCR assistant. Extract all visible text from the image exactly as it appears. Preserve formatting where possible (line breaks, lists). If no text is found, say "No text detected."';
      userPrompt = 'Extract all text from this image.';
      
      let imageData = image;
      let mediaType = 'image/jpeg';
      if (image.startsWith('data:')) {
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
          { type: 'text', text: userPrompt }
        ]
      }];
      
    } else if (action === 'describe') {
      systemPrompt = 'You are a helpful assistant that describes images. Focus on: 1) What type of content it is, 2) Key elements and relationships, 3) Any text or labels visible, 4) Overall purpose. Be concise but thorough.';
      userPrompt = 'Describe this image in detail. What is it showing?';
      
      let imageData = image;
      let mediaType = 'image/jpeg';
      if (image.startsWith('data:')) {
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
          { type: 'text', text: userPrompt }
        ]
      }];

    // === TEXT CREATIVE ACTIONS ===
    } else if (action === 'poem') {
      const styleGuide = {
        classic: 'Classic style with rhymes, 3-4 stanzas, AABB or ABAB pattern',
        funny: 'Humorous, playful, with jokes and wordplay',
        tender: 'Warm, emotional, touching, heartfelt',
        epic: 'Grand, ceremonial, celebratory tone',
        modern: 'Free verse, contemporary, no strict rhyme'
      };
      
      systemPrompt = `You are a talented poet. Create a beautiful poem based on user's input.

Style: ${styleGuide[style] || styleGuide.classic}
Language: ALWAYS respond in the SAME language as user's input

Rules:
- If an image is provided, describe what you see and create a poem about it
- Use personal details mentioned by user
- Make it emotional and memorable
- Keep it 8-16 lines
- Output ONLY the poem, no explanations

${context ? `Context: Time is ${context.timeOfDay}, location: ${context.location}` : ''}`;

      userPrompt = text || 'Create a poem about this image';
      
      // Check if image provided
      if (image) {
        let imageData = image;
        let mediaType = 'image/jpeg';
        if (image.startsWith('data:')) {
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
            { type: 'text', text: userPrompt }
          ]
        }];
      } else {
        messages = [{ role: 'user', content: userPrompt }];
      }

    } else if (action === 'greeting') {
      const styleGuide = {
        warm: 'Warm and sincere, heartfelt',
        funny: 'Light-hearted, with gentle humor',
        formal: 'Polished and respectful',
        poetic: 'Lyrical, with beautiful imagery'
      };
      
      systemPrompt = `You are a greeting card writer. Create a short, memorable message.

Style: ${styleGuide[style] || styleGuide.warm}
Language: ALWAYS respond in the SAME language as user's input

Rules:
- If an image is provided, incorporate what you see into the greeting
- 2-5 sentences maximum
- Use personal details if provided
- Make it shareable and touching
- Output ONLY the greeting text, no explanations

${context ? `Context: Time is ${context.timeOfDay}, location: ${context.location}` : ''}`;

      userPrompt = text || 'Create a greeting based on this image';
      
      if (image) {
        let imageData = image;
        let mediaType = 'image/jpeg';
        if (image.startsWith('data:')) {
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
            { type: 'text', text: userPrompt }
          ]
        }];
      } else {
        messages = [{ role: 'user', content: userPrompt }];
      }

    } else if (action === 'speech') {
      const lengthGuide = {
        short: '1-2 minutes, about 150-250 words',
        medium: '3-5 minutes, about 400-600 words',
        long: '7-10 minutes, about 800-1200 words'
      };
      
      systemPrompt = `You are a professional speech writer. Create an engaging speech.

Length: ${lengthGuide[style] || lengthGuide.short}
Language: ALWAYS respond in the SAME language as user's input

Rules:
- If an image is provided, incorporate what you see into the speech
- Strong opening hook
- Use personal details and anecdotes
- Include 1-2 metaphors or quotes
- Emotional and memorable closing
- Easy to read aloud
- Output ONLY the speech, no explanations

${context ? `Context: Time is ${context.timeOfDay}, location: ${context.location}` : ''}`;

      userPrompt = text || 'Create a speech about this image';
      
      if (image) {
        let imageData = image;
        let mediaType = 'image/jpeg';
        if (image.startsWith('data:')) {
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
            { type: 'text', text: userPrompt }
          ]
        }];
      } else {
        messages = [{ role: 'user', content: userPrompt }];
      }

    } else if (action === 'summarize') {
      const checkCategory = body.checkCategory || false;
      
      systemPrompt = `You are a helpful assistant. Summarize the following text concisely in 1-3 sentences.
Keep the main points. Same language as input.
${checkCategory ? `
Also analyze and suggest the best category from: tasks, ideas, bugs, questions, design, handmagic, inbox.
Return JSON format: {"summary": "your summary here", "suggestedCategory": "category_name"}
` : 'Output ONLY the summary text, no explanations.'}`;
      
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else if (action === 'tasks') {
      systemPrompt = `Extract actionable tasks from the text.
Return as JSON array of task strings.
Each task should be clear, actionable, and concise.
Same language as input.
Format: {"tasks": ["task 1", "task 2", "task 3"]}`;
      
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else if (action === 'expand') {
      const checkCategory = body.checkCategory || false;
      
      systemPrompt = `You are a creative assistant. Expand on the given idea or text.
Add more details, examples, or considerations.
Keep the same tone and language as input.
Make it 2-3x longer but stay relevant.
${checkCategory ? `
Also analyze and suggest the best category from: tasks, ideas, bugs, questions, design, handmagic, inbox.
Return JSON format: {"expanded": "your expanded text here", "suggestedCategory": "category_name"}
` : 'Output ONLY the expanded text, no explanations.'}`;
      
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else if (action === 'rewrite') {
      const rewriteStyle = style || 'professional';
      const checkCategory = body.checkCategory || false;
      
      const styleGuides = {
        professional: 'formal, business-appropriate tone',
        casual: 'friendly, conversational tone',
        concise: 'brief and to the point',
        detailed: 'thorough with more context'
      };
      
      // B1 FIX: Explicitly preserve original language
      systemPrompt = `You are a writing assistant. Rewrite the text in a ${styleGuides[rewriteStyle] || styleGuides.professional}.

CRITICAL RULE: You MUST respond in THE EXACT SAME LANGUAGE as the input text.
- If the input is in Russian, respond in Russian.
- If the input is in English, respond in English.
- If the input is in Spanish, respond in Spanish.
- And so on. DO NOT translate. Only rewrite in the same language.

Keep the same meaning. Only change the style/tone.
${checkCategory ? `
Also analyze and suggest the best category from: tasks, ideas, bugs, questions, design, handmagic, inbox.
Return JSON format: {"rewritten": "your rewritten text here", "suggestedCategory": "category_name"}
` : 'Output ONLY the rewritten text, no explanations.'}`;
      
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else if (action === 'enhance') {
      const checkCategory = body.checkCategory || false;
      
      systemPrompt = `You are a professional editor. Enhance the text by:
1. Fix spelling and grammar errors
2. Correct punctuation
3. Fix word agreement and sentence structure
4. Split into proper sentences/paragraphs if needed
5. Keep the original meaning and style

IMPORTANT: Keep the SAME language as input. Do not translate.
Make minimal changes - only fix obvious errors.
${checkCategory ? `
Also analyze and suggest the best category from: tasks, ideas, bugs, questions, design, handmagic, inbox.
Return JSON format: {"enhanced": "your enhanced text here", "suggestedCategory": "category_name"}
` : 'Output ONLY the enhanced text, no explanations.'}`;
      
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    // I1 FIX: Translate action
    } else if (action === 'translate') {
      const targetLang = body.targetLang || 'English';
      
      systemPrompt = `You are a professional translator. Translate the text accurately to ${targetLang}.
Keep the meaning, tone, and style of the original.
Output ONLY the translated text, no explanations or notes.`;
      
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else {
      return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Claude API
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
        system: systemPrompt,
        messages: messages,
      }),
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

    const data = await response.json();
    const resultText = data.content?.[0]?.text || 'No response generated';

    return new Response(JSON.stringify({ 
      success: true,
      action: action,
      result: resultText,
      usage: data.usage,
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
