/**
 * DropLit Privacy Integration Module
 * Combines all privacy layers into unified API
 * 
 * Architecture:
 * 
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Layer 3: ZK Search + Audit Trail                            │
 *   │          zk-search.js, audit-trail.js                       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Layer 2: Client-Side Embeddings                             │
 *   │          local-embeddings.js                                │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Layer 1: Encryption                                         │
 *   │          crypto-keys.js, drop-encryption.js                 │
 *   │          sync-encrypted.js, encryption-ui.js                │
 *   └─────────────────────────────────────────────────────────────┘
 * 
 * This module provides:
 * - Unified initialization
 * - Coordinated drop processing
 * - Privacy-aware ASKI context
 * - Status and health monitoring
 * 
 * @version 1.0.0
 * @date 2026-01-09
 */

// ============================================================
// PRIVACY SYSTEM STATE
// ============================================================

const PrivacySystem = {
  initialized: false,
  
  layers: {
    encryption: { ready: false, module: null },
    embeddings: { ready: false, module: null },
    zkSearch: { ready: false, module: null },
    audit: { ready: false, module: null }
  },
  
  config: {
    // Feature flags
    enableEncryption: true,
    enableLocalEmbeddings: true,
    enableZKSearch: true,
    enableAudit: true,
    
    // Performance
    lazyLoadEmbeddings: true,  // Load ML model only when needed
    
    // UI
    showPrivacyIndicators: true
  }
};

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the complete privacy system
 * Call this early in app startup
 * 
 * @param {Object} options - Configuration
 * @param {Uint8Array|CryptoKey} options.masterKey - Encryption key
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} - Initialization status
 */
async function initPrivacySystem(options = {}) {
  console.log('[Privacy] Initializing privacy system...');
  
  const { masterKey, onProgress } = options;
  const status = {
    success: true,
    layers: {},
    errors: []
  };
  
  // Merge config
  Object.assign(PrivacySystem.config, options.config || {});
  
  try {
    // Layer 1: Encryption (required)
    if (PrivacySystem.config.enableEncryption) {
      onProgress?.('Initializing encryption...', 0.1);
      
      if (window.DropLitEncryption && masterKey) {
        PrivacySystem.layers.encryption.module = window.DropLitEncryption;
        PrivacySystem.layers.encryption.ready = true;
        status.layers.encryption = 'ready';
      } else {
        status.layers.encryption = 'skipped (no key)';
      }
    }
    
    // Layer 2: Local Embeddings
    if (PrivacySystem.config.enableLocalEmbeddings) {
      onProgress?.('Initializing local AI...', 0.3);
      
      if (window.DropLitEmbeddings) {
        await window.DropLitEmbeddings.init({
          preloadModel: !PrivacySystem.config.lazyLoadEmbeddings
        });
        PrivacySystem.layers.embeddings.module = window.DropLitEmbeddings;
        PrivacySystem.layers.embeddings.ready = true;
        status.layers.embeddings = 'ready';
      } else {
        status.layers.embeddings = 'module not loaded';
        status.errors.push('local-embeddings.js not loaded');
      }
    }
    
    // Layer 3a: ZK Search
    if (PrivacySystem.config.enableZKSearch) {
      onProgress?.('Initializing zero-knowledge search...', 0.5);
      
      if (window.DropLitZKSearch && masterKey) {
        await window.DropLitZKSearch.init(masterKey);
        PrivacySystem.layers.zkSearch.module = window.DropLitZKSearch;
        PrivacySystem.layers.zkSearch.ready = true;
        status.layers.zkSearch = 'ready';
      } else {
        status.layers.zkSearch = masterKey ? 'module not loaded' : 'no key';
      }
    }
    
    // Layer 3b: Audit Trail
    if (PrivacySystem.config.enableAudit) {
      onProgress?.('Initializing audit trail...', 0.7);
      
      if (window.DropLitAudit) {
        await window.DropLitAudit.init();
        PrivacySystem.layers.audit.module = window.DropLitAudit;
        PrivacySystem.layers.audit.ready = true;
        status.layers.audit = 'ready';
      } else {
        status.layers.audit = 'module not loaded';
      }
    }
    
    onProgress?.('Privacy system ready', 1.0);
    
    PrivacySystem.initialized = true;
    console.log('[Privacy] System initialized:', status);
    
  } catch (error) {
    console.error('[Privacy] Initialization error:', error);
    status.success = false;
    status.errors.push(error.message);
  }
  
  return status;
}

/**
 * Check if privacy system is ready
 * @returns {boolean}
 */
function isPrivacyReady() {
  return PrivacySystem.initialized;
}

/**
 * Get privacy system status
 * @returns {Object}
 */
function getPrivacyStatus() {
  return {
    initialized: PrivacySystem.initialized,
    layers: {
      encryption: PrivacySystem.layers.encryption.ready,
      embeddings: PrivacySystem.layers.embeddings.ready,
      zkSearch: PrivacySystem.layers.zkSearch.ready,
      audit: PrivacySystem.layers.audit.ready
    },
    config: PrivacySystem.config
  };
}

// ============================================================
// DROP PROCESSING PIPELINE
// ============================================================

/**
 * Process a drop through all privacy layers before saving
 * 
 * @param {Object} drop - Drop to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processed drop ready for storage/sync
 */
async function processDropForStorage(drop, options = {}) {
  console.log('[Privacy] Processing drop for storage:', drop.id);
  
  const result = {
    drop: { ...drop },
    embedding: null,
    searchTokens: null,
    auditEntry: null
  };
  
  try {
    // Step 1: Generate embedding (before encryption)
    if (PrivacySystem.layers.embeddings.ready) {
      const text = drop.text || drop.content || '';
      if (text && text.length > 10) {
        result.embedding = await PrivacySystem.layers.embeddings.module.generateForDrop(drop);
        console.log('[Privacy] Embedding generated locally');
      }
    }
    
    // Step 2: Generate ZK search tokens (before encryption)
    if (PrivacySystem.layers.zkSearch.ready) {
      result.searchTokens = await PrivacySystem.layers.zkSearch.module.generateDropTokens(drop);
      result.drop.searchTokens = result.searchTokens;
      console.log('[Privacy] Search tokens generated:', result.searchTokens?.length);
    }
    
    // Step 3: Encrypt drop
    if (PrivacySystem.layers.encryption.ready && options.encrypt !== false) {
      // Note: encryption should be called separately with the key
      // This is handled by sync-encrypted.js
      result.drop._needsEncryption = true;
    }
    
    // Step 4: Log to audit trail
    if (PrivacySystem.layers.audit.ready) {
      const isNew = options.isNew !== false;
      result.auditEntry = isNew
        ? await PrivacySystem.layers.audit.module.logDropCreate(drop)
        : await PrivacySystem.layers.audit.module.logDropUpdate(drop);
    }
    
  } catch (error) {
    console.error('[Privacy] Processing error:', error);
  }
  
  return result;
}

/**
 * Process drop after retrieval (decryption, etc.)
 * 
 * @param {Object} encryptedDrop - Drop from storage
 * @param {CryptoKey} key - Decryption key
 * @returns {Promise<Object>} - Decrypted drop
 */
async function processDropFromStorage(encryptedDrop, key) {
  // Decryption is handled by sync-encrypted.js
  // This function coordinates other post-processing
  
  let drop = encryptedDrop;
  
  // If drop was encrypted, it should be decrypted by sync-encrypted.js first
  // This function can add additional processing
  
  return drop;
}

// ============================================================
// PRIVACY-AWARE SEARCH
// ============================================================

/**
 * Search drops with privacy preservation
 * Combines semantic search (local) and ZK token search
 * 
 * @param {string} query - Search query
 * @param {Array} drops - All drops (decrypted)
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Search results
 */
async function privacySearch(query, drops, options = {}) {
  console.log('[Privacy] Searching:', query.substring(0, 50));
  
  const {
    topK = 20,
    useSemanticSearch = true,
    useZKSearch = true
  } = options;
  
  // Use hybrid search if ZK is ready
  if (PrivacySystem.layers.zkSearch.ready && useZKSearch) {
    return PrivacySystem.layers.zkSearch.module.hybridSearch(query, drops, {
      topK,
      useSemanticSearch: useSemanticSearch && PrivacySystem.layers.embeddings.ready
    });
  }
  
  // Fall back to semantic search only
  if (PrivacySystem.layers.embeddings.ready && useSemanticSearch) {
    return PrivacySystem.layers.embeddings.module.search(query, drops, {
      topK,
      threshold: 0.25
    });
  }
  
  // Fall back to simple text search
  console.warn('[Privacy] No advanced search available, using simple match');
  return drops.filter(d => {
    const text = (d.text || d.content || '').toLowerCase();
    return text.includes(query.toLowerCase());
  }).slice(0, topK);
}

// ============================================================
// ASKI INTEGRATION
// ============================================================

/**
 * Get privacy-aware context for ASKI
 * Returns relevant drops without exposing data to server unnecessarily
 * 
 * @param {string} userMessage - User's message to ASKI
 * @param {Array} allDrops - All user's drops (decrypted)
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Context for ASKI
 */
async function getAskiContext(userMessage, allDrops, options = {}) {
  const {
    maxDrops = 15,
    includeRecent = 5,
    useSemanticSearch = true
  } = options;
  
  const context = {
    relevantDrops: [],
    recentDrops: [],
    totalDrops: allDrops.length,
    privacyNote: 'All processing done client-side'
  };
  
  try {
    // Get recent drops
    const sortedByTime = [...allDrops].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
      const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
      return timeB - timeA;
    });
    context.recentDrops = sortedByTime.slice(0, includeRecent);
    
    // Get semantically relevant drops
    if (useSemanticSearch && userMessage.length > 10) {
      const searchResults = await privacySearch(userMessage, allDrops, {
        topK: maxDrops - includeRecent
      });
      
      // Extract drops from results
      context.relevantDrops = searchResults.map(r => r.drop || r);
    }
    
    // Deduplicate
    const seenIds = new Set();
    const allContext = [];
    
    for (const drop of [...context.relevantDrops, ...context.recentDrops]) {
      if (!seenIds.has(drop.id)) {
        seenIds.add(drop.id);
        allContext.push(drop);
      }
    }
    
    context.drops = allContext.slice(0, maxDrops);
    
  } catch (error) {
    console.error('[Privacy] Error getting ASKI context:', error);
    // Fall back to recent drops only
    context.drops = context.recentDrops;
  }
  
  return context;
}

// ============================================================
// INTEGRITY VERIFICATION
// ============================================================

/**
 * Verify data integrity across all systems
 * 
 * @returns {Promise<Object>} - Verification results
 */
async function verifyDataIntegrity() {
  console.log('[Privacy] Verifying data integrity...');
  
  const results = {
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // Check audit trail
  if (PrivacySystem.layers.audit.ready) {
    const auditResult = await PrivacySystem.layers.audit.module.verify();
    results.checks.auditTrail = {
      valid: auditResult.valid,
      entriesChecked: auditResult.entriesChecked,
      errors: auditResult.errors?.length || 0
    };
  }
  
  // Check embedding cache stats
  if (PrivacySystem.layers.embeddings.ready) {
    const stats = await PrivacySystem.layers.embeddings.module.getCacheStats();
    results.checks.embeddingCache = {
      count: stats.count,
      estimatedSizeBytes: stats.estimatedSizeBytes
    };
  }
  
  // Overall status
  results.healthy = Object.values(results.checks).every(c => c.valid !== false);
  
  return results;
}

/**
 * Generate proof of data state
 * Can be used to prove data hasn't changed
 * 
 * @returns {Promise<Object>} - Integrity proof
 */
async function generateIntegrityProof() {
  if (!PrivacySystem.layers.audit.ready) {
    return null;
  }
  
  return PrivacySystem.layers.audit.module.generateProof();
}

// ============================================================
// FULL DROPS INDEXING
// ============================================================

/**
 * Index all drops for search and embeddings
 * Call this when user enables features or on first load
 * 
 * @param {Array} drops - All drops to index
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Indexing statistics
 */
async function indexAllDrops(drops, onProgress = null) {
  console.log('[Privacy] Indexing all drops...');
  
  const stats = {
    total: drops.length,
    embeddings: { processed: 0, cached: 0, failed: 0 },
    searchTokens: { processed: 0, failed: 0 },
    duration: 0
  };
  
  const startTime = Date.now();
  
  // Index embeddings
  if (PrivacySystem.layers.embeddings.ready) {
    onProgress?.('Generating embeddings...', 0);
    
    const embeddingStats = await PrivacySystem.layers.embeddings.module.indexAll(
      drops,
      (current, total, details) => {
        onProgress?.(`Processing embeddings: ${current}/${total}`, current / total * 0.5);
      }
    );
    
    stats.embeddings = embeddingStats;
  }
  
  // Generate search tokens
  if (PrivacySystem.layers.zkSearch.ready) {
    onProgress?.('Generating search tokens...', 0.5);
    
    for (let i = 0; i < drops.length; i++) {
      try {
        const tokens = await PrivacySystem.layers.zkSearch.module.generateDropTokens(drops[i]);
        drops[i].searchTokens = tokens;
        stats.searchTokens.processed++;
      } catch (e) {
        stats.searchTokens.failed++;
      }
      
      onProgress?.(`Generating search tokens: ${i + 1}/${drops.length}`, 0.5 + (i / drops.length) * 0.5);
    }
  }
  
  stats.duration = Date.now() - startTime;
  onProgress?.('Indexing complete', 1);
  
  console.log('[Privacy] Indexing complete:', stats);
  return stats;
}

// ============================================================
// UI HELPERS
// ============================================================

/**
 * Get privacy badge HTML for a drop
 * 
 * @param {Object} drop - Drop to get badge for
 * @returns {string} - HTML string
 */
function getPrivacyBadge(drop) {
  const badges = [];
  
  if (drop.encrypted_content || drop._needsEncryption) {
    badges.push('<span class="privacy-badge encrypted" title="Encrypted">🔐</span>');
  }
  
  if (drop.embedding || drop._hasEmbedding) {
    badges.push('<span class="privacy-badge local-ai" title="Local AI indexed">🧠</span>');
  }
  
  if (drop.searchTokens && drop.searchTokens.length > 0) {
    badges.push('<span class="privacy-badge zk-search" title="ZK Search enabled">🔍</span>');
  }
  
  return badges.join('');
}

/**
 * Get overall privacy status HTML
 * 
 * @returns {string} - HTML string
 */
function getPrivacyStatusHTML() {
  const status = getPrivacyStatus();
  
  const layers = [
    { name: 'Encryption', ready: status.layers.encryption, icon: '🔐' },
    { name: 'Local AI', ready: status.layers.embeddings, icon: '🧠' },
    { name: 'ZK Search', ready: status.layers.zkSearch, icon: '🔍' },
    { name: 'Audit Trail', ready: status.layers.audit, icon: '📋' }
  ];
  
  const items = layers.map(l => `
    <div class="privacy-layer ${l.ready ? 'ready' : 'inactive'}">
      <span class="icon">${l.icon}</span>
      <span class="name">${l.name}</span>
      <span class="status">${l.ready ? '✓' : '○'}</span>
    </div>
  `).join('');
  
  return `
    <div class="privacy-status-panel">
      <div class="privacy-title">Privacy Protection</div>
      <div class="privacy-layers">${items}</div>
    </div>
  `;
}

// ============================================================
// CSS STYLES
// ============================================================

const PRIVACY_STYLES = `
/* Privacy badges on drops */
.privacy-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 12px;
  margin-left: 4px;
  opacity: 0.7;
  cursor: help;
}

.privacy-badge:hover {
  opacity: 1;
}

/* Privacy status panel */
.privacy-status-panel {
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
}

.dark-mode .privacy-status-panel {
  background: var(--bg-secondary, #2a2a2a);
}

.privacy-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.privacy-layers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.privacy-layer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-primary, white);
  border-radius: 8px;
  opacity: 0.5;
}

.dark-mode .privacy-layer {
  background: var(--bg-primary, #1a1a1a);
}

.privacy-layer.ready {
  opacity: 1;
}

.privacy-layer .icon {
  font-size: 16px;
}

.privacy-layer .name {
  flex: 1;
  font-size: 14px;
}

.privacy-layer .status {
  color: var(--text-secondary);
}

.privacy-layer.ready .status {
  color: #22c55e;
}

/* Privacy indicator in header */
.privacy-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 16px;
  font-size: 12px;
  color: #22c55e;
}

.privacy-indicator.partial {
  background: rgba(234, 179, 8, 0.1);
  color: #eab308;
}

.privacy-indicator.inactive {
  background: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}
`;

/**
 * Inject privacy styles into document
 */
function injectPrivacyStyles() {
  if (document.getElementById('droplit-privacy-styles')) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = 'droplit-privacy-styles';
  style.textContent = PRIVACY_STYLES;
  document.head.appendChild(style);
}

// ============================================================
// EXPORTS
// ============================================================

// ES module exports removed for script tag compatibility
// Use window.DropLitPrivacy instead

// For script tag usage
if (typeof window !== 'undefined') {
  window.DropLitPrivacy = {
    init: initPrivacySystem,
    isReady: isPrivacyReady,
    getStatus: getPrivacyStatus,
    
    processForStorage: processDropForStorage,
    processFromStorage: processDropFromStorage,
    
    search: privacySearch,
    getAskiContext,
    
    verify: verifyDataIntegrity,
    generateProof: generateIntegrityProof,
    
    indexAll: indexAllDrops,
    
    getBadge: getPrivacyBadge,
    getStatusHTML: getPrivacyStatusHTML,
    injectStyles: injectPrivacyStyles,
    
    system: PrivacySystem
  };
  
  // Auto-inject styles
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPrivacyStyles);
  } else {
    injectPrivacyStyles();
  }
  
  console.log('[Privacy] Integration module loaded. Access via window.DropLitPrivacy');
}
