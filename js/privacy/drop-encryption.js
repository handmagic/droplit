/**
 * DROPLIT — Drop Encryption Module
 * Version: 1.0.0
 * Date: January 9, 2026
 * 
 * Encrypts and decrypts drops using AES-GCM
 * Works with crypto-keys.js for key management
 * 
 * Architecture:
 * - Sensitive fields encrypted into single blob
 * - Metadata remains visible for filtering/sorting
 * - ASKI works via client-side decryption
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ENCRYPTION_VERSION = 1;
const NONCE_LENGTH = 12; // bytes for AES-GCM

// Fields that contain sensitive data and must be encrypted
const SENSITIVE_FIELDS = [
  'text',
  'audioData',
  'image',
  'notes',
  'geo'        // Location can be sensitive
];

// Fields that remain visible (for filtering, sorting, UI)
const VISIBLE_FIELDS = [
  'id',
  'category',
  'timestamp',
  'date',
  'time',
  'isMedia',
  'creator',
  'source',
  'markers',
  'privacy_level',
  'synced',
  'syntrise_id',
  'sessionId',
  'aiGenerated',
  'isMerged',
  'isUploaded',
  // Audio metadata (non-sensitive)
  'audioFormat',
  'audioSize',
  'audioBitrate',
  'duration'
];

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENCRYPTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encrypt data with AES-GCM
 * 
 * @param {string} plaintext - Data to encrypt
 * @param {CryptoKey} key - Encryption key
 * @returns {Promise<{encrypted: string, nonce: string}>}
 */
async function encryptData(plaintext, key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    data
  );
  
  // Convert to base64 for storage
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    nonce: arrayBufferToBase64(nonce)
  };
}

/**
 * Decrypt data with AES-GCM
 * 
 * @param {string} encryptedBase64 - Encrypted data (base64)
 * @param {string} nonceBase64 - Nonce (base64)
 * @param {CryptoKey} key - Decryption key
 * @returns {Promise<string>}
 */
async function decryptData(encryptedBase64, nonceBase64, key) {
  const encrypted = base64ToUint8Array(encryptedBase64);
  const nonce = base64ToUint8Array(nonceBase64);
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// ═══════════════════════════════════════════════════════════════════════════
// DROP ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encrypt a drop for storage
 * Sensitive fields → encrypted blob
 * Visible fields → unchanged
 * 
 * @param {Object} drop - Plain drop object
 * @param {CryptoKey} key - Master encryption key
 * @returns {Promise<Object>} - Encrypted drop
 */
async function encryptDrop(drop, key) {
  // Extract sensitive fields
  const sensitiveData = {};
  for (const field of SENSITIVE_FIELDS) {
    if (drop[field] !== undefined && drop[field] !== null) {
      sensitiveData[field] = drop[field];
    }
  }
  
  // If no sensitive data, return as-is with marker
  if (Object.keys(sensitiveData).length === 0) {
    return {
      ...drop,
      encryption_version: 0 // Not encrypted
    };
  }
  
  // Encrypt sensitive data
  const { encrypted, nonce } = await encryptData(
    JSON.stringify(sensitiveData),
    key
  );
  
  // Build encrypted drop
  const encryptedDrop = {
    // Copy visible fields
    ...Object.fromEntries(
      Object.entries(drop).filter(([k]) => VISIBLE_FIELDS.includes(k))
    ),
    
    // Add encryption data
    encrypted_content: encrypted,
    encryption_nonce: nonce,
    encryption_version: ENCRYPTION_VERSION,
    
    // Ensure privacy level is set
    privacy_level: drop.privacy_level || 'standard'
  };
  
  return encryptedDrop;
}

/**
 * Decrypt a drop from storage
 * 
 * @param {Object} encryptedDrop - Encrypted drop object
 * @param {CryptoKey} key - Master decryption key
 * @returns {Promise<Object>} - Plain drop
 */
async function decryptDrop(encryptedDrop, key) {
  // Check if drop is encrypted
  if (!encryptedDrop.encrypted_content || encryptedDrop.encryption_version === 0) {
    // Not encrypted, return as-is
    return encryptedDrop;
  }
  
  try {
    // Decrypt sensitive data
    const decryptedJson = await decryptData(
      encryptedDrop.encrypted_content,
      encryptedDrop.encryption_nonce,
      key
    );
    
    const sensitiveData = JSON.parse(decryptedJson);
    
    // Merge back into drop
    const plainDrop = {
      ...encryptedDrop,
      ...sensitiveData
    };
    
    // Remove encryption fields from plain version
    delete plainDrop.encrypted_content;
    delete plainDrop.encryption_nonce;
    
    return plainDrop;
    
  } catch (error) {
    console.error('[DropEncryption] Decryption failed:', error);
    // Return drop with error marker
    return {
      ...encryptedDrop,
      _decryption_error: true,
      _error_message: error.message
    };
  }
}

/**
 * Decrypt multiple drops
 * 
 * @param {Array} encryptedDrops - Array of encrypted drops
 * @param {CryptoKey} key - Master decryption key
 * @returns {Promise<Array>} - Array of plain drops
 */
async function decryptDrops(encryptedDrops, key) {
  const results = [];
  
  for (const drop of encryptedDrops) {
    const decrypted = await decryptDrop(drop, key);
    results.push(decrypted);
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVACY LEVEL HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Privacy levels:
 * - standard: encrypted, embeddings in cloud, full features
 * - high: encrypted, no cloud embeddings, reduced search
 * - maximum: local only, no sync to server
 */

const PRIVACY_LEVELS = {
  standard: {
    name: 'Standard',
    description: 'Encrypted content, full AI features',
    sync: true,
    embeddings: true,
    icon: '🔒'
  },
  high: {
    name: 'High Security',
    description: 'Encrypted, no cloud search',
    sync: true,
    embeddings: false,
    icon: '🔐'
  },
  maximum: {
    name: 'Maximum',
    description: 'Local only, no sync',
    sync: false,
    embeddings: false,
    icon: '🛡️'
  }
};

/**
 * Check if drop should be synced based on privacy level
 */
function shouldSync(drop) {
  const level = drop.privacy_level || 'standard';
  return PRIVACY_LEVELS[level]?.sync !== false;
}

/**
 * Check if drop should have embeddings generated
 */
function shouldGenerateEmbeddings(drop) {
  const level = drop.privacy_level || 'standard';
  return PRIVACY_LEVELS[level]?.embeddings !== false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prepare drop for sync to Supabase
 * - Encrypts if needed
 * - Formats for backend schema
 * 
 * @param {Object} drop - Local drop
 * @param {CryptoKey} key - Encryption key
 * @returns {Promise<Object|null>} - Prepared drop or null if shouldn't sync
 */
async function prepareDropForSync(drop, key) {
  // Check if should sync
  if (!shouldSync(drop)) {
    console.log('[DropEncryption] Drop privacy_level=maximum, skipping sync');
    return null;
  }
  
  // Encrypt
  const encrypted = await encryptDrop(drop, key);
  
  // Format for Supabase schema
  return {
    external_id: String(encrypted.id),
    
    // Encrypted content
    encrypted_content: encrypted.encrypted_content,
    encryption_nonce: encrypted.encryption_nonce,
    encryption_version: encrypted.encryption_version,
    
    // Clear plaintext fields (safety)
    content: null,
    text: null,
    
    // Visible metadata
    category: encrypted.category,
    privacy_level: encrypted.privacy_level,
    source: encrypted.source || 'droplit',
    
    // Metadata as JSONB
    metadata: {
      isMedia: encrypted.isMedia,
      creator: encrypted.creator,
      markers: encrypted.markers,
      timestamp: encrypted.timestamp,
      date: encrypted.date,
      time: encrypted.time,
      audioFormat: encrypted.audioFormat,
      audioSize: encrypted.audioSize,
      duration: encrypted.duration
    }
  };
}

/**
 * Process drop from Supabase after fetch
 * - Decrypts
 * - Formats for frontend
 * 
 * @param {Object} serverDrop - Drop from Supabase
 * @param {CryptoKey} key - Decryption key
 * @returns {Promise<Object>} - Frontend drop
 */
async function processDropFromServer(serverDrop, key) {
  // Build drop structure from server data
  const drop = {
    id: parseInt(serverDrop.external_id) || serverDrop.id,
    syntrise_id: serverDrop.id,
    synced: true,
    
    // From encrypted content
    encrypted_content: serverDrop.encrypted_content,
    encryption_nonce: serverDrop.encryption_nonce,
    encryption_version: serverDrop.encryption_version,
    
    // From visible fields
    category: serverDrop.category,
    privacy_level: serverDrop.privacy_level,
    source: serverDrop.source,
    
    // From metadata JSONB
    ...(serverDrop.metadata || {})
  };
  
  // Decrypt
  return decryptDrop(drop, key);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if a drop is encrypted
 */
function isEncrypted(drop) {
  return drop.encryption_version > 0 && drop.encrypted_content;
}

/**
 * Get encryption status text for UI
 */
function getEncryptionStatus(drop) {
  if (!isEncrypted(drop)) {
    return { icon: '⚠️', text: 'Not encrypted', class: 'unencrypted' };
  }
  
  const level = PRIVACY_LEVELS[drop.privacy_level] || PRIVACY_LEVELS.standard;
  return {
    icon: level.icon,
    text: level.name,
    class: `privacy-${drop.privacy_level}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if drop needs encryption migration
 */
function needsEncryptionMigration(drop) {
  // Has content but not encrypted
  return (drop.text || drop.audioData || drop.image) && 
         (!drop.encryption_version || drop.encryption_version === 0);
}

/**
 * Migrate an unencrypted drop to encrypted
 */
async function migrateDrop(drop, key) {
  if (!needsEncryptionMigration(drop)) {
    return drop;
  }
  
  console.log('[DropEncryption] Migrating drop:', drop.id);
  return encryptDrop(drop, key);
}

/**
 * Migrate all drops in localStorage
 */
async function migrateAllDrops(key) {
  const ideasJson = localStorage.getItem('ideas');
  if (!ideasJson) return { migrated: 0, total: 0 };
  
  const ideas = JSON.parse(ideasJson);
  let migrated = 0;
  
  const migratedIdeas = [];
  for (const drop of ideas) {
    if (needsEncryptionMigration(drop)) {
      const encrypted = await encryptDrop(drop, key);
      migratedIdeas.push(encrypted);
      migrated++;
    } else {
      migratedIdeas.push(drop);
    }
  }
  
  // Save back to localStorage
  localStorage.setItem('ideas', JSON.stringify(migratedIdeas));
  
  console.log(`[DropEncryption] Migration complete: ${migrated}/${ideas.length} drops`);
  return { migrated, total: ideas.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

window.DropEncryption = {
  // Core functions
  encryptDrop,
  decryptDrop,
  decryptDrops,
  
  // Privacy
  PRIVACY_LEVELS,
  shouldSync,
  shouldGenerateEmbeddings,
  
  // Sync helpers
  prepareDropForSync,
  processDropFromServer,
  
  // Utilities
  isEncrypted,
  getEncryptionStatus,
  
  // Migration
  needsEncryptionMigration,
  migrateDrop,
  migrateAllDrops,
  
  // Constants
  SENSITIVE_FIELDS,
  VISIBLE_FIELDS,
  ENCRYPTION_VERSION
};

console.log('[DropEncryption] Module loaded');
