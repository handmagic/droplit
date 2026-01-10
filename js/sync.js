// ============================================
// DROPLIT SYNC v2.0
// Privacy System + Syntrise Core Integration
// ============================================

// ============================================
// SYNTRISE CORE INTEGRATION v0.1
// ============================================

const SYNTRISE_CONFIG = {
  API_URL: 'https://syntrise-core.vercel.app/api',
  USER_ID: 'c95e2b0c-1182-424d-ac0a-0f0566cf09fa',
  ENABLED: true
};

let syntriseSyncQueue = [];

// Sync single drop to Syntrise CORE
async function syncDropToCore(drop) {
  if (!SYNTRISE_CONFIG.ENABLED) return;
  try {
    const response = await fetch(`${SYNTRISE_CONFIG.API_URL}/drops/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: SYNTRISE_CONFIG.USER_ID,
        drops: [{
          id: String(drop.id),
          content: drop.text,
          category: drop.category || 'uncategorized',
          tags: drop.tags || [],
          created_at: drop.created || new Date().toISOString()
        }]
      })
    });
    if (response.ok) {
      console.log('✅ Synced to Syntrise CORE:', drop.id);
    }
  } catch (e) {
    console.warn('⚠️ Syntrise sync queued:', e.message);
    syntriseSyncQueue.push(drop);
  }
}

// Get context for Aski from Syntrise CORE
async function getSyntriseContext(query) {
  // LEGACY: Old API - now using Supabase
  if (!SYNTRISE_CONFIG.ENABLED) return null;
  try {
    const response = await fetch(`${SYNTRISE_CONFIG.API_URL}/drops/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: SYNTRISE_CONFIG.USER_ID,
        query: query,
        limit: 5,
        threshold: 0.1
      })
    });
    const data = await response.json();
    return data.results || [];
  } catch (e) {
    console.warn('Syntrise context error:', e.message);
    return [];
  }
}

// ============================================
// DYNAMIC CONTEXT FROM SUPABASE (v0.9.58)
// ============================================

// Get fresh drops for ASKI context
async function getSupabaseContext(query, options = {}) {
  const {
    limit = 20,           // Max drops to return
    recentHours = 24,     // Include drops from last N hours
    searchEnabled = true  // Enable text search
  } = options;
  
  if (!supabaseClient || !currentUser) {
    console.log('⚠️ Supabase not ready for context');
    return { recent: [], relevant: [] };
  }
  
  try {
    const context = { recent: [], relevant: [] };
    
    // 1. Get RECENT drops (last N hours)
    const recentSince = new Date(Date.now() - recentHours * 60 * 60 * 1000).toISOString();
    
    const { data: recentDrops, error: recentError } = await supabaseClient
      .from('drops')
      .select('content, category, created_at, metadata')
      .eq('user_id', currentUser.id)
      .gte('created_at', recentSince)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (!recentError && recentDrops) {
      context.recent = recentDrops.map(d => ({
        text: d.content,
        category: d.category,
        time: d.metadata?.time || '',
        date: d.metadata?.date || ''
      }));
      console.log(`📥 Context: ${recentDrops.length} recent drops`);
    }
    
    // 2. SEARCH relevant drops by keywords (if query provided)
    if (searchEnabled && query && query.length > 2) {
      // Extract keywords (simple: split and filter)
      const keywords = query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 3); // Max 3 keywords
      
      if (keywords.length > 0) {
        // Search using ilike for each keyword
        const searchPattern = `%${keywords[0]}%`;
        
        const { data: relevantDrops, error: searchError } = await supabaseClient
          .from('drops')
          .select('content, category, created_at, metadata')
          .eq('user_id', currentUser.id)
          .ilike('content', searchPattern)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (!searchError && relevantDrops) {
          context.relevant = relevantDrops.map(d => ({
            text: d.content,
            category: d.category,
            time: d.metadata?.time || '',
            date: d.metadata?.date || ''
          }));
          console.log(`🔍 Context: ${relevantDrops.length} relevant drops for "${keywords[0]}"`);
        }
      }
    }
    
    return context;
    
  } catch (error) {
    console.error('❌ Supabase context error:', error);
    return { recent: [], relevant: [] };
  }
}

// Format context for AI prompt
function formatContextForAI(context) {
  if (!context || (!context.recent?.length && !context.relevant?.length)) {
    return null;
  }
  
  let formatted = [];
  
  // Add relevant drops first (if any)
  if (context.relevant?.length) {
    formatted.push('=== RELEVANT NOTES ===');
    context.relevant.forEach(d => {
      formatted.push(`[${d.category}] ${d.text}`);
    });
  }
  
  // Add recent drops
  if (context.recent?.length) {
    formatted.push('=== RECENT NOTES (last 24h) ===');
    context.recent.slice(0, 10).forEach(d => {
      const timeStr = d.time ? ` (${d.time})` : '';
      formatted.push(`[${d.category}]${timeStr} ${d.text}`);
    });
  }
  
  return formatted.join('\n');
}

// Sync all existing drops in batches (to avoid timeout)
async function syncAllDropsToCore() {
  if (!SYNTRISE_CONFIG.ENABLED) {
    console.log('Syntrise sync disabled');
    return { synced: 0, error: 'disabled' };
  }
  
  // Filter text drops only
  const textDrops = ideas.filter(drop => drop.text && !drop.isMedia);
  
  if (!textDrops.length) {
    console.log('No drops to sync');
    return { synced: 0, error: 'no_drops' };
  }
  
  console.log('🔄 Syncing', textDrops.length, 'drops in batches...');
  
  const BATCH_SIZE = 5;
  let totalSynced = 0;
  let errors = [];
  
  // Split into batches
  for (let i = 0; i < textDrops.length; i += BATCH_SIZE) {
    const batch = textDrops.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(textDrops.length / BATCH_SIZE);
    
    console.log(`Batch ${batchNum}/${totalBatches}...`);
    
    try {
      const response = await fetch(`${SYNTRISE_CONFIG.API_URL}/drops/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: SYNTRISE_CONFIG.USER_ID,
          drops: batch.map(drop => ({
            id: String(drop.id),
            content: drop.text,
            category: drop.category || 'uncategorized',
            created_at: drop.timestamp || new Date().toISOString()
          }))
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        totalSynced += data.synced || 0;
      } else {
        errors.push(`Batch ${batchNum} failed`);
      }
    } catch (e) {
      errors.push(`Batch ${batchNum}: ${e.message}`);
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < textDrops.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log(`✅ Synced ${totalSynced}/${textDrops.length} drops`);
  
  if (errors.length) {
    return { synced: totalSynced, error: errors.join(', ') };
  }
  return { synced: totalSynced };
}

// Expose for console access
window.SyntriseCore = {
  sync: syncDropToCore,
  syncAll: syncAllDropsToCore,
  getContext: getSyntriseContext,
  config: SYNTRISE_CONFIG
};

// Sync to Cloud button handler
async function syncToCloud() {
  const textDrops = ideas.filter(drop => drop.text && !drop.isMedia);
  if (!textDrops.length) {
    toast('No text drops to sync', 'info');
    return;
  }
  
  const batches = Math.ceil(textDrops.length / 5);
  toast(`Syncing ${textDrops.length} drops (${batches} batches)...`, 'info');
  
  try {
    const result = await syncAllDropsToCore();
    if (result.error === 'disabled') {
      toast('Cloud sync is disabled', 'info');
    } else if (result.error && result.synced === 0) {
      toast('Sync failed: ' + result.error, 'error');
    } else if (result.synced > 0) {
      toast('Synced ' + result.synced + ' drops!', 'success');
    } else {
      toast('All drops already synced', 'success');
    }
  } catch (e) {
    toast('Sync error: ' + e.message, 'error');
  }
}


// ============================================
// PRIVACY SYSTEM INTEGRATION v1.0
// ============================================

/**
 * Check if privacy system is available and initialized
 */
function isPrivacyReady() {
  return window.DROPLIT_PRIVACY_ENABLED === true && 
         typeof DropLitPrivacy !== 'undefined' &&
         DropLitPrivacy.isInitialized();
}

/**
 * Sync drop with encryption to Supabase
 * @param {Object} drop - Drop object to sync
 * @returns {Promise<Object>} - Sync result
 */
async function syncDropEncrypted(drop) {
  if (!supabaseClient || !currentUser) {
    console.log('⚠️ Supabase not ready for encrypted sync');
    return { success: false, error: 'not_ready' };
  }
  
  try {
    // Check if privacy system is ready
    if (!isPrivacyReady()) {
      console.log('📤 Privacy not enabled, syncing unencrypted');
      return await syncDropUnencrypted(drop);
    }
    
    console.log('🔐 Processing drop for encrypted sync...');
    
    // Step 1: Process through privacy pipeline (embeddings, ZK tokens, audit)
    let searchTokens = null;
    try {
      const processed = await DropLitPrivacy.processForStorage(drop);
      if (processed && processed.searchTokens) {
        searchTokens = processed.searchTokens;
      }
    } catch (privErr) {
      console.warn('⚠️ Privacy processing failed:', privErr.message);
    }
    
    // Step 2: Get encryption key
    let key = null;
    try {
      const keyData = await DropLitKeys.retrieveKey(currentUser.id);
      if (keyData && keyData.key) {
        key = keyData.key;
      }
    } catch (keyErr) {
      console.warn('⚠️ Failed to get encryption key:', keyErr.message);
    }
    
    // Step 3: Encrypt and prepare for sync
    let supabaseData = null;
    let isEncrypted = false;
    
    if (key && typeof DropLitEncryption !== 'undefined') {
      try {
        // Use prepareDropForSync which handles encryption and formatting
        const prepared = await DropLitEncryption.prepareDropForSync(drop, key);
        
        if (prepared) {
          supabaseData = {
            user_id: currentUser.id,
            ...prepared
          };
          isEncrypted = true;
          console.log('🔐 Drop encrypted successfully');
        }
      } catch (encErr) {
        console.warn('⚠️ Encryption failed:', encErr.message);
      }
    }
    
    // Fallback to unencrypted if encryption failed
    if (!supabaseData) {
      console.log('📤 Using unencrypted sync (encryption unavailable)');
      return await syncDropUnencrypted(drop);
    }
    
    // Step 4: Upsert to Supabase
    const { data, error } = await supabaseClient
      .from('drops')
      .upsert(supabaseData, {
        onConflict: 'user_id,external_id',
        returning: 'minimal'
      });
    
    if (error) {
      console.error('❌ Supabase encrypted sync error:', error);
      return { success: false, error: error.message };
    }
    
    // Step 5: Sync ZK search tokens if available
    if (searchTokens && searchTokens.length > 0) {
      await syncSearchTokens(drop.id, searchTokens);
    }
    
    // Step 6: Log to audit trail
    if (typeof DropLitAudit !== 'undefined') {
      try {
        await DropLitAudit.logSync('push', 1);
      } catch (auditErr) {
        console.warn('⚠️ Audit log failed:', auditErr.message);
      }
    }
    
    console.log('✅ Encrypted sync complete:', drop.id);
    return { success: true, encrypted: isEncrypted };
    
  } catch (error) {
    console.error('❌ Encrypted sync error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync drop without encryption (fallback)
 */
async function syncDropUnencrypted(drop) {
  try {
    const { data, error } = await supabaseClient
      .from('drops')
      .upsert({
        user_id: currentUser.id,
        external_id: String(drop.id),
        content: drop.text,
        category: drop.category || 'inbox',
        source: drop.source || 'droplit',
        metadata: {
          date: drop.date,
          time: drop.time,
          creator: drop.creator || 'user',
          isMedia: drop.isMedia || false
        },
        encryption_version: 0,
        privacy_level: 'standard'
      }, {
        onConflict: 'user_id,external_id',
        returning: 'minimal'
      });
    
    if (error) {
      console.error('❌ Supabase sync error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Unencrypted sync complete:', drop.id);
    return { success: true, encrypted: false };
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync ZK search tokens to Supabase
 */
async function syncSearchTokens(dropId, tokens) {
  if (!supabaseClient || !currentUser) return;
  
  try {
    // First get the Supabase drop ID
    const { data: dropData } = await supabaseClient
      .from('drops')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('external_id', String(dropId))
      .single();
    
    if (!dropData) {
      console.warn('⚠️ Drop not found for tokens sync:', dropId);
      return;
    }
    
    // Upsert tokens
    const { error } = await supabaseClient
      .from('drop_search_tokens')
      .upsert({
        drop_id: dropData.id,
        user_id: currentUser.id,
        tokens: tokens,
        token_count: tokens.length
      }, {
        onConflict: 'drop_id'
      });
    
    if (error) {
      console.warn('⚠️ Token sync error:', error.message);
    } else {
      console.log('🔑 Tokens synced:', tokens.length);
    }
    
  } catch (e) {
    console.warn('⚠️ Token sync failed:', e.message);
  }
}

/**
 * Batch sync all drops with privacy
 */
async function syncAllDropsWithPrivacy(options = {}) {
  const { onProgress } = options;
  
  if (!supabaseClient || !currentUser) {
    return { success: false, error: 'Not authenticated' };
  }
  
  const textDrops = ideas.filter(drop => drop.text && !drop.isMedia);
  
  if (!textDrops.length) {
    return { success: true, synced: 0, message: 'No drops to sync' };
  }
  
  console.log(`🔄 Starting privacy sync for ${textDrops.length} drops...`);
  
  let synced = 0;
  let errors = [];
  const total = textDrops.length;
  
  for (let i = 0; i < textDrops.length; i++) {
    const drop = textDrops[i];
    
    try {
      const result = await syncDropEncrypted(drop);
      
      if (result.success) {
        synced++;
      } else {
        errors.push(`Drop ${drop.id}: ${result.error}`);
      }
      
      // Report progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: total,
          synced: synced,
          percent: Math.round(((i + 1) / total) * 100)
        });
      }
      
      // Small delay to avoid rate limiting
      if (i < textDrops.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
      
    } catch (e) {
      errors.push(`Drop ${drop.id}: ${e.message}`);
    }
  }
  
  console.log(`✅ Privacy sync complete: ${synced}/${total}`);
  
  return {
    success: errors.length === 0,
    synced: synced,
    total: total,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Privacy-aware search using ZK tokens
 */
async function searchDropsPrivate(query, options = {}) {
  const { limit = 20 } = options;
  
  // If privacy system is ready, use it
  if (isPrivacyReady()) {
    try {
      const drops = ideas.filter(d => d.text && !d.isMedia);
      const results = await DropLitPrivacy.search(query, drops, { topK: limit });
      return results;
    } catch (e) {
      console.warn('⚠️ Privacy search failed, fallback to basic:', e.message);
    }
  }
  
  // Fallback to basic search
  const queryLower = query.toLowerCase();
  return ideas
    .filter(d => d.text && d.text.toLowerCase().includes(queryLower))
    .slice(0, limit);
}

/**
 * Get ASKI context with privacy awareness
 */
async function getContextForAski(userMessage, options = {}) {
  const { maxDrops = 15 } = options;
  
  // If privacy system is ready, use semantic search
  if (isPrivacyReady()) {
    try {
      const drops = ideas.filter(d => d.text && !d.isMedia);
      const context = await DropLitPrivacy.getAskiContext(userMessage, drops, { maxDrops });
      return context;
    } catch (e) {
      console.warn('⚠️ Privacy context failed, fallback:', e.message);
    }
  }
  
  // Fallback to Supabase context
  const supabaseContext = await getSupabaseContext(userMessage, {
    limit: maxDrops,
    recentHours: 24
  });
  
  return formatContextForAI(supabaseContext);
}

/**
 * Initialize privacy system after auth
 */
async function initPrivacyAfterAuth() {
  if (typeof DropLitPrivacy === 'undefined') {
    console.log('⚠️ Privacy modules not loaded');
    return false;
  }
  
  if (!currentUser) {
    console.log('⚠️ No user for privacy init');
    return false;
  }
  
  try {
    // Check if user has encryption key
    const hasKey = await DropLitKeys.hasStoredKey(currentUser.id);
    
    if (hasKey) {
      // Load existing key and initialize
      const key = await DropLitKeys.loadKey(currentUser.id);
      if (key) {
        await DropLitPrivacy.init({
          masterKey: key,
          config: {
            enableEncryption: true,
            enableLocalEmbeddings: true,  // Will lazy-load ML model
            enableZKSearch: true,
            enableAudit: true
          },
          onProgress: (msg, pct) => {
            console.log(`[Privacy] ${msg} ${pct ? pct + '%' : ''}`);
          }
        });
        
        window.DROPLIT_PRIVACY_ENABLED = true;
        console.log('🔐 Privacy system initialized');
        return true;
      }
    }
    
    console.log('ℹ️ No encryption key found. Privacy features available after setup.');
    return false;
    
  } catch (error) {
    console.error('❌ Privacy init error:', error);
    return false;
  }
}

/**
 * Show privacy setup UI
 */
function showPrivacySetup() {
  if (typeof DropLitEncryptionUI !== 'undefined') {
    DropLitEncryptionUI.showSetupModal();
  } else {
    toast('Privacy setup not available', 'error');
  }
}

/**
 * Get privacy status for debug info
 */
function getPrivacyStatus() {
  const status = {
    modulesLoaded: typeof DropLitPrivacy !== 'undefined',
    enabled: window.DROPLIT_PRIVACY_ENABLED === true,
    initialized: false,
    hasKey: false,
    encryptionReady: false,
    embeddingsReady: false,
    zkSearchReady: false,
    auditReady: false
  };
  
  if (typeof DropLitPrivacy !== 'undefined' && DropLitPrivacy.isInitialized()) {
    status.initialized = true;
    const fullStatus = DropLitPrivacy.getStatus();
    status.encryptionReady = fullStatus.encryption;
    status.embeddingsReady = fullStatus.embeddings;
    status.zkSearchReady = fullStatus.zkSearch;
    status.auditReady = fullStatus.audit;
  }
  
  if (typeof DropLitKeys !== 'undefined' && currentUser) {
    // This is async but we'll check sync for quick status
    status.hasKey = localStorage.getItem(`droplit_has_key_${currentUser.id}`) === 'true';
  }
  
  return status;
}


// ============================================
// EXPORTS
// ============================================
window.DropLitSync = {
  // Legacy
  syncDropToCore,
  getSyntriseContext,
  getSupabaseContext,
  formatContextForAI,
  syncAllDropsToCore,
  syncToCloud,
  SYNTRISE_CONFIG,
  
  // Privacy-enabled
  syncDropToServer,
  syncDropEncrypted,
  syncDropUnencrypted,
  syncAllDropsWithPrivacy,
  searchDropsPrivate,
  getContextForAski,
  initPrivacyAfterAuth,
  showPrivacySetup,
  getPrivacyStatus,
  isPrivacyReady
};

// ============================================
// MAIN SYNC ENTRY POINT (called from save())
// ============================================

/**
 * Sync drop to server - automatically chooses encrypted or unencrypted
 * This is the main function called from save() in index.html
 * 
 * @param {Object} drop - Drop object to sync
 * @param {string} action - 'create', 'update', or 'delete'
 * @returns {Promise<Object>} - Sync result
 */
async function syncDropToServer(drop, action = 'create') {
  // Check if we can sync
  if (!supabaseClient) {
    console.log('⚠️ Supabase client not available');
    return { success: false, error: 'no_client' };
  }
  
  if (!currentUser) {
    console.log('⚠️ User not logged in, skipping sync');
    return { success: false, error: 'not_logged_in' };
  }
  
  console.log(`📤 syncDropToServer: ${action} drop ${drop.id}`);
  
  try {
    // Handle delete action
    if (action === 'delete') {
      const { error } = await supabaseClient
        .from('drops')
        .update({ is_deleted: true })
        .eq('external_id', String(drop.id))
        .eq('user_id', currentUser.id);
      
      if (error) {
        console.error('❌ Delete sync error:', error);
        return { success: false, error: error.message };
      }
      
      console.log('✅ Drop marked as deleted:', drop.id);
      return { success: true, action: 'delete' };
    }
    
    // Check if privacy is enabled
    if (isPrivacyReady()) {
      console.log('🔐 Privacy enabled, using encrypted sync');
      return await syncDropEncrypted(drop);
    } else {
      console.log('📤 Using standard sync (privacy not enabled)');
      return await syncDropUnencrypted(drop);
    }
    
  } catch (error) {
    console.error('❌ syncDropToServer error:', error);
    return { success: false, error: error.message };
  }
}

// Also expose key functions globally for easy access
window.syncDropToServer = syncDropToServer;
window.syncDropEncrypted = syncDropEncrypted;
window.initPrivacyAfterAuth = initPrivacyAfterAuth;
window.getPrivacyStatus = getPrivacyStatus;
