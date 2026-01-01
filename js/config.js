// ============================================
// DROPLIT CONFIG - v0.9.59
// ============================================

// API Endpoints
const AI_API_URL = '/api/ai';

// Supabase Configuration
const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';

// Test User
const TEST_USER_EMAIL = 'test2@syntrise.com';
const TEST_USER_PASSWORD = '12345';
const TEST_USER_ID = '10531fa2-b07e-41db-bc41-f6bd955beb26';

// Feature Flags
const STREAMING_ENABLED = true;
const SYNTRISE_CONFIG = { ENABLED: false };

// Device ID
const DEVICE_ID = localStorage.getItem('droplit_device_id') || (() => {
  const id = 'dev_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('droplit_device_id', id);
  return id;
})();

// Categories with colors
const CATEGORIES = {
  tasks: { bg: '#FEF3C7', text: '#92400E' },
  ideas: { bg: '#E0E7FF', text: '#3730A3' },
  handmagic: { bg: '#FCE7F3', text: '#9D174D' },
  design: { bg: '#D1FAE5', text: '#065F46' },
  bugs: { bg: '#FEE2E2', text: '#991B1B' },
  questions: { bg: '#E0F2FE', text: '#075985' },
  inbox: { bg: '#F5F5F4', text: '#57534E' },
  audio: { bg: '#FEF9C3', text: '#854D0E' },
  photo: { bg: '#F3E8FF', text: '#7C3AED' },
  sketch: { bg: '#FEE2E2', text: '#DC2626' },
  scan: { bg: '#DBEAFE', text: '#1D4ED8' }
};

// Marker definitions
const MARKERS = {
  fire: { icon: '1', label: 'Priority', color: '#EF4444' },
  star: { icon: '2', label: 'Favorite', color: '#F59E0B' },
  check: { icon: '3', label: 'Done', color: '#10B981' },
  pin: { icon: '4', label: 'Pinned', color: '#8B5CF6' }
};

console.log('Config loaded. Device:', DEVICE_ID);
