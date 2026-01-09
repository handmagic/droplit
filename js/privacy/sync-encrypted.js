/**
 * DROPLIT — Encrypted Sync Module
 * Version: 1.0.0
 * Date: January 9, 2026
 * 
 * Modified sync.js functions with encryption support
 * 
 * Dependencies:
 * - crypto-keys.js (CryptoKeys)
 * - drop-encryption.js (DropEncryption)
 * 
 * Integration:
 * Replace corresponding functions in sync.js with these
 */

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let encryptionKey = null; // CryptoKey, loaded on init
let encryptionReady = false;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize encryption for current user
 * Called after Supabase auth
 */
async function initEncryption() {
  if (!window.supabase || !window.supabase.auth) {
    console.error('[SyncEncrypted] Supabase not initialized');
    return false;
  }
  
  const { data: { user } } = await window.supabase.auth.getUser();
  if (!user) {
    console.log('[SyncEncrypted] No user logged in');
    return false;
  }
  
  // Check if user has key
  const hasKey = await window.DropLitKeys.hasStoredKey(user.id);
  
  if (!hasKey) {
    console.log('[SyncEncrypted] No encryption key found, need setup');
    // Show key setup modal (handled by UI)
    window.dispatchEvent(new CustomEvent('encryption-setup-needed', { detail: { userId: user.id } }));
    return false;
  }
  
  // Load key
  const keyData = await window.DropLitKeys.retrieveKey(user.id);
  if (!keyData) {
    console.error('[SyncEncrypted] Failed to retrieve key');
    return false;
  }
  
  encryptionKey = keyData.key;
  encryptionReady = true;
  
  console.log('[SyncEncrypted] Encryption initialized');
  window.dispatchEvent(new CustomEvent('encryption-ready'));
  
  return true;
}

/**
 * Setup encryption with password
 */
async function setupEncryptionWithPassword(userId, password) {
  const result = await window.DropLitKeys.initializeEncryption(userId, 'password', password);
  
  if (result.success) {
    const keyData = await window.DropLitKeys.retrieveKey(userId);
    encryptionKey = keyData.key;
    encryptionReady = true;
    
    // Migrate existing drops
    await migrateLocalDrops();
    
    window.dispatchEvent(new CustomEvent('encryption-ready'));
  }
  
  return result;
}

/**
 * Setup encryption with random key
 */
async function setupEncryptionRandom(userId) {
  const result = await window.DropLitKeys.initializeEncryption(userId, 'random');
  
  if (result.success) {
    const keyData = await window.DropLitKeys.retrieveKey(userId);
    encryptionKey = keyData.key;
    encryptionReady = true;
    
    // Migrate existing drops
    await migrateLocalDrops();
    
    window.dispatchEvent(new CustomEvent('encryption-ready'));
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTED SYNC OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync a drop to Supabase (encrypted)
 * REPLACES: syncDropToServer in sync.js
 */
async function syncDropEncrypted(drop, action = 'upsert') {
  if (!encryptionReady) {
    console.warn('[SyncEncrypted] Encryption not ready, queuing...');
    // Queue for later sync
    addToSyncQueue(drop, action);
    return { success: false, reason: 'encryption_not_ready' };
  }
  
  try {
    // Prepare encrypted drop
    const prepared = await window.DropLitEncryption.prepareDropForSync(drop, encryptionKey);
    
    if (!prepared) {
      // Privacy level = maximum, don't sync
      return { success: true, reason: 'local_only' };
    }
    
    // Get current user
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Add user_id
    prepared.user_id = user.id;
    
    if (action === 'upsert') {
      // Check if exists
      const { data: existing } = await window.supabase
        .from('drops')
        .select('id')
        .eq('external_id', prepared.external_id)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (existing) {
        // Update
        const { error } = await window.supabase
          .from('drops')
          .update(prepared)
          .eq('id', existing.id);
        
        if (error) throw error;
        console.log('[SyncEncrypted] Drop updated:', prepared.external_id);
        
      } else {
        // Insert
        const { error } = await window.supabase
          .from('drops')
          .insert(prepared);
        
        if (error) throw error;
        console.log('[SyncEncrypted] Drop inserted:', prepared.external_id);
      }
      
    } else if (action === 'delete') {
      const { error } = await window.supabase
        .from('drops')
        .update({ is_deleted: true })
        .eq('external_id', prepared.external_id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      console.log('[SyncEncrypted] Drop deleted:', prepared.external_id);
    }
    
    // Mark as synced locally
    markDropSynced(drop.id);
    
    return { success: true };
    
  } catch (error) {
    console.error('[SyncEncrypted] Sync failed:', error);
    addToSyncQueue(drop, action);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch drops from Supabase (decrypt)
 * REPLACES: fetchDropsFromServer in sync.js
 */
async function fetchDropsEncrypted() {
  if (!encryptionReady) {
    console.warn('[SyncEncrypted] Encryption not ready');
    return [];
  }
  
  try {
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Fetch encrypted drops
    const { data, error } = await window.supabase
      .from('drops')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (error) throw error;
    
    console.log(`[SyncEncrypted] Fetched ${data.length} drops, decrypting...`);
    
    // Decrypt all drops
    const decrypted = [];
    for (const serverDrop of data) {
      const drop = await window.DropLitEncryption.processDropFromServer(serverDrop, encryptionKey);
      decrypted.push(drop);
    }
    
    console.log(`[SyncEncrypted] Decrypted ${decrypted.length} drops`);
    return decrypted;
    
  } catch (error) {
    console.error('[SyncEncrypted] Fetch failed:', error);
    return [];
  }
}

/**
 * Full sync: fetch server, merge with local, push changes
 */
async function fullSyncEncrypted() {
  if (!encryptionReady) {
    console.warn('[SyncEncrypted] Encryption not ready');
    return { success: false, reason: 'encryption_not_ready' };
  }
  
  try {
    // 1. Fetch server drops
    const serverDrops = await fetchDropsEncrypted();
    
    // 2. Get local drops
    const localDrops = JSON.parse(localStorage.getItem('ideas') || '[]');
    
    // 3. Merge (server wins for conflicts based on timestamp)
    const merged = mergeDrops(localDrops, serverDrops);
    
    // 4. Save merged to localStorage
    localStorage.setItem('ideas', JSON.stringify(merged));
    
    // 5. Push unsynced local drops
    const unsyncedDrops = merged.filter(d => !d.synced);
    for (const drop of unsyncedDrops) {
      await syncDropEncrypted(drop, 'upsert');
    }
    
    console.log(`[SyncEncrypted] Full sync complete: ${merged.length} drops`);
    
    // Trigger UI refresh
    if (typeof render === 'function') {
      render();
    }
    
    return { success: true, count: merged.length };
    
  } catch (error) {
    console.error('[SyncEncrypted] Full sync failed:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge local and server drops
 * Server wins for conflicts (most recent)
 */
function mergeDrops(localDrops, serverDrops) {
  const merged = new Map();
  
  // Add server drops (they are authoritative)
  for (const drop of serverDrops) {
    const key = String(drop.id);
    merged.set(key, { ...drop, synced: true });
  }
  
  // Add local drops that don't exist on server
  for (const drop of localDrops) {
    const key = String(drop.id);
    if (!merged.has(key)) {
      // New local drop, not yet synced
      merged.set(key, { ...drop, synced: false });
    } else {
      // Exists on server - check if local has newer timestamp
      const serverDrop = merged.get(key);
      if (drop.timestamp > serverDrop.timestamp) {
        // Local is newer, mark for sync
        merged.set(key, { ...drop, synced: false });
      }
    }
  }
  
  // Convert back to array, sorted by timestamp descending
  return Array.from(merged.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Mark a drop as synced in localStorage
 */
function markDropSynced(dropId) {
  const ideas = JSON.parse(localStorage.getItem('ideas') || '[]');
  const index = ideas.findIndex(d => d.id === dropId);
  
  if (index !== -1) {
    ideas[index].synced = true;
    localStorage.setItem('ideas', JSON.stringify(ideas));
  }
}

/**
 * Add drop to sync queue for retry
 */
function addToSyncQueue(drop, action) {
  const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
  
  // Avoid duplicates
  const existing = queue.findIndex(q => q.drop.id === drop.id);
  if (existing !== -1) {
    queue[existing] = { drop, action, timestamp: Date.now() };
  } else {
    queue.push({ drop, action, timestamp: Date.now() });
  }
  
  localStorage.setItem('sync_queue', JSON.stringify(queue));
}

/**
 * Process sync queue
 */
async function processSyncQueue() {
  if (!encryptionReady) return;
  
  const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
  if (queue.length === 0) return;
  
  console.log(`[SyncEncrypted] Processing sync queue: ${queue.length} items`);
  
  const remaining = [];
  for (const item of queue) {
    const result = await syncDropEncrypted(item.drop, item.action);
    if (!result.success && result.reason !== 'local_only') {
      remaining.push(item);
    }
  }
  
  localStorage.setItem('sync_queue', JSON.stringify(remaining));
}

/**
 * Migrate existing local drops to encrypted format
 */
async function migrateLocalDrops() {
  if (!encryptionReady) return;
  
  const result = await window.DropLitEncryption.migrateAllDrops(encryptionKey);
  console.log(`[SyncEncrypted] Migration: ${result.migrated}/${result.total} drops encrypted`);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ASKI CONTEXT BUILDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get decrypted drops for ASKI context
 * This is called from chat.js when building context for AI
 */
async function getDropsForAskiContext(filter = {}) {
  // Get local drops (already decrypted in memory/localStorage)
  const ideas = JSON.parse(localStorage.getItem('ideas') || '[]');
  
  let filtered = ideas;
  
  // Apply filters
  if (filter.category) {
    filtered = filtered.filter(d => d.category === filter.category);
  }
  
  if (filter.days) {
    const cutoff = Date.now() - (filter.days * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(d => new Date(d.timestamp).getTime() > cutoff);
  }
  
  if (filter.query) {
    const query = filter.query.toLowerCase();
    filtered = filtered.filter(d => 
      d.text?.toLowerCase().includes(query) ||
      d.notes?.toLowerCase().includes(query)
    );
  }
  
  // Limit
  if (filter.limit) {
    filtered = filtered.slice(0, filter.limit);
  }
  
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SYNC
// ═══════════════════════════════════════════════════════════════════════════

let syncInterval = null;

/**
 * Start auto-sync interval
 */
function startAutoSync(intervalMs = 60000) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  syncInterval = setInterval(async () => {
    if (encryptionReady && navigator.onLine) {
      await processSyncQueue();
    }
  }, intervalMs);
  
  console.log(`[SyncEncrypted] Auto-sync started (every ${intervalMs/1000}s)`);
}

/**
 * Stop auto-sync
 */
function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

// Sync when coming online
window.addEventListener('online', async () => {
  console.log('[SyncEncrypted] Back online, syncing...');
  await processSyncQueue();
});

// Listen for save events from index.html
window.addEventListener('drop-saved', async (event) => {
  const drop = event.detail;
  if (encryptionReady) {
    await syncDropEncrypted(drop, 'upsert');
  }
});

// Listen for delete events
window.addEventListener('drop-deleted', async (event) => {
  const dropId = event.detail;
  if (encryptionReady) {
    await syncDropEncrypted({ id: dropId }, 'delete');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

window.DropLitEncryptedSync = {
  // Initialization
  initEncryption,
  setupEncryptionWithPassword,
  setupEncryptionRandom,
  
  // Core sync
  syncDropEncrypted,
  fetchDropsEncrypted,
  fullSyncEncrypted,
  
  // Helpers
  processSyncQueue,
  migrateLocalDrops,
  getDropsForAskiContext,
  
  // Auto-sync
  startAutoSync,
  stopAutoSync,
  
  // State
  get isReady() { return encryptionReady; },
  get hasKey() { return encryptionKey !== null; }
};

console.log('[SyncEncrypted] Module loaded');
