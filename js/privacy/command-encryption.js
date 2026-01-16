// ============================================
// DROPLIT COMMAND ENCRYPTION v1.0
// E2E Encryption for Command Drops
// 
// Вариант 3: Двойное сохранение
// - ai.js создаёт plaintext (как сейчас)
// - Этот модуль шифрует и обновляет запись
// ============================================

(function() {
  'use strict';

  const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
  
  /**
   * Encrypt existing command drop after creation
   * Called after ASKI creates a command in plaintext
   * 
   * @param {string} commandId - UUID of the command in Supabase
   * @param {string} title - Original title to encrypt
   * @param {string} content - Optional content to encrypt
   * @returns {Promise<boolean>} - Success status
   */
  async function encryptExistingCommand(commandId, title, content = null) {
    console.log('[CommandEncrypt] Starting encryption for:', commandId);
    
    // Check prerequisites
    if (!commandId) {
      console.warn('[CommandEncrypt] No command ID provided');
      return false;
    }
    
    if (!window.currentUser?.id) {
      console.warn('[CommandEncrypt] No current user');
      return false;
    }
    
    // Check if encryption is enabled
    if (!window.DROPLIT_PRIVACY_ENABLED) {
      console.log('[CommandEncrypt] Privacy not enabled, skipping');
      return false;
    }
    
    // Check if encryption modules are available
    if (!window.DropLitKeys || !window.DropLitEncryption) {
      console.warn('[CommandEncrypt] Encryption modules not loaded');
      return false;
    }
    
    try {
      // Get user's encryption key
      const keyData = await window.DropLitKeys.retrieveKey(window.currentUser.id);
      if (!keyData?.key) {
        console.warn('[CommandEncrypt] No encryption key available');
        return false;
      }
      
      // Prepare sensitive data for encryption
      const sensitiveData = {
        title: title,
        content: content || title,
        encrypted_at: new Date().toISOString()
      };
      
      // Encrypt using DropLitEncryption
      const plaintext = JSON.stringify(sensitiveData);
      const encrypted = await window.DropLitEncryption.encrypt(plaintext, keyData.key);
      
      if (!encrypted?.ciphertext || !encrypted?.nonce) {
        console.error('[CommandEncrypt] Encryption returned invalid result');
        return false;
      }
      
      console.log('[CommandEncrypt] Data encrypted, updating Supabase...');
      
      // Update the command in Supabase
      const updateData = {
        encrypted_content: encrypted.ciphertext,
        encryption_nonce: encrypted.nonce,
        encryption_version: 1,
        // Optionally mask plaintext fields
        // title: '[Encrypted]',  // Keep original for now as fallback
        // content: '[Encrypted]'
      };
      
      // Get Supabase client
      const supabaseClient = window._supabaseClient;
      if (!supabaseClient) {
        console.error('[CommandEncrypt] No Supabase client');
        return false;
      }
      
      const { error } = await supabaseClient
        .from('command_drops')
        .update(updateData)
        .eq('id', commandId)
        .eq('user_id', window.currentUser.id);
      
      if (error) {
        console.error('[CommandEncrypt] Supabase update error:', error);
        return false;
      }
      
      // Store local mapping for fast decryption later
      storeLocalMapping(commandId, title, content);
      
      console.log('[CommandEncrypt] ✅ Command encrypted successfully:', commandId);
      return true;
      
    } catch (error) {
      console.error('[CommandEncrypt] Encryption failed:', error);
      // Non-critical: plaintext version still works
      return false;
    }
  }
  
  /**
   * Store local mapping for fast decryption
   * Used when showing notifications
   */
  function storeLocalMapping(commandId, title, content) {
    try {
      const mapping = JSON.parse(localStorage.getItem('droplit_command_mapping') || '{}');
      mapping[commandId] = {
        title: title,
        content: content || title,
        cached_at: new Date().toISOString()
      };
      localStorage.setItem('droplit_command_mapping', JSON.stringify(mapping));
      console.log('[CommandEncrypt] Local mapping stored for:', commandId);
    } catch (e) {
      console.warn('[CommandEncrypt] Could not store local mapping:', e);
    }
  }
  
  /**
   * Decrypt command title for display
   * 
   * @param {Object} command - Command object with encrypted_content
   * @returns {Promise<string>} - Decrypted title or fallback
   */
  async function decryptCommandTitle(command) {
    // Not encrypted - return as-is
    if (!command.encryption_version || command.encryption_version === 0) {
      return command.title;
    }
    
    // Try local mapping first (fastest)
    try {
      const mapping = JSON.parse(localStorage.getItem('droplit_command_mapping') || '{}');
      if (mapping[command.id]?.title) {
        return mapping[command.id].title;
      }
    } catch (e) {
      // Continue to decryption
    }
    
    // Decrypt from encrypted_content
    if (!command.encrypted_content || !command.encryption_nonce) {
      console.warn('[CommandEncrypt] Missing encrypted data for:', command.id);
      return command.title || '[Напоминание]';
    }
    
    if (!window.DropLitKeys || !window.DropLitEncryption) {
      console.warn('[CommandEncrypt] Encryption modules not available');
      return command.title || '[Напоминание]';
    }
    
    try {
      const keyData = await window.DropLitKeys.retrieveKey(window.currentUser.id);
      if (!keyData?.key) {
        return command.title || '[Напоминание]';
      }
      
      const decrypted = await window.DropLitEncryption.decrypt(
        command.encrypted_content,
        command.encryption_nonce,
        keyData.key
      );
      
      const data = JSON.parse(decrypted);
      
      // Cache for future use
      storeLocalMapping(command.id, data.title, data.content);
      
      return data.title;
      
    } catch (error) {
      console.error('[CommandEncrypt] Decryption failed:', error);
      return command.title || '[Зашифрованное напоминание]';
    }
  }
  
  /**
   * Decrypt command for notification display
   * Returns both title and content
   * 
   * @param {string} commandId - Command UUID
   * @returns {Promise<{title: string, content: string}|null>}
   */
  async function decryptCommandForNotification(commandId) {
    // Try local mapping first
    try {
      const mapping = JSON.parse(localStorage.getItem('droplit_command_mapping') || '{}');
      if (mapping[commandId]) {
        return {
          title: mapping[commandId].title,
          content: mapping[commandId].content || mapping[commandId].title
        };
      }
    } catch (e) {
      // Continue
    }
    
    // Fetch from Supabase and decrypt
    try {
      const supabaseClient = window._supabaseClient;
      if (!supabaseClient) return null;
      
      const { data: command, error } = await supabaseClient
        .from('command_drops')
        .select('id, title, content, encrypted_content, encryption_nonce, encryption_version')
        .eq('id', commandId)
        .single();
      
      if (error || !command) return null;
      
      // Not encrypted
      if (!command.encryption_version || command.encryption_version === 0) {
        return {
          title: command.title,
          content: command.content || command.title
        };
      }
      
      // Decrypt
      if (!window.DropLitKeys || !window.DropLitEncryption) return null;
      
      const keyData = await window.DropLitKeys.retrieveKey(window.currentUser.id);
      if (!keyData?.key) return null;
      
      const decrypted = await window.DropLitEncryption.decrypt(
        command.encrypted_content,
        command.encryption_nonce,
        keyData.key
      );
      
      const data = JSON.parse(decrypted);
      
      // Cache
      storeLocalMapping(commandId, data.title, data.content);
      
      return {
        title: data.title,
        content: data.content || data.title
      };
      
    } catch (error) {
      console.error('[CommandEncrypt] Could not decrypt for notification:', error);
      return null;
    }
  }
  
  /**
   * Clean up old mappings (older than 30 days)
   */
  function cleanupOldMappings() {
    try {
      const mapping = JSON.parse(localStorage.getItem('droplit_command_mapping') || '{}');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      let cleaned = 0;
      for (const id in mapping) {
        if (mapping[id].cached_at && new Date(mapping[id].cached_at) < thirtyDaysAgo) {
          delete mapping[id];
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        localStorage.setItem('droplit_command_mapping', JSON.stringify(mapping));
        console.log('[CommandEncrypt] Cleaned up', cleaned, 'old mappings');
      }
    } catch (e) {
      // Non-critical
    }
  }
  
  // Run cleanup on load
  setTimeout(cleanupOldMappings, 5000);
  
  // ============================================
  // EXPOSE GLOBAL API
  // ============================================
  
  window.DropLitCommandEncrypt = {
    encryptExistingCommand,
    decryptCommandTitle,
    decryptCommandForNotification,
    storeLocalMapping
  };
  
  console.log('[CommandEncrypt] Module loaded');

})();
