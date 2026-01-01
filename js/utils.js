// ============================================
// DROPLIT UTILS - v0.9.59
// ============================================

// Generate unique ID
function generateId(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Parse date string to Date object
function parseD(s) {
  if (!s) return new Date(0);
  const p = s.split('.');
  if (p.length === 3) {
    return new Date(p[2], p[1] - 1, p[0]);
  }
  return new Date(s);
}

// Check if date is within N days
function inDays(s, n) {
  const d = parseD(s);
  const now = new Date();
  const diff = (now - d) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= n;
}

// Check if date is today
function isToday(s) {
  const d = parseD(s);
  const now = new Date();
  return d.getDate() === now.getDate() && 
         d.getMonth() === now.getMonth() && 
         d.getFullYear() === now.getFullYear();
}

// Format time for display
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Format date for display
function formatDate(date) {
  return date.toLocaleDateString('ru-RU');
}

// Toast notification
function toast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = message;
  document.body.appendChild(t);
  
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

// Update network banner
function updateNet() {
  const banner = document.getElementById('netBanner');
  if (banner) {
    banner.classList.toggle('show', !navigator.onLine);
  }
}

// Scroll functions
function scrollToTop() {
  if (ideasWrap) {
    ideasWrap.scrollTo({ top: 0, behavior: 'smooth' });
    if (scrollTopBtn) scrollTopBtn.classList.remove('show');
  }
}

function scrollToBottom() {
  if (ideasWrap) {
    ideasWrap.scrollTo({ top: ideasWrap.scrollHeight, behavior: 'smooth' });
    if (scrollBottomBtn) scrollBottomBtn.classList.remove('show');
  }
}

function scrollToBottomInstant() {
  if (ideasWrap) {
    ideasWrap.scrollTo({ top: ideasWrap.scrollHeight, behavior: 'instant' });
  }
}

// Play drop sound
function playDropSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc2.frequency.setValueAtTime(1320, ctx.currentTime);
    
    osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(2640, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.2);
    
    setTimeout(() => ctx.close(), 300);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// Wake lock for recording
async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');
    } catch (e) {
      console.warn('Wake lock failed:', e);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
    console.log('Wake lock released');
  }
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Truncate text
function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

console.log('Utils loaded');
