// ============================================
// DROPLIT AUTH v1.0
// Supabase authentication and sync
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
    
    // v1.2: ALWAYS refresh token on init — cached expires_at can be stale
    // refreshSession() is cheap and idempotent
    if (session) {
      console.log('🔄 Refreshing JWT token...');
      try {
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
        if (refreshError) {
          console.warn('⚠️ Token refresh failed:', refreshError.message, '— will re-login');
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
    
    // If session exists but NOT our test user - sign out first
    const TEST_USER_ID = '10531fa2-b07e-41db-bc41-f6bd955beb26';
    
    if (session && session.user.id !== TEST_USER_ID) {
      console.log('🔄 Wrong user, signing out...', session.user.id.substring(0, 8));
      await supabaseClient.auth.signOut();
      await signInWithTestAccount();
    } else if (session && session.user.id === TEST_USER_ID) {
      currentUser = session.user;
      if (typeof toast === 'function') toast('✅ User: ' + currentUser.id.substring(0, 8) + '...', 'success');
      console.log('✅ Correct session found:', currentUser.id.substring(0, 8) + '...');
      await pullFromServer();
      updateSyncUI('synced', 'Synced');
    } else {
      // No session - sign in
      await signInWithTestAccount();
    }
    
    // NO AUTH LISTENER - disabled to stop loop
    // Auth state will be checked manually when needed
    console.log('✅ Auth initialized - NO listener (disabled to stop loop)');
    
    return true;
  } catch (error) {
    console.error('❌ Supabase init error:', error);
    updateSyncUI('error', 'Error');
    return false;
  }
}

// ============================================
// SIGN IN WITH TEST ACCOUNT
// ============================================
async function signInWithTestAccount() {
  try {
    updateSyncUI('syncing', 'Connecting...');
    if (typeof toast === 'function') toast('🔐 Logging in...', 'info');
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: 'test2@syntrise.com',
      password: '12345'
    });
    
    if (error) {
      if (typeof toast === 'function') toast('❌ Login error: ' + error.message, 'error');
      throw error;
    }
    
    currentUser = data.user;
    if (typeof toast === 'function') toast('✅ Logged in: ' + currentUser.id.substring(0, 8) + '...', 'success');
    console.log('✅ Signed in as:', currentUser.email, currentUser.id.substring(0, 8) + '...');
    
    // Check if first time - migrate local data
    const migrated = localStorage.getItem('droplit_migrated_' + currentUser.id);
    if (!migrated && typeof ideas !== 'undefined' && ideas.length > 0) {
      await migrateLocalData();
    } else {
      // Sync from server
      await pullFromServer();
    }
    
    updateSyncUI('synced', 'Synced');
    return true;
  } catch (error) {
    console.error('❌ Sign in error:', error);
    if (typeof toast === 'function') toast('❌ Auth failed: ' + error.message, 'error');
    updateSyncUI('error', 'Auth error');
    return false;
  }
}

// ============================================
// ANONYMOUS SIGN IN (BACKUP)
// ============================================
async function signInAnonymously() {
  try {
    updateSyncUI('syncing', 'Connecting...');
    
    const { data, error } = await supabaseClient.auth.signInAnonymously();
    
    if (error) throw error;
    
    currentUser = data.user;
    console.log('✅ Signed in anonymously:', currentUser.id.substring(0, 8) + '...');
    
    // Check if first time - migrate local data
    const migrated = localStorage.getItem('droplit_migrated_' + currentUser.id);
    if (!migrated && typeof ideas !== 'undefined' && ideas.length > 0) {
      await migrateLocalData();
    } else {
      // Sync from server
      await pullFromServer();
    }
    
    updateSyncUI('synced', 'Synced');
    return true;
  } catch (error) {
    console.error('❌ Anonymous sign in error:', error);
    updateSyncUI('error', 'Auth error');
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
    // Filter only text drops (skip media for MVP)
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
      // Insert in batches of 50
      for (let i = 0; i < dropsToInsert.length; i += 50) {
        const batch = dropsToInsert.slice(i, i + 50);
        const { error } = await supabaseClient
          .from('drops')
          .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
        
        if (error) {
          console.error('Migration batch error:', error);
        }
      }
    }
    
    // Log migration
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
    const { data, error } = await supabaseClient
      .from('drops')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      console.log(`📥 Pulled ${data.length} drops from server`);
      // Merge with local (server wins for now)
      // TODO: proper conflict resolution
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
  
  // Skip media drops for MVP
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
    if (typeof toast === 'function') toast('Not connected to cloud', 'warning');
    initSupabase();
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
  
  if (lastSyncTime) {
    el.textContent = 'Last sync: ' + lastSyncTime.toLocaleTimeString();
  } else {
    el.textContent = 'Last sync: —';
  }
}

function updateSyncUI(status, text) {
  // Update lastSyncInfo if synced
  if (status === 'synced') {
    lastSyncTime = new Date();
    updateLastSyncInfo();
  }
}

// ============================================
// INITIALIZE ON LOAD
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initSupabase, 500); // Delay to ensure SDK loaded
});

// ============================================
// EXPORTS
// ============================================
window.DropLitAuth = {
  initSupabase,
  signInWithTestAccount,
  signInAnonymously,
  syncDropToServer,
  deleteDropFromServer,
  manualSync,
  pullFromServer,
  getSupabase: () => supabaseClient,
  getCurrentUser: () => currentUser,
  getDeviceId: () => DEVICE_ID,
  isAuthenticated: () => !!currentUser
};
