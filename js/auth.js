// ============================================
// DROPLIT AUTH v2.0
// Supabase authentication with OAuth support
// ============================================

// ============================================
// SUPABASE CONFIG
// ============================================
const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';

let supabaseClient = null;
let currentUser = null;
let syncEnabled = true;
let isSyncing = false;
let lastSyncTime = null;

// Device ID for tracking
const DEVICE_ID = localStorage.getItem('droplit_device_id') || (() => {
  const id = 'dev_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('droplit_device_id', id);
  return id;
})();

console.log('📱 Device ID:', DEVICE_ID);

// ============================================
// INITIALIZE SUPABASE
// ============================================
async function initSupabase() {
  try {
    if (typeof window.supabase === 'undefined') {
      console.log('⚠️ Supabase SDK not loaded');
      updateSyncUI('offline', 'No SDK');
      return false;
    }
    
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client initialized');
    
    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session && session.user) {
      currentUser = session.user;
      console.log('✅ Session found:', currentUser.email || currentUser.id.substring(0, 8) + '...');
      updateSyncUI('synced', 'Connected');
      
      // Pull data in background
      pullFromServer();
      
    } else {
      // No session - DON'T auto-login!
      // Let onboarding.js handle showing the modal
      console.log('ℹ️ No session - waiting for user to sign in');
      updateSyncUI('offline', 'Not signed in');
    }
    
    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state:', event);
      
      if (event === 'SIGNED_IN' && session?.user) {
        currentUser = session.user;
        console.log('✅ Signed in:', currentUser.email || currentUser.id.substring(0, 8));
        updateSyncUI('synced', 'Connected');
        pullFromServer();
        
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        console.log('👋 Signed out');
        updateSyncUI('offline', 'Not signed in');
      }
      
      // Update account UI if function exists
      if (typeof updateAccountUI === 'function') {
        updateAccountUI();
      }
    });
    
    return true;
  } catch (error) {
    console.error('❌ Supabase init error:', error);
    updateSyncUI('error', 'Error');
    return false;
  }
}

// ============================================
// SIGN OUT
// ============================================
async function signOut() {
  if (!supabaseClient) return false;
  
  try {
    await supabaseClient.auth.signOut();
    currentUser = null;
    console.log('👋 Signed out');
    return true;
  } catch (error) {
    console.error('❌ Sign out error:', error);
    return false;
  }
}

// ============================================
// PULL DROPS FROM SERVER
// ============================================
async function pullFromServer() {
  if (!currentUser || !supabaseClient) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('drops')
      .select('*')
      .eq('user_id', currentUser.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      console.log(`📥 Pulled ${data.length} drops from server`);
    }
    
    lastSyncTime = new Date();
    
  } catch (error) {
    console.error('❌ Pull error:', error);
  }
}

// ============================================
// SYNC SINGLE DROP TO SERVER
// ============================================
async function syncDropToServer(idea, action = 'create') {
  if (!syncEnabled || !currentUser || !supabaseClient) {
    console.log('⏸️ Sync disabled or not connected');
    return false;
  }
  
  // Skip media drops for MVP (unless they have encrypted content)
  if ((idea.isMedia || idea.image || idea.audioData) && !idea.encrypted) {
    console.log('⏸️ Skipping unencrypted media drop sync');
    return true;
  }
  
  try {
    updateSyncUI('syncing', 'Saving...');
    
    // Prepare drop data for Supabase
    let dropData = {
      user_id: currentUser.id,
      external_id: String(idea.id),
      content: idea.text || '',
      category: idea.category || 'inbox',
      tags: idea.tags || [],
      markers: idea.markers || [],
      source: 'droplit',
      language: 'ru',
      is_media: !!(idea.isMedia || idea.image || idea.audioData),
      has_local_media: !!(idea.image || idea.audioData),
      is_merged: idea.isMerged || false,
      ai_generated: idea.aiGenerated || false,
      transcription: idea.transcription || null,
      original_text: idea.originalText || null,
      notes: idea.notes || null,
      local_id: String(idea.id),
      device_id: DEVICE_ID,
      metadata: {
        date: idea.date,
        time: idea.time,
        timestamp: idea.timestamp,
        encrypted: idea.encrypted || false
      }
    };
    
    // If privacy system is active, encrypt before sync
    if (window.DROPLIT_PRIVACY_ENABLED && typeof window.DropLitEncryptedSync !== 'undefined') {
      try {
        dropData = await window.DropLitEncryptedSync.prepareDropForSync(idea);
        console.log('🔐 Drop encrypted for sync');
      } catch (encErr) {
        console.warn('⚠️ Encryption failed, syncing unencrypted:', encErr);
      }
    }
    
    console.log('📤 Syncing drop:', dropData.external_id);
    
    const { error, data } = await supabaseClient
      .from('drops')
      .upsert(dropData, { 
        onConflict: 'external_id',
        ignoreDuplicates: false 
      })
      .select();
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log(`☁️ Synced drop ${String(idea.id).substring(0, 8)}... (${action})`);
    updateSyncUI('synced', 'Synced');
    lastSyncTime = new Date();
    
    return true;
  } catch (error) {
    console.error('❌ Sync error:', error);
    updateSyncUI('error', 'Sync failed');
    return false;
  }
}

// ============================================
// DELETE DROP FROM SERVER
// ============================================
async function deleteDropFromServer(ideaId) {
  if (!syncEnabled || !currentUser || !supabaseClient) return false;
  
  try {
    updateSyncUI('syncing', 'Deleting...');
    
    const { error } = await supabaseClient
      .from('drops')
      .delete()
      .eq('external_id', String(ideaId))
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    
    console.log(`🗑️ Deleted drop ${String(ideaId).substring(0, 8)}...`);
    updateSyncUI('synced', 'Synced');
    
    return true;
  } catch (error) {
    console.error('❌ Delete sync error:', error);
    updateSyncUI('error', 'Delete failed');
    return false;
  }
}

// ============================================
// MANUAL SYNC
// ============================================
async function manualSync() {
  if (isSyncing) return;
  
  if (!currentUser) {
    if (typeof toast === 'function') toast('Not signed in', 'warning');
    return;
  }
  
  isSyncing = true;
  if (typeof toast === 'function') toast('Syncing...', 'info');
  
  try {
    // Sync all local text drops
    const textDrops = (typeof ideas !== 'undefined' ? ideas : []).filter(i => !i.isMedia && !i.image && !i.audioData);
    let synced = 0;
    
    for (const idea of textDrops) {
      const success = await syncDropToServer(idea, 'sync');
      if (success) synced++;
    }
    
    lastSyncTime = new Date();
    updateLastSyncInfo();
    if (typeof toast === 'function') toast(`Synced ${synced} drops`, 'success');
    
  } catch (error) {
    console.error('❌ Manual sync error:', error);
    if (typeof toast === 'function') toast('Sync failed', 'error');
  }
  
  isSyncing = false;
}

// ============================================
// UI HELPERS
// ============================================
function updateLastSyncInfo() {
  const el = document.getElementById('lastSyncInfo');
  if (!el) return;
  
  if (lastSyncTime) {
    el.textContent = 'Last sync: ' + lastSyncTime.toLocaleTimeString();
  } else {
    el.textContent = 'Last sync: —';
  }
}

function updateSyncUI(status, text) {
  if (status === 'synced') {
    lastSyncTime = new Date();
    updateLastSyncInfo();
  }
}

// ============================================
// INITIALIZE ON LOAD
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initSupabase, 300);
});

// ============================================
// EXPORTS
// ============================================
window.DropLitAuth = {
  initSupabase,
  signOut,
  syncDropToServer,
  deleteDropFromServer,
  manualSync,
  pullFromServer,
  getSupabase: () => supabaseClient,
  getCurrentUser: () => currentUser,
  getDeviceId: () => DEVICE_ID,
  isAuthenticated: () => !!currentUser
};

// Also expose currentUser globally
window.currentUser = currentUser;

// Keep currentUser in sync
Object.defineProperty(window, 'currentUser', {
  get: () => currentUser,
  set: (val) => { currentUser = val; }
});
