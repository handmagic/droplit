// ============================================
// DROPLIT TTS v1.0
// Text-to-Speech and Sound functions
// ============================================

// ============================================
// DROP SOUND
// Signature sound when creating a drop
// ============================================
let dropSoundCtx = null;

function playDropSound() {
  try {
    if (!dropSoundCtx) dropSoundCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = dropSoundCtx;
    if (ctx.state === 'suspended') ctx.resume();
    
    // Create a pleasant "drop" sound
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15); // A4
    osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6
    osc2.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15); // E5
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.2);
  } catch(e) {
    console.log('Sound not available');
  }
}

// ============================================
// TTS - TEXT TO SPEECH
// Read drop content aloud
// ============================================
let currentTTSUtterance = null;
let isTTSPlaying = false;
let currentTTSAudio = null;
let activeSpeakBtn = null;

function speakAskAIMessage(btn) {
  // If this button is already playing - stop it
  if (btn === activeSpeakBtn) {
    stopTTS();
    btn.classList.remove('speaking');
    activeSpeakBtn = null;
    return;
  }
  
  // Stop any other playback
  stopTTS();
  if (activeSpeakBtn) {
    activeSpeakBtn.classList.remove('speaking');
  }
  
  const msgDiv = btn.closest('.ask-ai-message');
  const bubble = msgDiv?.querySelector('.ask-ai-bubble');
  if (!bubble) return;
  
  const text = bubble.textContent || bubble.innerText;
  if (!text) return;
  
  // Mark button as active
  btn.classList.add('speaking');
  activeSpeakBtn = btn;
  
  speakTextWithCallback(text, function() {
    btn.classList.remove('speaking');
    activeSpeakBtn = null;
  });
}

function speakTextWithCallback(text, onEnd) {
  if (!text) return;
  
  stopTTS();
  
  const provider = localStorage.getItem('tts_provider') || 'browser';
  const apiKey = localStorage.getItem('openai_tts_key');
  const voice = localStorage.getItem('aski_voice') || 'nova';
  
  if (provider === 'openai' && apiKey && apiKey.startsWith('sk-')) {
    speakWithOpenAICallback(text, apiKey, voice, onEnd);
  } else {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.onend = function() {
        if (onEnd) onEnd();
        if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
      };
      window.speechSynthesis.speak(utterance);
    }
  }
}

async function speakWithOpenAICallback(text, apiKey, voice, onEnd) {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice
      })
    });
    
    if (!response.ok) throw new Error('OpenAI TTS error');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    currentTTSAudio = new Audio(url);
    
    currentTTSAudio.onended = function() {
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (onEnd) onEnd();
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
    };
    
    currentTTSAudio.play();
  } catch (e) {
    console.error('OpenAI TTS error:', e);
    if (onEnd) onEnd();
    if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
  }
}

function speakText(text) {
  if (!text) return;
  
  stopTTS();
  if (typeof updateChatControlLeft === 'function') updateChatControlLeft('stop');
  
  const provider = localStorage.getItem('tts_provider') || 'browser';
  const openaiKey = localStorage.getItem('openai_tts_key');
  const openaiVoice = localStorage.getItem('aski_voice') || 'nova';
  const elevenlabsKey = localStorage.getItem('elevenlabs_tts_key');
  const elevenlabsVoice = localStorage.getItem('elevenlabs_voice_id') || 'EXAVITQu4vr4xnSDxMaL';
  
  if (provider === 'openai' && openaiKey && openaiKey.startsWith('sk-')) {
    speakWithOpenAI(text, openaiKey, openaiVoice);
  } else if (provider === 'elevenlabs' && elevenlabsKey) {
    speakWithElevenLabs(text, elevenlabsKey, elevenlabsVoice);
  } else {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.onend = function() { 
        if (typeof unlockVoiceMode === 'function') unlockVoiceMode(); 
      };
      window.speechSynthesis.speak(utterance);
    }
  }
}

async function speakWithElevenLabs(text, apiKey, voiceId) {
  try {
    console.log('[ElevenLabs] Starting TTS...');
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
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
    
    if (!response.ok) throw new Error('ElevenLabs TTS error: ' + response.status);
    
    const blob = await response.blob();
    console.log('[ElevenLabs] Audio blob received:', blob.size, 'bytes');
    const url = URL.createObjectURL(blob);
    currentTTSAudio = new Audio(url);
    
    // Multiple event handlers for reliability
    const cleanup = function() {
      console.log('[ElevenLabs] Audio cleanup');
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (typeof unlockVoiceMode === 'function') {
        console.log('[ElevenLabs] Calling unlockVoiceMode');
        unlockVoiceMode();
      }
    };
    
    currentTTSAudio.onended = function() {
      console.log('[ElevenLabs] Audio onended');
      cleanup();
    };
    
    currentTTSAudio.onerror = function(e) {
      console.error('[ElevenLabs] Audio error:', e);
      cleanup();
    };
    
    // Fallback timeout based on text length (~100ms per character for speech)
    const estimatedDuration = Math.max(5000, text.length * 80);
    setTimeout(function() {
      if (currentTTSAudio) {
        console.log('[ElevenLabs] Timeout fallback triggered');
        cleanup();
      }
    }, estimatedDuration);
    
    await currentTTSAudio.play();
    console.log('[ElevenLabs] Audio playing');
    
  } catch (e) {
    console.error('ElevenLabs TTS error:', e);
    if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
  }
}

async function speakWithOpenAI(text, apiKey, voice) {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice
      })
    });
    
    if (!response.ok) throw new Error('OpenAI TTS error');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    currentTTSAudio = new Audio(url);
    
    currentTTSAudio.onended = function() {
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
    };
    
    currentTTSAudio.play();
  } catch (e) {
    console.error('OpenAI TTS error:', e);
    if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
  }
}

function stopTTS() {
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (typeof updateChatControlLeft === 'function') updateChatControlLeft('hide');
}

function speakDrop(id, e) {
  if (e) e.stopPropagation();
  
  // ideas is a global variable from main script
  const item = typeof ideas !== 'undefined' ? ideas.find(x => x.id === id) : null;
  if (!item) return;
  
  // Get text to speak
  let textToSpeak = '';
  if (item.category === 'audio' && item.transcription) {
    textToSpeak = item.transcription;
  } else if (item.text) {
    textToSpeak = item.text;
  } else if (item.notes) {
    textToSpeak = item.notes;
  }
  
  if (!textToSpeak) {
    if (typeof toast === 'function') toast('Nothing to read', 'warning');
    return;
  }
  
  // Stop if already playing
  if (isTTSPlaying || currentTTSAudio) {
    stopTTS();
    speechSynthesis.cancel();
    isTTSPlaying = false;
    updateTTSButton(id, false);
    if (typeof toast === 'function') toast('Stopped', 'info');
    return;
  }
  
  // Use settings-based TTS
  isTTSPlaying = true;
  updateTTSButton(id, true);
  
  speakTextWithCallback(textToSpeak, function() {
    isTTSPlaying = false;
    updateTTSButton(id, false);
  });
  
  if (typeof toast === 'function') toast('Reading...', 'info');
}

function updateTTSButton(id, isPlaying) {
  const btn = document.querySelector(`.card[data-id="${id}"] .act-tts`);
  if (btn) {
    btn.innerHTML = isPlaying ? 'Stop' : 'Read';
    btn.classList.toggle('playing', isPlaying);
  }
}

function stopAllTTS() {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
  isTTSPlaying = false;
}

// ============================================
// EXPORTS (for future module use)
// ============================================
window.DropLitTTS = {
  playDropSound,
  speakText,
  speakTextWithCallback,
  speakAskAIMessage,
  speakDrop,
  stopTTS,
  stopAllTTS,
  speakWithOpenAI,
  speakWithElevenLabs
};
