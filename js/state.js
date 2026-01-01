// ============================================
// DROPLIT STATE - v0.9.59
// ============================================

// Core data
let ideas = JSON.parse(localStorage.getItem('droplit_ideas')) || [];

// Auto-fix string IDs from old versions
(function autoFixIds() {
  let fixed = 0;
  ideas = ideas.map((item, index) => {
    if (typeof item.id === 'string') {
      item.id = Date.now() + index;
      fixed++;
    }
    return item;
  });
  if (fixed > 0) {
    localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
    console.log('Auto-fixed ' + fixed + ' drop(s) with string IDs');
  }
})();

// Supabase state
let supabaseClient = null;
let currentUser = null;
let syncEnabled = true;
let isSyncing = false;
let syncQueue = [];
let lastSyncTime = null;

// UI state
let curTime = 'all';
let curCat = 'all';
let sortAsc = false;
let selectMode = false;
let selectedIds = new Set();
let currentOpenCardId = null;
let editingCard = null;

// Search state
let searchMode = false;
let searchQuery = '';

// Archive state
let showArchived = false;

// Recording state
let isRec = false;
let saved = false;
let recognition = null;
let wakeLock = null;

// FAB state
let fabTimer = null;
let fabPressed = false;

// TTS state
let currentTTSDropId = null;
let currentAudio = null;

// Chat state
let askAIMessages = [];
let aiProcessing = false;
let askiIsProcessing = false;
let lastUserMessage = '';

// Voice Mode state
let voiceModeActive = false;
let voiceModeSpeaking = false;
let voiceModeLocked = false;
let voiceModeListenTimer = null;
let voiceModeRecognition = null;
let voiceModeAwaitingResponse = false;

// Photo state
let currentPhotoBlob = null;
let pendingPhotoId = null;

// Long press state
let touchStartTime = 0;
let touchMoved = false;
let longPressTimer = null;

// DOM references (initialized in app.js)
let ideasWrap, scrollTopBtn, scrollBottomBtn;

console.log('State initialized. Drops count:', ideas.length);
