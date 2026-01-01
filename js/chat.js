// ============================================
// DROPLIT CHAT - v0.9.59
// ASKI chat with streaming support
// ============================================

// Chat history
let askAIMessages = [];
let lastUserMessage = '';

// Open chat panel
function openAskAI() {
  document.body.classList.add('chat-open');
  document.getElementById('askAIPanel').classList.add('open');
  
  setTimeout(() => {
    const input = document.getElementById('askAIInput');
    if (input) input.focus();
  }, 300);
  
  // Show welcome if empty
  if (askAIMessages.length === 0) {
    addAskAIMessage('Hi! I am Aski, your AI assistant. Ask me anything or tell me what to remember.', false);
  }
  
  // Voice Mode: start in sleep mode
  voiceModeActive = false;
  voiceModeSpeaking = false;
  updateVoiceModeUI();
}

// Close chat panel
function closeAskAI() {
  document.body.classList.remove('chat-open');
  document.getElementById('askAIPanel').classList.remove('open');
  
  // Stop voice mode
  stopVoiceModeListening();
  voiceModeActive = false;
  if (typeof stopTTS === 'function') stopTTS();
  
  updateVoiceModeUI();
}

// Toggle chat
function toggleChat() {
  const panel = document.getElementById('askAIPanel');
  if (panel && panel.classList.contains('open')) {
    closeAskAI();
  } else {
    openAskAI();
  }
}

// Add message to chat
function addAskAIMessage(text, isUser) {
  const messagesDiv = document.getElementById('askAIMessages');
  if (!messagesDiv) return;
  
  const time = formatTime(new Date());
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ask-ai-message ' + (isUser ? 'user' : 'ai');
  
  let actionsHtml = '';
  if (!isUser) {
    actionsHtml = '<div class="ask-ai-actions">' +
      '<button class="ask-ai-action-btn" onclick="copyAskAIMessage(this)">Copy</button>' +
      '<button class="ask-ai-action-btn" onclick="speakMessageText(this)">Speak</button>' +
      '<button class="ask-ai-action-btn" onclick="createDropFromAI(this)">+Drop</button>' +
      '</div>';
  }
  
  msgDiv.innerHTML = '<div class="ask-ai-bubble">' + escapeHtml(text) + '</div>' +
                     actionsHtml +
                     '<div class="ask-ai-time">' + time + '</div>';
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  // Save to history
  askAIMessages.push({ text: text, isUser: isUser });
  
  // Auto-speak AI responses if enabled
  if (!isUser && isAutoSpeakEnabled() && text) {
    speakText(text);
  }
  
  // AutoDrop
  if (isAutoDropEnabled()) {
    autoSaveMessageAsDrop(text, isUser);
  }
}

// Show typing indicator
function showAskAITyping() {
  const messagesDiv = document.getElementById('askAIMessages');
  if (!messagesDiv) return;
  
  const typingDiv = document.createElement('div');
  typingDiv.className = 'ask-ai-message ai typing';
  typingDiv.id = 'askAITyping';
  typingDiv.innerHTML = '<div class="ask-ai-bubble"><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>';
  
  messagesDiv.appendChild(typingDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Hide typing indicator
function hideAskAITyping() {
  const typing = document.getElementById('askAITyping');
  if (typing) typing.remove();
}

// Send message to AI
async function sendAskAIMessage() {
  const input = document.getElementById('askAIInput');
  const text = input.value.trim();
  if (!text) return;
  
  voiceModeLocked = true;
  askiIsProcessing = true;
  if (typeof stopVoiceModeListening === 'function') stopVoiceModeListening();
  if (typeof updateVoiceModeIndicator === 'function') updateVoiceModeIndicator('processing');
  
  lastUserMessage = text;
  addAskAIMessage(text, true);
  input.value = '';
  input.style.height = 'auto';
  updateAskAICharCount();
  showAskAITyping();
  
  // Get context
  let contextObject = null;
  try {
    const supabaseContext = await getSupabaseContext(text, { limit: 20, recentHours: 24, searchEnabled: true });
    if (supabaseContext?.recent?.length || supabaseContext?.relevant?.length) {
      contextObject = { recent: supabaseContext.recent || [], relevant: supabaseContext.relevant || [] };
    }
  } catch (e) {}
  
  let syntriseContext = [];
  if (window.SyntriseCore && SYNTRISE_CONFIG?.ENABLED) {
    try { syntriseContext = await getSyntriseContext(text); } catch (e) {}
  }
  
  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        text: text,
        history: askAIMessages.slice(-10),
        syntriseContext: syntriseContext,
        dropContext: contextObject,
        enableTools: !STREAMING_ENABLED,
        userId: currentUser?.id,
        uid: currentUser?.id,
        stream: STREAMING_ENABLED
      })
    });
    
    const contentType = response.headers.get('content-type') || '';
    
    if (STREAMING_ENABLED && contentType.includes('text/event-stream')) {
      hideAskAITyping();
      await handleStreamingResponse(response);
    } else {
      const data = await response.json();
      hideAskAITyping();
      
      if (data.success && data.result) {
        addAskAIMessage(data.result, false);
        if (data.createDrop?.action === 'create_drop' && isAutoDropEnabled()) {
          createDropFromAIResponse(data.createDrop);
        }
      } else {
        addAskAIMessage('Sorry, error: ' + (data.error || 'unknown'), false);
        unlockVoiceMode();
      }
    }
  } catch (error) {
    hideAskAITyping();
    addErrorMessage('Connection error. Please check your internet connection.');
    unlockVoiceMode();
  }
}

// Handle streaming response
async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  const messagesDiv = document.getElementById('askAIMessages');
  const time = formatTime(new Date());
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ask-ai-message ai';
  msgDiv.innerHTML = '<div class="ask-ai-bubble"><span class="streaming-text"></span><span class="streaming-indicator"></span></div><div class="ask-ai-time">' + time + '</div>';
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  const textSpan = msgDiv.querySelector('.streaming-text');
  let fullText = '';
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              textSpan.textContent = fullText;
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.error('Streaming error:', e);
  }
  
  // Finalize
  const indicator = msgDiv.querySelector('.streaming-indicator');
  if (indicator) indicator.remove();
  
  // Add action buttons
  const bubble = msgDiv.querySelector('.ask-ai-bubble');
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ask-ai-actions';
  actionsDiv.innerHTML = '<button class="ask-ai-action-btn" onclick="copyAskAIMessage(this)">Copy</button>' +
                         '<button class="ask-ai-action-btn" onclick="speakMessageText(this)">Speak</button>' +
                         '<button class="ask-ai-action-btn" onclick="createDropFromAI(this)">+Drop</button>';
  bubble.after(actionsDiv);
  
  // Save to history
  askAIMessages.push({ text: fullText, isUser: false });
  
  // AutoDrop
  if (isAutoDropEnabled()) autoSaveMessageAsDrop(fullText, false);
  
  // Auto-speak
  if (isAutoSpeakEnabled() && fullText) {
    try { speakText(fullText); } catch(e) { unlockVoiceMode(); }
  } else {
    unlockVoiceMode();
  }
}

// Add error message with retry
function addErrorMessage(text) {
  const messagesDiv = document.getElementById('askAIMessages');
  const time = formatTime(new Date());
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ask-ai-message ai error';
  msgDiv.innerHTML = '<div class="ask-ai-bubble" style="background:#FEE2E2;color:#DC2626;">' + text + '</div>' +
    '<div class="ask-ai-actions"><button class="ask-ai-action-btn retry-btn" onclick="retryLastMessage(this)" style="border-color:#DC2626;color:#DC2626;">Retry</button></div>' +
    '<div class="ask-ai-time">' + time + '</div>';
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Retry last message
function retryLastMessage(btn) {
  if (!lastUserMessage) {
    toast('No message to retry');
    return;
  }
  
  const errorMsg = btn.closest('.ask-ai-message');
  if (errorMsg) errorMsg.remove();
  
  document.getElementById('askAIInput').value = lastUserMessage;
  sendAskAIMessage();
}

// Copy message
function copyAskAIMessage(btn) {
  const bubble = btn.closest('.ask-ai-message').querySelector('.ask-ai-bubble');
  if (bubble) {
    navigator.clipboard.writeText(bubble.textContent);
    toast('Copied!', 'success');
  }
}

// Speak message
function speakMessageText(btn) {
  const bubble = btn.closest('.ask-ai-message').querySelector('.ask-ai-bubble');
  if (bubble && typeof speakText === 'function') {
    speakText(bubble.textContent);
  }
}

// Create drop from AI message
function createDropFromAI(btn) {
  if (btn.classList.contains('created')) {
    toast('Drop already created');
    return;
  }
  
  const msgDiv = btn.closest('.ask-ai-message');
  const bubble = msgDiv?.querySelector('.ask-ai-bubble');
  if (!bubble) return;
  
  const text = bubble.textContent;
  
  const drop = {
    id: Date.now(),
    text: text,
    category: 'inbox',
    timestamp: new Date().toISOString(),
    date: formatDate(new Date()),
    time: formatTime(new Date()),
    isMedia: false
  };
  
  ideas.unshift(drop);
  save(drop);
  render();
  counts();
  
  btn.classList.add('created');
  btn.textContent = 'Created';
  toast('Drop created!', 'success');
}

// Create drop from AI response (tool)
function createDropFromAIResponse(dropData) {
  const now = new Date();
  const newIdea = {
    id: Date.now(),
    text: dropData.text,
    category: dropData.category || 'inbox',
    date: formatDate(now),
    time: formatTime(now),
    timestamp: now.toISOString(),
    aiGenerated: true,
    is_archived: false
  };
  
  ideas.unshift(newIdea);
  save(newIdea);
  render();
  counts();
  toast('Aski created: ' + dropData.category, 'success');
}

// Update character count
function updateAskAICharCount() {
  const input = document.getElementById('askAIInput');
  const counter = document.getElementById('askAICharCount');
  if (input && counter) {
    const len = input.value.length;
    counter.textContent = len + ' / 2000';
    counter.classList.toggle('warning', len > 1800);
  }
}

// Auto-resize textarea
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// AutoDrop save
function autoSaveMessageAsDrop(text, isUser) {
  if (!text || text.length < 10) return;
  
  // Skip error messages
  const skipPatterns = ['Connection error', 'Please check your internet', 'could not process', 'Sorry, I could not', 'No internet', 'Failed to'];
  if (skipPatterns.some(p => text.includes(p))) return;
  
  const now = new Date();
  const drop = {
    id: Date.now() + Math.random(),
    text: text.substring(0, 500),
    category: 'inbox',
    date: formatDate(now),
    time: formatTime(now),
    timestamp: now.toISOString(),
    aiGenerated: !isUser,
    autoDropped: true
  };
  
  ideas.unshift(drop);
  localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
  syncDropToServer(drop, 'create');
}

// Check if AutoDrop enabled
function isAutoDropEnabled() {
  return localStorage.getItem('droplit_autodrop') === 'true';
}

// Check if AutoSpeak enabled
function isAutoSpeakEnabled() {
  return localStorage.getItem('droplit_autospeak') === 'true';
}

// Toggle AutoDrop
function toggleAutoDrop() {
  const enabled = !isAutoDropEnabled();
  localStorage.setItem('droplit_autodrop', enabled);
  updateAutoDropIndicator();
  toast('AutoDrop ' + (enabled ? 'ON' : 'OFF'), 'info');
}

// Update AutoDrop indicator
function updateAutoDropIndicator() {
  const indicator = document.getElementById('autoDropIndicator');
  if (indicator) {
    indicator.classList.toggle('active', isAutoDropEnabled());
  }
}

// Unlock voice mode
function unlockVoiceMode() {
  voiceModeLocked = false;
  askiIsProcessing = false;
  if (typeof updateVoiceModeIndicator === 'function') {
    updateVoiceModeIndicator('ready');
  }
}

console.log('Chat module loaded');
