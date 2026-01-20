// ============================================
// DROPLIT UTILS v1.0
// Constants and helper functions
// ============================================

// Categories configuration
const CATS = {
  command: { name: 'COMMANDS', single: 'CMD', kw: ['reminder', 'alarm', 'напоминание', 'будильник', 'напомни', 'разбуди'], isMedia: false },
  tasks: { name: 'TASKS', single: 'TASK', kw: ['task', 'tasks', 'todo', 'задача', 'задачи', 'сделать', 'нужно', 'надо'], isMedia: false },
  ideas: { name: 'IDEAS', single: 'IDEA', kw: ['idea', 'ideas', 'идея', 'идеи', 'мысль', 'придумал'], isMedia: false },
  handmagic: { name: 'HANDMAGIC', single: 'HANDMAGIC', kw: ['handmagic', 'хендмеджик', 'магия', 'ручная магия'], isMedia: false },
  design: { name: 'DESIGN', single: 'DESIGN', kw: ['design', 'дизайн', 'ui', 'ux', 'кнопка', 'цвет', 'интерфейс'], isMedia: false },
  bugs: { name: 'BUGS', single: 'BUG', kw: ['bug', 'bugs', 'fix', 'баг', 'баги', 'ошибка', 'ошибки', 'исправить'], isMedia: false },
  questions: { name: 'QUESTIONS', single: 'QUESTION', kw: ['question', 'questions', 'вопрос', 'вопросы', 'спросить', 'claude', 'клод'], isMedia: false },
  link: { name: 'LINKS', single: 'LINK', kw: ['link', 'url', 'http', 'https', 'www', 'ссылка'], isMedia: false },
  chart: { name: 'CHARTS', single: 'CHART', kw: ['chart', 'graph', 'график', 'диаграмма', 'визуализация'], isMedia: true, isChart: true },
  sketch: { name: 'SKETCHES', single: 'SKETCH', kw: [], isMedia: true },
  scan: { name: 'SCANS', single: 'SCAN', kw: [], isMedia: true },
  photo: { name: 'PHOTOS', single: 'PHOTO', kw: [], isMedia: true },
  audio: { name: 'AUDIO', single: 'AUDIO', kw: [], isMedia: true, isAudio: true },
  inbox: { name: 'INBOX', single: 'INBOX', kw: [], isMedia: false }
};

const MEDIA_CATS = ['photo', 'sketch', 'scan', 'audio', 'chart'];

// Markers system
const MARKERS = {
  heart: '❤️',
  star: '⭐',
  fire: '🔥',
  done: '✅',
  trash: '💩',
  think: '🤔'
};

// Currently enabled markers (MVP = only heart)
const ENABLED_MARKERS = ['heart'];

// ============================================
// ID GENERATOR (Base62: 16 random characters)
// ============================================
const BASE62_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateId(length = 16) {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, byte => BASE62_CHARS[byte % 62]).join('');
}

// ============================================
// DATE HELPERS
// ============================================
function parseD(s) {
  if (!s || typeof s !== 'string') return new Date(0);
  const parts = s.split('.');
  if (parts.length !== 3) return new Date(0);
  const [d, m, y] = parts.map(Number);
  return new Date(y, m - 1, d);
}

function inDays(s, n) {
  if (!s) return false;
  try {
    return (new Date() - parseD(s)) / (864e5) <= n;
  } catch (e) {
    return false;
  }
}

function isToday(s) {
  if (!s) return false;
  return s === new Date().toLocaleDateString('ru-RU');
}

// ============================================
// HTML ESCAPE (XSS prevention)
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// EXPORTS (for future module use)
// ============================================
// These are already global, but we can namespace them
window.DropLitUtils = {
  CATS,
  MEDIA_CATS,
  MARKERS,
  ENABLED_MARKERS,
  generateId,
  parseD,
  inDays,
  isToday,
  escapeHtml
};
