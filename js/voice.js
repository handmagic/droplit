// ============================================
// DROPLIT VOICE - v0.9.59
// Text-to-Speech and Speech Recognition
// ============================================

// TTS State
let currentTTSDropId = null;
let currentAudio = null;

// Get TTS provider
function getTTSProvider() {
  return localStorage.getItem('droplit_tts_provider') || 'browser';
}

// Speak text
function speakText(text) {
  const provider = getTTSProvider();
  
  if (provider === 'openai') {
    speakWithOpenAI(text);
  } else if (provider === 'elevenlabs') {
    speakWithElevenLabs(text);
  } else {
    speakWithBrowser(text);
  }
}

// Browser TTS
function speakWithBrowser(text) {
  if (!('speechSynthesis' in window)) {
    toast('TTS not supported', 'error');
    return;
  }
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onend = () => {
    unlockVoiceMode();
  };
  
  utterance.onerror = (e) => {
    console.error('TTS error:', e);
    unlockVoiceMode();
  };
  
  window.speechSynthesis.speak(utterance);
}

// OpenAI TTS
async function speakWithOpenAI(text) {
  const apiKey = localStorage.getItem('droplit_openai_key');
  if (!apiKey) {
    toast('OpenAI API key not set', 'error');
    speakWithBrowser(text);
    return;
  }
  
  const voice = localStorage.getItem('droplit_openai_voice') || 'nova';
  
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: voice,
        input: text
      })
    });
    
    if (!response.ok) throw new Error('TTS API error');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      unlockVoiceMode();
    };
    currentAudio.onerror = () => {
      unlockVoiceMode();
    };
    currentAudio.play();
    
  } catch (error) {
    console.error('OpenAI TTS error:', error);
    toast('TTS error, using browser', 'warning');
    speakWithBrowser(text);
  }
}

// ElevenLabs TTS
async function speakWithElevenLabs(text) {
  const apiKey = localStorage.getItem('droplit_elevenlabs_key');
  if (!apiKey) {
    toast('ElevenLabs API key not set', 'error');
    speakWithBrowser(text);
    return;
  }
  
  const voiceId = localStorage.getItem('droplit_elevenlabs_voice') || 'EXAVITQu4vr4xnSDxMaL';
  
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2'
      })
    });
    
    if (!response.ok) throw new Error('ElevenLabs API error');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      unlockVoiceMode();
    };
    currentAudio.onerror = () => {
      unlockVoiceMode();
    };
    currentAudio.play();
    
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    toast('TTS error, using browser', 'warning');
    speakWithBrowser(text);
  }
}

// Stop TTS
function stopTTS() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  window.speechSynthesis?.cancel();
}

// Speak drop by ID
function speakDrop(id, e) {
  if (e) e.stopPropagation();
  
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  if (currentTTSDropId === id && currentAudio) {
    stopTTS();
    currentTTSDropId = null;
    updateTTSButton(id, false);
    return;
  }
  
  currentTTSDropId = id;
  updateTTSButton(id, true);
  
  speakText(idea.text);
}

// Update TTS button state
function updateTTSButton(id, isPlaying) {
  const btn = document.querySelector('.card[data-id="' + id + '"] .tts-btn');
  if (btn) {
    btn.classList.toggle('playing', isPlaying);
  }
}

// Stop all TTS
function stopAllTTS() {
  stopTTS();
  currentTTSDropId = null;
}

// ============================================
// SPEECH RECOGNITION (STT)
// ============================================

// Initialize speech recognition
function initSR() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    document.getElementById('warning').style.display = 'block';
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.continuous = true;
  recognition.interimResults = true;
  
  recognition.onstart = () => {
    isRec = true;
    updateRecUI(true);
    acquireWakeLock();
  };
  
  recognition.onend = () => {
    isRec = false;
    updateRecUI(false);
    releaseWakeLock();
  };
  
  recognition.onerror = (e) => {
    console.error('SR error:', e.error);
    isRec = false;
    updateRecUI(false);
    releaseWakeLock();
  };
  
  recognition.onresult = (e) => {
    let final = '';
    let interim = '';
    
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        final += e.results[i][0].transcript;
      } else {
        interim += e.results[i][0].transcript;
      }
    }
    
    if (final && !saved) {
      saved = true;
      saveIdea(final);
      recognition.stop();
    }
  };
}

// Toggle recording
function toggleRec() {
  if (isRec) {
    recognition.stop();
  } else {
    saved = false;
    recognition.start();
  }
}

// Update recording UI
function updateRecUI(on) {
  const fab = document.getElementById('fab');
  if (fab) {
    fab.classList.toggle('rec', on);
  }
}

// ============================================
// FAB HANDLING
// ============================================

function fabDown(event) {
  event.preventDefault();
  fabPressed = true;
  
  fabTimer = setTimeout(() => {
    if (fabPressed) {
      // Long press - open chat
      toggleChat();
      fabPressed = false;
    }
  }, 500);
}

function fabUp(event) {
  event.preventDefault();
  
  if (fabTimer) {
    clearTimeout(fabTimer);
    fabTimer = null;
  }
  
  if (fabPressed) {
    // Short press - toggle recording
    toggleRec();
  }
  
  fabPressed = false;
}

// ============================================
// VOICE MODE (Chat)
// ============================================

function toggleVoiceMode() {
  voiceModeActive = !voiceModeActive;
  
  if (voiceModeActive) {
    startVoiceModeListening();
  } else {
    stopVoiceModeListening();
  }
  
  updateVoiceModeUI();
}

function startVoiceModeListening() {
  // Similar to initSR but for chat
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceModeRecognition = new SpeechRecognition();
  voiceModeRecognition.lang = 'ru-RU';
  voiceModeRecognition.continuous = false;
  voiceModeRecognition.interimResults = false;
  
  voiceModeRecognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    if (text) {
      document.getElementById('askAIInput').value = text;
      sendAskAIMessage();
    }
  };
  
  voiceModeRecognition.onerror = () => {
    voiceModeActive = false;
    updateVoiceModeUI();
  };
  
  voiceModeRecognition.onend = () => {
    if (voiceModeActive && !voiceModeLocked) {
      // Restart listening after pause
      setTimeout(() => {
        if (voiceModeActive && !voiceModeLocked) {
          voiceModeRecognition.start();
        }
      }, 500);
    }
  };
  
  voiceModeRecognition.start();
}

function stopVoiceModeListening() {
  if (voiceModeRecognition) {
    voiceModeRecognition.abort();
    voiceModeRecognition = null;
  }
}

function updateVoiceModeUI() {
  const btn = document.getElementById('voiceModeBtn');
  if (btn) {
    btn.classList.toggle('active', voiceModeActive);
  }
}

function updateVoiceModeIndicator(state) {
  // Update visual indicator based on state: ready, listening, processing
  const indicator = document.getElementById('voiceModeIndicator');
  if (indicator) {
    indicator.className = 'voice-mode-indicator ' + state;
  }
}

// Toggle auto-speak
function toggleAutoSpeak() {
  const enabled = !isAutoSpeakEnabled();
  localStorage.setItem('droplit_autospeak', enabled);
  
  const btn = document.getElementById('autoSpeakBtn');
  if (btn) btn.classList.toggle('active', enabled);
  
  toast('Auto-speak ' + (enabled ? 'ON' : 'OFF'), 'info');
}

// Set TTS provider
function setTTSProvider(provider) {
  localStorage.setItem('droplit_tts_provider', provider);
  
  document.querySelectorAll('.tts-provider-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.tts-provider-btn[data-provider="' + provider + '"]');
  if (btn) btn.classList.add('active');
  
  toast('TTS: ' + provider, 'info');
}

// Set OpenAI voice
function setAskiVoice(voice) {
  localStorage.setItem('droplit_openai_voice', voice);
  
  document.querySelectorAll('.voice-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.voice-btn[data-voice="' + voice + '"]');
  if (btn) btn.classList.add('active');
}

console.log('Voice module loaded');
