// ============================================
// DROPLIT SETTINGS v1.1
// Main Menu, Settings, Export/Import, Undo
// ============================================

function addCatPrompt(){document.getElementById('addCatModal').classList.add('show');}
function closeAddCatModal(){document.getElementById('addCatModal').classList.remove('show');}

function exportAll(){
  closeSettings();
  if(!ideas.length){toast('Nothing to export','warning');return;}
  const grp={};for(const i of ideas){if(!grp[i.category])grp[i.category]=[];grp[i.category].push(i);}
  let md='# DropLit Export\n'+new Date().toLocaleDateString('ru-RU')+' | '+ideas.length+' ideas\n\n';
  for(const[k,arr]of Object.entries(grp)){
    md+='## '+CATS[k].name+' ('+arr.length+')\n';
    for(const i of arr)md+='- ['+i.date+' '+i.time+'] '+i.text+'\n';
    md+='\n';
  }
  md+='---\nExported from DropLit v0.9.58';
  document.getElementById('exportBox').textContent=md;
  document.getElementById('exportModal').classList.add('show');
}

function closeExportModal(){document.getElementById('exportModal').classList.remove('show');}
function copyExport(){navigator.clipboard.writeText(document.getElementById('exportBox').textContent);toast('Copied!','success');closeExportModal();}
function openAbout(){document.getElementById('aboutModal').classList.add('show');}
function closeAbout(){document.getElementById('aboutModal').classList.remove('show');}
function openSettings(){
  document.getElementById('settingsModal').classList.add('show');
  // Initialize voice settings UI with saved values
  initVoiceSettings();
}
function closeSettings(){document.getElementById('settingsModal').classList.remove('show');}

// ============================================
// MAIN MENU
// ============================================

function toggleMainMenu() {
  const menu = document.getElementById('mainMenu');
  const isOpen = menu.classList.contains('show');
  
  if (isOpen) {
    closeMainMenu();
  } else {
    openMainMenu();
  }
}

function openMainMenu() {
  document.getElementById('mainMenu').classList.add('show');
  document.body.classList.add('main-menu-open');
  updateMenuIcon(true);
  updateUndoList();
  updateTokenBalance();
  initFontSize();
  // Initialize voice/TTS settings UI with saved values
  initVoiceSettings();
  // Sync AutoDrop indicator
  if (typeof updateAutoDropIndicator === 'function') {
    updateAutoDropIndicator();
  }
}

function closeMainMenu() {
  document.getElementById('mainMenu').classList.remove('show');
  document.body.classList.remove('main-menu-open');
  updateMenuIcon(false);
}

// Debug info (v0.9.58)
function showDebugInfo() {
  closeMainMenu();
  const total = ideas.length;
  const stringIds = ideas.filter(i => typeof i.id === 'string').length;
  const merged = ideas.filter(i => i.isMerged).length;
  const audio = ideas.filter(i => i.category === 'audio').length;
  const textDrops = ideas.filter(i => !i.isMedia && !i.image && !i.audioData).length;
  const mediaDrops = ideas.filter(i => i.isMedia || i.image || i.audioData).length;
  const userId = currentUser ? currentUser.id.substring(0, 8) + '...' : 'Not logged in';
  const deviceId = (typeof DEVICE_ID !== 'undefined' && DEVICE_ID) ? DEVICE_ID : 'Not set';
  const syncStatus = syncEnabled ? 'Enabled' : 'Disabled';
  const lastSync = lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never';
  
  alert(
    `DropLit Debug v0.9.58\n\n` +
    `=== DROPS ===\n` +
    `Total: ${total}\n` +
    `Text: ${textDrops}\n` +
    `Media: ${mediaDrops}\n` +
    `Merged: ${merged}\n` +
    `Audio: ${audio}\n` +
    `String IDs: ${stringIds}\n\n` +
    `=== SYNC ===\n` +
    `User ID: ${userId}\n` +
    `Device ID: ${deviceId}\n` +
    `Sync: ${syncStatus}\n` +
    `Last sync: ${lastSync}\n\n` +
    `=== STORAGE ===\n` +
    `LocalStorage: ${(localStorage.getItem('droplit_ideas')?.length / 1024).toFixed(1)} KB`
  );
}

function updateMenuIcon(isOpen) {
  const btn = document.getElementById('menuToggleBtn');
  if (!btn) return;
  
  const openIcon = btn.querySelector('.menu-icon-open');
  const closeIcon = btn.querySelector('.menu-icon-close');
  
  if (openIcon && closeIcon) {
    openIcon.style.display = isOpen ? 'none' : 'block';
    closeIcon.style.display = isOpen ? 'block' : 'none';
  }
  
  // Change button style when menu is open
  btn.classList.toggle('active', isOpen);
}

// ============================================
// UNDO SYSTEM
// ============================================

const MAX_UNDO_HISTORY = 10;
let undoHistory = JSON.parse(localStorage.getItem('droplit_undo') || '[]');

const UNDO_ICONS = {
  delete: 'DEL',
  createTasks: 'TSK',
  replace: 'RPL',
  edit: 'EDT',
  merge: 'MRG',
  category: 'CAT',
  create: 'NEW',
  archive: 'ARC',
  restore: 'RST'
};

const UNDO_LABELS = {
  delete: 'Deleted',
  createTasks: 'Created tasks',
  replace: 'Replaced text',
  edit: 'Edited',
  merge: 'Merged drops',
  category: 'Changed category',
  create: 'Created',
  archive: 'Archived',
  restore: 'Restored'
};

function saveUndo(action, data) {
  const entry = {
    action,
    data,
    timestamp: Date.now()
  };
  
  undoHistory.unshift(entry);
  if (undoHistory.length > MAX_UNDO_HISTORY) {
    undoHistory = undoHistory.slice(0, MAX_UNDO_HISTORY);
  }
  
  localStorage.setItem('droplit_undo', JSON.stringify(undoHistory));
}

function performUndo(index) {
  const entry = undoHistory[index];
  if (!entry) return;
  
  switch (entry.action) {
    case 'delete':
      // Restore deleted drop
      ideas.push(entry.data);
      toast('Drop restored', 'success');
      break;
      
    case 'createTasks':
      // Remove created tasks
      const taskIds = entry.data.taskIds;
      ideas = ideas.filter(i => !taskIds.includes(i.id));
      toast(`${taskIds.length} tasks removed`, 'success');
      break;
      
    case 'replace':
      // Restore original text
      const dropR = ideas.find(i => i.id === entry.data.id);
      if (dropR) {
        dropR.text = entry.data.originalText;
        toast('Text restored', 'success');
      }
      break;
      
    case 'edit':
      // Restore previous text
      const dropE = ideas.find(i => i.id === entry.data.id);
      if (dropE) {
        dropE.text = entry.data.previousText;
        toast('Edit undone', 'success');
      }
      break;
      
    case 'merge':
      // Remove merged drop
      ideas = ideas.filter(i => i.id !== entry.data.mergedId);
      toast('Merge undone', 'success');
      break;
      
    case 'category':
      // Restore previous category
      const dropC = ideas.find(i => i.id === entry.data.id);
      if (dropC) {
        dropC.category = entry.data.previousCategory;
        toast('Category restored', 'success');
      }
      break;
      
    case 'create':
      // Remove created drop
      ideas = ideas.filter(i => i.id !== entry.data.id);
      toast('Creation undone', 'success');
      break;
      
    case 'archive':
      // Restore from archive
      const dropA = ideas.find(i => i.id === entry.data.id);
      if (dropA) {
        dropA.lifecycle_state = 'active';
        delete dropA.archived_at;
        toast('Restored from archive', 'success');
      }
      break;
      
    case 'restore':
      // Re-archive
      const dropRe = ideas.find(i => i.id === entry.data.id);
      if (dropRe) {
        dropRe.lifecycle_state = 'archived';
        dropRe.archived_at = entry.data.archived_at || new Date().toISOString();
        toast('Archived again', 'success');
      }
      break;
  }
  
  // Remove from history
  undoHistory.splice(index, 1);
  localStorage.setItem('droplit_undo', JSON.stringify(undoHistory));
  
  save();
  render();
  counts();
  updateUndoList();
}

function updateUndoList() {
  const list = document.getElementById('undoList');
  const mainBtn = document.getElementById('undoMainBtn');
  const toggleBtn = document.getElementById('undoToggleBtn');
  const lastInfo = document.getElementById('undoLastInfo');
  
  if (undoHistory.length === 0) {
    mainBtn.disabled = true;
    mainBtn.innerHTML = '↶ Nothing to Undo';
    lastInfo.textContent = '';
    toggleBtn.style.display = 'none';
    list.innerHTML = '';
    list.classList.remove('show');
    return;
  }
  
  // Enable main button
  mainBtn.disabled = false;
  const lastEntry = undoHistory[0];
  const lastLabel = UNDO_LABELS[lastEntry.action] || 'Action';
  const lastPreview = getUndoPreview(lastEntry);
  mainBtn.innerHTML = `↶ Undo: ${lastLabel}`;
  
  // Show last action info
  lastInfo.textContent = `${lastPreview} • ${getTimeAgo(lastEntry.timestamp)}`;
  
  // Show toggle button if more than 1 item
  if (undoHistory.length > 1) {
    toggleBtn.style.display = 'block';
    toggleBtn.textContent = `Show all history (${undoHistory.length})`;
  } else {
    toggleBtn.style.display = 'none';
    list.classList.remove('show');
  }
  
  // Build list (hidden by default)
  list.innerHTML = undoHistory.slice(1).map((entry, index) => {
    const icon = UNDO_ICONS[entry.action] || '↶';
    const label = UNDO_LABELS[entry.action] || 'Action';
    const time = getTimeAgo(entry.timestamp);
    const preview = getUndoPreview(entry);
    
    return `
      <div class="undo-item">
        <div class="undo-item-icon">${icon}</div>
        <div class="undo-item-info">
          <div class="undo-item-title">${label}: ${preview}</div>
          <div class="undo-item-time">${time}</div>
        </div>
        <button class="pill-s pri" onclick="performUndo(${index + 1})">Undo</button>
      </div>
    `;
  }).join('');
}

function toggleUndoList() {
  const list = document.getElementById('undoList');
  const toggleBtn = document.getElementById('undoToggleBtn');
  const isShown = list.classList.toggle('show');
  toggleBtn.textContent = isShown 
    ? `Hide history (${undoHistory.length})` 
    : `Show all history (${undoHistory.length})`;
}

function undoLast() {
  if (undoHistory.length > 0) {
    performUndo(0);
  }
}

function getUndoPreview(entry) {
  switch (entry.action) {
    case 'delete':
    case 'archive':
    case 'restore':
      return truncateText(entry.data.text || 'Drop', 25);
    case 'createTasks':
      return `${entry.data.taskIds?.length || 0} tasks`;
    case 'replace':
    case 'edit':
      return truncateText(entry.data.previousText || entry.data.originalText || 'text', 25);
    case 'merge':
      return `${entry.data.count} drops`;
    case 'category':
      return `→ ${entry.data.newCategory}`;
    case 'create':
      return truncateText(entry.data.text || 'Drop', 25);
    default:
      return '';
  }
}

function truncateText(text, maxLen) {
  if (!text) return '';
  text = text.replace(/\n/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

// ============================================
// SEARCH
// ============================================

let searchMode = false;
let searchQuery = '';

function performSearch() {
  const query = document.getElementById('menuSearchInput').value.trim().toLowerCase();
  if (!query) {
    clearSearch();
    return;
  }
  
  searchMode = true;
  searchQuery = query;
  closeMainMenu();
  
  // Show search indicator
  document.getElementById('searchIndicator').style.display = 'flex';
  document.getElementById('searchQueryDisplay').textContent = query;
  
  // Filter ideas by search query
  render();
  
  const count = filtered().length;
  toast(`Found ${count} drop${count !== 1 ? 's' : ''}`, 'info');
}

function clearSearch() {
  searchMode = false;
  searchQuery = '';
  document.getElementById('menuSearchInput').value = '';
  document.getElementById('searchIndicator').style.display = 'none';
  render();
}

let voiceSearchRecognition = null;

function startVoiceSearch() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Voice search not supported', 'error');
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceSearchRecognition = new SpeechRecognition();
  voiceSearchRecognition.continuous = false;
  voiceSearchRecognition.interimResults = false;
  voiceSearchRecognition.lang = navigator.language || 'en-US';
  
  voiceSearchRecognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('menuSearchInput').value = transcript;
    performSearch();
  };
  
  voiceSearchRecognition.onerror = () => {
    toast('Voice search failed', 'error');
  };
  
  voiceSearchRecognition.start();
  toast('Listening...', 'info');
}

// ============================================
// FILTERS TOGGLE (Clean Screen)
// ============================================

function toggleFilters() {
  const isVisible = document.body.classList.toggle('filters-visible');
  localStorage.setItem('droplit_filters_visible', isVisible);
}

function initFiltersState() {
  // Default to hidden (clean screen)
  const savedState = localStorage.getItem('droplit_filters_visible');
  if (savedState === 'true') {
    document.body.classList.add('filters-visible');
  }
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================

function toggleVoiceMode() {
  const toggle = document.getElementById('voiceModeToggle');
  const isEnabled = toggle.classList.toggle('active');
  setVoiceMode(isEnabled);
  
  // Update chat UI
  updateVoiceModeUI();
  
  if (isEnabled) {
    toast('Voice Mode ON');
    acquireWakeLock(); // Keep screen on
    // Start in sleep mode - wait for user tap
    if (document.getElementById('askAIPanel')?.classList.contains('show')) {
      voiceModeSleeping = true;
      updateVoiceModeIndicator('sleeping');
    }
  } else {
    stopVoiceModeListening();
    releaseWakeLock(); // Allow screen to sleep
    toast('Voice Mode OFF');
    updateVoiceModeIndicator('');
  }
}

function toggleAutoSpeak() {
  const toggle = document.getElementById('autoSpeakToggle');
  const isEnabled = toggle.classList.toggle('active');
  setAutoSpeak(isEnabled);
}

// AutoDrop functions
function isAutoDropEnabled() {
  return localStorage.getItem('aski_autodrop') === 'true';
}

function setAutoDrop(enabled) {
  localStorage.setItem('aski_autodrop', enabled ? 'true' : 'false');
  toast(enabled ? 'AutoDrop enabled' : 'AutoDrop disabled');
}

function toggleAutoDrop() {
  const toggle = document.getElementById('autoDropToggle');
  const isEnabled = toggle.classList.toggle('active');
  setAutoDrop(isEnabled);
}

// Auto-save message as drop (for AutoDrop mode)
function autoSaveMessageAsDrop(text, isUser) {
  // Filter out service/error messages
  const servicePatterns = [
    'Connection error',
    'Please check your internet',
    'could not process your request',
    'Sorry, I could not',
    'No internet',
    'Failed to'
  ];
  
  if (servicePatterns.some(pattern => text.includes(pattern))) {
    console.log('AutoDrop: Skipping service message');
    return;
  }
  
  const convId = getConversationId();
  const msgIndex = getNextMessageIndex();
  
  const drop = {
    id: Date.now() + msgIndex, // Ensure unique ID
    text: text,
    category: 'inbox',
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('ru-RU'),
    time: new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
    isMedia: false,
    // AutoDrop metadata
    conversation_id: convId,
    message_index: msgIndex,
    role: isUser ? 'user' : 'assistant',
    source: 'autodrop'
  };
  
  ideas.unshift(drop);
  save(drop);
  render();
  counts();
  
  // Sync with Syntrise if enabled
  if (typeof syncDropToSyntrise === 'function') {
    syncDropToSyntrise(drop);
  }
  
  console.log(`AutoDrop saved: ${isUser ? 'user' : 'ai'} message #${msgIndex} in ${convId}`);
}

// Toggle AutoDrop from chat header
function toggleAutoDropFromChat() {
  const enabled = !isAutoDropEnabled();
  setAutoDrop(enabled);
  updateAutoDropIndicator();
  
  // Also update toggle in settings if visible
  const toggle = document.getElementById('autoDropToggle');
  if (toggle) {
    if (enabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }
}

// Update AutoDrop indicator in chat header
function updateAutoDropIndicator() {
  const indicator = document.getElementById('autoDropIndicator');
  if (!indicator) return;
  
  const enabled = isAutoDropEnabled();
  indicator.style.display = 'block';
  
  if (enabled) {
    indicator.classList.remove('off');
    indicator.textContent = 'AUTODROP';
  } else {
    indicator.classList.add('off');
    indicator.textContent = 'AUTODROP';
  }
}

// Get current conversation ID (creates new one if needed)
function getConversationId() {
  let convId = sessionStorage.getItem('current_conversation_id');
  if (!convId) {
    convId = 'conv_' + Date.now();
    sessionStorage.setItem('current_conversation_id', convId);
  }
  return convId;
}

// Get next message index in conversation
function getNextMessageIndex() {
  let idx = parseInt(sessionStorage.getItem('message_index') || '0');
  sessionStorage.setItem('message_index', (idx + 1).toString());
  return idx;
}

function initVoiceSettings() {
  // === ПЕРЕЧИТЫВАЕМ ВСЕ НАСТРОЙКИ ИЗ LOCALSTORAGE ===
  
  // TTS Provider
  ttsProvider = localStorage.getItem('tts_provider') || 'openai';
  
  // OpenAI настройки
  askiVoice = localStorage.getItem('aski_voice') || 'nova';
  askiApiKey = localStorage.getItem('openai_tts_key') || '';
  
  // ElevenLabs настройки
  elevenlabsApiKey = localStorage.getItem('elevenlabs_tts_key') || '';
  elevenlabsVoice = localStorage.getItem('elevenlabs_voice') || 'Bella';
  elevenlabsVoiceId = localStorage.getItem('elevenlabs_voice_id') || 'EXAVITQu4vr4xnSDxMaL';
  
  // === UI: TTS PROVIDER SELECTOR ===
  // Сначала убираем active со всех кнопок
  document.querySelectorAll('#ttsProviderSelector .pill-m').forEach(btn => {
    btn.classList.remove('active');
  });
  // Потом добавляем active к нужной
  const providerBtn = document.querySelector(`#ttsProviderSelector .pill-m[data-provider="${ttsProvider}"]`);
  if (providerBtn) {
    providerBtn.classList.add('active');
  }
  
  // === UI: ПОКАЗАТЬ/СКРЫТЬ БЛОКИ ГОЛОСОВ ===
  const openaiSettings = document.getElementById('openaiVoiceSettings');
  const elevenlabsSettings = document.getElementById('elevenlabsVoiceSettings');
  
  if (openaiSettings) {
    openaiSettings.style.display = (ttsProvider === 'openai') ? 'block' : 'none';
  }
  if (elevenlabsSettings) {
    elevenlabsSettings.style.display = (ttsProvider === 'elevenlabs') ? 'block' : 'none';
  }
  
  // === UI: OPENAI VOICE SELECTOR ===
  document.querySelectorAll('#voiceSelector .pill-m').forEach(btn => {
    btn.classList.remove('active');
  });
  const openaiVoiceBtn = document.querySelector(`#voiceSelector .pill-m[data-voice="${askiVoice}"]`);
  if (openaiVoiceBtn) {
    openaiVoiceBtn.classList.add('active');
  }
  
  // === UI: OPENAI API KEY ===
  const openaiInput = document.getElementById('openaiApiKeyInput');
  if (openaiInput) {
    openaiInput.value = askiApiKey;
    const status = document.getElementById('apiKeyStatus');
    if (status) {
      if (askiApiKey) {
        status.textContent = 'Key loaded';
        status.style.color = '#10B981';
      } else {
        status.textContent = 'Using browser voice';
        status.style.color = 'var(--color-text-muted)';
      }
    }
  }
  
  // === UI: ELEVENLABS VOICE SELECTOR ===
  document.querySelectorAll('#elevenlabsVoiceSelector .pill-m').forEach(btn => {
    btn.classList.remove('active');
  });
  const elVoiceBtn = document.querySelector(`#elevenlabsVoiceSelector .pill-m[data-voiceid="${elevenlabsVoiceId}"]`);
  if (elVoiceBtn) {
    elVoiceBtn.classList.add('active');
  }
  
  // === UI: ELEVENLABS API KEY ===
  const elevenlabsInput = document.getElementById('elevenlabsApiKeyInput');
  if (elevenlabsInput) {
    elevenlabsInput.value = elevenlabsApiKey;
    const status = document.getElementById('elevenlabsApiKeyStatus');
    if (status) {
      if (elevenlabsApiKey) {
        status.textContent = 'Key loaded';
        status.style.color = '#10B981';
      } else {
        status.textContent = '';
      }
    }
  }
  
  // === UI: TOGGLES ===
  const voiceModeToggle = document.getElementById('voiceModeToggle');
  if (voiceModeToggle) {
    voiceModeToggle.classList.toggle('active', isVoiceModeEnabled());
  }
  
  const autoSpeakToggle = document.getElementById('autoSpeakToggle');
  if (autoSpeakToggle) {
    autoSpeakToggle.classList.toggle('active', isAutoSpeakEnabled());
  }
  
  const autoDropToggle = document.getElementById('autoDropToggle');
  if (autoDropToggle) {
    autoDropToggle.classList.toggle('active', isAutoDropEnabled());
  }
  
  // === UI: LISTEN TIME ===
  const savedSeconds = localStorage.getItem('aski_listen_seconds') || '15';
  document.querySelectorAll('#listenCyclesSelector .pill-m').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cycles === savedSeconds);
  });
}

function initAutoSpeakToggle() {
  // Deprecated - use initVoiceSettings instead
  initVoiceSettings();
}

function toggleDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  const isDark = toggle.classList.toggle('active');
  document.body.classList.toggle('dark-mode', isDark);
  localStorage.setItem('droplit_darkmode', isDark);
}

function setFontSize(size) {
  // Remove all font size classes
  document.body.classList.remove('font-small', 'font-normal', 'font-large');
  // Add selected
  document.body.classList.add('font-' + size);
  
  // Update buttons (support both old and new selectors)
  document.querySelectorAll('#fontSizeSelector .pill-m, .font-size-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
  
  // Save preference
  localStorage.setItem('droplit_fontsize', size);
  
  // No toast - instant feedback via button state
}

function initFontSize() {
  const saved = localStorage.getItem('droplit_fontsize') || 'normal';
  document.body.classList.remove('font-small', 'font-normal', 'font-large');
  document.body.classList.add('font-' + saved);
  
  // Update buttons when initialized
  document.querySelectorAll('#fontSizeSelector .pill-m').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === saved);
  });
}

function exportData() {
  const data = {
    version: '0.8.2',
    exported: new Date().toISOString(),
    ideas: ideas
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `droplit-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  toast('Data exported!', 'success');
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.ideas && Array.isArray(data.ideas)) {
        if (confirm(`Import ${data.ideas.length} drops? This will add to existing data.`)) {
          ideas = ideas.concat(data.ideas);
          save();
          render();
          counts();
          toast(`Imported ${data.ideas.length} drops! ✓`, 'success');
        }
      } else {
        toast('Invalid backup file', 'error');
      }
    } catch (err) {
      toast('Failed to parse file', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAllData() {
  if (confirm('Delete ALL drops? This cannot be undone!')) {
    if (confirm('Are you REALLY sure? All data will be lost!')) {
      ideas = [];
      undoHistory = [];
      save();
      localStorage.removeItem('droplit_undo');
      render();
      counts();
      updateUndoList();
      toast('All data cleared', 'success');
    }
  }
}

// Initialize undo UI on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => updateUndoList(), 100);
});


// ============================================
// EXPORTS
// ============================================
window.DropLitSettings = {
  openSettings,
  closeSettings,
  openMainMenu,
  closeMainMenu,
  toggleMainMenu,
  toggleDarkMode,
  setFontSize,
  initFontSize,
  initVoiceSettings,
  exportData,
  handleImportFile,
  clearAllData,
  showDebugInfo,
  addToUndo,
  undoAction
};
