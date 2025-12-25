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
    const { action, image, text, style, context } = body;

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
- Use personal details mentioned by user
- Make it emotional and memorable
- Keep it 8-16 lines
- Output ONLY the poem, no explanations

${context ? `Context: Time is ${context.timeOfDay}, location: ${context.location}` : ''}`;

      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

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
- 2-5 sentences maximum
- Use personal details if provided
- Make it shareable and touching
- Output ONLY the greeting text, no explanations

${context ? `Context: Time is ${context.timeOfDay}, location: ${context.location}` : ''}`;

      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

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
- Strong opening hook
- Use personal details and anecdotes
- Include 1-2 metaphors or quotes
- Emotional and memorable closing
- Easy to read aloud
- Output ONLY the speech, no explanations

${context ? `Context: Time is ${context.timeOfDay}, location: ${context.location}` : ''}`;

      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else if (action === 'summarize') {
      systemPrompt = 'Summarize the following text in 1-2 concise sentences. Keep the main point. Same language as input.';
      userPrompt = text;
      messages = [{ role: 'user', content: userPrompt }];

    } else if (action === 'tasks') {
      systemPrompt = `Extract actionable tasks from the text. 
Format as a simple numbered list.
Each task should be clear and actionable.
Same language as input.
Output ONLY the task list.`;
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
