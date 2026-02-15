// ============================================
// DROPLIT MEDIA STORAGE v1.0
// OPFS-based encrypted media vault
// ============================================
// 
// Purpose: Store original media files (photos, audio) in
// Origin Private File System, encrypted with user's master key.
// localStorage keeps only compressed thumbnails.
//
// Architecture:
//   OPFS /media/   → encrypted originals
//   OPFS /index/   → media index (what files exist)
//   localStorage   → thumbnails + metadata (lightweight)
//
// Dependencies:
//   - window.DropLitKeys (crypto-keys.js) — for master key
//   - Web Crypto API (AES-GCM) — for encryption
//   - OPFS API (navigator.storage.getDirectory)
//
// Usage:
//   await DropLitMediaStorage.init();
//   const ref = await DropLitMediaStorage.saveOriginal(dropId, blob, 'photo');
//   const blob = await DropLitMediaStorage.loadOriginal(dropId, 'photo');
//   const thumbDataUrl = await DropLitMediaStorage.generateThumbnail(blob, 200);
// ============================================

(function() {
  'use strict';

  // ============================================
  // CONSTANTS
  // ============================================
  
  const MODULE_NAME = 'MediaStorage';
  const OPFS_MEDIA_DIR = 'media';
  const OPFS_INDEX_FILE = 'vault_index.json';
  
  // Thumbnail settings
  const THUMB_MAX_SIZE = 400;      // px, longest side
  const THUMB_QUALITY = 0.7;       // JPEG quality
  
  // Encryption: AES-256-GCM
  const NONCE_LENGTH = 12;         // bytes for AES-GCM IV
  const ALGO = 'AES-GCM';
  
  // ============================================
  // STATE
  // ============================================
  
  let _initialized = false;
  let _supported = false;
  let _root = null;        // OPFS root directory handle
  let _mediaDir = null;    // /media/ directory handle
  let _persisted = false;  // navigator.storage.persist() result
  let _index = {};         // {dropId: {files: [{name, type, size, created}], ...}}
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  async function init() {
    if (_initialized) return { success: true, supported: _supported };
    
    try {
      // Check OPFS support
      if (!navigator.storage || !navigator.storage.getDirectory) {
        console.warn(`[${MODULE_NAME}] OPFS not supported in this browser`);
        _supported = false;
        _initialized = true;
        return { success: true, supported: false };
      }
      
      // Get root
      _root = await navigator.storage.getDirectory();
      
      // Create /media/ directory
      _mediaDir = await _root.getDirectoryHandle(OPFS_MEDIA_DIR, { create: true });
      
      // Request persistent storage (prevents browser eviction)
      try {
        _persisted = await navigator.storage.persist();
        if (_persisted) {
          console.log(`[${MODULE_NAME}] Persistent storage granted`);
        } else {
          console.log(`[${MODULE_NAME}] Persistent storage: not granted (normal for desktop Chrome)`);
        }
      } catch (e) {
        console.warn(`[${MODULE_NAME}] persist() not available`);
      }
      
      // Load index
      await _loadIndex();
      
      _supported = true;
      _initialized = true;
      
      const usage = await getStorageUsage();
      console.log(`[${MODULE_NAME}] Initialized. ${Object.keys(_index).length} media entries, ` +
        `${_formatBytes(usage.used)} used, ${_formatBytes(usage.available)} available`);
      
      return { success: true, supported: true, persisted: _persisted };
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] Init failed:`, err);
      _supported = false;
      _initialized = true;
      return { success: false, supported: false, error: err.message };
    }
  }
  
  function isSupported() {
    return _supported;
  }
  
  function isInitialized() {
    return _initialized && _supported;
  }
  
  // ============================================
  // SAVE ORIGINAL (encrypt + write to OPFS)
  // ============================================
  
  /**
   * Save original media file to OPFS, encrypted.
   * 
   * @param {string|number} dropId - Drop ID (Date.now())
   * @param {Blob|File} blob - Original media file
   * @param {string} mediaType - 'photo' | 'audio' | 'scan' | 'video'
   * @returns {object} { success, filename, size, encrypted }
   */
  async function saveOriginal(dropId, blob, mediaType) {
    if (!_supported || !_mediaDir) {
      console.warn(`[${MODULE_NAME}] OPFS not available, cannot save`);
      return { success: false, error: 'OPFS not available' };
    }
    
    const dropIdStr = String(dropId);
    const filename = `${dropIdStr}_${mediaType}.enc`;
    
    try {
      // Get encryption key
      const key = await _getEncryptionKey();
      
      let dataToWrite;
      let isEncrypted = false;
      
      if (key) {
        // Encrypt: [12 bytes nonce][encrypted data]
        const plainBytes = new Uint8Array(await blob.arrayBuffer());
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
        
        const encryptedBuffer = await crypto.subtle.encrypt(
          { name: ALGO, iv: nonce },
          key,
          plainBytes
        );
        
        // Pack: nonce + ciphertext
        dataToWrite = new Uint8Array(NONCE_LENGTH + encryptedBuffer.byteLength);
        dataToWrite.set(nonce, 0);
        dataToWrite.set(new Uint8Array(encryptedBuffer), NONCE_LENGTH);
        isEncrypted = true;
        
      } else {
        // No encryption key — store raw (user hasn't set up encryption)
        dataToWrite = new Uint8Array(await blob.arrayBuffer());
        isEncrypted = false;
      }
      
      // Write to OPFS
      const fileHandle = await _mediaDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(dataToWrite);
      await writable.close();
      
      // Update index
      if (!_index[dropIdStr]) {
        _index[dropIdStr] = { files: [] };
      }
      
      // Remove existing entry for this type (re-save case)
      _index[dropIdStr].files = _index[dropIdStr].files.filter(f => f.type !== mediaType);
      
      _index[dropIdStr].files.push({
        name: filename,
        type: mediaType,
        size: dataToWrite.byteLength,
        originalSize: blob.size,
        mimeType: blob.type || _guessMimeType(mediaType),
        encrypted: isEncrypted,
        created: Date.now()
      });
      
      await _saveIndex();
      
      console.log(`[${MODULE_NAME}] Saved ${mediaType}: ${filename} (${_formatBytes(dataToWrite.byteLength)}, encrypted: ${isEncrypted})`);
      
      return {
        success: true,
        filename: filename,
        size: dataToWrite.byteLength,
        originalSize: blob.size,
        encrypted: isEncrypted
      };
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] Save failed for ${dropIdStr}:`, err);
      return { success: false, error: err.message };
    }
  }
  
  // ============================================
  // LOAD ORIGINAL (read from OPFS + decrypt)
  // ============================================
  
  /**
   * Load and decrypt original media file from OPFS.
   * 
   * @param {string|number} dropId - Drop ID
   * @param {string} mediaType - 'photo' | 'audio' | 'scan' | 'video'
   * @returns {Blob|null} Decrypted original blob, or null
   */
  async function loadOriginal(dropId, mediaType) {
    if (!_supported || !_mediaDir) return null;
    
    const dropIdStr = String(dropId);
    const filename = `${dropIdStr}_${mediaType}.enc`;
    
    try {
      // Read from OPFS
      const fileHandle = await _mediaDir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const data = new Uint8Array(await file.arrayBuffer());
      
      // Check index for encryption status
      const entry = _getIndexEntry(dropIdStr, mediaType);
      const mimeType = entry?.mimeType || _guessMimeType(mediaType);
      
      if (entry?.encrypted === false) {
        // Stored unencrypted
        return new Blob([data], { type: mimeType });
      }
      
      // Decrypt: first 12 bytes = nonce, rest = ciphertext
      const nonce = data.slice(0, NONCE_LENGTH);
      const ciphertext = data.slice(NONCE_LENGTH);
      
      // Try primary key first
      const key = await _getEncryptionKey();
      if (key) {
        try {
          const decryptedBuffer = await crypto.subtle.decrypt(
            { name: ALGO, iv: nonce }, key, ciphertext
          );
          return new Blob([decryptedBuffer], { type: mimeType });
        } catch (primaryErr) {
          // Primary key failed — try all other stored keys
          console.warn(`[${MODULE_NAME}] Primary key failed for ${dropIdStr}/${mediaType}, trying fallback keys...`);
        }
      }
      
      // Fallback: try all user keys from IndexedDB (handles userId change after re-login)
      const allKeys = await _getAllEncryptionKeys();
      for (const fallbackKey of allKeys) {
        try {
          const decryptedBuffer = await crypto.subtle.decrypt(
            { name: ALGO, iv: nonce }, fallbackKey, ciphertext
          );
          console.log(`[${MODULE_NAME}] Decrypted ${dropIdStr}/${mediaType} with fallback key`);
          return new Blob([decryptedBuffer], { type: mimeType });
        } catch (e) {
          // This key didn't work either — try next
        }
      }
      
      console.error(`[${MODULE_NAME}] All keys failed for ${dropIdStr}/${mediaType}`);
      return null;
      
    } catch (err) {
      if (err.name === 'NotFoundError') {
        return null;
      }
      console.error(`[${MODULE_NAME}] Load failed for ${dropIdStr}/${mediaType}:`, err);
      return null;
    }
  }
  
  // ============================================
  // THUMBNAIL GENERATION
  // ============================================
  
  /**
   * Generate compressed thumbnail from image blob.
   * Does NOT save to OPFS — returns dataURL for localStorage.
   * 
   * @param {Blob} imageBlob - Original image
   * @param {number} maxSize - Max dimension (default 400)
   * @returns {string} JPEG dataURL
   */
  async function generateThumbnail(imageBlob, maxSize) {
    maxSize = maxSize || THUMB_MAX_SIZE;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = function() {
        try {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          
          if (w > maxSize || h > maxSize) {
            if (w > h) {
              h = Math.round(h * maxSize / w);
              w = maxSize;
            } else {
              w = Math.round(w * maxSize / h);
              h = maxSize;
            }
          }
          
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          
          const dataUrl = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
          resolve(dataUrl);
          
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = function() {
        reject(new Error('Failed to load image for thumbnail'));
      };
      
      img.src = URL.createObjectURL(imageBlob);
    });
  }
  
  // ============================================
  // DELETE
  // ============================================
  
  /**
   * Delete all media files for a drop from OPFS.
   * 
   * @param {string|number} dropId
   * @returns {boolean} success
   */
  async function deleteMedia(dropId) {
    if (!_supported || !_mediaDir) return false;
    
    const dropIdStr = String(dropId);
    const entry = _index[dropIdStr];
    
    if (!entry || !entry.files) return true; // nothing to delete
    
    let allDeleted = true;
    
    for (const file of entry.files) {
      try {
        await _mediaDir.removeEntry(file.name);
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          console.warn(`[${MODULE_NAME}] Delete failed: ${file.name}`, err);
          allDeleted = false;
        }
      }
    }
    
    delete _index[dropIdStr];
    await _saveIndex();
    
    return allDeleted;
  }
  
  // ============================================
  // HAS ORIGINAL (check without loading)
  // ============================================
  
  /**
   * Check if original media exists in OPFS for a drop.
   * 
   * @param {string|number} dropId
   * @param {string} mediaType - 'photo' | 'audio' (optional, checks any)
   * @returns {boolean}
   */
  function hasOriginal(dropId, mediaType) {
    const dropIdStr = String(dropId);
    const entry = _index[dropIdStr];
    if (!entry || !entry.files || entry.files.length === 0) return false;
    if (mediaType) return entry.files.some(f => f.type === mediaType);
    return true;
  }
  
  /**
   * Get info about stored media for a drop.
   * 
   * @param {string|number} dropId
   * @returns {object|null} { files: [{name, type, size, encrypted, created}] }
   */
  function getMediaInfo(dropId) {
    return _index[String(dropId)] || null;
  }
  
  // ============================================
  // STORAGE USAGE
  // ============================================
  
  async function getStorageUsage() {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: (estimate.quota || 0) - (estimate.usage || 0),
        quota: estimate.quota || 0,
        percent: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0,
        persisted: _persisted
      };
    } catch (err) {
      return { used: 0, available: 0, quota: 0, percent: 0, persisted: false };
    }
  }
  
  /**
   * Get total size of all media in OPFS index.
   * @returns {number} bytes
   */
  function getTotalMediaSize() {
    let total = 0;
    for (const dropId in _index) {
      if (_index[dropId].files) {
        for (const f of _index[dropId].files) {
          total += f.size || 0;
        }
      }
    }
    return total;
  }
  
  // ============================================
  // MIGRATION: existing base64 → OPFS
  // ============================================
  
  /**
   * Migrate existing base64 media from localStorage drops to OPFS.
   * Call once after OPFS init. Idempotent (skips already migrated).
   * 
   * @returns {object} { migrated, skipped, failed }
   */
  async function migrateExistingMedia() {
    if (!_supported) return { migrated: 0, skipped: 0, failed: 0 };
    
    let localDrops;
    try {
      const raw = localStorage.getItem('droplit_ideas');
      localDrops = raw ? JSON.parse(raw) : [];
    } catch (e) {
      return { migrated: 0, skipped: 0, failed: 0 };
    }
    
    let migrated = 0, skipped = 0, failed = 0;
    let modified = false;
    
    for (const drop of localDrops) {
      if (!drop || !drop.id) continue;
      
      // Photo: has base64 image, not yet in OPFS
      if (drop.image && drop.image.startsWith('data:') && !hasOriginal(drop.id, 'photo')) {
        try {
          const blob = _dataUrlToBlob(drop.image);
          const result = await saveOriginal(drop.id, blob, 'photo');
          
          if (result.success) {
            // Generate smaller thumbnail for localStorage
            const thumb = await generateThumbnail(blob, THUMB_MAX_SIZE);
            drop.image = thumb;
            drop.mediaRef = result.filename;
            drop.mediaSize = result.originalSize;
            drop.mediaSaved = true;
            modified = true;
            migrated++;
          } else {
            failed++;
          }
        } catch (err) {
          console.warn(`[${MODULE_NAME}] Migration failed for photo ${drop.id}:`, err);
          failed++;
        }
      }
      // Audio: has base64 audioData, not yet in OPFS
      else if (drop.audioData && drop.audioData.startsWith('data:') && !hasOriginal(drop.id, 'audio')) {
        try {
          const blob = _dataUrlToBlob(drop.audioData);
          const result = await saveOriginal(drop.id, blob, 'audio');
          
          if (result.success) {
            // Clear heavy base64 from localStorage, keep reference
            drop.audioData = null;
            drop.mediaRef = result.filename;
            drop.mediaSize = result.originalSize;
            drop.mediaSaved = true;
            modified = true;
            migrated++;
          } else {
            failed++;
          }
        } catch (err) {
          console.warn(`[${MODULE_NAME}] Migration failed for audio ${drop.id}:`, err);
          failed++;
        }
      }
      else {
        skipped++;
      }
    }
    
    // Save modified drops back to localStorage
    if (modified) {
      try {
        localStorage.setItem('droplit_ideas', JSON.stringify(localDrops));
        console.log(`[${MODULE_NAME}] Migration: updated localStorage (freed heavy base64)`);
      } catch (e) {
        console.error(`[${MODULE_NAME}] Failed to save migrated drops:`, e);
      }
    }
    
    if (migrated > 0) {
      console.log(`[${MODULE_NAME}] Migration complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
    }
    
    return { migrated, skipped, failed };
  }
  
  // ============================================
  // EXPORT (for .dvault or cloud upload)
  // ============================================
  
  /**
   * Get encrypted blob for a drop's media (for cloud upload).
   * Returns the raw OPFS file contents (already encrypted).
   * 
   * @param {string|number} dropId
   * @param {string} mediaType
   * @returns {Blob|null} Encrypted blob ready for upload
   */
  async function getEncryptedBlob(dropId, mediaType) {
    if (!_supported || !_mediaDir) return null;
    
    const filename = `${String(dropId)}_${mediaType}.enc`;
    
    try {
      const fileHandle = await _mediaDir.getFileHandle(filename);
      return await fileHandle.getFile();
    } catch (err) {
      return null;
    }
  }
  
  /**
   * Write pre-encrypted blob to OPFS (for restore from cloud).
   * 
   * @param {string|number} dropId
   * @param {string} mediaType
   * @param {Blob} encryptedBlob - Already encrypted data
   * @param {object} meta - { mimeType, originalSize }
   * @returns {boolean} success
   */
  async function writeEncryptedBlob(dropId, mediaType, encryptedBlob, meta) {
    if (!_supported || !_mediaDir) return false;
    
    const dropIdStr = String(dropId);
    const filename = `${dropIdStr}_${mediaType}.enc`;
    
    try {
      const fileHandle = await _mediaDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(encryptedBlob);
      await writable.close();
      
      // Update index
      if (!_index[dropIdStr]) {
        _index[dropIdStr] = { files: [] };
      }
      _index[dropIdStr].files = _index[dropIdStr].files.filter(f => f.type !== mediaType);
      _index[dropIdStr].files.push({
        name: filename,
        type: mediaType,
        size: encryptedBlob.size,
        originalSize: meta?.originalSize || encryptedBlob.size,
        mimeType: meta?.mimeType || _guessMimeType(mediaType),
        encrypted: true,
        created: Date.now()
      });
      
      await _saveIndex();
      return true;
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] writeEncryptedBlob failed:`, err);
      return false;
    }
  }
  
  // ============================================
  // INTERNAL: Index management
  // ============================================
  
  async function _loadIndex() {
    try {
      const fileHandle = await _root.getFileHandle(OPFS_INDEX_FILE);
      const file = await fileHandle.getFile();
      const text = await file.text();
      _index = JSON.parse(text);
    } catch (err) {
      // File doesn't exist yet — fresh install
      _index = {};
    }
  }
  
  async function _saveIndex() {
    try {
      const fileHandle = await _root.getFileHandle(OPFS_INDEX_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(_index));
      await writable.close();
    } catch (err) {
      console.error(`[${MODULE_NAME}] Failed to save index:`, err);
    }
  }
  
  function _getIndexEntry(dropIdStr, mediaType) {
    const entry = _index[dropIdStr];
    if (!entry || !entry.files) return null;
    return entry.files.find(f => f.type === mediaType) || null;
  }
  
  // ============================================
  // INTERNAL: Encryption key
  // ============================================
  
  async function _getEncryptionKey() {
    // Get key from DropLitKeys module
    const keysModule = window.DropLitKeys;
    if (!keysModule?.retrieveKey) return null;
    
    // Need user ID
    const userId = _getCurrentUserId();
    if (!userId) return null;
    
    try {
      const keyData = await keysModule.retrieveKey(userId);
      if (!keyData?.key) return null;
      
      // DropLitKeys returns CryptoKey from TweetNaCl (raw bytes).
      // We need Web Crypto AES-GCM key for large files.
      // If keyData.key is already a CryptoKey with AES-GCM, use directly.
      // If it's raw bytes, import for AES-GCM.
      
      if (keyData.key instanceof CryptoKey) {
        // Check if usable for AES-GCM
        if (keyData.key.algorithm?.name === 'AES-GCM') {
          return keyData.key;
        }
        // Export and reimport for AES-GCM
        try {
          const raw = await crypto.subtle.exportKey('raw', keyData.key);
          return await crypto.subtle.importKey(
            'raw', raw, { name: ALGO }, false, ['encrypt', 'decrypt']
          );
        } catch (e) {
          // Key not exportable — derive from key material another way
          console.warn(`[${MODULE_NAME}] Key not exportable, using raw bytes`);
        }
      }
      
      // Raw bytes (Uint8Array)
      if (keyData.key instanceof Uint8Array || keyData.key.byteLength) {
        const rawBytes = keyData.key instanceof Uint8Array ? keyData.key : new Uint8Array(keyData.key);
        // Use first 32 bytes (256 bits) for AES-256-GCM
        const keyBytes = rawBytes.slice(0, 32);
        return await crypto.subtle.importKey(
          'raw', keyBytes, { name: ALGO }, false, ['encrypt', 'decrypt']
        );
      }
      
      return null;
      
    } catch (err) {
      console.warn(`[${MODULE_NAME}] Failed to get encryption key:`, err);
      return null;
    }
  }
  
  function _getCurrentUserId() {
    // Try multiple sources for current user ID
    if (window.currentUser?.id) return window.currentUser.id;
    if (window._supabaseClient) {
      try {
        // Synchronous access — may not work, that's ok
        const session = window._supabaseClient.auth?.session?.();
        if (session?.user?.id) return session.user.id;
      } catch (e) {}
    }
    // Fallback: check localStorage for any known user key
    const keyEntries = Object.keys(localStorage).filter(k => k.startsWith('droplit_has_key_'));
    if (keyEntries.length > 0) {
      return keyEntries[keyEntries.length - 1].replace('droplit_has_key_', '');
    }
    return null;
  }
  
  /**
   * Get ALL encryption keys from all stored user IDs.
   * Used as fallback when primary key fails (userId changed after re-login).
   */
  async function _getAllEncryptionKeys() {
    const keysModule = window.DropLitKeys;
    if (!keysModule?.retrieveKey) return [];
    
    // Find all user IDs with stored keys
    const keyEntries = Object.keys(localStorage).filter(k => k.startsWith('droplit_has_key_'));
    const userIds = keyEntries.map(k => k.replace('droplit_has_key_', ''));
    
    const keys = [];
    for (const uid of userIds) {
      try {
        const keyData = await keysModule.retrieveKey(uid);
        if (!keyData?.key) continue;
        
        let aesKey = null;
        
        if (keyData.key instanceof CryptoKey) {
          if (keyData.key.algorithm?.name === 'AES-GCM') {
            aesKey = keyData.key;
          } else {
            try {
              const raw = await crypto.subtle.exportKey('raw', keyData.key);
              aesKey = await crypto.subtle.importKey('raw', raw, { name: ALGO }, false, ['encrypt', 'decrypt']);
            } catch (e) {}
          }
        } else if (keyData.key instanceof Uint8Array || keyData.key.byteLength) {
          const rawBytes = keyData.key instanceof Uint8Array ? keyData.key : new Uint8Array(keyData.key);
          const keyBytes = rawBytes.slice(0, 32);
          aesKey = await crypto.subtle.importKey('raw', keyBytes, { name: ALGO }, false, ['encrypt', 'decrypt']);
        }
        
        if (aesKey) keys.push(aesKey);
      } catch (e) {}
    }
    
    return keys;
  }
  
  // ============================================
  // INTERNAL: Utilities
  // ============================================
  
  function _dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
  }
  
  function _guessMimeType(mediaType) {
    switch (mediaType) {
      case 'photo': case 'scan': return 'image/jpeg';
      case 'audio': return 'audio/webm';
      case 'video': return 'video/webm';
      default: return 'application/octet-stream';
    }
  }
  
  function _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  // ============================================
  // PUBLIC API
  // ============================================
  
  const api = {
    init,
    isSupported,
    isInitialized,
    
    // Core operations
    saveOriginal,
    loadOriginal,
    deleteMedia,
    
    // Thumbnails
    generateThumbnail,
    
    // Queries
    hasOriginal,
    getMediaInfo,
    getStorageUsage,
    getTotalMediaSize,
    
    // Migration
    migrateExistingMedia,
    
    // Export/import (for cloud sync and vault export)
    getEncryptedBlob,
    writeEncryptedBlob
  };
  
  window.DropLitMediaStorage = api;
  
  console.log(`[${MODULE_NAME}] Module loaded. Access via window.DropLitMediaStorage`);
  
})();
