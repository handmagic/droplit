// ============================================
// DROPLIT SYNC - v0.9.59
// Supabase synchronization
// ============================================

// Initialize Supabase client
async function initSupabase() {
  try {
    if (typeof window.supabase === 'undefined') {
      console.log('Supabase SDK not loaded');
      updateSyncUI('offline', 'No SDK');
      return false;
    }
    
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized');
    
    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session && session.user.id !== TEST_USER_ID) {
      console.log('Wrong user, signing out...');
      await supabaseClient.auth.signOut();
      await signInWithTestAccount();
    } else if (session && session.user.id === TEST_USER_ID) {
      currentUser = session.user;
      toast('Connected: ' + currentUser.id.substring(0, 8) + '...', 'success');
      await pullFromServer();
      updateSyncUI('synced', 'Synced');
    } else {
      await signInWithTestAccount();
    }
    
    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        currentUser = session.user;
        console.log('Auth state changed:', event);
      }
    });
    
    return true;
  } catch (error) {
    console.error('Supabase init error:', error);
    updateSyncUI('error', 'Error');
    return false;
  }
}

// Sign in with test account
async function signInWithTestAccount() {
  try {
    updateSyncUI('syncing', 'Connecting...');
    toast('Logging in...', 'info');
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });
    
    if (error) {
      toast('Login error: ' + error.message, 'error');
      throw error;
    }
    
    currentUser = data.user;
    toast('Logged in: ' + currentUser.id.substring(0, 8) + '...', 'success');
    
    const migrated = localStorage.getItem('droplit_migrated_' + currentUser.id);
    if (!migrated && ideas.length > 0) {
      await migrateLocalData();
    } else {
      await pullFromServer();
    }
    
    updateSyncUI('synced', 'Synced');
    return true;
  } catch (error) {
    console.error('Sign in error:', error);
    toast('Auth failed: ' + error.message, 'error');
    updateSyncUI('error', 'Auth error');
    return false;
  }
}

// Migrate local data to Supabase
async function migrateLocalData() {
  if (!currentUser || ideas.length === 0) return;
  
  updateSyncUI('syncing', 'Migrating...');
  console.log('Migrating ' + ideas.length + ' drops to Supabase...');
  
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
      is_archived: idea.is_archived || false,
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
    
    localStorage.setItem('droplit_migrated_' + currentUser.id, 'true');
    console.log('Migrated ' + dropsToInsert.length + ' text drops');
    
    updateSyncUI('synced', 'Migrated!');
    toast('Synced ' + dropsToInsert.length + ' drops to cloud!', 'success');
    
  } catch (error) {
    console.error('Migration error:', error);
    updateSyncUI('error', 'Migration failed');
  }
}

// Pull drops from server
async function pullFromServer() {
  if (!currentUser) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('drops')
      .select('*')
      .eq('user_id', currentUser.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      console.log('Pulled ' + data.length + ' drops from server');
    }
    
    lastSyncTime = new Date();
    
  } catch (error) {
    console.error('Pull error:', error);
  }
}

// Sync single drop to server
async function syncDropToServer(idea, action = 'create') {
  if (!syncEnabled || !currentUser || !supabaseClient) {
    console.log('Sync disabled or not connected');
    return false;
  }
  
  if (idea.isMedia || idea.image || idea.audioData) {
    console.log('Skipping media drop sync');
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
      is_archived: idea.is_archived || false,
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
    
    console.log('Synced drop ' + String(idea.id).substring(0, 8) + '...');
    updateSyncUI('synced', 'Synced');
    lastSyncTime = new Date();
    
    return true;
  } catch (error) {
    console.error('Sync error:', error);
    updateSyncUI('error', 'Sync failed');
    return false;
  }
}

// Delete drop from server
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
    
    console.log('Deleted drop ' + String(ideaId).substring(0, 8) + '...');
    updateSyncUI('synced', 'Synced');
    
    return true;
  } catch (error) {
    console.error('Delete sync error:', error);
    updateSyncUI('error', 'Delete failed');
    return false;
  }
}

// Manual sync
async function manualSync() {
  if (isSyncing) return;
  
  if (!currentUser) {
    toast('Not connected to cloud', 'warning');
    initSupabase();
    return;
  }
  
  isSyncing = true;
  toast('Syncing...', 'info');
  
  try {
    const textDrops = ideas.filter(i => !i.isMedia && !i.image && !i.audioData);
    let synced = 0;
    
    for (const idea of textDrops) {
      const success = await syncDropToServer(idea, 'sync');
      if (success) synced++;
    }
    
    lastSyncTime = new Date();
    updateLastSyncInfo();
    toast('Synced ' + synced + ' drops to cloud', 'success');
    
  } catch (error) {
    console.error('Manual sync error:', error);
    toast('Sync failed: ' + error.message, 'error');
  }
  
  isSyncing = false;
}

// Update last sync info
function updateLastSyncInfo() {
  const el = document.getElementById('lastSyncInfo');
  if (!el) return;
  
  if (lastSyncTime) {
    el.textContent = 'Last sync: ' + lastSyncTime.toLocaleTimeString();
  } else {
    el.textContent = 'Last sync: -';
  }
}

// Update sync UI indicator
function updateSyncUI(status, text) {
  if (status === 'synced') {
    lastSyncTime = new Date();
    updateLastSyncInfo();
  }
}

// Get context for AI from Supabase
async function getSupabaseContext(query, options = {}) {
  if (!currentUser || !supabaseClient) return null;
  
  const limit = options.limit || 20;
  const recentHours = options.recentHours || 24;
  
  try {
    // Get recent drops
    const recentCutoff = new Date(Date.now() - recentHours * 60 * 60 * 1000).toISOString();
    
    const { data: recent } = await supabaseClient
      .from('drops')
      .select('id, content, category, created_at')
      .eq('user_id', currentUser.id)
      .gte('created_at', recentCutoff)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Search relevant drops if query provided
    let relevant = [];
    if (query && options.searchEnabled) {
      const { data: searched } = await supabaseClient
        .from('drops')
        .select('id, content, category, created_at')
        .eq('user_id', currentUser.id)
        .ilike('content', '%' + query + '%')
        .limit(5);
      
      relevant = searched || [];
    }
    
    return {
      recent: (recent || []).map(d => ({
        id: d.id,
        text: d.content,
        category: d.category,
        time: new Date(d.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      })),
      relevant: relevant.map(d => ({
        id: d.id,
        text: d.content,
        category: d.category
      }))
    };
  } catch (error) {
    console.error('Context fetch error:', error);
    return null;
  }
}

// Format context for AI prompt
function formatContextForAI(context) {
  if (!context) return null;
  
  const parts = [];
  
  if (context.relevant?.length) {
    parts.push('RELEVANT:');
    context.relevant.forEach(d => parts.push('- [' + d.category + '] ' + d.text));
  }
  
  if (context.recent?.length) {
    parts.push('RECENT:');
    context.recent.slice(0, 10).forEach(d => parts.push('- [' + d.category + '] ' + d.text));
  }
  
  return parts.length ? parts.join('\n') : null;
}

console.log('Sync module loaded');
