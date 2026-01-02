// ============================================
// DROPLIT SYNC v1.0
// Syntrise Core Integration & Supabase Context
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
// EXPORTS
// ============================================
window.DropLitSync = {
  syncDropToCore,
  getSyntriseContext,
  getSupabaseContext,
  formatContextForAI,
  syncAllDropsToCore,
  syncToCloud,
  SYNTRISE_CONFIG
};
