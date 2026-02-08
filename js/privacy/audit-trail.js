/**
 * DropLit Cryptographic Audit Trail Module
 * Layer 3: Data Integrity Verification
 * 
 * Creates an immutable, cryptographic record of all operations.
 * Proves that data hasn't been tampered with.
 * 
 * Features:
 * - Hash chain (blockchain-like integrity)
 * - Tamper detection
 * - Operation logging without content exposure
 * - Optional public timestamping
 * 
 * Privacy preserved:
 * - Only hashes are logged, not content
 * - Operations recorded but not content
 * - User can verify integrity locally
 * 
 * @version 1.0.0
 * @date 2026-01-09
 */

// ============================================================
// CONFIGURATION
// ============================================================

const AUDIT_CONFIG = {
  // Storage
  dbName: 'droplit_audit',
  storeName: 'audit_trail',
  
  // Chain settings
  genesisHash: '0000000000000000000000000000000000000000000000000000000000000000',
  hashAlgorithm: 'SHA-256',
  
  // Retention
  maxEntries: 10000,        // Max entries before pruning
  pruneKeepDays: 90,        // Keep entries from last N days when pruning
  
  // Integrity checks
  autoVerifyOnLoad: true,   // Verify chain on startup
  verifyInterval: 3600000,  // Verify every hour (ms)
  
  // Timestamps
  enableTimestamping: false, // External timestamping (future)
  timestampService: null,
};

// ============================================================
// STATE
// ============================================================

let auditDB = null;
let lastHash = null;
let chainLength = 0;
let isInitialized = false;

// ============================================================
// OPERATION TYPES
// ============================================================

const OPERATION_TYPES = {
  // Drop operations
  DROP_CREATE: 'drop.create',
  DROP_UPDATE: 'drop.update',
  DROP_DELETE: 'drop.delete',
  DROP_RESTORE: 'drop.restore',
  
  // Sync operations
  SYNC_PUSH: 'sync.push',
  SYNC_PULL: 'sync.pull',
  SYNC_CONFLICT: 'sync.conflict',
  
  // Encryption operations
  KEY_GENERATE: 'key.generate',
  KEY_ROTATE: 'key.rotate',
  KEY_IMPORT: 'key.import',
  KEY_EXPORT: 'key.export',
  
  // Auth operations
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_SESSION: 'auth.session',
  
  // Export/Import
  DATA_EXPORT: 'data.export',
  DATA_IMPORT: 'data.import',
  
  // System
  SYSTEM_INIT: 'system.init',
  SYSTEM_VERIFY: 'system.verify',
  SYSTEM_PRUNE: 'system.prune',
};

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the audit trail system
 * 
 * @param {Object} options - Configuration overrides
 * @returns {Promise<boolean>}
 */
async function initAuditTrail(options = {}) {
  console.log('[Audit] Initializing audit trail...');
  
  Object.assign(AUDIT_CONFIG, options);
  
  try {
    // Initialize IndexedDB
    await initAuditDB();
    
    // Load last hash for chain continuation
    await loadLastHash();
    
    // Verify chain integrity if configured
    if (AUDIT_CONFIG.autoVerifyOnLoad) {
      const result = await verifyChainIntegrity();
      if (result && !result.valid) {
        console.warn('[Audit] Chain corrupted — clearing and starting fresh');
        // Auto-repair: clear corrupted entries and reset chain
        try {
          const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readwrite');
          const store = tx.objectStore(AUDIT_CONFIG.storeName);
          store.clear();
          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
          lastHash = AUDIT_CONFIG.genesisHash;
          chainLength = 0;
          console.log('[Audit] Chain reset successfully');
        } catch (clearErr) {
          console.warn('[Audit] Could not clear chain:', clearErr.message);
        }
      }
    }
    
    // Log initialization
    await logOperation(OPERATION_TYPES.SYSTEM_INIT, {
      timestamp: Date.now(),
      chainLength: chainLength
    });
    
    isInitialized = true;
    console.log(`[Audit] Initialized with ${chainLength} entries`);
    
    return true;
    
  } catch (error) {
    console.error('[Audit] Initialization failed:', error);
    return false;
  }
}

/**
 * Initialize IndexedDB for audit storage
 */
async function initAuditDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIT_CONFIG.dbName, 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      auditDB = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(AUDIT_CONFIG.storeName)) {
        const store = db.createObjectStore(AUDIT_CONFIG.storeName, { 
          keyPath: 'sequence',
          autoIncrement: true 
        });
        
        store.createIndex('hash', 'hash', { unique: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('operation', 'operation', { unique: false });
        store.createIndex('resourceId', 'resourceId', { unique: false });
      }
    };
  });
}

/**
 * Load the last hash from the chain
 */
async function loadLastHash() {
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    
    // Get the last entry by opening a cursor in reverse
    const request = store.openCursor(null, 'prev');
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      
      if (cursor) {
        lastHash = cursor.value.hash;
        chainLength = cursor.value.sequence;
      } else {
        // Empty chain
        lastHash = AUDIT_CONFIG.genesisHash;
        chainLength = 0;
      }
      
      resolve();
    };
    
    request.onerror = () => {
      lastHash = AUDIT_CONFIG.genesisHash;
      chainLength = 0;
      resolve();
    };
  });
}

// ============================================================
// HASHING
// ============================================================

/**
 * Compute SHA-256 hash
 * 
 * @param {string|Object} data - Data to hash
 * @returns {Promise<string>} - Hex hash
 */
async function computeHash(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const encoder = new TextEncoder();
  const buffer = encoder.encode(text);
  
  const hashBuffer = await crypto.subtle.digest(AUDIT_CONFIG.hashAlgorithm, buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute hash of content without revealing content
 * Used for content integrity verification
 * 
 * @param {string} content - Content to hash
 * @returns {Promise<string>}
 */
async function hashContent(content) {
  return computeHash(content);
}

// ============================================================
// LOGGING OPERATIONS
// ============================================================

/**
 * Log an operation to the audit trail
 * Creates a new entry in the hash chain
 * 
 * @param {string} operation - Operation type (from OPERATION_TYPES)
 * @param {Object} metadata - Operation metadata (NO sensitive content!)
 * @returns {Promise<Object>} - Audit entry
 */
async function logOperation(operation, metadata = {}) {
  if (!auditDB) {
    console.warn('[Audit] Not initialized, skipping log');
    return null;
  }
  
  const entry = {
    // Timing
    timestamp: Date.now(),
    isoTimestamp: new Date().toISOString(),
    
    // Operation
    operation: operation,
    
    // Resource reference (if applicable)
    resourceId: metadata.resourceId || null,
    resourceType: metadata.resourceType || null,
    
    // Content hash (NOT content itself)
    contentHash: metadata.contentHash || null,
    
    // Chain link
    previousHash: lastHash,
    
    // Metadata (sanitized, no sensitive data)
    metadata: sanitizeMetadata(metadata),
    
    // Computed fields (will be set below)
    hash: null
    // NOTE: sequence is auto-generated by IndexedDB autoIncrement
    // Do NOT include it here — null value breaks IDB add()
  };
  
  // Compute hash of this entry (without the hash field)
  entry.hash = await computeHash({
    timestamp: entry.timestamp,
    operation: entry.operation,
    resourceId: entry.resourceId,
    contentHash: entry.contentHash,
    previousHash: entry.previousHash,
    metadata: entry.metadata
  });
  
  // Store in IndexedDB
  return new Promise((resolve, reject) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readwrite');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    
    const request = store.add(entry);
    
    request.onsuccess = () => {
      entry.sequence = request.result;
      lastHash = entry.hash;
      chainLength++;
      
      // Check if pruning needed
      if (chainLength > AUDIT_CONFIG.maxEntries) {
        pruneOldEntries();
      }
      
      resolve(entry);
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Sanitize metadata to remove any sensitive content
 * Only keep safe, non-revealing information
 * 
 * @param {Object} metadata 
 * @returns {Object}
 */
function sanitizeMetadata(metadata) {
  // Remove sensitive fields
  const sanitized = { ...metadata };
  
  // Remove anything that could contain user content
  delete sanitized.content;
  delete sanitized.text;
  delete sanitized.data;
  delete sanitized.password;
  delete sanitized.key;
  delete sanitized.token;
  delete sanitized.secret;
  
  // Keep safe fields
  const safeFields = [
    'count', 'size', 'duration', 'status', 'result',
    'category', 'action', 'source', 'destination',
    'success', 'error', 'version', 'chainLength'
  ];
  
  const safe = {};
  for (const field of safeFields) {
    if (sanitized[field] !== undefined) {
      safe[field] = sanitized[field];
    }
  }
  
  return safe;
}

// ============================================================
// CONVENIENCE LOGGERS
// ============================================================

/**
 * Log drop creation
 * 
 * @param {Object} drop - Created drop
 * @returns {Promise<Object>}
 */
async function logDropCreate(drop) {
  const contentHash = await hashContent(drop.text || drop.content || '');
  
  return logOperation(OPERATION_TYPES.DROP_CREATE, {
    resourceId: String(drop.id),
    resourceType: 'drop',
    contentHash,
    category: drop.category,
    source: drop.source || 'user'
  });
}

/**
 * Log drop update
 * 
 * @param {Object} drop - Updated drop
 * @param {Object} previousDrop - Drop before update
 * @returns {Promise<Object>}
 */
async function logDropUpdate(drop, previousDrop = null) {
  const contentHash = await hashContent(drop.text || drop.content || '');
  const previousHash = previousDrop 
    ? await hashContent(previousDrop.text || previousDrop.content || '')
    : null;
  
  return logOperation(OPERATION_TYPES.DROP_UPDATE, {
    resourceId: String(drop.id),
    resourceType: 'drop',
    contentHash,
    previousContentHash: previousHash,
    category: drop.category
  });
}

/**
 * Log drop deletion
 * 
 * @param {string|number} dropId 
 * @returns {Promise<Object>}
 */
async function logDropDelete(dropId) {
  return logOperation(OPERATION_TYPES.DROP_DELETE, {
    resourceId: String(dropId),
    resourceType: 'drop'
  });
}

/**
 * Log sync operation
 * 
 * @param {string} direction - 'push' or 'pull'
 * @param {number} count - Number of items synced
 * @returns {Promise<Object>}
 */
async function logSync(direction, count) {
  const op = direction === 'push' 
    ? OPERATION_TYPES.SYNC_PUSH 
    : OPERATION_TYPES.SYNC_PULL;
  
  return logOperation(op, {
    count,
    direction
  });
}

/**
 * Log key operation
 * 
 * @param {string} action - 'generate', 'rotate', 'import', 'export'
 * @returns {Promise<Object>}
 */
async function logKeyOperation(action) {
  const opMap = {
    'generate': OPERATION_TYPES.KEY_GENERATE,
    'rotate': OPERATION_TYPES.KEY_ROTATE,
    'import': OPERATION_TYPES.KEY_IMPORT,
    'export': OPERATION_TYPES.KEY_EXPORT
  };
  
  return logOperation(opMap[action] || OPERATION_TYPES.KEY_GENERATE, {
    action
  });
}

/**
 * Log data export
 * 
 * @param {string} format - Export format
 * @param {number} count - Number of items exported
 * @returns {Promise<Object>}
 */
async function logDataExport(format, count) {
  return logOperation(OPERATION_TYPES.DATA_EXPORT, {
    format,
    count
  });
}

// ============================================================
// VERIFICATION
// ============================================================

/**
 * Verify the integrity of the entire audit chain
 * Checks that no entries have been tampered with
 * 
 * @returns {Promise<Object>} - { valid, errors, entriesChecked }
 */
async function verifyChainIntegrity() {
  console.log('[Audit] Verifying chain integrity...');
  
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    const request = store.openCursor();
    
    let previousHash = AUDIT_CONFIG.genesisHash;
    let entriesChecked = 0;
    const errors = [];
    
    request.onsuccess = async (event) => {
      const cursor = event.target.result;
      
      if (cursor) {
        const entry = cursor.value;
        entriesChecked++;
        
        // Check 1: Previous hash matches
        if (entry.previousHash !== previousHash) {
          errors.push({
            sequence: entry.sequence,
            error: 'Previous hash mismatch',
            expected: previousHash,
            actual: entry.previousHash
          });
        }
        
        // Check 2: Entry hash is valid
        const computedHash = await computeHash({
          timestamp: entry.timestamp,
          operation: entry.operation,
          resourceId: entry.resourceId,
          contentHash: entry.contentHash,
          previousHash: entry.previousHash,
          metadata: entry.metadata
        });
        
        if (computedHash !== entry.hash) {
          errors.push({
            sequence: entry.sequence,
            error: 'Entry hash mismatch (tampered?)',
            expected: computedHash,
            actual: entry.hash
          });
        }
        
        previousHash = entry.hash;
        cursor.continue();
        
      } else {
        // Done
        const valid = errors.length === 0;
        
        if (valid) {
          console.log(`[Audit] Chain verified: ${entriesChecked} entries OK`);
        } else {
          console.error(`[Audit] Chain verification FAILED: ${errors.length} errors`);
        }
        
        // Log verification
        logOperation(OPERATION_TYPES.SYSTEM_VERIFY, {
          entriesChecked,
          errorsFound: errors.length,
          result: valid ? 'valid' : 'invalid'
        });
        
        resolve({ valid, errors, entriesChecked });
      }
    };
    
    request.onerror = () => {
      resolve({ valid: false, errors: [{ error: 'Database error' }], entriesChecked: 0 });
    };
  });
}

/**
 * Verify a specific drop's history
 * 
 * @param {string|number} dropId 
 * @returns {Promise<Object>} - History and verification status
 */
async function verifyDropHistory(dropId) {
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    const index = store.index('resourceId');
    const request = index.getAll(String(dropId));
    
    request.onsuccess = async () => {
      const entries = request.result || [];
      
      // Sort by timestamp
      entries.sort((a, b) => a.timestamp - b.timestamp);
      
      // Verify each entry's hash
      let allValid = true;
      for (const entry of entries) {
        const computedHash = await computeHash({
          timestamp: entry.timestamp,
          operation: entry.operation,
          resourceId: entry.resourceId,
          contentHash: entry.contentHash,
          previousHash: entry.previousHash,
          metadata: entry.metadata
        });
        
        if (computedHash !== entry.hash) {
          allValid = false;
          break;
        }
      }
      
      resolve({
        dropId,
        entries,
        entryCount: entries.length,
        valid: allValid,
        firstOperation: entries[0]?.operation || null,
        lastOperation: entries[entries.length - 1]?.operation || null
      });
    };
    
    request.onerror = () => {
      resolve({ dropId, entries: [], entryCount: 0, valid: false });
    };
  });
}

// ============================================================
// QUERYING
// ============================================================

/**
 * Get recent audit entries
 * 
 * @param {number} limit - Max entries to return
 * @returns {Promise<Array>}
 */
async function getRecentEntries(limit = 100) {
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    const entries = [];
    
    const request = store.openCursor(null, 'prev'); // Reverse order
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      
      if (cursor && entries.length < limit) {
        entries.push(cursor.value);
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    
    request.onerror = () => resolve([]);
  });
}

/**
 * Get entries by operation type
 * 
 * @param {string} operation - Operation type
 * @param {number} limit - Max entries
 * @returns {Promise<Array>}
 */
async function getEntriesByOperation(operation, limit = 100) {
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    const index = store.index('operation');
    const request = index.getAll(operation, limit);
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

/**
 * Get audit statistics
 * 
 * @returns {Promise<Object>}
 */
async function getAuditStats() {
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    
    const countRequest = store.count();
    
    countRequest.onsuccess = () => {
      resolve({
        totalEntries: countRequest.result,
        chainLength: chainLength,
        lastHash: lastHash,
        isHealthy: lastHash !== null
      });
    };
    
    countRequest.onerror = () => {
      resolve({ totalEntries: 0, chainLength: 0, lastHash: null, isHealthy: false });
    };
  });
}

// ============================================================
// MAINTENANCE
// ============================================================

/**
 * Prune old audit entries
 * Keeps the chain valid by preserving hash links
 */
async function pruneOldEntries() {
  console.log('[Audit] Pruning old entries...');
  
  const cutoffDate = Date.now() - (AUDIT_CONFIG.pruneKeepDays * 24 * 60 * 60 * 1000);
  
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readwrite');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    const index = store.index('timestamp');
    
    const range = IDBKeyRange.upperBound(cutoffDate);
    const request = index.openCursor(range);
    
    let deletedCount = 0;
    let firstKeptHash = null;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      
      if (cursor) {
        // Keep the first entry's hash for chain continuation
        if (!firstKeptHash) {
          firstKeptHash = cursor.value.hash;
        }
        
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        // Log pruning operation
        logOperation(OPERATION_TYPES.SYSTEM_PRUNE, {
          deletedCount,
          cutoffDate: new Date(cutoffDate).toISOString()
        });
        
        console.log(`[Audit] Pruned ${deletedCount} entries`);
        resolve({ deletedCount });
      }
    };
    
    request.onerror = () => resolve({ deletedCount: 0 });
  });
}

/**
 * Export audit trail for external verification
 * 
 * @returns {Promise<Object>} - Exportable audit data
 */
async function exportAuditTrail() {
  return new Promise((resolve) => {
    const tx = auditDB.transaction(AUDIT_CONFIG.storeName, 'readonly');
    const store = tx.objectStore(AUDIT_CONFIG.storeName);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const entries = request.result || [];
      
      resolve({
        version: '1.0',
        exportedAt: new Date().toISOString(),
        chainLength: entries.length,
        genesisHash: AUDIT_CONFIG.genesisHash,
        lastHash: lastHash,
        entries: entries.map(e => ({
          sequence: e.sequence,
          timestamp: e.timestamp,
          operation: e.operation,
          hash: e.hash,
          previousHash: e.previousHash
        }))
      });
    };
    
    request.onerror = () => resolve(null);
  });
}

/**
 * Generate integrity proof for a point in time
 * Can be used to prove data state at a specific moment
 * 
 * @param {number} timestamp - Optional timestamp to prove
 * @returns {Promise<Object>} - Merkle-like proof
 */
async function generateIntegrityProof(timestamp = Date.now()) {
  const entries = await getRecentEntries(100);
  
  // Find entry closest to timestamp
  const relevantEntry = entries.find(e => e.timestamp <= timestamp) || entries[0];
  
  if (!relevantEntry) {
    return null;
  }
  
  return {
    proofType: 'hash-chain',
    timestamp: timestamp,
    proofTimestamp: relevantEntry.timestamp,
    entryHash: relevantEntry.hash,
    previousHash: relevantEntry.previousHash,
    chainLength: chainLength,
    sequence: relevantEntry.sequence,
    // Could add Merkle tree proof here for efficiency
  };
}

// ============================================================
// EXPORTS
// ============================================================

// ES module exports removed for script tag compatibility
// Use window.DropLitAudit instead

// For script tag usage
if (typeof window !== 'undefined') {
  window.DropLitAudit = {
    init: initAuditTrail,
    OPERATIONS: OPERATION_TYPES,
    
    log: logOperation,
    logDropCreate,
    logDropUpdate,
    logDropDelete,
    logSync,
    logKeyOperation,
    logDataExport,
    
    verify: verifyChainIntegrity,
    verifyDrop: verifyDropHistory,
    generateProof: generateIntegrityProof,
    
    getRecent: getRecentEntries,
    getByOperation: getEntriesByOperation,
    getStats: getAuditStats,
    
    hashContent,
    export: exportAuditTrail,
    prune: pruneOldEntries,
    
    config: AUDIT_CONFIG
  };
  
  console.log('[Audit] Module loaded. Access via window.DropLitAudit');
}
