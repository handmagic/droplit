// ============================================
// DROPLIT CLOUD — Google Drive v1.0
// Encrypted media backup to user's Google Drive
// ============================================
//
// Uses Google Drive API v3 with 'appDataFolder' scope.
// appDataFolder is a hidden app-specific folder:
//   - Only DropLit can read/write
//   - User doesn't see it in Drive UI
//   - Files are encrypted BEFORE upload
//   - Google sees only .enc blobs with numeric names
//
// Dependencies:
//   - Google OAuth token (from Supabase Auth provider_token)
//   - window.DropLitMediaStorage (for OPFS access)
//
// Usage:
//   await DropLitCloudGDrive.init(accessToken);
//   const fileId = await DropLitCloudGDrive.upload(dropId, 'photo', encryptedBlob);
//   const blob = await DropLitCloudGDrive.download(fileId);
//   await DropLitCloudGDrive.remove(fileId);
// ============================================

(function() {
  'use strict';

  const MODULE_NAME = 'CloudGDrive';
  
  // Google Drive API endpoints
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  
  // State
  let _initialized = false;
  let _accessToken = null;
  let _tokenExpiry = 0;
  let _enabled = false;         // User has opted in
  let _manifest = {};           // {dropId: {fileId, type, size, uploaded}}
  
  // Settings key
  const SETTINGS_KEY = 'droplit_cloud_backup_enabled';
  const MANIFEST_KEY = 'droplit_cloud_manifest';
  const PROMPT_SHOWN_KEY = 'droplit_cloud_prompt_shown';
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  /**
   * Initialize Google Drive cloud backup.
   * Does NOT require access token at init — token resolved lazily.
   */
  async function init() {
    if (_initialized) return { success: true, enabled: _enabled };
    
    // Check if user has opted in
    _enabled = localStorage.getItem(SETTINGS_KEY) === 'true';
    
    // Load manifest (local cache of uploaded files)
    try {
      const raw = localStorage.getItem(MANIFEST_KEY);
      _manifest = raw ? JSON.parse(raw) : {};
    } catch (e) {
      _manifest = {};
    }
    
    _initialized = true;
    
    console.log(`[${MODULE_NAME}] Initialized. Enabled: ${_enabled}, manifest: ${Object.keys(_manifest).length} entries`);
    
    return { success: true, enabled: _enabled };
  }
  
  // ============================================
  // ENABLE / DISABLE
  // ============================================
  
  /**
   * Enable cloud backup. Saves preference immediately.
   * Access test is non-blocking — actual uploads will retry if needed.
   * @returns {boolean} success
   */
  async function enable() {
    // Save preference FIRST — so toggle persists across reloads
    _enabled = true;
    localStorage.setItem(SETTINGS_KEY, 'true');
    
    // Try to get token and verify access (non-blocking for UI)
    try {
      const token = await _resolveAccessToken();
      if (token) {
        const ok = await _testAccess(token);
        if (ok) {
          console.log(`[${MODULE_NAME}] ✅ Cloud backup enabled & verified`);
        } else {
          console.warn(`[${MODULE_NAME}] ⚠️ Cloud backup enabled but Drive access failed — will retry on upload`);
        }
      } else {
        console.warn(`[${MODULE_NAME}] ⚠️ Cloud backup enabled but no token yet — will retry on upload`);
      }
    } catch (err) {
      console.warn(`[${MODULE_NAME}] ⚠️ Cloud backup enabled, access test error:`, err.message);
    }
    
    return true;
  }
  
  function disable() {
    _enabled = false;
    localStorage.setItem(SETTINGS_KEY, 'false');
    console.log(`[${MODULE_NAME}] Cloud backup disabled`);
  }
  
  function isEnabled() {
    return _enabled;
  }
  
  // ============================================
  // UPLOAD encrypted file to Google Drive
  // ============================================
  
  /**
   * Upload encrypted media blob to Google Drive appDataFolder.
   * 
   * @param {string|number} dropId - Drop ID
   * @param {string} mediaType - 'photo' | 'audio'
   * @param {Blob} encryptedBlob - Already encrypted data from OPFS
   * @param {object} meta - { mimeType, originalSize }
   * @returns {object} { success, fileId, size }
   */
  async function upload(dropId, mediaType, encryptedBlob, meta) {
    if (!_enabled) {
      return { success: false, error: 'Cloud backup not enabled' };
    }
    
    const token = await _resolveAccessToken();
    if (!token) {
      return { success: false, error: 'No access token' };
    }
    
    const dropIdStr = String(dropId);
    const filename = `${dropIdStr}_${mediaType}.enc`;
    
    try {
      // Check if already uploaded (idempotent)
      if (_manifest[dropIdStr]?.fileId && _manifest[dropIdStr]?.type === mediaType) {
        console.log(`[${MODULE_NAME}] Already uploaded: ${filename}`);
        return { success: true, fileId: _manifest[dropIdStr].fileId, size: encryptedBlob.size, existed: true };
      }
      
      // Multipart upload: metadata + file content
      const metadata = {
        name: filename,
        parents: ['appDataFolder'],
        properties: {
          dropId: dropIdStr,
          mediaType: mediaType,
          originalSize: String(meta?.originalSize || encryptedBlob.size),
          mimeType: meta?.mimeType || 'application/octet-stream',
          uploadedAt: new Date().toISOString()
        }
      };
      
      // Build multipart body
      const boundary = '---droplit_upload_' + Date.now();
      const delimiter = '\r\n--' + boundary + '\r\n';
      const closeDelimiter = '\r\n--' + boundary + '--';
      
      // Metadata part
      const metaPart = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata);
      
      // File part
      const filePart = delimiter +
        'Content-Type: application/octet-stream\r\n' +
        'Content-Transfer-Encoding: binary\r\n\r\n';
      
      // Combine into single ArrayBuffer
      const metaBytes = new TextEncoder().encode(metaPart + filePart);
      const closeBytes = new TextEncoder().encode(closeDelimiter);
      const fileBytes = new Uint8Array(await encryptedBlob.arrayBuffer());
      
      const body = new Uint8Array(metaBytes.length + fileBytes.length + closeBytes.length);
      body.set(metaBytes, 0);
      body.set(fileBytes, metaBytes.length);
      body.set(closeBytes, metaBytes.length + fileBytes.length);
      
      const response = await fetch(
        `${DRIVE_UPLOAD}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: body
        }
      );
      
      if (!response.ok) {
        const err = await response.text();
        console.error(`[${MODULE_NAME}] Upload failed:`, response.status, err);
        return { success: false, error: `HTTP ${response.status}` };
      }
      
      const file = await response.json();
      
      // Update manifest
      _manifest[dropIdStr] = {
        fileId: file.id,
        type: mediaType,
        size: encryptedBlob.size,
        uploaded: Date.now()
      };
      _saveManifest();
      
      console.log(`[${MODULE_NAME}] Uploaded: ${filename} → ${file.id} (${_formatBytes(encryptedBlob.size)})`);
      
      return { success: true, fileId: file.id, size: encryptedBlob.size };
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] Upload error:`, err);
      return { success: false, error: err.message };
    }
  }
  
  // ============================================
  // DOWNLOAD from Google Drive
  // ============================================
  
  /**
   * Download encrypted blob from Google Drive.
   * 
   * @param {string} fileId - Google Drive file ID
   * @returns {Blob|null}
   */
  async function download(fileId) {
    const token = await _resolveAccessToken();
    if (!token) return null;
    
    try {
      const response = await fetch(
        `${DRIVE_API}/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) {
        console.error(`[${MODULE_NAME}] Download failed:`, response.status);
        return null;
      }
      
      return await response.blob();
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] Download error:`, err);
      return null;
    }
  }
  
  /**
   * Download by dropId (looks up fileId in manifest or searches Drive).
   * 
   * @param {string|number} dropId
   * @param {string} mediaType
   * @returns {Blob|null}
   */
  async function downloadByDropId(dropId, mediaType) {
    const dropIdStr = String(dropId);
    
    // Check manifest first
    const entry = _manifest[dropIdStr];
    if (entry?.fileId) {
      return await download(entry.fileId);
    }
    
    // Search Drive
    const fileId = await _findFile(dropIdStr, mediaType);
    if (!fileId) return null;
    
    return await download(fileId);
  }
  
  // ============================================
  // DELETE from Google Drive
  // ============================================
  
  /**
   * Remove encrypted file from Google Drive.
   * 
   * @param {string} fileId - Google Drive file ID
   * @returns {boolean}
   */
  async function remove(fileId) {
    const token = await _resolveAccessToken();
    if (!token) return false;
    
    try {
      const response = await fetch(
        `${DRIVE_API}/files/${fileId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      // Remove from manifest
      for (const key in _manifest) {
        if (_manifest[key].fileId === fileId) {
          delete _manifest[key];
          break;
        }
      }
      _saveManifest();
      
      return response.ok || response.status === 404;
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] Delete error:`, err);
      return false;
    }
  }
  
  /**
   * Remove by dropId.
   */
  async function removeByDropId(dropId) {
    const entry = _manifest[String(dropId)];
    if (entry?.fileId) {
      return await remove(entry.fileId);
    }
    return true;
  }
  
  // ============================================
  // LIST files in appDataFolder
  // ============================================
  
  /**
   * List all DropLit files in Google Drive appDataFolder.
   * @returns {Array} [{id, name, size, properties}]
   */
  async function listFiles() {
    const token = await _resolveAccessToken();
    if (!token) return [];
    
    try {
      const response = await fetch(
        `${DRIVE_API}/files?spaces=appDataFolder&fields=files(id,name,size,properties,createdTime)&pageSize=1000`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.files || [];
      
    } catch (err) {
      console.error(`[${MODULE_NAME}] listFiles error:`, err);
      return [];
    }
  }
  
  // ============================================
  // SYNC: Upload all unsynced media from OPFS
  // ============================================
  
  /**
   * Sync all OPFS media to Google Drive.
   * Called periodically or manually.
   * 
   * @returns {object} { uploaded, skipped, failed }
   */
  async function syncAll() {
    if (!_enabled) return { uploaded: 0, skipped: 0, failed: 0 };
    
    const mediaStorage = window.DropLitMediaStorage;
    if (!mediaStorage?.isInitialized()) return { uploaded: 0, skipped: 0, failed: 0 };
    
    let uploaded = 0, skipped = 0, failed = 0;
    
    // Get all drops with media from localStorage
    let drops;
    try {
      drops = JSON.parse(localStorage.getItem('droplit_ideas') || '[]');
    } catch (e) {
      return { uploaded: 0, skipped: 0, failed: 0 };
    }
    
    const mediaDrops = drops.filter(d => d.mediaSaved && d.mediaRef && !d.cloudRef);
    
    if (mediaDrops.length === 0) {
      return { uploaded: 0, skipped: 0, failed: 0 };
    }
    
    console.log(`[${MODULE_NAME}] syncAll: ${mediaDrops.length} unsynced media files`);
    
    for (const drop of mediaDrops) {
      const mediaType = drop.category === 'audio' ? 'audio' : 'photo';
      
      // Get encrypted blob from OPFS (already encrypted)
      const encBlob = await mediaStorage.getEncryptedBlob(drop.id, mediaType);
      if (!encBlob) {
        console.warn(`[${MODULE_NAME}] No OPFS file for ${drop.id}, skipping`);
        skipped++;
        continue;
      }
      
      const result = await upload(drop.id, mediaType, encBlob, {
        mimeType: mediaType === 'audio' ? 'audio/webm' : 'image/jpeg',
        originalSize: drop.mediaSize
      });
      
      if (result.success) {
        // Update drop with cloud reference
        drop.cloudRef = `gdrive:${result.fileId}`;
        uploaded++;
      } else {
        failed++;
        // Stop on auth errors (don't spam failed requests)
        if (result.error?.includes('401') || result.error?.includes('403')) {
          console.warn(`[${MODULE_NAME}] Auth error, stopping sync`);
          break;
        }
      }
    }
    
    // Save updated drops with cloudRef
    if (uploaded > 0) {
      try {
        // Sync cloudRefs back to in-memory ideas array
        if (typeof window.ideas !== 'undefined' && Array.isArray(window.ideas)) {
          for (const drop of drops) {
            if (drop.cloudRef) {
              const memDrop = window.ideas.find(d => String(d.id) === String(drop.id));
              if (memDrop) memDrop.cloudRef = drop.cloudRef;
            }
          }
          if (typeof window.save === 'function') window.save();
        } else {
          localStorage.setItem('droplit_ideas', JSON.stringify(drops));
        }
        console.log(`[${MODULE_NAME}] syncAll complete: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`);
      } catch (e) {
        console.error(`[${MODULE_NAME}] Failed to save cloudRef updates`);
      }
    }
    
    return { uploaded, skipped, failed };
  }
  
  // ============================================
  // SOFT PROMPT — show after first media drop
  // ============================================
  
  /**
   * Check if we should show the cloud backup prompt.
   * Call after creating a media drop.
   * 
   * @returns {boolean} should show prompt
   */
  function shouldShowPrompt() {
    // Already enabled or prompt already shown
    if (_enabled) return false;
    if (localStorage.getItem(PROMPT_SHOWN_KEY) === 'true') return false;
    return true;
  }
  
  /**
   * Mark prompt as shown (don't show again until Settings).
   */
  function dismissPrompt() {
    localStorage.setItem(PROMPT_SHOWN_KEY, 'true');
  }
  
  /**
   * Show the cloud backup suggestion as a subtle feed notification.
   * Not a modal, not a toast — a card in the feed that doesn't demand action.
   */
  function showPrompt() {
    dismissPrompt(); // Mark as shown (one time only)
    
    // Create notification card at top of feed
    const feed = document.querySelector('.ideas-list, #ideasList, .feed');
    if (!feed) return Promise.resolve(false);
    
    const card = document.createElement('div');
    card.id = 'cloudBackupSuggestion';
    card.style.cssText = `
      margin: 8px 16px;
      padding: 14px 16px;
      background: linear-gradient(135deg, #EBF5FF 0%, #F0F7FF 100%);
      border: 1px solid #BFDBFE;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      color: #1E40AF;
      position: relative;
      animation: fadeIn 0.5s ease-out;
    `;
    
    card.innerHTML = `
      <button onclick="this.parentElement.remove()" style="
        position:absolute; top:8px; right:10px; background:none; border:none;
        color:#93C5FD; font-size:18px; cursor:pointer; padding:0; line-height:1;
      ">×</button>
      <div style="font-weight:600; margin-bottom:4px;">☁️ Your media is stored locally</div>
      <div style="color:#3B82F6;">
        Photos & audio are encrypted on this device. 
        Enable <strong>Cloud Backup</strong> in Settings to protect them across devices.
      </div>
    `;
    
    feed.insertBefore(card, feed.firstChild);
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (document.getElementById('cloudBackupSuggestion')) {
        card.style.transition = 'opacity 0.5s';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 500);
      }
    }, 30000);
    
    return Promise.resolve(false);
  }
  
  // ============================================
  // GET CLOUD STATUS for a drop
  // ============================================
  
  /**
   * Check if a drop's media is backed up to cloud.
   * @param {string|number} dropId
   * @returns {object} { backed: boolean, fileId, provider }
   */
  function getCloudStatus(dropId) {
    const entry = _manifest[String(dropId)];
    return {
      backed: !!entry?.fileId,
      fileId: entry?.fileId || null,
      provider: entry ? 'gdrive' : null,
      uploaded: entry?.uploaded || null
    };
  }
  
  /**
   * Get total cloud storage used by DropLit.
   * @returns {number} bytes
   */
  function getTotalCloudSize() {
    let total = 0;
    for (const key in _manifest) {
      total += _manifest[key].size || 0;
    }
    return total;
  }
  
  // ============================================
  // INTERNAL: Access token management
  // ============================================
  
  // Key for storing Google refresh token
  const REFRESH_TOKEN_KEY = 'droplit_google_refresh_token';
  
  // Token exchange endpoint
  const TOKEN_ENDPOINT = '/api/gdrive-token';
  
  async function _resolveAccessToken() {
    // Check cached token
    if (_accessToken && Date.now() < _tokenExpiry) {
      return _accessToken;
    }
    
    // Helper: getSession with timeout to prevent hanging
    async function _safeGetSession(timeoutMs = 5000) {
      if (!window._supabaseClient) return null;
      try {
        const sessionPromise = window._supabaseClient.auth.getSession();
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), timeoutMs));
        const { data } = await Promise.race([sessionPromise, timeout]);
        return data?.session || null;
      } catch (err) {
        return null;
      }
    }
    
    // Strategy 1: Check cached provider token from auth callback (fastest, no async)
    if (window._googleProviderToken && Date.now() < (window._googleProviderTokenExpiry || 0)) {
      _accessToken = window._googleProviderToken;
      _tokenExpiry = window._googleProviderTokenExpiry;
      console.log(`[${MODULE_NAME}] Using cached provider token`);
      return _accessToken;
    }
    
    // Strategy 2: Get provider_token from current Supabase session
    try {
      const session = await _safeGetSession();
        
      // Save provider_refresh_token whenever we see it
      if (session?.provider_refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, session.provider_refresh_token);
      }
        
      if (session?.provider_token) {
        _accessToken = session.provider_token;
        _tokenExpiry = Date.now() + 50 * 60 * 1000;
        return _accessToken;
      }
    } catch (err) {
      // Continue to next strategy
    }
    
    // Strategy 2: Use saved refresh_token via server endpoint
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        // Get Supabase JWT for auth
        const session = await _safeGetSession();
        const supabaseToken = session?.access_token || null;
        
        const response = await fetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(supabaseToken ? { 'Authorization': `Bearer ${supabaseToken}` } : {})
          },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        if (response.ok) {
          const tokenData = await response.json();
          _accessToken = tokenData.access_token;
          _tokenExpiry = Date.now() + (tokenData.expires_in - 120) * 1000; // refresh 2 min before expiry
          console.log(`[${MODULE_NAME}] Access token refreshed via server endpoint`);
          return _accessToken;
        } else {
          const err = await response.json().catch(() => ({}));
          console.warn(`[${MODULE_NAME}] Token refresh failed:`, err.error || response.status);
          // If refresh token is invalid, clear it
          if (response.status === 400) {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          }
        }
      } catch (err) {
        console.warn(`[${MODULE_NAME}] Token endpoint error:`, err.message);
      }
    }
    
    return null;
  }
  
  // ============================================
  // INTERNAL: Drive helpers
  // ============================================
  
  async function _testAccess(token) {
    try {
      const response = await fetch(
        `${DRIVE_API}/files?spaces=appDataFolder&pageSize=1`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      return response.ok;
    } catch (err) {
      return false;
    }
  }
  
  async function _findFile(dropIdStr, mediaType) {
    const token = await _resolveAccessToken();
    if (!token) return null;
    
    const filename = `${dropIdStr}_${mediaType}.enc`;
    
    try {
      const response = await fetch(
        `${DRIVE_API}/files?spaces=appDataFolder&q=name='${filename}'&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data.files?.length > 0) {
        // Update manifest
        _manifest[dropIdStr] = {
          fileId: data.files[0].id,
          type: mediaType,
          uploaded: Date.now()
        };
        _saveManifest();
        return data.files[0].id;
      }
      
      return null;
    } catch (err) {
      return null;
    }
  }
  
  function _saveManifest() {
    try {
      localStorage.setItem(MANIFEST_KEY, JSON.stringify(_manifest));
    } catch (e) {
      console.warn(`[${MODULE_NAME}] Failed to save manifest`);
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
  // SYNC ONE — upload single drop immediately
  // ============================================
  
  /**
   * Upload a single drop's media to Drive right after creation.
   * Call this from savePhoto/saveAudio hooks.
   * 
   * @param {number|string} dropId
   * @param {string} mediaType - 'photo' or 'audio'
   * @returns {object} { success, fileId }
   */
  async function syncOne(dropId, mediaType) {
    if (!_enabled || !_initialized) return { success: false, error: 'not enabled' };
    
    const mediaStorage = window.DropLitMediaStorage;
    if (!mediaStorage?.isInitialized()) return { success: false, error: 'OPFS not ready' };
    
    const encBlob = await mediaStorage.getEncryptedBlob(dropId, mediaType);
    if (!encBlob) return { success: false, error: 'no OPFS file' };
    
    const result = await upload(dropId, mediaType, encBlob, {
      mimeType: mediaType === 'audio' ? 'audio/webm' : 'image/jpeg'
    });
    
    if (result.success) {
      // Update drop's cloudRef in both memory and localStorage
      const cloudRefValue = `gdrive:${result.fileId}`;
      
      // 1. Update in-memory ideas (if available)
      if (typeof window.ideas !== 'undefined' && Array.isArray(window.ideas)) {
        const memDrop = window.ideas.find(d => String(d.id) === String(dropId));
        if (memDrop) {
          memDrop.cloudRef = cloudRefValue;
          // Use app's save() to write consistently
          if (typeof window.save === 'function') {
            window.save();
          }
        }
      } else {
        // Fallback: direct localStorage update
        try {
          const drops = JSON.parse(localStorage.getItem('droplit_ideas') || '[]');
          const drop = drops.find(d => String(d.id) === String(dropId));
          if (drop) {
            drop.cloudRef = cloudRefValue;
            localStorage.setItem('droplit_ideas', JSON.stringify(drops));
          }
        } catch (e) { /* silent */ }
      }
      
      _lastSyncTime = Date.now();
      localStorage.setItem('droplit_cloud_last_sync', String(_lastSyncTime));
      
      console.log(`[${MODULE_NAME}] syncOne: ${dropId} uploaded`);
    }
    
    return result;
  }
  
  // ============================================
  // RESTORE ALL — download from Drive to OPFS
  // ============================================
  
  /**
   * Restore all media from Google Drive back to OPFS.
   * Used when user logs in on new device or clears cache.
   * 
   * @returns {object} { restored, skipped, failed }
   */
  async function restoreAll() {
    const mediaStorage = window.DropLitMediaStorage;
    if (!mediaStorage?.isInitialized()) {
      return { restored: 0, skipped: 0, failed: 0, error: 'OPFS not ready' };
    }
    
    let restored = 0, skipped = 0, failed = 0;
    
    // Get file list from Drive
    const files = await listFiles();
    if (files.length === 0) {
      return { restored: 0, skipped: 0, failed: 0, error: 'No files in cloud' };
    }
    
    console.log(`[${MODULE_NAME}] restoreAll: ${files.length} files in cloud`);
    
    for (const file of files) {
      try {
        // Parse dropId and mediaType from filename: "1771122799908_photo.enc"
        const match = file.name.match(/^(\d+)_(photo|audio)\.enc$/);
        if (!match) { skipped++; continue; }
        
        const [, dropId, mediaType] = match;
        
        // Skip if already in OPFS
        if (mediaStorage.hasOriginal(dropId, mediaType)) {
          skipped++;
          // Still update manifest
          _manifest[dropId] = { fileId: file.id, type: mediaType, size: parseInt(file.size) || 0, uploaded: Date.now() };
          continue;
        }
        
        // Download encrypted blob
        const blob = await download(file.id);
        if (!blob) { failed++; continue; }
        
        // Write directly to OPFS (already encrypted)
        const written = await mediaStorage.writeEncryptedBlob(dropId, mediaType, blob);
        if (!written) { failed++; continue; }
        
        // Update manifest
        _manifest[dropId] = { fileId: file.id, type: mediaType, size: parseInt(file.size) || 0, uploaded: Date.now() };
        
        // Update drop in memory + localStorage
        try {
          const dropId_s = String(dropId);
          if (typeof window.ideas !== 'undefined' && Array.isArray(window.ideas)) {
            const memDrop = window.ideas.find(d => String(d.id) === dropId_s);
            if (memDrop) {
              memDrop.mediaRef = `${dropId}_${mediaType}.enc`;
              memDrop.mediaSaved = true;
              memDrop.cloudRef = `gdrive:${file.id}`;
              if (typeof window.save === 'function') window.save();
            }
          } else {
            const drops = JSON.parse(localStorage.getItem('droplit_ideas') || '[]');
            const drop = drops.find(d => String(d.id) === dropId_s);
            if (drop) {
              drop.mediaRef = `${dropId}_${mediaType}.enc`;
              drop.mediaSaved = true;
              drop.cloudRef = `gdrive:${file.id}`;
              localStorage.setItem('droplit_ideas', JSON.stringify(drops));
            }
          }
        } catch (e) { /* silent */ }
        
        restored++;
        console.log(`[${MODULE_NAME}] Restored: ${file.name} (${_formatBytes(parseInt(file.size) || 0)})`);
        
      } catch (err) {
        console.warn(`[${MODULE_NAME}] Restore error for ${file.name}:`, err.message);
        failed++;
      }
    }
    
    _saveManifest();
    
    console.log(`[${MODULE_NAME}] restoreAll complete: ${restored} restored, ${skipped} skipped, ${failed} failed`);
    return { restored, skipped, failed };
  }
  
  // ============================================
  // STATS — for Settings UI
  // ============================================
  
  let _lastSyncTime = parseInt(localStorage.getItem('droplit_cloud_last_sync') || '0');
  
  /**
   * Get cloud backup statistics for UI display.
   * @returns {object}
   */
  function getStats() {
    const fileCount = Object.keys(_manifest).length;
    const totalSize = getTotalCloudSize();
    const lastSync = _lastSyncTime;
    
    // Count unsynced
    let unsynced = 0;
    try {
      const drops = JSON.parse(localStorage.getItem('droplit_ideas') || '[]');
      unsynced = drops.filter(d => d.mediaSaved && d.mediaRef && !d.cloudRef).length;
    } catch (e) { /* silent */ }
    
    return {
      enabled: _enabled,
      fileCount,
      totalSize,
      totalSizeFormatted: _formatBytes(totalSize),
      lastSync,
      lastSyncFormatted: lastSync ? _timeSince(lastSync) : 'Never',
      unsynced,
      provider: 'Google Drive'
    };
  }
  
  function _timeSince(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'Just now';
    if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
  }
  
  // Update lastSyncTime after successful syncAll
  const _origSyncAll = syncAll;
  syncAll = async function() {
    const result = await _origSyncAll();
    if (result.uploaded > 0) {
      _lastSyncTime = Date.now();
      localStorage.setItem('droplit_cloud_last_sync', String(_lastSyncTime));
    }
    return result;
  };
  
  // ============================================
  // PUBLIC API
  // ============================================
  
  const api = {
    init,
    
    // Enable/disable
    enable,
    disable,
    isEnabled,
    
    // Core operations
    upload,
    download,
    downloadByDropId,
    remove,
    removeByDropId,
    
    // Sync
    syncAll,
    syncOne,
    restoreAll,
    listFiles,
    
    // Prompt
    shouldShowPrompt,
    dismissPrompt,
    showPrompt,
    
    // Status
    getCloudStatus,
    getTotalCloudSize,
    getStats
  };
  
  window.DropLitCloudGDrive = api;
  
  console.log(`[${MODULE_NAME}] Module loaded. Access via window.DropLitCloudGDrive`);
  
})();
