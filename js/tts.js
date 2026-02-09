// ============================================
// DROPLIT TTS v1.4
// Text-to-Speech and Sound functions
// v1.1: Added StreamingTTS stop support
// v1.2: Speak button states (Speak/Wait/Stop)
// v1.3: ElevenLabs fallback to OpenAI, better logging
// v1.4: Audio Session Manager — prevents ghost playback
// ============================================

// ============================================
// AUDIO SESSION MANAGER (v1.4)
// Prevents ghost playback from in-flight fetch
// ============================================
let audioSessionId = 0;       // Incremental counter — each new speak = new session
let audioSuppressed = false;  // STOP pressed → block all playback until next message

function newAudioSession() {
  audioSessionId++;
  audioSuppressed = false;
  console.log('[AudioSession] New session:', audioSessionId);
  return audioSessionId;
}

function suppressAudio() {
  audioSessionId++;  // Invalidate all in-flight fetches
  audioSuppressed = true;
  console.log('[AudioSession] Suppressed. All playback blocked until next message.');
  // Stop everything currently playing
  stopTTS();
  // Stop AudioContext playback (from chat.js)
  if (typeof stopAudioPlayback === 'function') stopAudioPlayback();
  // Stop browser speech
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function canPlayAudio(sessionId) {
  if (audioSuppressed) {
    console.log('[AudioSession] Playback blocked (suppressed)');
    return false;
  }
  if (sessionId !== audioSessionId) {
    console.log('[AudioSession] Playback blocked (session', sessionId, 'expired, current:', audioSessionId, ')');
    return false;
  }
  return true;
}

// Export globally for chat.js and index.html
window.newAudioSession = newAudioSession;
window.suppressAudio = suppressAudio;
window.canPlayAudio = canPlayAudio;
// Expose for reading in other files
window.getAudioSessionId = () => audioSessionId;
window.setAudioSuppressed = (val) => { audioSuppressed = val; };

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

// Update speak button state
function updateSpeakButton(btn, state) {
  if (!btn) return;
  
  btn.classList.remove('waiting', 'speaking');
  
  switch(state) {
    case 'wait':
      btn.textContent = 'Waiting...';
      btn.classList.add('waiting');
      break;
    case 'stop':
      btn.textContent = 'Stop';
      btn.classList.add('speaking');
      break;
    default: // 'speak'
      btn.textContent = 'Speak';
      break;
  }
}

function speakAskAIMessage(btn) {
  // If this button is already playing or waiting - stop it
  if (btn === activeSpeakBtn) {
    stopTTS();
    updateSpeakButton(btn, 'speak');
    activeSpeakBtn = null;
    return;
  }
  
  // Stop any other playback
  stopTTS();
  if (activeSpeakBtn) {
    updateSpeakButton(activeSpeakBtn, 'speak');
  }
  
  const msgDiv = btn.closest('.ask-ai-message');
  const bubble = msgDiv?.querySelector('.ask-ai-bubble');
  if (!bubble) return;
  
  const text = bubble.textContent || bubble.innerText;
  if (!text) return;
  
  // Set to Wait state
  updateSpeakButton(btn, 'wait');
  activeSpeakBtn = btn;
  
  speakTextWithCallback(text, 
    // onEnd
    function() {
      updateSpeakButton(btn, 'speak');
      activeSpeakBtn = null;
    },
    // onStart
    function() {
      updateSpeakButton(btn, 'stop');
    }
  );
}

function speakTextWithCallback(text, onEnd, onStart) {
  if (!text) return;
  
  stopTTS();
  newAudioSession();  // v1.4: New session invalidates any in-flight fetches
  
  const provider = localStorage.getItem('tts_provider') || 'browser';
  const apiKey = localStorage.getItem('openai_tts_key');
  const voice = localStorage.getItem('aski_voice') || 'nova';
  const elevenlabsKey = localStorage.getItem('elevenlabs_tts_key');
  const elevenlabsVoice = localStorage.getItem('elevenlabs_voice_id') || 'EXAVITQu4vr4xnSDxMaL';
  
  console.log('[TTS] Provider:', provider, '| OpenAI key:', apiKey ? 'yes' : 'no', '| ElevenLabs key:', elevenlabsKey ? 'yes' : 'no');
  
  // Try ElevenLabs first if selected, with fallback to OpenAI
  if (provider === 'elevenlabs' && elevenlabsKey) {
    speakWithElevenLabsCallback(text, elevenlabsKey, elevenlabsVoice, onEnd, onStart, apiKey, voice);
  } else if (apiKey && apiKey.startsWith('sk-')) {
    // Use OpenAI if available (regardless of provider setting)
    speakWithOpenAICallback(text, apiKey, voice, onEnd, onStart);
  } else if (provider === 'openai' && apiKey && apiKey.startsWith('sk-')) {
    speakWithOpenAICallback(text, apiKey, voice, onEnd, onStart);
  } else {
    // Browser TTS - starts immediately, no loading delay
    console.log('[TTS] Using browser speech synthesis');
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.onstart = function() {
        if (onStart) onStart();
      };
      utterance.onend = function() {
        if (onEnd) onEnd();
        if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
      };
      window.speechSynthesis.speak(utterance);
    }
  }
}

async function speakWithOpenAICallback(text, apiKey, voice, onEnd, onStart) {
  const mySession = audioSessionId;  // Capture session before fetch
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
    
    // SESSION CHECK: Still valid after fetch?
    if (!canPlayAudio(mySession)) {
      console.log('[OpenAI TTS] Session expired, skipping playback');
      if (onEnd) onEnd();
      return;
    }
    
    const blob = await response.blob();
    
    // SESSION CHECK again before play
    if (!canPlayAudio(mySession)) {
      console.log('[OpenAI TTS] Session expired before play');
      if (onEnd) onEnd();
      return;
    }
    
    const url = URL.createObjectURL(blob);
    currentTTSAudio = new Audio(url);
    
    currentTTSAudio.onended = function() {
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (onEnd) onEnd();
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
    };
    
    // Notify that audio is about to start
    if (onStart) onStart();
    currentTTSAudio.play();
  } catch (e) {
    console.error('OpenAI TTS error:', e);
    if (onEnd) onEnd();
    if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
  }
}

async function speakWithElevenLabsCallback(text, apiKey, voiceId, onEnd, onStart, fallbackOpenAIKey, fallbackVoice) {
  const mySession = audioSessionId;  // Capture session before fetch
  try {
    console.log('[ElevenLabs Callback] Starting TTS...');
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      console.warn('[ElevenLabs Callback] Error:', response.status, '- trying OpenAI fallback');
      if (fallbackOpenAIKey && fallbackOpenAIKey.startsWith('sk-')) {
        speakWithOpenAICallback(text, fallbackOpenAIKey, fallbackVoice || 'nova', onEnd, onStart);
        return;
      }
      throw new Error('ElevenLabs TTS error: ' + response.status);
    }
    
    // SESSION CHECK: Still valid after fetch?
    if (!canPlayAudio(mySession)) {
      console.log('[ElevenLabs Callback] Session expired, skipping playback');
      if (onEnd) onEnd();
      return;
    }
    
    const blob = await response.blob();
    console.log('[ElevenLabs Callback] Audio blob received:', blob.size, 'bytes');
    
    // SESSION CHECK again before play
    if (!canPlayAudio(mySession)) {
      console.log('[ElevenLabs Callback] Session expired before play');
      if (onEnd) onEnd();
      return;
    }
    
    const url = URL.createObjectURL(blob);
    currentTTSAudio = new Audio(url);
    
    currentTTSAudio.onended = function() {
      console.log('[ElevenLabs Callback] Audio ended');
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (onEnd) onEnd();
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
    };
    
    currentTTSAudio.onerror = function(e) {
      console.error('[ElevenLabs Callback] Audio error:', e);
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (onEnd) onEnd();
    };
    
    if (onStart) onStart();
    await currentTTSAudio.play();
    console.log('[ElevenLabs Callback] Audio playing');
    
  } catch (e) {
    console.error('ElevenLabs TTS error:', e);
    if (fallbackOpenAIKey && fallbackOpenAIKey.startsWith('sk-')) {
      console.log('[ElevenLabs Callback] Falling back to OpenAI TTS');
      speakWithOpenAICallback(text, fallbackOpenAIKey, fallbackVoice || 'nova', onEnd, onStart);
      return;
    }
    if (onEnd) onEnd();
    if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
  }
}

function speakText(text) {
  if (!text) return;
  
  stopTTS();
  newAudioSession();  // v1.4: New session invalidates any in-flight fetches
  if (typeof updateChatControlLeft === 'function') updateChatControlLeft('stop');
  
  const provider = localStorage.getItem('tts_provider') || 'browser';
  const openaiKey = localStorage.getItem('openai_tts_key');
  const openaiVoice = localStorage.getItem('aski_voice') || 'nova';
  const elevenlabsKey = localStorage.getItem('elevenlabs_tts_key');
  const elevenlabsVoice = localStorage.getItem('elevenlabs_voice_id') || 'EXAVITQu4vr4xnSDxMaL';
  
  console.log('[speakText] Provider:', provider, '| OpenAI:', openaiKey ? 'yes' : 'no');
  
  // Try ElevenLabs first if selected, with fallback to OpenAI
  if (provider === 'elevenlabs' && elevenlabsKey) {
    speakWithElevenLabsFallback(text, elevenlabsKey, elevenlabsVoice, openaiKey, openaiVoice);
  } else if (openaiKey && openaiKey.startsWith('sk-')) {
    // Use OpenAI if available
    speakWithOpenAI(text, openaiKey, openaiVoice);
  } else {
    // Browser fallback
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

// ElevenLabs with OpenAI fallback
async function speakWithElevenLabsFallback(text, apiKey, voiceId, fallbackKey, fallbackVoice) {
  const mySession = audioSessionId;  // Capture session
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
    
    if (!response.ok) {
      console.warn('[ElevenLabs] Error:', response.status, '- trying OpenAI fallback');
      if (fallbackKey && fallbackKey.startsWith('sk-')) {
        speakWithOpenAI(text, fallbackKey, fallbackVoice || 'nova');
        return;
      }
      throw new Error('ElevenLabs TTS error: ' + response.status);
    }
    
    // SESSION CHECK
    if (!canPlayAudio(mySession)) {
      console.log('[ElevenLabs] Session expired, skipping');
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
      return;
    }
    
    const blob = await response.blob();
    
    if (!canPlayAudio(mySession)) {
      console.log('[ElevenLabs] Session expired before play');
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
      return;
    }
    
    console.log('[ElevenLabs] Audio blob received:', blob.size, 'bytes');
    const url = URL.createObjectURL(blob);
    currentTTSAudio = new Audio(url);
    
    const cleanup = function() {
      console.log('[ElevenLabs] Audio cleanup');
      URL.revokeObjectURL(url);
      currentTTSAudio = null;
      if (typeof unlockVoiceMode === 'function') {
        unlockVoiceMode();
      }
    };
    
    currentTTSAudio.onended = cleanup;
    currentTTSAudio.onerror = function(e) {
      console.error('[ElevenLabs] Audio error:', e);
      cleanup();
    };
    
    await currentTTSAudio.play();
    console.log('[ElevenLabs] Audio playing');
    
  } catch (e) {
    console.error('ElevenLabs TTS error:', e);
    // Fallback to OpenAI
    if (fallbackKey && fallbackKey.startsWith('sk-')) {
      console.log('[ElevenLabs] Falling back to OpenAI');
      speakWithOpenAI(text, fallbackKey, fallbackVoice || 'nova');
      return;
    }
    if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
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
  const mySession = audioSessionId;  // Capture session
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
    
    // SESSION CHECK
    if (!canPlayAudio(mySession)) {
      console.log('[OpenAI] Session expired, skipping');
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
      return;
    }
    
    const blob = await response.blob();
    
    if (!canPlayAudio(mySession)) {
      console.log('[OpenAI] Session expired before play');
      if (typeof unlockVoiceMode === 'function') unlockVoiceMode();
      return;
    }
    
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
  // v1.4: Increment session to invalidate in-flight fetches
  audioSessionId++;
  
  // Stop regular Audio playback
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio = null;
  }
  
  // Stop browser speech synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  
  // Stop ElevenLabs Streaming TTS (WebSocket)
  if (window.StreamingTTS && typeof window.StreamingTTS.stop === 'function') {
    try {
      window.StreamingTTS.stop();
      console.log('[TTS] Streaming TTS stopped');
    } catch (e) {
      console.error('[TTS] Error stopping Streaming TTS:', e);
    }
  }
  
  // Stop AudioContext playback (from chat.js)
  if (typeof stopAudioPlayback === 'function') {
    stopAudioPlayback();
  }
  
  // Reset global streaming flag if exists
  if (typeof streamingTTSIsActive !== 'undefined') {
    streamingTTSIsActive = false;
  }
  
  if (typeof updateChatControlLeft === 'function') updateChatControlLeft('hide');
}

function speakDrop(id, e) {
  if (e) e.stopPropagation();
  
  console.log('[speakDrop] Called with id:', id);
  
  // ideas is a global variable from main script
  const item = typeof ideas !== 'undefined' ? ideas.find(x => x.id === id) : null;
  if (!item) {
    console.warn('[speakDrop] Item not found for id:', id);
    return;
  }
  
  // Get text to speak
  let textToSpeak = '';
  if (item.category === 'audio' && item.transcription) {
    textToSpeak = item.transcription;
  } else if (item.text) {
    textToSpeak = item.text;
  } else if (item.notes) {
    textToSpeak = item.notes;
  }
  
  console.log('[speakDrop] Text length:', textToSpeak?.length || 0);
  
  if (!textToSpeak) {
    if (typeof toast === 'function') toast('Nothing to read', 'warning');
    return;
  }
  
  // Stop if already playing
  if (isTTSPlaying || currentTTSAudio) {
    console.log('[speakDrop] Stopping current playback');
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
  
  console.log('[speakDrop] Starting TTS...');
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
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio = null;
  }
  // Also stop streaming TTS
  if (window.StreamingTTS) {
    try {
      window.StreamingTTS.stop();
    } catch (e) {}
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
  speakWithElevenLabs,
  speakWithElevenLabsFallback,
  speakWithElevenLabsCallback,
  updateSpeakButton
};
