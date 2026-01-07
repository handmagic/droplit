// ============================================
// DROPLIT CHAT v1.3 - NOUS Persona - Model Selection - Markdown Support
// ASKI Chat, Voice Mode, Streaming
// ============================================

// ============================================
// ASK AI CHAT FUNCTIONS
// ============================================

// Markdown rendering helper (uses global renderMarkdown if available)
function renderChatMarkdown(text) {
  if (typeof window.renderMarkdown === 'function') {
    return window.renderMarkdown(text);
  }
  // Fallback: just escape HTML
  return escapeHtml(text);
}

// Get current AI persona name
function getCurrentPersonaName() {
  if (typeof getAIPersona === 'function') {
    return getAIPersona().name;
  }
  const model = localStorage.getItem('aski_model') || 'sonnet';
  return model === 'opus' ? 'NOUS' : 'ASKI';
}

let askAIMessages = [];
let lastUserMessage = ''; // For retry functionality
let askAIVoiceRecognition = null;

function openAskAI() {
  const panel = document.getElementById('askAIPanel');
  panel.classList.add('show');
  document.body.classList.add('chat-open');
  // No auto-focus - voice-first approach, keyboard won't popup
  
  // Generate new session ID for AutoDrop filtering
  if (typeof generateChatSessionId === 'function') {
    generateChatSessionId();
  }
  
  // Keep screen on while chat is open (like TikTok)
  acquireWakeLock();
  
  // Update UI based on Voice Mode
  updateVoiceModeUI();
  
  // Update AutoDrop indicator
  updateAutoDropIndicator();
  
  // Show/hide bottom controls based on mode
  const controlsBottom = document.getElementById('askAIControlsBottom');
  const voiceLarge = document.getElementById('askAIVoiceLarge');
  
  if (isVoiceModeEnabled()) {
    // Voice mode - show new bottom controls
	panel.classList.add('voice-mode');
    if (controlsBottom) controlsBottom.style.display = 'flex';
    if (voiceLarge) voiceLarge.style.display = 'none';
    
    voiceModeLocked = false;
    voiceModeSleeping = true;
    askiIsProcessing = false;
    updateVoiceModeIndicator('sleeping');
    updateChatControlLeft('hide');
  } else {
    // Text mode - hide voice controls
    if (controlsBottom) controlsBottom.style.display = 'none';
    if (voiceLarge) voiceLarge.style.display = 'none';
	panel.classList.remove('voice-mode');
  }
}

function handleChatControlLeft() {
  // If ASKI is speaking - stop it
  if (askiIsSpeaking || currentTTSAudio) {
    askiStopSpeaking();
    stopTTS();
    updateChatControlLeft('hide');
    return;
  }
  // Otherwise - close chat
  closeAskAI();
}

function updateChatControlLeft(state) {
  const btn = document.getElementById('askAIControlLeft');
  if (!btn) return;
  
  if (state === 'stop') {
    btn.textContent = 'STOP';
    btn.classList.add('stop');
  } else {
    btn.textContent = 'HIDE';
    btn.classList.remove('stop');
  }
}

function closeAskAI() {
  const panel = document.getElementById('askAIPanel');
  panel.classList.remove('show', 'voice-mode-active', 'aski-busy');
  document.body.classList.remove('chat-open');
  
  // Clear session ID for AutoDrop
  if (typeof clearChatSessionId === 'function') {
    clearChatSessionId();
  }
  
  // Stop everything and reset all voice states
  voiceModeLocked = true;
  voiceModeSleeping = false;
  
  clearVoiceModeTimeout();
  stopVoiceModeListening();
  askiStopSpeaking();
  stopTTS();
  updateVoiceModeIndicator('');
  
  // Allow screen to sleep when chat is closed
  releaseWakeLock();
}

// Update UI based on Voice Mode setting
function updateVoiceModeUI() {
  const panel = document.getElementById('askAIPanel');
  if (isVoiceModeEnabled()) {
    panel.classList.add('voice-mode-active');
  } else {
    panel.classList.remove('voice-mode-active');
  }
}

// Set Aski busy state (processing or speaking)
function setAskiBusy(busy) {
  const panel = document.getElementById('askAIPanel');
  if (busy) {
    panel.classList.add('aski-busy');
  } else {
    panel.classList.remove('aski-busy');
  }
}

// Stop Aski response (speaking or waiting for API)
function stopAskiResponse() {
  console.log('Stopping Aski response');
  askiStopSpeaking();
  askiIsProcessing = false;
  voiceModeLocked = false;
  setAskiBusy(false);
  
  // Go to sleep mode
  if (isVoiceModeEnabled()) {
    voiceModeSleeping = true;
    updateVoiceModeIndicator('sleeping');
  }
  toast('Stopped');
}

function setAskAIPrompt(text) {
  const input = document.getElementById('askAIInput');
  input.value = text;
  updateAskAICharCount();
  input.focus();
}

function updateAskAICharCount() {
  const input = document.getElementById('askAIInput');
  const count = input.value.length;
  const counter = document.getElementById('askAICharCount');
  counter.textContent = `${count} / 2000`;
  counter.classList.toggle('warning', count > 1800);
  document.getElementById('askAISendBtn').disabled = count === 0;
}

// Auto-resize textarea as user types
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  const maxHeight = 120; // Max 5-6 lines
  textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
}

// ============================================
// ASKI VOICE (Text-to-Speech) + VOICE MODE
// ============================================

let askiIsSpeaking = false;
let askiCurrentUtterance = null;
let askiVoice = localStorage.getItem('aski_voice') || 'nova'; // OpenAI TTS voice
let askiApiKey = localStorage.getItem('openai_tts_key') || '';

// TTS Provider settings
let ttsProvider = localStorage.getItem('tts_provider') || 'openai'; // openai, elevenlabs, browser
let elevenlabsApiKey = localStorage.getItem('elevenlabs_tts_key') || '';
let elevenlabsVoice = localStorage.getItem('elevenlabs_voice') || 'Nadia';
let elevenlabsVoiceId = localStorage.getItem('elevenlabs_voice_id') || 'gedzfqL7OGdPbwm0ynTP';

// ElevenLabs voices - Russian native speakers
const ELEVENLABS_VOICES = {
  // Russian voices (tested & working)
  'Nadia': 'gedzfqL7OGdPbwm0ynTP',      // Russian female - RECOMMENDED
  'Larisa': 'AB9XsbSA4eLG12t2myjN',     // Russian female
  'Dmitry': 'kwajW3Xh5svCeKU5ky2S',     // Russian male
  // Multilingual voices (English + Russian)
  'Bella': 'EXAVITQu4vr4xnSDxMaL',      // English/Russian female
  'Rachel': '21m00Tcm4TlvDq8ikWAM'      // English/Russian female
};

// Loaded voices from API (will be populated dynamically)
let elevenlabsLoadedVoices = [];

// Load voices from ElevenLabs API
async function loadElevenLabsVoices() {
  if (!elevenlabsApiKey) {
    toast('Enter ElevenLabs API key first');
    return;
  }
  
  toast('Loading voices...');
  
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': elevenlabsApiKey
      }
    });
    
    if (!response.ok) {
      toast('Failed to load voices');
      return;
    }
    
    const data = await response.json();
    elevenlabsLoadedVoices = data.voices || [];
    
    console.log('Loaded voices:', elevenlabsLoadedVoices.length);
    
    // Update voice selector with loaded voices
    updateElevenLabsVoiceSelector();
    
    toast(`Loaded ${elevenlabsLoadedVoices.length} voices`);
    
  } catch (error) {
    console.error('Error loading voices:', error);
    toast('Error loading voices');
  }
}

// Update ElevenLabs voice selector with loaded voices
function updateElevenLabsVoiceSelector() {
  const selector = document.getElementById('elevenlabsVoiceSelector');
  if (!selector) return;
  
  // If we have loaded voices, show them
  if (elevenlabsLoadedVoices.length > 0) {
    let html = '';
    
    // Group by category: default voices first, then others
    const defaultVoices = elevenlabsLoadedVoices.filter(v => v.category === 'premade' || v.category === 'default');
    const otherVoices = elevenlabsLoadedVoices.filter(v => v.category !== 'premade' && v.category !== 'default');
    
    // Show default voices
    defaultVoices.slice(0, 12).forEach(voice => {
      const isActive = elevenlabsVoiceId === voice.voice_id;
      html += `<button class="pill-m ${isActive ? 'active' : ''}" data-voice="${voice.name}" data-voiceid="${voice.voice_id}" onclick="selectElevenLabsVoice('${voice.name}', '${voice.voice_id}')">${voice.name}</button>`;
    });
    
    // Add separator if there are other voices
    if (otherVoices.length > 0) {
      html += `<div style="width: 100%; font-size: 0.7rem; color: var(--color-text-muted); margin: 8px 0 4px;">Library voices:</div>`;
      otherVoices.slice(0, 12).forEach(voice => {
        const isActive = elevenlabsVoiceId === voice.voice_id;
        html += `<button class="pill-m ${isActive ? 'active' : ''}" data-voice="${voice.name}" data-voiceid="${voice.voice_id}" onclick="selectElevenLabsVoice('${voice.name}', '${voice.voice_id}')">${voice.name}</button>`;
      });
    }
    
    selector.innerHTML = html;
  }
}

// Select ElevenLabs voice
function selectElevenLabsVoice(name, voiceId) {
  elevenlabsVoice = name;
  elevenlabsVoiceId = voiceId;
  localStorage.setItem('elevenlabs_voice', name);
  localStorage.setItem('elevenlabs_voice_id', voiceId);
  
  // Update UI - remove active from all, add to selected
  document.querySelectorAll('#elevenlabsVoiceSelector .pill-m').forEach(btn => {
    btn.classList.remove('active');
  });
  const selectedBtn = document.querySelector(`#elevenlabsVoiceSelector .pill-m[data-voiceid="${voiceId}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  
  // Preview
  previewElevenLabsVoice(name);
}

// Remove emojis from text before speaking
function removeEmojis(text) {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]|✨|💡|🔥|👋|😊|🎯|🚀|💪|❤️|👍|🙏|✅|⭐|🎉|💯|🤔|😄|🌟|💬|📝/gu, '').trim();
}

// Detect language from text
function detectLanguage(text) {
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  const chineseRegex = /[\u4E00-\u9FFF]/;
  const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF]/;
  const cyrillicRegex = /[\u0400-\u04FF]/;
  const arabicRegex = /[\u0600-\u06FF]/;
  const hebrewRegex = /[\u0590-\u05FF]/;
  
  if (japaneseRegex.test(text) && !chineseRegex.test(text.replace(/[\u4E00-\u9FAF]/g, ''))) {
    return 'ja-JP';
  }
  if (chineseRegex.test(text)) return 'zh-CN';
  if (koreanRegex.test(text)) return 'ko-KR';
  if (cyrillicRegex.test(text)) return 'ru-RU';
  if (arabicRegex.test(text)) return 'ar-SA';
  if (hebrewRegex.test(text)) return 'he-IL';
  
  return 'en-US';
}

// Get best available voice for language and gender preference
function getVoiceForLang(lang) {
  const voices = speechSynthesis.getVoices();
  const langPrefix = lang.split('-')[0];
  
  // Filter voices by language
  let langVoices = voices.filter(v => v.lang === lang || v.lang.startsWith(langPrefix));
  
  if (langVoices.length === 0) {
    langVoices = voices;
  }
  
  // Try to find voice matching gender preference (for browser TTS fallback)
  // Map OpenAI voices to gender preference
  const femaleVoices = ['nova', 'shimmer'];
  const preferFemale = femaleVoices.includes(askiVoice);
  
  // Common female voice name patterns
  const femalePatterns = /female|woman|samantha|victoria|karen|moira|tessa|milena|anna|elena|irina|natasha|yuna|mei|xiaoxiao|huihui|sayaka|kyoko|siri.*female/i;
  // Common male voice name patterns  
  const malePatterns = /male|man|daniel|alex|tom|oliver|boris|yuri|maxim|ichiro|otoya|siri.*male/i;
  
  let preferredVoice = null;
  
  if (preferFemale) {
    preferredVoice = langVoices.find(v => femalePatterns.test(v.name));
  } else {
    preferredVoice = langVoices.find(v => malePatterns.test(v.name));
  }
  
  return preferredVoice || langVoices[0] || voices[0];
}

// ===== AUDIO PLAYBACK via AudioContext (for Android compatibility) =====
let globalAudioContext = null;
let currentAudioSource = null;

function getAudioContext() {
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return globalAudioContext;
}

// Play audio blob using AudioContext (works on Android!)
async function playAudioBlob(blob, onEnd = null) {
  try {
    const ctx = getAudioContext();
    
    // Resume if suspended (required after page load)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    // Stop current playback
    if (currentAudioSource) {
      try { currentAudioSource.stop(); } catch(e) {}
      currentAudioSource = null;
    }
    
    // Decode audio
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    // Create source and play
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
      currentAudioSource = null;
      if (onEnd) onEnd();
    };
    
    currentAudioSource = source;
    source.start();
    
    return true;
  } catch (error) {
    console.error('AudioContext playback error:', error);
    return false;
  }
}

// Stop current audio playback
function stopAudioPlayback() {
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch(e) {}
    currentAudioSource = null;
  }
}

// ===== TTS Functions =====

// Speak text with Aski's voice
let askiAudio = null; // Current audio element for OpenAI TTS

async function askiSpeak(text, lang = null, onEnd = null) {
  if (askiIsSpeaking) {
    askiStopSpeaking();
  }
  
  // Remove emojis before speaking
  const cleanText = removeEmojis(text);
  if (!cleanText) {
    if (onEnd) onEnd();
    return;
  }
  
  // ВАЖНО: Перечитываем настройки из localStorage перед каждым вызовом
  ttsProvider = localStorage.getItem('tts_provider') || 'openai';
  elevenlabsApiKey = localStorage.getItem('elevenlabs_tts_key') || '';
  elevenlabsVoiceId = localStorage.getItem('elevenlabs_voice_id') || 'gedzfqL7OGdPbwm0ynTP';
  askiApiKey = localStorage.getItem('openai_tts_key') || '';
  
  // Route to appropriate TTS provider
  if (ttsProvider === 'elevenlabs') {
    if (elevenlabsApiKey) {
      await askiSpeakElevenLabs(cleanText, onEnd);
    } else {
      toast('ElevenLabs: no API key');
      askiSpeakBrowser(cleanText, lang, onEnd);
    }
  } else if (ttsProvider === 'openai') {
    if (askiApiKey) {
      await askiSpeakOpenAI(cleanText, onEnd);
    } else {
      askiSpeakBrowser(cleanText, lang, onEnd);
    }
  } else {
    // Browser TTS
    askiSpeakBrowser(cleanText, lang, onEnd);
  }
}

// OpenAI TTS
async function askiSpeakOpenAI(text, onEnd = null) {
  try {
    askiIsSpeaking = true;
    updateSpeakingIndicator(true);
    updateVoiceModeIndicator('speaking');
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${askiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: askiVoice,
        response_format: 'mp3'
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      toast('TTS error: ' + (error.error?.message || response.status));
      askiIsSpeaking = false;
      updateSpeakingIndicator(false);
      askiSpeakBrowser(text, null, onEnd);
      return;
    }
    
    const blob = await response.blob();
    
    // Play using AudioContext (works on Android!)
    const success = await playAudioBlob(blob, () => {
      askiIsSpeaking = false;
      updateSpeakingIndicator(false);
      if (onEnd) onEnd();
    });
    
    if (!success) {
      // Fallback to browser TTS
      askiIsSpeaking = false;
      updateSpeakingIndicator(false);
      askiSpeakBrowser(text, null, onEnd);
    }
    
  } catch (error) {
    console.error('OpenAI TTS error:', error);
    askiIsSpeaking = false;
    updateSpeakingIndicator(false);
    askiSpeakBrowser(text, null, onEnd);
  }
}

// ElevenLabs TTS
async function askiSpeakElevenLabs(text, onEnd = null) {
  // Check if we have API key
  if (!elevenlabsApiKey) {
    toast('ElevenLabs: no API key');
    askiSpeakBrowser(text, null, onEnd);
    return;
  }
  
  try {
    askiIsSpeaking = true;
    updateSpeakingIndicator(true);
    updateVoiceModeIndicator('speaking');
    
    // Use stored voice ID
    const voiceId = elevenlabsVoiceId || 'gedzfqL7OGdPbwm0ynTP';
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenlabsApiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errMsg = error.detail?.message || error.detail?.status || error.detail || response.status;
      toast('ElevenLabs: ' + errMsg);
      askiIsSpeaking = false;
      updateSpeakingIndicator(false);
      askiSpeakBrowser(text, null, onEnd);
      return;
    }
    
    const blob = await response.blob();
    
    // Play using AudioContext (works on Android!)
    const success = await playAudioBlob(blob, () => {
      askiIsSpeaking = false;
      updateSpeakingIndicator(false);
      if (onEnd) onEnd();
    });
    
    if (!success) {
      askiIsSpeaking = false;
      updateSpeakingIndicator(false);
      askiSpeakBrowser(text, null, onEnd);
    }
    
  } catch (error) {
    toast('ElevenLabs: ' + (error.message || 'network error'));
    askiIsSpeaking = false;
    updateSpeakingIndicator(false);
    askiSpeakBrowser(text, null, onEnd);
  }
}

// ===== AUDIO DROP FUNCTIONS =====

// Audio recording state
let audioRecorder = null;
let audioRecordingChunks = [];
let audioRecordingStream = null;
let currentPlayingAudioId = null;
let currentAudioElement = null;

// Format duration in M:SS
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ':' + secs.toString().padStart(2, '0');
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

// Update audio record button UI
function updateAudioRecordButton(isRecording) {
  // Removed - now using modal
}

// ===== AUDIO RECORDER MODAL (WORKING VERSION) =====
let recorderState = 'ready'; // ready, recording, paused, stopped
let recorderStartTime = null;
let recorderTimerInterval = null;
let recorderBlob = null;

function openAudioRecorder() {
  closePlusMenu();
  recorderState = 'ready';
  recorderBlob = null;
  audioRecordingChunks = [];
  document.getElementById('recorderTime').textContent = '0:00';
  updateRecorderUI();
  
  document.getElementById('audioRecorderModal').classList.add('show');
  acquireWakeLock();
}

function closeAudioRecorder() {
  if (audioRecorder && audioRecorder.state === 'recording') {
    audioRecorder.stop();
  }
  if (recorderTimerInterval) {
    clearInterval(recorderTimerInterval);
    recorderTimerInterval = null;
  }
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }
  document.getElementById('audioRecorderModal').classList.remove('show');
  releaseWakeLock();
}

function updateRecorderUI() {
  const mainBtn = document.getElementById('recorderMainBtn');
  const mainText = document.getElementById('recorderMainText');
  const waveform = document.getElementById('recorderWaveform');
  const stopBtn = document.getElementById('recorderStopBtn');
  const playBtn = document.getElementById('recorderPlayBtn');
  const rewindBtn = document.querySelector('#audioRecorderModal .ctrl-btn.rewind');
  const forwardBtn = document.querySelector('#audioRecorderModal .ctrl-btn.forward');
  const deleteBtn = document.querySelector('#audioRecorderModal .act-btn.delete');
  const createBtn = document.querySelector('#audioRecorderModal .act-btn.create');
  const shareBtn = document.querySelector('#audioRecorderModal .act-btn.share');
  
  // Main button class
  mainBtn.className = 'audio-recorder-main-btn ' + recorderState;
  
  // Main button text
  if (recorderState === 'ready') {
    mainText.textContent = 'TAP TO RECORD';
  } else if (recorderState === 'recording') {
    mainText.textContent = 'TAP TO PAUSE';
  } else if (recorderState === 'paused') {
    mainText.textContent = 'TAP TO RESUME';
  } else if (recorderState === 'stopped') {
    mainText.textContent = 'TAP TO RE-RECORD';
  }
  
  // Waveform animation
  if (waveform) {
    waveform.className = 'audio-recorder-waveform' + (recorderState === 'recording' ? ' recording' : '');
  }
  
  // Stop button - show during recording or paused
  if (stopBtn) stopBtn.style.display = (recorderState === 'recording' || recorderState === 'paused') ? 'block' : 'none';
  
  // Play/rewind/forward - show when stopped with recording
  const hasRecording = recorderState === 'stopped' && recorderBlob !== null;
  if (playBtn) playBtn.style.display = hasRecording ? 'block' : 'none';
  if (rewindBtn) rewindBtn.style.display = hasRecording ? 'block' : 'none';
  if (forwardBtn) forwardBtn.style.display = hasRecording ? 'block' : 'none';
  
  // Action buttons
  if (deleteBtn) { deleteBtn.disabled = !hasRecording; deleteBtn.style.opacity = hasRecording ? '1' : '0.4'; }
  if (createBtn) { createBtn.disabled = !hasRecording; createBtn.style.opacity = hasRecording ? '1' : '0.4'; }
  if (shareBtn) { shareBtn.disabled = !hasRecording; shareBtn.style.opacity = hasRecording ? '1' : '0.4'; }
}

function updateRecorderTime() {
  const elapsed = Date.now() - recorderStartTime;
  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  document.getElementById('recorderTime').textContent = mins + ':' + (secs % 60).toString().padStart(2, '0');
}

function recorderToggleRecord() {
  if (recorderState === 'ready' || recorderState === 'stopped') {
    startRecorderRecording();
  } else if (recorderState === 'recording') {
    pauseRecorderRecording();
  } else if (recorderState === 'paused') {
    resumeRecorderRecording();
  }
}

function pauseRecorderRecording() {
  if (audioRecorder && audioRecorder.state === 'recording') {
    audioRecorder.pause();
    recorderState = 'paused';
    if (recorderTimerInterval) {
      clearInterval(recorderTimerInterval);
      recorderTimerInterval = null;
    }
    updateRecorderUI();
  }
}

function resumeRecorderRecording() {
  if (audioRecorder && audioRecorder.state === 'paused') {
    audioRecorder.resume();
    recorderState = 'recording';
    recorderTimerInterval = setInterval(updateRecorderTime, 100);
    updateRecorderUI();
  }
}

async function startRecorderRecording() {
  try {
    audioRecordingChunks = [];
    recorderBlob = null;
    
    audioRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    audioRecorder = new MediaRecorder(audioRecordingStream, { mimeType: mimeType });
    
    audioRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioRecordingChunks.push(e.data);
      }
    };
    
    audioRecorder.onstop = () => {
      recorderBlob = new Blob(audioRecordingChunks, { type: mimeType });
      audioRecordingStream.getTracks().forEach(t => t.stop());
      recorderState = 'stopped';
      updateRecorderUI();
    };
    
    audioRecorder.start(100);
    recorderState = 'recording';
    recorderStartTime = Date.now();
    recorderTimerInterval = setInterval(updateRecorderTime, 100);
    updateRecorderUI();
    
  } catch (err) {
    toast('Microphone access denied');
  }
}

function recorderStop() {
  if (audioRecorder && audioRecorder.state !== 'inactive') {
    audioRecorder.stop();
    if (recorderTimerInterval) {
      clearInterval(recorderTimerInterval);
      recorderTimerInterval = null;
    }
  }
}

function recorderDelete() {
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }
  recorderBlob = null;
  audioRecordingChunks = [];
  recorderState = 'ready';
  document.getElementById('recorderTime').textContent = '0:00';
  updateRecorderUI();
  toast('Recording deleted');
}

function recorderCreateDrop() {
  if (!recorderBlob) return;
  
  const createBtn = document.querySelector('#audioRecorderModal .act-btn.create');
  const deleteBtn = document.querySelector('#audioRecorderModal .act-btn.delete');
  const shareBtn = document.querySelector('#audioRecorderModal .act-btn.share');
  
  // Disable all buttons
  createBtn.textContent = 'SAVING...';
  createBtn.disabled = true;
  if (deleteBtn) deleteBtn.disabled = true;
  if (shareBtn) shareBtn.disabled = true;
  
  const reader = new FileReader();
  
  reader.onload = function() {
    try {
      const base64Data = reader.result;
      
      const timeText = document.getElementById('recorderTime').textContent;
      const parts = timeText.split(':');
      const duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      
      const now = new Date();
      const drop = {
        id: Date.now(),
        text: '',
        category: 'audio',
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('ru-RU'),
        time: now.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit', second:'2-digit'}),
        isMedia: true,
        audioData: base64Data,
        audioFormat: recorderBlob.type.split('/')[1] || 'webm',
        audioSize: recorderBlob.size,
        audioBitrate: duration > 0 ? Math.round((recorderBlob.size * 8) / duration) : 0,
        duration: duration,
        waveform: [],
        notes: ''
      };
      
      ideas.unshift(drop);
      save(drop);
      playDropSound(); // Play signature sound
      render();
      counts();
      
      // Success
      createBtn.textContent = 'CREATED!';
      createBtn.style.background = '#10B981';
      createBtn.style.color = 'white';
      toast('Audio saved!', 'success');
      
      // Reset
      recorderBlob = null;
      recorderState = 'ready';
      document.getElementById('recorderTime').textContent = '0:00';
      updateRecorderUI();
      
      setTimeout(() => {
        createBtn.textContent = 'CREATE DROP';
        createBtn.style.background = '#D1FAE5';
        createBtn.style.color = '#065F46';
      }, 1500);
      
    } catch (err) {
      console.error('recorderCreateDrop error:', err);
      createBtn.textContent = 'ERROR';
      createBtn.style.background = '#FEE2E2';
      toast('Error: ' + err.message, 'error');
      setTimeout(() => {
        createBtn.textContent = 'CREATE DROP';
        createBtn.style.background = '#D1FAE5';
        createBtn.style.color = '#065F46';
        createBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;
        if (shareBtn) shareBtn.disabled = false;
      }, 2000);
    }
  };
  
  reader.onerror = function() {
    createBtn.textContent = 'ERROR';
    toast('File read error', 'error');
  };
  
  reader.readAsDataURL(recorderBlob);
}

async function recorderShare() {
  if (!recorderBlob) return;
  
  const fileName = 'droplit-audio.' + (recorderBlob.type.includes('mp4') ? 'm4a' : 'webm');
  const file = new File([recorderBlob], fileName, { type: recorderBlob.type });
  
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        files: [file],
        title: 'DropLit Audio'
      });
      toast('Shared!');
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      // Try without files
      try {
        await navigator.share({
          title: 'DropLit Audio',
          text: 'Audio ' + document.getElementById('recorderTime').textContent
        });
        toast('Shared (text only)');
      } catch (err2) {
        downloadRecorderFile();
      }
    }
  } else {
    downloadRecorderFile();
  }
  
  function downloadRecorderFile() {
    const url = URL.createObjectURL(recorderBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded');
  }
}

function recorderPlayPause() {
  if (recorderState !== 'stopped' || !recorderBlob) return;
  
  const playBtn = document.getElementById('recorderPlayBtn');
  
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
    playBtn.textContent = 'PLAY';
    return;
  }
  
  const url = URL.createObjectURL(recorderBlob);
  currentAudioElement = new Audio(url);
  currentAudioElement.onended = () => {
    currentAudioElement = null;
    playBtn.textContent = 'PLAY';
    URL.revokeObjectURL(url);
  };
  currentAudioElement.play();
  playBtn.textContent = 'PAUSE';
}

function recorderRewind() {
  if (currentAudioElement) {
    currentAudioElement.currentTime = Math.max(0, currentAudioElement.currentTime - 10);
  }
}

function recorderForward() {
  if (currentAudioElement) {
    currentAudioElement.currentTime = Math.min(currentAudioElement.duration, currentAudioElement.currentTime + 10);
  }
}

// Generate simple waveform from audio buffer
async function generateWaveform(blob, numBars = 40) {
  try {
    const ctx = getAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(rawData.length / numBars);
    const waveform = [];
    
    for (let i = 0; i < numBars; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j] || 0);
      }
      waveform.push(Math.min(1, (sum / blockSize) * 3)); // Normalize and amplify
    }
    
    return waveform;
  } catch (e) {
    console.error('Waveform generation error:', e);
    return Array(numBars).fill(0.3); // Default waveform
  }
}

// Save audio drop
async function saveAudioDrop(blob) {
  try {
    // Get duration first
    const ctx = getAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const duration = audioBuffer.duration;
    
    // Convert blob to base64
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read audio'));
      reader.readAsDataURL(blob);
    });
    
    const now = new Date();
    const drop = {
      id: Date.now(),
      text: '',
      category: 'audio',
      timestamp: now.toISOString(),
      date: now.toLocaleDateString('ru-RU'),
      time: now.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit', second:'2-digit'}),
      isMedia: true,
      audioData: base64Data,
      audioFormat: blob.type.split('/')[1] || 'webm',
      audioSize: blob.size,
      audioBitrate: Math.round((blob.size * 8) / duration),
      duration: duration,
      waveform: [],
      notes: ''
    };
    
    ideas.unshift(drop);
    save(drop);
    playDropSound(); // Play signature sound
    render();
    counts();
    
    toast('Audio saved! ' + formatDuration(duration));
    return drop;
    
  } catch (error) {
    console.error('Save audio error:', error);
    toast('Error saving audio');
    throw error;
  }
}

// Play audio drop
function playAudioDrop(id, event) {
  if (event) event.stopPropagation();
  
  const item = ideas.find(x => x.id === id);
  if (!item || !item.audioData) {
    toast('Audio not found');
    return;
  }
  
  // Stop current playback
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
    
    // Reset previous play button
    if (currentPlayingAudioId) {
      const prevBtn = document.getElementById('playbtn-' + currentPlayingAudioId);
      if (prevBtn) {
        prevBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      }
    }
    
    // If same audio, just stop
    if (currentPlayingAudioId === id) {
      currentPlayingAudioId = null;
      return;
    }
  }
  
  currentPlayingAudioId = id;
  currentAudioElement = new Audio(item.audioData);
  
  const playBtn = document.getElementById('playbtn-' + id);
  const timeEl = document.getElementById('audiotime-' + id);
  
  currentAudioElement.onplay = () => {
    if (playBtn) {
      playBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
    }
  };
  
  currentAudioElement.ontimeupdate = () => {
    if (timeEl) {
      timeEl.textContent = formatDuration(currentAudioElement.currentTime);
    }
    // Update waveform progress
    updateWaveformProgress(id, currentAudioElement.currentTime / currentAudioElement.duration);
  };
  
  currentAudioElement.onended = () => {
    if (playBtn) {
      playBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
    if (timeEl) {
      timeEl.textContent = '0:00';
    }
    updateWaveformProgress(id, 0);
    currentPlayingAudioId = null;
    currentAudioElement = null;
  };
  
  currentAudioElement.onerror = () => {
    toast('Error playing audio');
    currentPlayingAudioId = null;
    currentAudioElement = null;
  };
  
  currentAudioElement.play();
}

// Toggle play/pause for audio in card
function togglePlayAudio(id, event) {
  if (event) event.stopPropagation();
  playAudioDrop(id, event);
}

// Seek audio
function seekAudio(id, seconds, event) {
  if (event) event.stopPropagation();
  
  if (currentPlayingAudioId === id && currentAudioElement) {
    currentAudioElement.currentTime = Math.max(0, Math.min(
      currentAudioElement.duration,
      currentAudioElement.currentTime + seconds
    ));
  }
}

// Update waveform progress visualization
function updateWaveformProgress(id, progress) {
  const waveform = document.getElementById('waveform-' + id);
  if (!waveform) return;
  
  const bars = waveform.querySelectorAll('.audio-waveform-bar');
  const playedBars = Math.floor(bars.length * progress);
  
  bars.forEach((bar, i) => {
    if (i < playedBars) {
      bar.classList.add('played');
    } else {
      bar.classList.remove('played');
    }
  });
}

// Transcribe audio using Whisper API
async function transcribeAudio(id) {
  const item = ideas.find(x => x.id === id);
  if (!item || !item.audioData) {
    toast('Audio not found');
    return;
  }
  
  if (!askiApiKey) {
    toast('Enter OpenAI API key first');
    return;
  }
  
  toast('Transcribing...');
  
  try {
    // Convert base64 to blob
    const response = await fetch(item.audioData);
    const blob = await response.blob();
    
    // Create form data
    const formData = new FormData();
    formData.append('file', blob, 'audio.' + (item.audioFormat || 'webm'));
    formData.append('model', 'whisper-1');
    
    const result = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + askiApiKey
      },
      body: formData
    });
    
    if (!result.ok) {
      const error = await result.json().catch(() => ({}));
      toast('Transcription error: ' + (error.error?.message || result.status));
      return;
    }
    
    const data = await result.json();
    const transcript = data.text;
    
    // Update the drop with transcript
    item.notes = transcript;
    item.text = transcript;
    updateDrop(item);
    render();
    
    toast('Transcribed: ' + transcript.substring(0, 50) + '...');
    
  } catch (error) {
    console.error('Transcription error:', error);
    toast('Transcription failed');
  }
}

// Fallback browser TTS
function askiSpeakBrowser(text, lang = null, onEnd = null) {
  if (!('speechSynthesis' in window)) {
    toast('Voice not supported');
    if (onEnd) onEnd();
    return;
  }
  
  const detectedLang = lang || detectLanguage(text);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = detectedLang;
  utterance.rate = 0.95;
  utterance.volume = 1.0;
  
  const voice = getVoiceForLang(detectedLang);
  if (voice) utterance.voice = voice;
  
  utterance.onstart = () => {
    askiIsSpeaking = true;
    updateSpeakingIndicator(true);
    updateVoiceModeIndicator('speaking');
  };
  
  utterance.onend = () => {
    askiIsSpeaking = false;
    askiCurrentUtterance = null;
    updateSpeakingIndicator(false);
    if (onEnd) onEnd();
  };
  
  utterance.onerror = () => {
    askiIsSpeaking = false;
    askiCurrentUtterance = null;
    updateSpeakingIndicator(false);
    if (onEnd) onEnd();
  };
  
  askiCurrentUtterance = utterance;
  speechSynthesis.speak(utterance);
}

// Stop speaking
function askiStopSpeaking() {
  // Stop our new TTS audio
  stopTTS();
  // Stop AudioContext playback
  stopAudioPlayback();
  // Stop legacy Audio element (if any)
  if (askiAudio) {
    askiAudio.pause();
    askiAudio.currentTime = 0;
    askiAudio = null;
  }
  // Stop browser TTS
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  askiIsSpeaking = false;
  askiCurrentUtterance = null;
  updateSpeakingIndicator(false);
}

// Toggle speak for a message
function toggleAskiSpeak(btn) {
  if (askiIsSpeaking) {
    askiStopSpeaking();
    return;
  }
  
  const bubble = btn.closest('.ask-ai-message').querySelector('.ask-ai-bubble');
  const text = bubble.textContent;
  askiSpeak(text);
}

// Update speaking indicator in header
function updateSpeakingIndicator(isSpeaking) {
  // Removed - status shown in subtitle instead
}

// ============================================
// VOICE MODE (Full voice conversation)
// ============================================

let voiceModeEnabled = false;
let voiceModeRecognition = null;
let askiIsProcessing = false; // True when waiting for API response
let voiceModeLocked = false;  // Prevents mic when Aski is speaking/processing
let voiceModeSleeping = false; // Sleep mode - waiting for user tap
let voiceModeTimeout = null;  // Timer (kept for potential future use)
let voiceModeCyclesLeft = 0;  // How many listening cycles before sleep

// Audio feedback for voice mode
function playVoiceBeep(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'start') {
      // Rising tone - mic ON
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
    } else {
      // Falling tone - mic OFF / sleep
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
    }
    
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {
    // Audio not available
  }
}

function isVoiceModeEnabled() {
  return localStorage.getItem('aski_voice_mode') === 'true';
}

function setVoiceMode(enabled) {
  localStorage.setItem('aski_voice_mode', enabled ? 'true' : 'false');
  voiceModeEnabled = enabled;
  
  if (enabled) {
    // Also enable auto-speak
    localStorage.setItem('aski_auto_speak', 'true');
    document.getElementById('autoSpeakToggle')?.classList.add('active');
  }
}

function isAutoSpeakEnabled() {
  return localStorage.getItem('aski_auto_speak') === 'true' || isVoiceModeEnabled();
}

function setAutoSpeak(enabled) {
  localStorage.setItem('aski_auto_speak', enabled ? 'true' : 'false');
  toast(enabled ? 'Auto-speak enabled' : 'Auto-speak disabled');
}

// Voice Mode: Start listening (only when NOT locked)
function startVoiceModeListening() {
  // Check all conditions
  if (!isVoiceModeEnabled()) return;
  if (voiceModeLocked) {
    console.log('Voice mode locked, skipping');
    return;
  }
  if (voiceModeSleeping) {
    console.log('Voice mode sleeping, tap to wake');
    return;
  }
  if (askiIsSpeaking || askiIsProcessing) {
    console.log('Aski is busy, skipping mic start');
    return;
  }
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Voice not supported in this browser');
    return;
  }
  
  // Stop any existing recognition first
  if (voiceModeRecognition) {
    try { voiceModeRecognition.abort(); } catch(e) {}
    voiceModeRecognition = null;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceModeRecognition = new SpeechRecognition();
  voiceModeRecognition.continuous = false;
  voiceModeRecognition.interimResults = false;
  voiceModeRecognition.lang = navigator.language || 'ru-RU';
  
  voiceModeRecognition.onstart = () => {
    document.getElementById('askAIVoiceBtn')?.classList.add('recording');
    updateVoiceModeIndicator('listening');
  };
  
  voiceModeRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript.trim()) {
      // User spoke real words
      clearVoiceModeTimeout();
      
      // LOCK voice mode before sending
      voiceModeLocked = true;
      stopVoiceModeListening();
      
      // Send the message
      document.getElementById('askAIInput').value = transcript;
      sendAskAIMessage();
    } else {
      // Empty result = noise without words = go to sleep
      console.log('Empty transcript - going to sleep');
      enterVoiceModeSleep();
    }
  };
  
  voiceModeRecognition.onend = () => {
    document.getElementById('askAIVoiceBtn')?.classList.remove('recording');
    
    // If locked (sending message) - don't do anything
    if (voiceModeLocked) return;
    
    // Check if we have cycles left
    if (voiceModeCyclesLeft > 0) {
      voiceModeCyclesLeft--;
      console.log('Cycles left:', voiceModeCyclesLeft);
      updateVoiceModeIndicator('waiting');
      setTimeout(startVoiceModeListening, 300);
    } else {
      enterVoiceModeSleep();
    }
  };
  
  voiceModeRecognition.onerror = (e) => {
    document.getElementById('askAIVoiceBtn')?.classList.remove('recording');
    
    if (e.error !== 'aborted') {
      console.log('Voice mode:', e.error);
    }
    
    // If locked - don't do anything
    if (voiceModeLocked) return;
    
    // Check if we have cycles left
    if (voiceModeCyclesLeft > 0) {
      voiceModeCyclesLeft--;
      console.log('Cycles left:', voiceModeCyclesLeft);
      updateVoiceModeIndicator('waiting');
      setTimeout(startVoiceModeListening, 500);
    } else {
      enterVoiceModeSleep();
    }
  };
  
  try {
    voiceModeRecognition.start();
  } catch (e) {
    console.error('Could not start voice mode:', e);
  }
}

// Clear any pending timeout
function clearVoiceModeTimeout() {
  if (voiceModeTimeout) {
    clearTimeout(voiceModeTimeout);
    voiceModeTimeout = null;
  }
}

// Enter sleep mode
function enterVoiceModeSleep() {
  console.log('Voice mode entering sleep');
  voiceModeSleeping = true;
  voiceModeCyclesLeft = 0;
  stopVoiceModeListening();
  clearVoiceModeTimeout();
  playVoiceBeep('stop');
  updateVoiceModeIndicator('sleeping');
}

// Wake up from sleep mode (user tapped mic button)
function wakeVoiceMode() {
  console.log('Voice mode waking up (manual tap)');
  voiceModeSleeping = false;
  voiceModeLocked = false;
  voiceModeCyclesLeft = 1; // Manual tap = 1 cycle only
  playVoiceBeep('start');
  updateVoiceModeIndicator('waiting');
  setTimeout(startVoiceModeListening, 300);
}

function stopVoiceModeListening() {
  if (voiceModeRecognition) {
    try {
      voiceModeRecognition.abort();
    } catch (e) {}
    voiceModeRecognition = null;
  }
  document.getElementById('askAIVoiceBtn')?.classList.remove('recording');
}

// Unlock and restart listening (called after Aski finishes speaking)
function unlockVoiceMode() {
  voiceModeLocked = false;
  askiIsProcessing = false;
  
  // After Aski finishes speaking - auto-start listening for conversation flow
  if (isVoiceModeEnabled() && document.getElementById('askAIPanel')?.classList.contains('show')) {
    voiceModeSleeping = false;
    voiceModeCyclesLeft = getListenCycles(); // Use setting
    playVoiceBeep('start');
    updateVoiceModeIndicator('waiting');
    setTimeout(startVoiceModeListening, 500);
  }
}

function updateVoiceModeIndicator(state) {
  const largeBtn = document.getElementById('askAIVoiceLarge');
  const largeBtnText = document.getElementById('voiceLargeText');
  const controlRight = document.getElementById('askAIControlRight');
  const controlRightText = document.getElementById('askAIControlRightText');
  
  // Update only the large button at bottom
  switch(state) {
    case 'listening':
      if (largeBtn) {
        largeBtn.classList.add('listening');
        largeBtnText.textContent = 'Listening...';
      }
      if (controlRight) {
        controlRight.classList.add('listening');
        controlRight.classList.remove('processing');
        if (controlRightText) controlRightText.textContent = 'LISTENING...';
      }
      break;
    case 'processing':
      setAskiBusy(true);
      if (largeBtn) {
        largeBtn.classList.remove('listening');
        largeBtnText.textContent = 'Thinking...';
      }
      if (controlRight) {
        controlRight.classList.remove('listening');
        controlRight.classList.add('processing');
        if (controlRightText) controlRightText.textContent = 'THINKING...';
      }
      updateChatControlLeft('stop');
      break;
    case 'speaking':
      setAskiBusy(true);
      if (largeBtn) {
        largeBtn.classList.remove('listening');
        largeBtnText.textContent = 'Speaking...';
      }
      if (controlRight) {
        controlRight.classList.remove('listening');
        controlRight.classList.add('processing');
        if (controlRightText) controlRightText.textContent = 'SPEAKING...';
      }
      updateChatControlLeft('stop');
      break;
    case 'locked':
      if (largeBtn) {
        largeBtn.classList.remove('listening');
        largeBtnText.textContent = 'Please wait...';
      }
      if (controlRight) {
        controlRight.classList.remove('listening');
        controlRight.classList.remove('processing');
        if (controlRightText) controlRightText.textContent = 'WAIT...';
      }
      break;
    case 'waiting':
      setAskiBusy(false);
      if (largeBtn) {
        largeBtn.classList.remove('listening');
        largeBtnText.textContent = 'Tap to talk';
      }
      if (controlRight) {
        controlRight.classList.remove('listening');
        controlRight.classList.remove('processing');
        if (controlRightText) controlRightText.textContent = 'TAP TO TALK';
      }
      updateChatControlLeft('hide');
      break;
    case 'sleeping':
      setAskiBusy(false);
      if (largeBtn) {
        largeBtn.classList.remove('listening');
        largeBtnText.textContent = 'Tap to talk';
      }
      if (controlRight) {
        controlRight.classList.remove('listening');
        controlRight.classList.remove('processing');
        if (controlRightText) controlRightText.textContent = 'TAP TO TALK';
      }
      updateChatControlLeft('hide');
      break;
    default:
      setAskiBusy(false);
      if (largeBtn) {
        largeBtn.classList.remove('listening');
        largeBtnText.textContent = 'Tap to talk';
      }
      if (controlRight) {
        controlRight.classList.remove('listening');
        controlRight.classList.remove('processing');
        if (controlRightText) controlRightText.textContent = 'TAP TO TALK';
      }
      updateChatControlLeft('hide');
  }
}

// Set voice (OpenAI TTS)
function setAskiVoice(voice) {
  askiVoice = voice;
  localStorage.setItem('aski_voice', voice);
  // Update UI - remove active from all, add to selected
  document.querySelectorAll('#voiceSelector .pill-m').forEach(btn => {
    btn.classList.remove('active');
  });
  const selectedBtn = document.querySelector(`#voiceSelector .pill-m[data-voice="${voice}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  // Preview voice
  previewVoice(voice);
}

// Preview voice with sample text
async function previewVoice(voice) {
  if (!askiApiKey) {
    toast('Enter API key to preview');
    return;
  }
  
  const samples = {
    'nova': 'Hi! I\'m Nova, friendly and warm.',
    'shimmer': 'Hello, I\'m Shimmer, soft and gentle.',
    'alloy': 'Hey there, I\'m Alloy, balanced and clear.',
    'onyx': 'Hello, I\'m Onyx, deep and confident.',
    'echo': 'Hi, I\'m Echo, calm and measured.',
    'fable': 'Hello! I\'m Fable, expressive and British.'
  };
  
  const text = samples[voice] || `This is ${voice} voice.`;
  askiSpeak(text, 'en', null);
}

// Save OpenAI API key
function saveOpenAIKey() {
  const input = document.getElementById('openaiApiKeyInput');
  const key = input.value.trim();
  askiApiKey = key;
  localStorage.setItem('openai_tts_key', key);
  
  const status = document.getElementById('apiKeyStatus');
  if (key) {
    if (key.startsWith('sk-')) {
      status.textContent = 'Key saved';
      status.style.color = '#10B981';
    } else {
      status.textContent = 'Invalid key format (should start with sk-)';
      status.style.color = '#EF4444';
    }
  } else {
    status.textContent = 'Using browser voice (lower quality)';
    status.style.color = 'var(--color-text-muted)';
  }
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  const input = document.getElementById('openaiApiKeyInput');
  const btn = document.getElementById('apiKeyToggleBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

// Load API key on init
function loadOpenAIKey() {
  const input = document.getElementById('openaiApiKeyInput');
  if (input && askiApiKey) {
    input.value = askiApiKey;
    saveOpenAIKey(); // Update status
  }
}

// TTS Provider functions
function setTTSProvider(provider) {
  ttsProvider = provider;
  localStorage.setItem('tts_provider', provider);
  
  // Update UI - remove active from all, add to selected
  document.querySelectorAll('#ttsProviderSelector .pill-m').forEach(btn => {
    btn.classList.remove('active');
  });
  const selectedBtn = document.querySelector(`#ttsProviderSelector .pill-m[data-provider="${provider}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  
  // Show/hide provider-specific settings
  const openaiSettings = document.getElementById('openaiVoiceSettings');
  const elevenlabsSettings = document.getElementById('elevenlabsVoiceSettings');
  
  if (openaiSettings) {
    openaiSettings.style.display = (provider === 'openai') ? 'block' : 'none';
  }
  if (elevenlabsSettings) {
    elevenlabsSettings.style.display = (provider === 'elevenlabs') ? 'block' : 'none';
    // Load ElevenLabs key into input when switching to ElevenLabs
    if (provider === 'elevenlabs') {
      elevenlabsApiKey = localStorage.getItem('elevenlabs_tts_key') || '';
      elevenlabsVoiceId = localStorage.getItem('elevenlabs_voice_id') || 'gedzfqL7OGdPbwm0ynTP';
      
      const input = document.getElementById('elevenlabsApiKeyInput');
      if (input) {
        input.value = elevenlabsApiKey;
        const status = document.getElementById('elevenlabsApiKeyStatus');
        if (status && elevenlabsApiKey) {
          status.textContent = 'Key loaded';
          status.style.color = '#10B981';
        }
      }
      
      // Update voice selector
      document.querySelectorAll('#elevenlabsVoiceSelector .pill-m').forEach(btn => {
        btn.classList.remove('active');
      });
      const voiceBtn = document.querySelector(`#elevenlabsVoiceSelector .pill-m[data-voiceid="${elevenlabsVoiceId}"]`);
      if (voiceBtn) {
        voiceBtn.classList.add('active');
      }
    }
  }
  
  toast(`TTS: ${provider === 'openai' ? 'OpenAI' : provider === 'elevenlabs' ? 'ElevenLabs' : 'Browser'}`);
}

// ElevenLabs voice selection (legacy, kept for compatibility)
function setElevenLabsVoice(voice) {
  const voiceId = ELEVENLABS_VOICES[voice];
  if (voiceId) {
    selectElevenLabsVoice(voice, voiceId);
  }
}

// Preview ElevenLabs voice
async function previewElevenLabsVoice(voice) {
  // Get key DIRECTLY from localStorage (exactly like working test)
  const key = localStorage.getItem('elevenlabs_tts_key');
  
  if (!key) {
    toast('Enter ElevenLabs API key');
    return;
  }
  
  // Debug - show exactly what we're sending
  console.log('=== Preview Debug ===');
  console.log('Key length:', key.length);
  console.log('Key first 8 chars:', key.substring(0, 8));
  console.log('Key last 4 chars:', key.substring(key.length - 4));
  
  // Use stored voiceId
  const voiceId = elevenlabsVoiceId || ELEVENLABS_VOICES[voice];
  console.log('Voice:', voice, 'ID:', voiceId);
  
  if (!voiceId) {
    toast('Unknown voice: ' + voice);
    return;
  }
  
  const text = 'Hello! This is ' + voice + ' voice test.';
  
  toast('Loading...');
  
  try {
    // EXACTLY like working test file
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs error:', response.status, errorText);
      
      if (response.status === 401) {
        toast('Invalid API key');
      } else if (response.status === 429) {
        toast('Rate limit - try again later');
      } else {
        toast('API error: ' + response.status);
      }
      return;
    }
    
    const blob = await response.blob();
    console.log('Blob size:', blob.size);
    toast('Playing...');
    
    // Play using AudioContext (works on Android!)
    const success = await playAudioBlob(blob);
    if (!success) {
      toast('Playback error');
    }
    
  } catch (error) {
    console.error('ElevenLabs preview error:', error);
    toast('Error: ' + error.message);
  }
}

// Save ElevenLabs API key
function saveElevenLabsKey() {
  const input = document.getElementById('elevenlabsApiKeyInput');
  if (!input) {
    toast('Input not found');
    return;
  }
  
  const key = input.value.trim();
  
  elevenlabsApiKey = key;
  localStorage.setItem('elevenlabs_tts_key', key);
  
  // Verify save
  const saved = localStorage.getItem('elevenlabs_tts_key');
  console.log('Key saved to localStorage, verified length:', saved?.length);
  
  const status = document.getElementById('elevenlabsApiKeyStatus');
  if (key) {
    status.textContent = `Key saved (${key.length} chars)`;
    status.style.color = '#10B981';
  } else {
    status.textContent = '';
  }
}

// Direct test of ElevenLabs API key - call from console: testElevenLabsKey()
async function testElevenLabsKey() {
  const key = localStorage.getItem('elevenlabs_tts_key');
  
  console.log('=== ElevenLabs Key Test ===');
  console.log('Key from localStorage:', key ? `"${key.substring(0,8)}..." (${key.length} chars)` : 'NULL');
  
  if (!key) {
    alert('No key in localStorage!');
    return;
  }
  
  // Test 1: Get user info (simplest API call)
  try {
    console.log('Testing /v1/user endpoint...');
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': key }
    });
    
    console.log('Response status:', res.status);
    
    if (res.ok) {
      const data = await res.json();
      console.log('SUCCESS! User:', data);
      const tier = data.subscription?.tier || 'unknown';
      
      // Test 2: Try TTS with simple model
      toast('Key OK! Testing TTS...');
      
      try {
        // Use default voice and simpler model for Free tier
        const ttsRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: 'Hello, this is a test.',
            model_id: 'eleven_monolingual_v1'
          })
        });
        
        console.log('TTS response:', ttsRes.status);
        
        if (ttsRes.ok) {
          alert('Key works! Tier: ' + tier + '\nTTS also works!');
        } else {
          const ttsError = await ttsRes.text();
          console.log('TTS error:', ttsError);
          alert('Key works (Tier: ' + tier + ')\nBut TTS failed: ' + ttsRes.status + '\n' + ttsError.substring(0, 100));
        }
      } catch (ttsErr) {
        alert('Key works (Tier: ' + tier + ')\nTTS network error: ' + ttsErr.message);
      }
      
    } else {
      const error = await res.text();
      console.log('Error response:', error);
      alert('Key INVALID! Status: ' + res.status + '\n' + error);
    }
  } catch (e) {
    console.error('Network error:', e);
    alert('Network error: ' + e.message);
  }
}

// Expose for console testing
window.testElevenLabsKey = testElevenLabsKey;

// Toggle API key visibility (supports both providers)
function toggleApiKeyVisibility(provider = 'openai') {
  if (provider === 'elevenlabs') {
    const input = document.getElementById('elevenlabsApiKeyInput');
    const btn = document.getElementById('elevenlabsApiKeyToggleBtn');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
  } else {
    const input = document.getElementById('openaiApiKeyInput');
    const btn = document.getElementById('apiKeyToggleBtn');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
  }
}

// Load ElevenLabs key on init
function loadElevenLabsKey() {
  // Debug
  console.log('loadElevenLabsKey called, key exists:', !!elevenlabsApiKey, 'length:', elevenlabsApiKey?.length);
  
  const input = document.getElementById('elevenlabsApiKeyInput');
  if (input) {
    if (elevenlabsApiKey) {
      input.value = elevenlabsApiKey;
      const status = document.getElementById('elevenlabsApiKeyStatus');
      if (status) {
        status.textContent = 'Key loaded';
        status.style.color = '#10B981';
      }
    }
  } else {
    // Input not found yet, retry after short delay
    console.log('elevenlabsApiKeyInput not found, will retry...');
  }
}

// Initialize TTS provider UI - теперь вся логика в initVoiceSettings()
function initTTSProviderUI() {
  // Deprecated - use initVoiceSettings() instead
}

// Get listen cycles setting (stored as seconds, convert to cycles)
function getListenCycles() {
  const seconds = parseInt(localStorage.getItem('aski_listen_seconds') || '15');
  return Math.round(seconds / 5); // ~5 sec per cycle
}

// Set listen time in seconds
function setListenCycles(seconds) {
  localStorage.setItem('aski_listen_seconds', seconds.toString());
  // Update UI
  document.querySelectorAll('#listenCyclesSelector .pill-m').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cycles === seconds.toString());
  });
  toast(`Listen time: ${seconds} sec`);
}

// Load voices (some browsers need this)
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Streaming response handler v2 - supports tools
async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  const messagesDiv = document.getElementById('askAIMessages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ask-ai-message ai';
  msgDiv.innerHTML = '<div class="ask-ai-bubble"><span class="streaming-text"></span><span class="streaming-indicator"></span></div><div class="ask-ai-time">' + time + '</div>';
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  const textSpan = msgDiv.querySelector('.streaming-text');
  const indicator = msgDiv.querySelector('.streaming-indicator');
  let fullText = '';
  let buffer = '';
  let createDropData = null;
  
  // Start WebSocket streaming TTS if enabled
  // TEMPORARILY DISABLED for debugging
  const useStreamingTTS = false; // isAutoSpeakEnabled() && 
                          // localStorage.getItem('tts_provider') === 'elevenlabs' &&
                          // window.StreamingTTS;
  let streamingTTSActive = false;
  
  if (useStreamingTTS) {
    try {
      streamingTTSActive = await window.StreamingTTS.start();
      console.log('[Chat] Streaming TTS started:', streamingTTSActive);
    } catch (e) {
      console.error('[Chat] Streaming TTS start failed:', e);
      streamingTTSActive = false;
    }
  }
  
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
            
            // New API v4.5 format
            if (parsed.type === 'text' && parsed.content) {
              fullText += parsed.content;
              textSpan.textContent = fullText;
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
              
              // Feed to streaming TTS
              if (streamingTTSActive) {
                window.StreamingTTS.feedText(parsed.content);
              }
            }
            
            // Tool started
            if (parsed.type === 'tool_start') {
              if (indicator) {
                indicator.textContent = toolStatusText(parsed.tool);
                indicator.classList.add('tool-active');
              }
            }
            
            // Tool completed
            if (parsed.type === 'tool_result') {
              if (indicator) {
                indicator.classList.remove('tool-active');
                indicator.textContent = '';
              }
            }
            
            // Stream done
            if (parsed.type === 'done') {
              createDropData = parsed.createDrop;
            }
            
            // Legacy format (v4.4 and earlier)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              textSpan.textContent = fullText;
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
              
              // Feed to streaming TTS
              if (streamingTTSActive) {
                window.StreamingTTS.feedText(parsed.delta.text);
              }
            }
            
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.error('Streaming error:', e);
  }
  
  if (indicator) indicator.remove();
  
  const bubble = msgDiv.querySelector('.ask-ai-bubble');
  
  // Apply markdown rendering to final text
  if (typeof window.renderMarkdown === 'function') {
    bubble.innerHTML = window.renderMarkdown(fullText);
  }
  
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ask-ai-actions';
  
  // Check AutoDrop directly from localStorage
  const autoDropEnabled = localStorage.getItem('droplit_autodrop') === 'true';
  const createDropBtn = autoDropEnabled 
    ? '<button class="ask-ai-action-btn created autodrop-saved"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved</button>'
    : '<button class="ask-ai-action-btn" onclick="createDropFromAI(this)">Create Drop</button>';
  
  actionsDiv.innerHTML = '<button class="ask-ai-action-btn" onclick="copyAskAIMessage(this)">Copy</button><button class="ask-ai-action-btn" onclick="speakAskAIMessage(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak</button>' + createDropBtn;
  bubble.after(actionsDiv);
  
  askAIMessages.push({ text: fullText, isUser: false });
  
  if (createDropData && createDropData.drop) {
    const drop = createDropData.drop;
    const now = new Date();
    const newIdea = {
      id: Date.now().toString(),
      text: drop.text,
      category: drop.category || 'inbox',
      timestamp: now.toISOString(),
      date: now.toLocaleDateString('ru-RU'),
      time: now.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
      isMedia: false,
      source: 'aski_tool',
      creator: 'aski',
      sessionId: typeof currentChatSessionId !== 'undefined' ? currentChatSessionId : null
    };
    ideas.unshift(newIdea);
    save(newIdea);
    counts();  // NO render() - causes delays!
    toast('Drop created by ASKI', 'success');
  }
  
  if (localStorage.getItem('droplit_autodrop') === 'true') autoSaveMessageAsDrop(fullText, false);
  
  // Handle TTS
  if (streamingTTSActive) {
    // Set callback BEFORE finishing - prevents race condition
    window.StreamingTTS.onEnd(() => {
      console.log('[Chat] Streaming TTS ended, unlocking voice mode');
      unlockVoiceMode();
    });
    // Now finish streaming TTS - audio continues playing
    window.StreamingTTS.finish();
  } else if (isAutoSpeakEnabled() && fullText) {
    // Fallback to regular TTS (OpenAI, browser, or ElevenLabs REST)
    try {
      speakText(fullText);
    } catch (e) {
      console.error('TTS error:', e);
      unlockVoiceMode();
    }
  } else {
    unlockVoiceMode();
  }
}

function toolStatusText(toolName) {
  const names = { 'web_search': 'Searching...', 'create_drop': 'Creating drop...', 'fetch_recent_drops': 'Reading notes...', 'search_drops': 'Searching notes...', 'get_summary': 'Summarizing...' };
  return names[toolName] || 'Processing...';
}

function addAskAIMessage(text, isUser = true) {
  const messagesDiv = document.getElementById('askAIMessages');
  const emptyState = document.getElementById('askAIEmpty');
  
  if (emptyState) emptyState.style.display = 'none';
  
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  // Check localStorage directly for reliability
  const autoDropEnabled = localStorage.getItem('droplit_autodrop') === 'true';
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `ask-ai-message ${isUser ? 'user' : 'ai'}`;
  
  // Determine button state based on AutoDrop
  const createDropBtn = autoDropEnabled 
    ? `<button class="ask-ai-action-btn created autodrop-saved">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Saved
      </button>`
    : `<button class="ask-ai-action-btn" onclick="createDropFromAI(this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Create Drop
      </button>`;
  
  if (isUser) {
    msgDiv.innerHTML = `
      <div class="ask-ai-bubble">${escapeHtml(text)}</div>
      <div class="ask-ai-actions">
        ${createDropBtn}
        <button class="ask-ai-action-btn" onclick="copyAIResponse(this)">Copy</button>
      </div>
      <div class="ask-ai-time">${time}</div>
    `;
  } else {
    msgDiv.innerHTML = `
      <div class="ask-ai-bubble">${renderChatMarkdown(text)}</div>
      <div class="ask-ai-actions">
        <button class="ask-ai-action-btn speak-btn" onclick="toggleAskiSpeak(this)" title="Speak">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          Speak
        </button>
        ${createDropBtn}
        <button class="ask-ai-action-btn" onclick="copyAIResponse(this)">Copy</button>
      </div>
      <div class="ask-ai-time">${time}</div>
    `;
    
    // Auto-speak if enabled
    if (isAutoSpeakEnabled()) {
      updateVoiceModeIndicator('speaking');
      setTimeout(() => {
        askiSpeak(text, null, () => {
          // After speaking, UNLOCK voice mode (this will restart listening)
          unlockVoiceMode();
        });
      }, 300);
    } else {
      // No auto-speak, unlock immediately
      unlockVoiceMode();
    }
  }
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  askAIMessages.push({ text, isUser, time });
  
  // AutoDrop: automatically save message as drop
  if (autoDropEnabled) {
    autoSaveMessageAsDrop(text, isUser);
  }
}

function showAskAITyping() {
  const messagesDiv = document.getElementById('askAIMessages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'ask-ai-message ai';
  typingDiv.id = 'askAITyping';
  typingDiv.innerHTML = `
    <div class="ask-ai-typing">
      <div class="ask-ai-typing-dot"></div>
      <div class="ask-ai-typing-dot"></div>
      <div class="ask-ai-typing-dot"></div>
    </div>
  `;
  messagesDiv.appendChild(typingDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideAskAITyping() {
  const typing = document.getElementById('askAITyping');
  if (typing) typing.remove();
}

async function sendAskAIMessage() {
  console.log('sendAskAIMessage called');
  const input = document.getElementById('askAIInput');
  const text = input.value.trim();
  console.log('Text:', text);
  if (!text) {
    console.log('No text, returning');
    return;
  }
  
  // LOCK voice mode while processing
  voiceModeLocked = true;
  askiIsProcessing = true;
  stopVoiceModeListening();
  updateVoiceModeIndicator('processing');
  
  // Save for retry
  lastUserMessage = text;
  
  addAskAIMessage(text, true);
  input.value = '';
  input.style.height = 'auto'; // Reset textarea height
  updateAskAICharCount();
  
  showAskAITyping();
  
  // Get context from Supabase (v0.9.58 - Dynamic Context)
  let contextForAI = null;
  try {
    const supabaseContext = await getSupabaseContext(text, {
      limit: 20,
      recentHours: 24,
      searchEnabled: true
    });
    contextForAI = formatContextForAI(supabaseContext);
    if (contextForAI) {
      console.log('📚 Context loaded for ASKI');
    }
  } catch (e) {
    console.warn('Context fetch skipped:', e.message);
  }
  
  // Legacy: Also try Syntrise CORE if enabled
  let syntriseContext = [];
  if (window.SyntriseCore && SYNTRISE_CONFIG?.ENABLED) {
    try {
      syntriseContext = await getSyntriseContext(text);
      console.log('Syntrise context:', syntriseContext?.length || 0, 'drops found');
    } catch (e) {
      console.warn('Syntrise context fetch skipped');
    }
  }
  
  console.log('Sending to:', AI_API_URL);
  
  // v2 API: Send structured context, server handles formatting
  const INJECT_CONTEXT_INTO_MESSAGE = false; // v2: Server handles context
  
  // Prepare context object for server
  let contextObject = null;
  try {
    if (supabaseContext?.recent?.length || supabaseContext?.relevant?.length) {
      contextObject = {
        recent: supabaseContext.recent || [],
        relevant: supabaseContext.relevant || []
      };
    }
  } catch (e) {
    console.warn('Context preparation error:', e);
  }
  
  try {
    // Get selected AI model from settings
    const selectedModel = typeof getAIModel === 'function' ? getAIModel() : localStorage.getItem('aski_model') || 'sonnet';
    
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        text: text,  // Clean text, no injection
        history: askAIMessages.slice(-10),
        syntriseContext: syntriseContext, // Legacy
        dropContext: contextObject, // v2: Structured context for server
        stream: STREAMING_ENABLED,
        enableTools: false, // v2: Enable Tool Calling
        userId: currentUser?.id, // v3: For CORE Memory integration
        model: selectedModel // v4.14: AI model selection (sonnet/opus/haiku)
      })
    });
    
    console.log('Response status:', response.status);
	const contentType = response.headers.get('content-type') || '';

	if (STREAMING_ENABLED && contentType.includes('text/event-stream')) {
	hideAskAITyping();
	try {
	await handleStreamingResponse(response);
	} catch (e) {
	console.error('Streaming error:', e);
	}
	return;
	}
    const data = await response.json();
    console.log('Response data:', data);
    
    // Log tools used (v2)
    if (data.toolsUsed?.length) {
      console.log('🔧 AI used tools:', data.toolsUsed.join(', '));
    }
    
    hideAskAITyping();
    
    if (data.success && data.result) {
      addAskAIMessage(data.result, false);
      
      // Handle AI-initiated drop creation (v2 Tool Calling)
      // Only create if AutoDrop is enabled OR user explicitly asked
      if (data.createDrop?.action === 'create_drop') {
        const autoDropEnabled = isAutoDropEnabled();
        
        if (autoDropEnabled) {
          const dropText = data.createDrop.text;
          const dropCategory = data.createDrop.category || 'inbox';
          
          // Create the drop
          const now = new Date();
          const newIdea = {
            id: Date.now(),
            text: dropText,
            category: dropCategory,
            date: now.toLocaleDateString('ru-RU'),
            time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            timestamp: now.toISOString(),
            aiGenerated: true
          };
          
          ideas.unshift(newIdea);
          save(newIdea);
          render();
          counts();
          
          console.log('✅ AI created drop:', dropText.substring(0, 50) + '...');
          toast(`Aski created: ${dropCategory}`, 'success');
        } else {
          console.log('⏭️ AI wanted to create drop but AutoDrop is OFF');
        }
      }
    } else {
      console.log('Error in response:', data);
      addAskAIMessage('Sorry, I could not process your request. ' + (data.error || ''), false);
      // Unlock on error if no auto-speak
      if (!isAutoSpeakEnabled()) {
        unlockVoiceMode();
      }
    }
  } catch (error) {
    hideAskAITyping();
    console.error('Ask AI error:', error);
    addErrorMessage('Connection error. Please check your internet connection.');
    // Unlock on error
    unlockVoiceMode();
  }
}

// Add error message with Retry button
function addErrorMessage(text) {
  const messagesDiv = document.getElementById('askAIMessages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ask-ai-message ai error';
  msgDiv.innerHTML = `
    <div class="ask-ai-bubble" style="background: #FEE2E2; color: #DC2626;">${text}</div>
    <div class="ask-ai-actions">
      <button class="ask-ai-action-btn retry-btn" onclick="retryLastMessage(this)" style="border-color: #DC2626; color: #DC2626;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        Retry
      </button>
    </div>
    <div class="ask-ai-time">${time}</div>
  `;
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Retry last message
function retryLastMessage(btn) {
  if (!lastUserMessage) {
    toast('No message to retry');
    return;
  }
  
  // Remove error message
  const errorMsg = btn.closest('.ask-ai-message');
  if (errorMsg) errorMsg.remove();
  
  // Set input and send
  document.getElementById('askAIInput').value = lastUserMessage;
  sendAskAIMessage();
}

function createDropFromAI(btn) {
  console.log('[createDropFromAI] Called');
  
  // Check if already created
  if (btn.classList.contains('created')) {
    toast('Drop already created');
    return;
  }
  
  const msgDiv = btn.closest('.ask-ai-message');
  if (!msgDiv) {
    console.error('[createDropFromAI] Could not find message div');
    return;
  }
  
  const bubble = msgDiv.querySelector('.ask-ai-bubble');
  if (!bubble) {
    console.error('[createDropFromAI] Could not find bubble');
    return;
  }
  
  const text = bubble.textContent;
  const isUserMessage = msgDiv.classList.contains('user');
  
  console.log('[createDropFromAI] Creating drop:', text.substring(0, 50) + '...');
  
  const now = new Date();
  const drop = {
    id: Date.now(),
    text: text,
    category: 'inbox',
    timestamp: now.toISOString(),
    date: now.toLocaleDateString('ru-RU'),
    time: now.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
    isMedia: false,
    source: 'chat_manual',
    creator: isUserMessage ? 'user' : 'aski',
    sessionId: typeof currentChatSessionId !== 'undefined' ? currentChatSessionId : null
  };
  
  ideas.unshift(drop);
  save(drop);
  // NO render() - causes 2-3 second delays!
  counts();
  
  // Update button to show "created" state IMMEDIATELY
  btn.classList.add('created');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    Drop created
  `;
  btn.blur(); // Remove focus to prevent red outline
  
  console.log('[createDropFromAI] Drop created successfully, id:', drop.id);
  
  // Sync with Syntrise if enabled
  if (typeof syncDropToSyntrise === 'function') {
    syncDropToSyntrise(drop);
  }
  
  toast('Drop created');
}

function copyAIResponse(btn) {
  const bubble = btn.closest('.ask-ai-message').querySelector('.ask-ai-bubble');
  const text = bubble.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  }).catch(() => {
    toast('Failed to copy');
  });
}

function toggleAskAIVoice() {
  const btn = document.getElementById('askAIVoiceBtn');
  
  // === VOICE MODE ENABLED ===
  if (isVoiceModeEnabled()) {
    // If sleeping - wake up
    if (voiceModeSleeping) {
      wakeVoiceMode();
      return;
    }
    
    // If listening/active - go to sleep (user wants to stop)
    if (voiceModeRecognition || btn.classList.contains('recording')) {
      enterVoiceModeSleep();
      return;
    }
    
    // If locked (Aski speaking/processing) - just show message
    if (voiceModeLocked || askiIsProcessing || askiIsSpeaking) {
      toast('Wait for Aski to finish');
      return;
    }
    
    // Otherwise start listening
    wakeVoiceMode();
    return;
  }
  
  // === VOICE MODE DISABLED (manual mode) ===
  if (btn.classList.contains('recording')) {
    if (askAIVoiceRecognition) {
      askAIVoiceRecognition.stop();
    }
    btn.classList.remove('recording');
  } else {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast('Voice not supported in this browser');
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    askAIVoiceRecognition = new SpeechRecognition();
    askAIVoiceRecognition.continuous = false;
    askAIVoiceRecognition.interimResults = false;
    askAIVoiceRecognition.lang = navigator.language || 'en-US';
    
    askAIVoiceRecognition.onstart = () => {
      btn.classList.add('recording');
    };
    
    askAIVoiceRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById('askAIInput').value = transcript;
      updateAskAICharCount();
    };
    
    askAIVoiceRecognition.onend = () => {
      btn.classList.remove('recording');
    };
    
    askAIVoiceRecognition.onerror = () => {
      btn.classList.remove('recording');
      toast('Voice recognition error');
    };
    
    askAIVoiceRecognition.start();
  }
}

// Ask AI input event listeners
document.addEventListener('DOMContentLoaded', () => {
  const askAIInput = document.getElementById('askAIInput');
  if (askAIInput) {
    askAIInput.addEventListener('input', updateAskAICharCount);
    askAIInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !document.getElementById('askAISendBtn').disabled) {
        sendAskAIMessage();
      }
    });
  }
  
  // Load API key
  // (API key is stored on server, not needed here)
  
  // Swipe down to close Ask AI - ONLY on handle and header (not message area)
  // This prevents conflict with system notification panel and allows normal scroll
  const askAIHandle = document.querySelector('.ask-ai-handle');
  const askAIHeader = document.querySelector('.ask-ai-header');
  let swipeStartY = 0;
  
  function handleSwipeStart(e) {
    swipeStartY = e.touches[0].clientY;
  }
  
  function handleSwipeEnd(e) {
    const swipeEndY = e.changedTouches[0].clientY;
    if (swipeEndY - swipeStartY > 50) { // Reduced threshold for header area
      closeAskAI();
    }
  }
  
  // Attach to handle bar
  if (askAIHandle) {
    askAIHandle.addEventListener('touchstart', handleSwipeStart);
    askAIHandle.addEventListener('touchend', handleSwipeEnd);
  }
  
  // Attach to header
  if (askAIHeader) {
    askAIHeader.addEventListener('touchstart', handleSwipeStart);
    askAIHeader.addEventListener('touchend', handleSwipeEnd);
  }
  
  // Swipe UP on Ask AI FAB button to open chat
  const fabAskAI = document.getElementById('fabAskAI');
  let fabStartY = 0;
  fabAskAI.addEventListener('touchstart', (e) => {
    fabStartY = e.touches[0].clientY;
  });
  fabAskAI.addEventListener('touchend', (e) => {
    const fabEndY = e.changedTouches[0].clientY;
    if (fabStartY - fabEndY > 30) { // Swipe up threshold
      openAskAI();
    }
  });
});

// ============================================
// EXPORTS
// ============================================
window.DropLitChat = {
  openAskAI,
  closeAskAI,
  sendAskAIMessage,
  addAskAIMessage,
  toggleAskAIVoice,
  setAskAIPrompt,
  askiSpeak,
  askiStopSpeaking
};
