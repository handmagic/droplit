/**
 * DROPLIT — Encryption UI Components
 * Version: 1.0.0
 * Date: January 9, 2026
 * 
 * UI for encryption setup and management:
 * - Key setup modal (first-time)
 * - Privacy level selector
 * - Encryption status indicator
 * - Key backup/recovery
 */

// ═══════════════════════════════════════════════════════════════════════════
// KEY SETUP MODAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create and show the encryption setup modal
 */
function showEncryptionSetupModal(userId) {
  // Check if modal already exists
  let modal = document.getElementById('encryption-setup-modal');
  if (modal) {
    modal.style.display = 'flex';
    return;
  }
  
  // Create modal HTML
  modal = document.createElement('div');
  modal.id = 'encryption-setup-modal';
  modal.className = 'modal encryption-modal';
  modal.innerHTML = `
    <div class="modal-content encryption-modal-content">
      <div class="encryption-header">
        <div class="encryption-icon">🔐</div>
        <h2>Secure Your Data</h2>
        <p>Choose how to protect your drops with encryption</p>
      </div>
      
      <div class="encryption-options">
        <div class="encryption-option" data-method="password">
          <div class="option-icon">🔑</div>
          <div class="option-content">
            <h3>Password Protected</h3>
            <p>Encrypt with a password you choose. You'll need this password to access your data on new devices.</p>
            <div class="option-warning">
              ⚠️ If you forget your password, your data cannot be recovered.
            </div>
          </div>
          <div class="option-select">
            <input type="radio" name="encryption-method" value="password" id="enc-password">
          </div>
        </div>
        
        <div class="encryption-option" data-method="random">
          <div class="option-icon">🎲</div>
          <div class="option-content">
            <h3>Device Key</h3>
            <p>Generate a random key stored on this device. Simpler, but data only accessible on this device.</p>
            <div class="option-warning">
              ⚠️ Clearing browser data will delete the key permanently.
            </div>
          </div>
          <div class="option-select">
            <input type="radio" name="encryption-method" value="random" id="enc-random">
          </div>
        </div>
      </div>
      
      <div class="password-section" style="display: none;">
        <div class="input-group">
          <label for="encryption-password">Enter Password</label>
          <input type="password" id="encryption-password" placeholder="Minimum 8 characters">
        </div>
        <div class="input-group">
          <label for="encryption-password-confirm">Confirm Password</label>
          <input type="password" id="encryption-password-confirm" placeholder="Re-enter password">
        </div>
        <div class="password-strength" id="password-strength"></div>
      </div>
      
      <div class="encryption-actions">
        <button class="btn-primary" id="encryption-setup-btn" disabled>
          <span class="btn-text">Enable Encryption</span>
          <span class="btn-loading" style="display: none;">Setting up...</span>
        </button>
      </div>
      
      <div class="encryption-footer">
        <p>Your data is encrypted before it leaves your device. Even we cannot read it.</p>
      </div>
    </div>
  `;
  
  // Add styles if not already added
  addEncryptionStyles();
  
  // Add to body
  document.body.appendChild(modal);
  
  // Setup event listeners
  setupModalEventListeners(userId);
  
  // Show modal
  modal.style.display = 'flex';
}

/**
 * Setup modal event listeners
 */
function setupModalEventListeners(userId) {
  const modal = document.getElementById('encryption-setup-modal');
  const passwordSection = modal.querySelector('.password-section');
  const setupBtn = modal.querySelector('#encryption-setup-btn');
  const passwordInput = modal.querySelector('#encryption-password');
  const confirmInput = modal.querySelector('#encryption-password-confirm');
  
  let selectedMethod = null;
  
  // Option selection
  modal.querySelectorAll('.encryption-option').forEach(option => {
    option.addEventListener('click', () => {
      // Remove active from all
      modal.querySelectorAll('.encryption-option').forEach(o => o.classList.remove('active'));
      
      // Set active
      option.classList.add('active');
      option.querySelector('input[type="radio"]').checked = true;
      selectedMethod = option.dataset.method;
      
      // Show/hide password section
      if (selectedMethod === 'password') {
        passwordSection.style.display = 'block';
        validatePasswordForm();
      } else {
        passwordSection.style.display = 'none';
        setupBtn.disabled = false;
      }
    });
  });
  
  // Password validation
  const validatePasswordForm = () => {
    if (selectedMethod !== 'password') {
      setupBtn.disabled = false;
      return;
    }
    
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    
    // Check length
    if (password.length < 8) {
      setupBtn.disabled = true;
      showPasswordStrength(password);
      return;
    }
    
    // Check match
    if (password !== confirm) {
      setupBtn.disabled = true;
      return;
    }
    
    setupBtn.disabled = false;
    showPasswordStrength(password);
  };
  
  passwordInput.addEventListener('input', validatePasswordForm);
  confirmInput.addEventListener('input', validatePasswordForm);
  
  // Setup button
  setupBtn.addEventListener('click', async () => {
    if (setupBtn.disabled) return;
    
    setupBtn.querySelector('.btn-text').style.display = 'none';
    setupBtn.querySelector('.btn-loading').style.display = 'inline';
    setupBtn.disabled = true;
    
    try {
      let result;
      
      if (selectedMethod === 'password') {
        result = await window.DropLitEncryptedSync.setupEncryptionWithPassword(userId, passwordInput.value);
      } else {
        result = await window.DropLitEncryptedSync.setupEncryptionRandom(userId);
      }
      
      if (result.success) {
        showToast('🔐 Encryption enabled successfully!', 'success');
        closeEncryptionModal();
        
        // Set flag that user has key
        localStorage.setItem('droplit_has_key_' + userId, 'true');
        
        // Initialize privacy system
        if (typeof initializePrivacySystem === 'function') {
          await initializePrivacySystem();
        } else if (typeof window.initializePrivacySystem === 'function') {
          await window.initializePrivacySystem();
        } else {
          // Dispatch event for external handlers
          window.dispatchEvent(new CustomEvent('encryption-ready', { 
            detail: { userId: userId, method: selectedMethod }
          }));
        }
        
        // Update button if exists
        const btn = document.getElementById('setupEncryptionBtn');
        if (btn) {
          btn.textContent = '✅ Encryption Active';
          btn.classList.remove('pri');
          btn.classList.add('sec');
        }
        
        // Refresh UI
        if (typeof render === 'function') render();
        
      } else {
        showToast('Failed to setup encryption: ' + (result.error || 'Unknown error'), 'error');
      }
      
    } catch (error) {
      console.error('[EncryptionUI] Setup failed:', error);
      showToast('Error: ' + error.message, 'error');
    }
    
    setupBtn.querySelector('.btn-text').style.display = 'inline';
    setupBtn.querySelector('.btn-loading').style.display = 'none';
    setupBtn.disabled = false;
  });
}

/**
 * Show password strength indicator
 */
function showPasswordStrength(password) {
  const strengthEl = document.getElementById('password-strength');
  if (!strengthEl) return;
  
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  
  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  
  strengthEl.innerHTML = `
    <div class="strength-bar">
      <div class="strength-fill" style="width: ${strength * 20}%; background: ${colors[strength - 1] || '#ef4444'}"></div>
    </div>
    <span class="strength-label" style="color: ${colors[strength - 1] || '#ef4444'}">${labels[strength - 1] || 'Too short'}</span>
  `;
}

/**
 * Close encryption modal
 */
function closeEncryptionModal() {
  const modal = document.getElementById('encryption-setup-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVACY LEVEL SELECTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create privacy level selector for drop creation
 */
function createPrivacySelector(currentLevel = 'standard') {
  const levels = window.DropEncryption?.PRIVACY_LEVELS || {
    standard: { name: 'Standard', icon: '🔒' },
    high: { name: 'High', icon: '🔐' },
    maximum: { name: 'Maximum', icon: '🛡️' }
  };
  
  const container = document.createElement('div');
  container.className = 'privacy-selector';
  container.innerHTML = `
    <label class="privacy-label">Privacy Level</label>
    <div class="privacy-options">
      ${Object.entries(levels).map(([key, level]) => `
        <button class="privacy-option ${key === currentLevel ? 'active' : ''}" 
                data-level="${key}" 
                title="${level.description || level.name}">
          <span class="privacy-icon">${level.icon}</span>
          <span class="privacy-name">${level.name}</span>
        </button>
      `).join('')}
    </div>
    <input type="hidden" name="privacy_level" value="${currentLevel}">
  `;
  
  // Setup click handlers
  container.querySelectorAll('.privacy-option').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.privacy-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelector('input[name="privacy_level"]').value = btn.dataset.level;
    });
  });
  
  return container;
}

/**
 * Get selected privacy level
 */
function getSelectedPrivacyLevel(container) {
  return container?.querySelector('input[name="privacy_level"]')?.value || 'standard';
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION STATUS INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create encryption status badge for drop card
 */
function createEncryptionBadge(drop) {
  const status = window.DropEncryption?.getEncryptionStatus(drop) || {
    icon: '⚠️',
    text: 'Unknown',
    class: 'unknown'
  };
  
  const badge = document.createElement('span');
  badge.className = `encryption-badge ${status.class}`;
  badge.innerHTML = `${status.icon} <span>${status.text}</span>`;
  badge.title = `Encryption: ${status.text}`;
  
  return badge;
}

/**
 * Update encryption indicator in header/settings
 */
function updateEncryptionIndicator() {
  const indicator = document.getElementById('encryption-indicator');
  if (!indicator) return;
  
  const isReady = window.DropLitEncryptedSync?.isReady || false;
  
  if (isReady) {
    indicator.innerHTML = '🔐 Encrypted';
    indicator.className = 'encryption-indicator active';
    indicator.title = 'Your data is encrypted';
  } else {
    indicator.innerHTML = '⚠️ Not Encrypted';
    indicator.className = 'encryption-indicator inactive';
    indicator.title = 'Click to setup encryption';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

function addEncryptionStyles() {
  if (document.getElementById('encryption-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'encryption-styles';
  style.textContent = `
    /* Modal */
    .encryption-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
      box-sizing: border-box;
    }
    
    .encryption-modal-content {
      background: var(--card-bg, #1a1a2e);
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    
    .encryption-header {
      text-align: center;
      margin-bottom: 24px;
    }
    
    .encryption-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    
    .encryption-header h2 {
      color: var(--text-primary, #fff);
      margin: 0 0 8px;
      font-size: 24px;
    }
    
    .encryption-header p {
      color: var(--text-secondary, #999);
      margin: 0;
    }
    
    /* Options */
    .encryption-options {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .encryption-option {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 16px;
      background: var(--bg-secondary, #16213e);
      border: 2px solid transparent;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .encryption-option:hover {
      border-color: var(--accent, #8B5CF6);
    }
    
    .encryption-option.active {
      border-color: var(--accent, #8B5CF6);
      background: rgba(139, 92, 246, 0.1);
    }
    
    .option-icon {
      font-size: 32px;
      flex-shrink: 0;
    }
    
    .option-content h3 {
      color: var(--text-primary, #fff);
      margin: 0 0 8px;
      font-size: 16px;
    }
    
    .option-content p {
      color: var(--text-secondary, #999);
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .option-warning {
      color: var(--warning, #f97316);
      font-size: 12px;
    }
    
    .option-select {
      margin-left: auto;
      padding-top: 8px;
    }
    
    .option-select input[type="radio"] {
      width: 20px;
      height: 20px;
      accent-color: var(--accent, #8B5CF6);
    }
    
    /* Password Section */
    .password-section {
      margin-bottom: 24px;
    }
    
    .input-group {
      margin-bottom: 16px;
    }
    
    .input-group label {
      display: block;
      color: var(--text-secondary, #999);
      font-size: 14px;
      margin-bottom: 8px;
    }
    
    .input-group input {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-secondary, #16213e);
      border: 1px solid var(--border, #333);
      border-radius: 8px;
      color: var(--text-primary, #fff);
      font-size: 16px;
      box-sizing: border-box;
    }
    
    .input-group input:focus {
      outline: none;
      border-color: var(--accent, #8B5CF6);
    }
    
    .password-strength {
      margin-top: 8px;
    }
    
    .strength-bar {
      height: 4px;
      background: var(--bg-tertiary, #0f0f1a);
      border-radius: 2px;
      overflow: hidden;
    }
    
    .strength-fill {
      height: 100%;
      transition: all 0.3s;
    }
    
    .strength-label {
      font-size: 12px;
      margin-top: 4px;
      display: block;
    }
    
    /* Actions */
    .encryption-actions {
      margin-bottom: 16px;
    }
    
    .btn-primary {
      width: 100%;
      padding: 14px 24px;
      background: var(--accent, #8B5CF6);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn-primary:hover:not(:disabled) {
      background: var(--accent-hover, #7c3aed);
      transform: translateY(-1px);
    }
    
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    /* Footer */
    .encryption-footer {
      text-align: center;
    }
    
    .encryption-footer p {
      color: var(--text-tertiary, #666);
      font-size: 12px;
      margin: 0;
    }
    
    /* Privacy Selector */
    .privacy-selector {
      margin: 16px 0;
    }
    
    .privacy-label {
      display: block;
      color: var(--text-secondary, #999);
      font-size: 12px;
      margin-bottom: 8px;
    }
    
    .privacy-options {
      display: flex;
      gap: 8px;
    }
    
    .privacy-option {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 8px;
      background: var(--bg-secondary, #16213e);
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .privacy-option:hover {
      border-color: var(--accent, #8B5CF6);
    }
    
    .privacy-option.active {
      border-color: var(--accent, #8B5CF6);
      background: rgba(139, 92, 246, 0.1);
    }
    
    .privacy-icon {
      font-size: 20px;
    }
    
    .privacy-name {
      font-size: 11px;
      color: var(--text-secondary, #999);
    }
    
    /* Encryption Badge */
    .encryption-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: var(--bg-tertiary, #0f0f1a);
      border-radius: 4px;
      font-size: 11px;
    }
    
    .encryption-badge.privacy-standard {
      color: var(--success, #22c55e);
    }
    
    .encryption-badge.privacy-high {
      color: var(--warning, #f97316);
    }
    
    .encryption-badge.privacy-maximum {
      color: var(--info, #3b82f6);
    }
    
    .encryption-badge.unencrypted {
      color: var(--error, #ef4444);
    }
    
    /* Indicator in header */
    .encryption-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
    }
    
    .encryption-indicator.active {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    
    .encryption-indicator.inactive {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
  `;
  
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST HELPER
// ═══════════════════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
  // Use existing toast function if available
  if (typeof toast === 'function') {
    toast(message);
    return;
  }
  
  // Fallback
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.textContent = message;
  toastEl.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#8B5CF6'};
    color: white;
    border-radius: 8px;
    z-index: 10001;
    animation: fadeIn 0.3s;
  `;
  
  document.body.appendChild(toastEl);
  
  setTimeout(() => {
    toastEl.remove();
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

// Listen for encryption setup needed event
window.addEventListener('encryption-setup-needed', (event) => {
  showEncryptionSetupModal(event.detail.userId);
});

// Update indicator when encryption is ready
window.addEventListener('encryption-ready', () => {
  updateEncryptionIndicator();
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

window.DropLitEncryptionUI = {
  showEncryptionSetupModal,
  closeEncryptionModal,
  createPrivacySelector,
  getSelectedPrivacyLevel,
  createEncryptionBadge,
  updateEncryptionIndicator,
  addEncryptionStyles
};

// Initialize styles
addEncryptionStyles();

console.log('[EncryptionUI] Module loaded');
