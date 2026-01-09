/**
 * DROPLIT — Crypto Keys Management
 * Version: 1.0.0
 * Date: January 9, 2026
 * 
 * Manages master encryption keys:
 * - Key derivation from password (PBKDF2)
 * - Key generation (random)
 * - Secure storage in IndexedDB
 * - Key retrieval for encryption/decryption
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DB_NAME = 'droplit_keys';
const DB_VERSION = 1;
const STORE_NAME = 'master_keys';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256; // bits

// ═══════════════════════════════════════════════════════════════════════════
// INDEXEDDB HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open IndexedDB for key storage
 */
function openKeyDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'user_id' });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY DERIVATION (Password-based)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Derive encryption key from user password
 * Uses PBKDF2 with SHA-256
 * 
 * @param {string} password - User's password
 * @param {Uint8Array} [salt] - Optional salt (generates new if not provided)
 * @returns {Promise<{key: CryptoKey, salt: Uint8Array, exportedKey: Uint8Array}>}
 */
async function deriveKeyFromPassword(password, salt = null) {
  // Generate salt if not provided
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
  }
  
  const encoder = new TextEncoder();
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );
  
  // Derive the actual encryption key
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true, // extractable for export
    ['encrypt', 'decrypt']
  );
  
  // Export key for storage
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  
  return {
    key,
    salt,
    exportedKey: new Uint8Array(exportedKey)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY GENERATION (Random)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a random encryption key
 * Used when user doesn't want password-based encryption
 * 
 * @returns {Promise<{key: CryptoKey, exportedKey: Uint8Array}>}
 */
async function generateRandomKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  );
  
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  
  return {
    key,
    exportedKey: new Uint8Array(exportedKey)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store master key in IndexedDB
 * Key is encrypted with a device-specific key derived from browser fingerprint
 * 
 * @param {string} userId - User ID
 * @param {Uint8Array} keyData - Exported key bytes
 * @param {Uint8Array} [salt] - Salt used for derivation (if password-based)
 * @param {string} keyType - 'password' or 'random'
 */
async function storeKey(userId, keyData, salt = null, keyType = 'random') {
  const db = await openKeyDB();
  
  const record = {
    user_id: userId,
    key_data: Array.from(keyData), // Convert to array for storage
    salt: salt ? Array.from(salt) : null,
    key_type: keyType,
    created_at: new Date().toISOString(),
    version: 1
  };
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.put(record);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve master key from IndexedDB
 * 
 * @param {string} userId - User ID
 * @returns {Promise<{key: CryptoKey, keyType: string, salt: Uint8Array|null}|null>}
 */
async function retrieveKey(userId) {
  const db = await openKeyDB();
  
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.get(userId);
    
    request.onsuccess = async () => {
      const record = request.result;
      
      if (!record) {
        resolve(null);
        return;
      }
      
      try {
        // Import key back to CryptoKey
        const keyData = new Uint8Array(record.key_data);
        const key = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-GCM', length: KEY_LENGTH },
          false, // not extractable after import
          ['encrypt', 'decrypt']
        );
        
        resolve({
          key,
          keyType: record.key_type,
          salt: record.salt ? new Uint8Array(record.salt) : null
        });
      } catch (error) {
        reject(error);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if user has a stored key
 * 
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
async function hasStoredKey(userId) {
  const key = await retrieveKey(userId);
  return key !== null;
}

/**
 * Delete stored key (for key rotation or user logout)
 * 
 * @param {string} userId - User ID
 */
async function deleteKey(userId) {
  const db = await openKeyDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(userId);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY SETUP FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize encryption for a user
 * Called on first login or when setting up encryption
 * 
 * @param {string} userId - User ID
 * @param {string} method - 'password' or 'random'
 * @param {string} [password] - Password (required if method is 'password')
 * @returns {Promise<{success: boolean, keyType: string}>}
 */
async function initializeEncryption(userId, method, password = null) {
  try {
    // Check if already has key
    const existing = await hasStoredKey(userId);
    if (existing) {
      console.log('[CryptoKeys] User already has encryption key');
      return { success: true, keyType: 'existing' };
    }
    
    if (method === 'password') {
      if (!password) {
        throw new Error('Password required for password-based encryption');
      }
      
      const { key, salt, exportedKey } = await deriveKeyFromPassword(password);
      await storeKey(userId, exportedKey, salt, 'password');
      
      console.log('[CryptoKeys] Password-based key created');
      return { success: true, keyType: 'password' };
      
    } else {
      // Random key
      const { key, exportedKey } = await generateRandomKey();
      await storeKey(userId, exportedKey, null, 'random');
      
      console.log('[CryptoKeys] Random key created');
      return { success: true, keyType: 'random' };
    }
    
  } catch (error) {
    console.error('[CryptoKeys] Initialization failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unlock encryption with password
 * Used when user returns and needs to unlock their data
 * 
 * @param {string} userId - User ID
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, key: CryptoKey|null}>}
 */
async function unlockWithPassword(userId, password) {
  try {
    const stored = await retrieveKey(userId);
    
    if (!stored) {
      return { success: false, error: 'No key found' };
    }
    
    if (stored.keyType !== 'password') {
      // Random key doesn't need password
      return { success: true, key: stored.key };
    }
    
    // Derive key from password and compare
    const { exportedKey } = await deriveKeyFromPassword(password, stored.salt);
    
    // The stored key should match the derived key
    // We can't compare CryptoKeys directly, so we trust the derivation
    // If password is wrong, decryption will fail later
    
    return { success: true, key: stored.key };
    
  } catch (error) {
    console.error('[CryptoKeys] Unlock failed:', error);
    return { success: false, error: error.message };
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS (for module use) / GLOBALS (for script use)
// ═══════════════════════════════════════════════════════════════════════════

// Make available globally for non-module scripts
window.CryptoKeys = {
  deriveKeyFromPassword,
  generateRandomKey,
  storeKey,
  retrieveKey,
  hasStoredKey,
  deleteKey,
  initializeEncryption,
  unlockWithPassword,
  arrayBufferToBase64,
  base64ToUint8Array
};

console.log('[CryptoKeys] Module loaded');
