// ============================================
// DROPLIT APP - v0.9.59
// Main initialization
// ============================================

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Initialize app when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DropLit v0.9.59 initializing...');
  
  // Initialize DOM references
  ideasWrap = document.getElementById('ideasWrap');
  scrollTopBtn = document.getElementById('scrollTopBtn');
  scrollBottomBtn = document.getElementById('scrollBottomBtn');
  
  // Initialize modals
  initModals();
  
  // Initialize filters
  initTimeFilter();
  initCatFilter();
  
  // Initialize scroll buttons
  initScrollButtons();
  
  // Initialize speech recognition
  initSR();
  
  // Initialize font size
  initFontSize();
  
  // Initialize dark mode
  if (localStorage.getItem('droplit_darkmode') === 'true') {
    document.body.classList.add('dark-mode');
  }
  
  // Initialize auto-speak
  const autoSpeakBtn = document.getElementById('autoSpeakBtn');
  if (autoSpeakBtn) {
    autoSpeakBtn.classList.toggle('active', isAutoSpeakEnabled());
  }
  
  // Initialize AutoDrop indicator
  updateAutoDropIndicator();
  
  // Network status
  updateNet();
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  
  // Initialize Supabase (delayed)
  setTimeout(initSupabase, 500);
  
  // Render initial list
  render();
  counts();
  
  console.log('DropLit v0.9.59 ready!');
});

// Handle visibility change (for wake lock)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseWakeLock();
  }
});

// Handle photo input
document.getElementById('cameraInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target.result;
    savePhoto(dataUrl);
  };
  reader.readAsDataURL(file);
  
  e.target.value = '';
});

// Save photo as drop
function savePhoto(dataUrl) {
  const now = new Date();
  
  const newIdea = {
    id: Date.now(),
    text: 'Photo',
    category: 'photo',
    date: formatDate(now),
    time: formatTime(now),
    timestamp: now.toISOString(),
    image: dataUrl,
    isMedia: true
  };
  
  ideas.unshift(newIdea);
  save(newIdea);
  
  playDropSound();
  render();
  counts();
  
  toast('Photo saved!', 'success');
}

// Voice search (placeholder)
function startVoiceSearch() {
  toast('Voice search coming soon', 'info');
}

// Export data
function exportData() {
  const data = JSON.stringify(ideas, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'droplit-backup-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  
  URL.revokeObjectURL(url);
  toast('Data exported!', 'success');
}

// Clear all data
function clearAllData() {
  if (!confirm('Delete ALL drops? This cannot be undone!')) return;
  
  ideas = [];
  localStorage.removeItem('droplit_ideas');
  
  render();
  counts();
  toast('All data cleared', 'success');
}

// Legacy Syntrise functions (stubs)
async function getSyntriseContext(query) {
  return [];
}

async function syncDropToCore(drop) {
  return true;
}

console.log('App module loaded');
