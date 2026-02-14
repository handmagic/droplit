// ============================================
// DROPLIT AUTH v2.0
// Supabase authentication and sync
// No forced login — works with onboarding.js
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
let syncQueue = [];
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
    
    // Use global client if exists, otherwise create
    if (!window._supabaseClient) {
      window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase client initialized (auth.js)');
    } else {
      console.log('✅ Using existing Supabase client');
    }
    supabaseClient = window._supabaseClient;
    
    // Check for existing session
    let { data: { session } } = await supabaseClient.auth.getSession();
    
    // Refresh token if session exists
    if (session) {
      console.log('🔄 Refreshing JWT token...');
      try {
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
        if (refreshError) {
          console.warn('⚠️ Token refresh failed:', refreshError.message);
          session = null;
        } else if (refreshData?.session) {
          session = refreshData.session;
          console.log('✅ Token refreshed, expires:', new Date(session.expires_at * 1000).toLocaleTimeString());
        }
      } catch (e) {
        console.warn('⚠️ Token refresh error:', e.message);
        session = null;
      }
    }
    
    if (session) {
      // Session exists — user already authenticated
      currentUser = session.user;
      console.log('✅ Session found:', currentUser.email, currentUser.id.substring(0, 8) + '...');
      if (typeof toast === 'function') toast('✅ Welcome back, ' + (currentUser.email || 'user'), 'success');
      await pullFromServer();
      updateSyncUI('synced', 'Synced');
    } else {
      // No session — onboarding.js will handle login
      console.log('ℹ️ No session — waiting for onboarding to authenticate user');
      updateSyncUI('offline', 'Not signed in');
    }
    
    console.log('✅ Auth initialized');
    return true;
    
  } catch (error) {
    console.error('❌ Supabase init error:', error);
    updateSyncUI('error', 'Error');
    return false;
  }
}

// ============================================
// MIGRATE LOCAL DATA TO SUPABASE
// ============================================
async function migrateLocalData() {
  if (!currentUser || typeof ideas === 'undefined' || ideas.length === 0) return;
  
  updateSyncUI('syncing', 'Migrating...');
  console.log(`📦 Migrating ${ideas.length} drops to Supabase...`);
  
  try {
    const textDrops = ideas.filter(i => !i.isMedia && !i.image && !i.audioData);
    
    const dropsToInsert = textDrops.map(idea => ({
      user_id: currentUser.id,
      external_id: String(idea.id),
      content: idea.text || '',
      category: idea.category || 'inbox',
      tags: idea.tags || [],
      markers: idea.markers || [],
      source: 'droplit',
      language: 'ru',
      is_media: false,
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
        timestamp: idea.timestamp
      }
    }));
    
    if (dropsToInsert.length > 0) {
      for (let i = 0; i < dropsToInsert.length; i += 50) {
        const batch = dropsToInsert.slice(i, i + 50);
        const { error } = await supabaseClient
          .from('drops')
          .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
        if (error) console.error('Migration batch error:', error);
      }
    }
    
    await supabaseClient.from('sync_log').insert({
      user_id: currentUser.id,
      action: 'migrate',
      device_id: DEVICE_ID,
      details: { count: dropsToInsert.length, total_local: ideas.length }
    });
    
    localStorage.setItem('droplit_migrated_' + currentUser.id, 'true');
    console.log(`✅ Migrated ${dropsToInsert.length} text drops`);
    updateSyncUI('synced', 'Migrated!');
    if (typeof toast === 'function') toast(`Synced ${dropsToInsert.length} drops to cloud!`, 'success');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    updateSyncUI('error', 'Migration failed');
  }
}

// ============================================
// PULL DROPS FROM SERVER
// ============================================
async function pullFromServer() {
  if (!currentUser) return;
  
  try {
    const { count, error } = await supabaseClient
      .from('drops')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    if (count > 0) console.log(`📥 Server has ${count} drops (sync check only)`);
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
  
  if (idea.isMedia || idea.image || idea.audioData) {
    console.log('⏸️ Skipping media drop sync (MVP)');
    return true;
  }
  
  try {
    updateSyncUI('syncing', 'Saving...');
    
    const dropData = {
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
        timestamp: idea.timestamp
      }
    };
    
    const { error } = await supabaseClient
      .from('drops')
      .upsert(dropData, { onConflict: 'external_id', ignoreDuplicates: false })
      .select();
    
    if (error) throw error;
    
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
    if (typeof toast === 'function') toast('Not connected to cloud', 'warning');
    return;
  }
  
  isSyncing = true;
  if (typeof toast === 'function') toast('Syncing...', 'info');
  
  try {
    const textDrops = (typeof ideas !== 'undefined' ? ideas : []).filter(i => !i.isMedia && !i.image && !i.audioData);
    let synced = 0;
    
    for (const idea of textDrops) {
      const success = await syncDropToServer(idea, 'sync');
      if (success) synced++;
    }
    
    lastSyncTime = new Date();
    updateLastSyncInfo();
    if (typeof toast === 'function') toast(`Synced ${synced} drops to cloud`, 'success');
  } catch (error) {
    console.error('❌ Manual sync error:', error);
    if (typeof toast === 'function') toast('Sync failed: ' + error.message, 'error');
  }
  
  isSyncing = false;
}

// ============================================
// UI HELPERS
// ============================================
function updateLastSyncInfo() {
  const el = document.getElementById('lastSyncInfo');
  if (!el) return;
  el.textContent = lastSyncTime ? 'Last sync: ' + lastSyncTime.toLocaleTimeString() : 'Last sync: —';
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
  syncDropToServer,
  deleteDropFromServer,
  manualSync,
  pullFromServer,
  getSupabase: () => supabaseClient,
  getCurrentUser: () => currentUser,
  getDeviceId: () => DEVICE_ID,
  isAuthenticated: () => !!currentUser
};
