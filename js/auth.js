/**
 * DROPLIT — Encryption UI Components
 * Version: 1.1.0 — Mobile-First Redesign
 * Date: January 10, 2026
 */

// ═══════════════════════════════════════════════════════════════════════════
// KEY SETUP MODAL
// ═══════════════════════════════════════════════════════════════════════════

function showEncryptionSetupModal(userId) {
  // Remove existing modal if any
  const existing = document.getElementById('encryption-setup-modal');
  if (existing) existing.remove();
  
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'encryption-setup-modal';
  modal.innerHTML = `
    <div class="enc-modal-overlay" onclick="DropLitEncryptionUI.closeEncryptionModal()"></div>
    <div class="enc-modal-container">
      <div class="enc-modal-content">
        
        <div class="enc-header">
          <div class="enc-icon">🔐</div>
          <h2>Secure Your Data</h2>
          <p>Choose how to protect your drops</p>
        </div>
        
        <div class="enc-options">
          <label class="enc-option" data-method="password">
            <input type="radio" name="enc-method" value="password">
            <div class="enc-option-body">
              <span class="enc-option-icon">🔑</span>
              <div class="enc-option-text">
                <strong>Password</strong>
                <small>Access on any device</small>
              </div>
            </div>
          </label>
          
          <label class="enc-option" data-method="random">
            <input type="radio" name="enc-method" value="random">
            <div class="enc-option-body">
              <span class="enc-option-icon">🎲</span>
              <div class="enc-option-text">
                <strong>Device Key</strong>
                <small>This device only</small>
              </div>
            </div>
          </label>
        </div>
        
        <div class="enc-password-form" id="encPasswordForm" style="display:none;">
          <input type="password" id="encPassword" placeholder="Password (min 8 chars)" autocomplete="new-password">
          <input type="password" id="encPasswordConfirm" placeholder="Confirm password" autocomplete="new-password">
          <div class="enc-strength" id="encStrength"></div>
        </div>
        
        <div class="enc-warning" id="encWarning"></div>
        
        <button class="enc-btn-primary" id="encSetupBtn" disabled onclick="DropLitEncryptionUI.doSetup('${userId}')">
          Enable Encryption
        </button>
        
        <p class="enc-footer">Your data is encrypted before leaving your device</p>
        
      </div>
    </div>
  `;
  
  // Add styles
  addEncryptionStyles();
  
  // Add to body
  document.body.appendChild(modal);
  
  // Setup listeners
  setupModalListeners();
}

function setupModalListeners() {
  const options = document.querySelectorAll('.enc-option');
  const passwordForm = document.getElementById('encPasswordForm');
  const warning = document.getElementById('encWarning');
  const btn = document.getElementById('encSetupBtn');
  const pwd = document.getElementById('encPassword');
  const pwdConfirm = document.getElementById('encPasswordConfirm');
  
  let selectedMethod = null;
  
  // Option click
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
      selectedMethod = opt.dataset.method;
      
      if (selectedMethod === 'password') {
        passwordForm.style.display = 'block';
        warning.innerHTML = '⚠️ Lost password = lost data';
        btn.disabled = true;
        pwd.focus();
      } else {
        passwordForm.style.display = 'none';
        warning.innerHTML = '⚠️ Clearing browser data deletes key';
        btn.disabled = false;
      }
    });
  });
  
  // Password validation
  const validate = () => {
    if (selectedMethod !== 'password') return;
    
    const p = pwd.value;
    const c = pwdConfirm.value;
    
    // Strength indicator
    let strength = 0;
    if (p.length >= 8) strength++;
    if (p.length >= 12) strength++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) strength++;
    if (/[0-9]/.test(p)) strength++;
    if (/[^A-Za-z0-9]/.test(p)) strength++;
    
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const idx = Math.min(strength, 4);
    
    document.getElementById('encStrength').innerHTML = p.length > 0 ? 
      `<div style="height:3px;background:#333;border-radius:2px;"><div style="height:100%;width:${(strength/5)*100}%;background:${colors[idx]};border-radius:2px;transition:0.3s;"></div></div><small style="color:${colors[idx]}">${labels[idx] || 'Too short'}</small>` : '';
    
    // Enable button
    btn.disabled = !(p.length >= 8 && p === c);
  };
  
  pwd.addEventListener('input', validate);
  pwdConfirm.addEventListener('input', validate);
}

async function doSetup(userId) {
  const btn = document.getElementById('encSetupBtn');
  const method = document.querySelector('.enc-option.selected')?.dataset.method;
  
  if (!method) return;
  
  btn.disabled = true;
  btn.textContent = 'Setting up...';
  
  try {
    let result;
    
    if (method === 'password') {
      const pwd = document.getElementById('encPassword').value;
      result = await window.DropLitEncryptedSync.setupEncryptionWithPassword(userId, pwd);
    } else {
      result = await window.DropLitEncryptedSync.setupEncryptionRandom(userId);
    }
    
    if (result.success) {
      if (typeof toast === 'function') {
        toast('🔐 Encryption enabled!', 'success');
      }
      closeEncryptionModal();
      localStorage.setItem('droplit_has_key_' + userId, 'true');
      localStorage.setItem('droplit_encryption_enabled', 'true');
      
      // Update header lock indicator
      if (typeof updateSecurityIndicator === 'function') {
        updateSecurityIndicator();
      }
      
      // Initialize privacy system
      if (typeof initializePrivacySystem === 'function') {
        await initializePrivacySystem();
      } else if (typeof window.initializePrivacySystem === 'function') {
        await window.initializePrivacySystem();
      }
      
      // Refresh
      if (typeof render === 'function') render();
      
    } else {
      throw new Error(result.error || 'Setup failed');
    }
    
  } catch (err) {
    console.error('[EncryptionUI] Error:', err);
    if (typeof toast === 'function') {
      toast('Error: ' + err.message, 'error');
    } else {
      alert('Error: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = 'Enable Encryption';
  }
}

function closeEncryptionModal() {
  const modal = document.getElementById('encryption-setup-modal');
  if (modal) modal.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES — Mobile-First, Centered
// ═══════════════════════════════════════════════════════════════════════════

function addEncryptionStyles() {
  if (document.getElementById('encryption-modal-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'encryption-modal-styles';
  style.textContent = `
    /* Modal Container */
    #encryption-setup-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
    }
    
    /* Overlay */
    .enc-modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
    }
    
    /* Container - handles scrolling */
    .enc-modal-container {
      position: relative;
      width: 100%;
      max-width: 360px;
      max-height: calc(100vh - 32px);
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    
    /* Content */
    .enc-modal-content {
      background: #1a1a2e;
      border-radius: 16px;
      padding: 24px 20px;
      box-sizing: border-box;
    }
    
    /* Header */
    .enc-header {
      text-align: center;
      margin-bottom: 20px;
    }
    .enc-icon {
      font-size: 40px;
      margin-bottom: 8px;
    }
    .enc-header h2 {
      margin: 0 0 4px;
      font-size: 20px;
      color: #fff;
    }
    .enc-header p {
      margin: 0;
      font-size: 14px;
      color: #888;
    }
    
    /* Options */
    .enc-options {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }
    .enc-option {
      flex: 1;
      cursor: pointer;
    }
    .enc-option input {
      display: none;
    }
    .enc-option-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 14px 8px;
      background: #252542;
      border: 2px solid transparent;
      border-radius: 12px;
      transition: 0.2s;
    }
    .enc-option:hover .enc-option-body {
      border-color: #444;
    }
    .enc-option.selected .enc-option-body {
      border-color: #8B5CF6;
      background: rgba(139,92,246,0.15);
    }
    .enc-option-icon {
      font-size: 24px;
    }
    .enc-option-text {
      text-align: center;
    }
    .enc-option-text strong {
      display: block;
      font-size: 14px;
      color: #fff;
    }
    .enc-option-text small {
      font-size: 11px;
      color: #888;
    }
    
    /* Password Form */
    .enc-password-form {
      margin-bottom: 16px;
    }
    .enc-password-form input {
      width: 100%;
      padding: 12px 14px;
      margin-bottom: 10px;
      background: #252542;
      border: 1px solid #333;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      box-sizing: border-box;
    }
    .enc-password-form input:focus {
      outline: none;
      border-color: #8B5CF6;
    }
    .enc-password-form input::placeholder {
      color: #666;
    }
    .enc-strength {
      min-height: 20px;
    }
    .enc-strength small {
      font-size: 11px;
    }
    
    /* Warning */
    .enc-warning {
      text-align: center;
      font-size: 12px;
      color: #f97316;
      margin-bottom: 16px;
      min-height: 16px;
    }
    
    /* Button */
    .enc-btn-primary {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #8B5CF6, #6366F1);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: 0.2s;
    }
    .enc-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .enc-btn-primary:not(:disabled):active {
      transform: scale(0.98);
    }
    
    /* Footer */
    .enc-footer {
      text-align: center;
      font-size: 11px;
      color: #666;
      margin: 16px 0 0;
    }
  `;
  
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION INDICATOR (simplified)
// ═══════════════════════════════════════════════════════════════════════════

function updateEncryptionIndicator() {
  const indicator = document.getElementById('encryption-indicator');
  if (!indicator) return;
  
  const isActive = window.DROPLIT_PRIVACY_ENABLED === true;
  indicator.className = 'encryption-indicator ' + (isActive ? 'active' : 'inactive');
  indicator.innerHTML = isActive ? '🔐 On' : '🔓 Off';
}

function createEncryptionBadge(privacyLevel, isEncrypted) {
  const badge = document.createElement('span');
  badge.className = 'encryption-badge';
  
  if (!isEncrypted) {
    badge.classList.add('unencrypted');
    badge.textContent = '🔓';
  } else {
    badge.classList.add('encrypted');
    badge.textContent = '🔐';
  }
  
  return badge;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

window.DropLitEncryptionUI = {
  showEncryptionSetupModal,
  closeEncryptionModal,
  doSetup,
  updateEncryptionIndicator,
  createEncryptionBadge,
  addEncryptionStyles
};

// Listen for events
window.addEventListener('encryption-setup-needed', (e) => {
  showEncryptionSetupModal(e.detail.userId);
});

console.log('[EncryptionUI] Module loaded v1.1.0');
