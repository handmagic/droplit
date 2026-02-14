// ============================================
// DROPLIT AUTH v3.0 — UNIFIED
// Replaces: auth.js v1.0 + onboarding.js v1.0
// Eliminates race condition between two files
// ============================================

// ============================================
// SUPABASE CONFIG
// ============================================
const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';

let supabaseClient = null;
let currentUser = null;
let syncEnabled = true;
let isSyncing = false;
let syncQueue = [];
let lastSyncTime = null;

// Device ID for tracking
const DEVICE_ID = localStorage.getItem('droplit_device_id') || (() => {
  const id = 'dev_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('droplit_device_id', id);
  return id;
})();

console.log('📱 Device ID:', DEVICE_ID);

// ============================================
// DEV MODE DETECTION
// ============================================
function isDevMode() {
  return new URLSearchParams(location.search).has('dev')
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
    || localStorage.getItem('droplit_dev_mode') === 'true';
}

// ============================================
// SUPABASE CLIENT — SINGLE INSTANCE
// ============================================
function ensureSupabaseClient() {
  if (supabaseClient) return true;
  
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.log('⚠️ Supabase SDK not loaded');
    return false;
  }
  
  if (window._supabaseClient) {
    supabaseClient = window._supabaseClient;
    console.log('[Auth] Using existing global Supabase client');
  } else {
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseClient = window._supabaseClient;
    console.log('[Auth] Created global Supabase client');
  }
  return true;
}

// ============================================
// UNIFIED INIT — SINGLE ENTRY POINT
// ============================================
async function initAuth() {
  console.log('[Auth] v3.0 initializing...');
  
  // Wait for Supabase SDK if not ready
  if (typeof window.supabase === 'undefined') {
    console.log('[Auth] Waiting for Supabase SDK...');
    setTimeout(initAuth, 100);
    return;
  }
  
  if (!ensureSupabaseClient()) {
    console.error('[Auth] Cannot create Supabase client');
    updateSyncUI('offline', 'No SDK');
    return;
  }
  
  // Setup auth state listener FIRST (once)
  setupAuthListener();
  
  // Check for existing session
  try {
    let { data: { session } } = await supabaseClient.auth.getSession();
    
    // Refresh token if session exists
    if (session) {
      console.log('[Auth] Found session, refreshing token...');
      try {
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
        if (refreshError) {
          console.warn('[Auth] Token refresh failed:', refreshError.message);
          session = null;
        } else if (refreshData?.session) {
          session = refreshData.session;
          console.log('[Auth] Token refreshed, expires:', new Date(session.expires_at * 1000).toLocaleTimeString());
        }
      } catch (e) {
        console.warn('[Auth] Token refresh error:', e.message);
        session = null;
      }
    }
    
    if (session && session.user) {
      // ✅ User is already authenticated
      console.log('[Auth] User authenticated:', session.user.email);
      currentUser = session.user;
      window.currentUser = currentUser;
      
      hideOnboardingModal();
      await pullFromServer();
      updateSyncUI('synced', 'Synced');
      
      // Update account UI
      if (typeof updateAccountUI === 'function') {
        updateAccountUI();
      }
      
      // Trigger encryption check
      triggerEncryptionCheck(currentUser);
      
      return;
    }
    
    // No valid session
    console.log('[Auth] No session found');
    
    // DEV MODE: auto-login with test account
    if (isDevMode()) {
      console.log('[Auth] DEV MODE — auto-login test2@syntrise.com');
      await signInWithTestAccount();
      return;
    }
    
    // PRODUCTION: show login modal
    console.log('[Auth] Showing login screen');
    showOnboardingModal();
    
  } catch (error) {
    console.error('[Auth] Init error:', error);
    updateSyncUI('error', 'Error');
    
    // Show login on error so user can retry
    if (!isDevMode()) {
      showOnboardingModal();
    }
  }
}

// ============================================
// AUTH STATE LISTENER — ONE LISTENER
// ============================================
function setupAuthListener() {
  if (window._authListenerSetup) {
    console.log('[Auth] Listener already setup, skipping');
    return;
  }
  
  window._authListenerSetup = true;
  console.log('[Auth] Setting up auth state listener');
  
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] State change:', event);
    
    if (event === 'SIGNED_IN' && session?.user) {
      // Prevent duplicate handling
      if (window._authEventHandled) {
        console.log('[Auth] SIGNED_IN already handled, skipping');
        return;
      }
      window._authEventHandled = true;
      
      const user = session.user;
      currentUser = user;
      window.currentUser = user;
      
      // Process pending invite code (from onboarding flow)
      const pendingInvite = localStorage.getItem('droplit_pending_invite');
      const pendingInviteCode = localStorage.getItem('droplit_pending_invite_code');
      
      if (pendingInvite) {
        await useInviteCode(pendingInvite, user.id);
        localStorage.removeItem('droplit_pending_invite');
      }
      
      // Assign user plan based on invite code
      if (pendingInviteCode) {
        let userPlan = 'beta'; // default for beta testers
        
        if (pendingInviteCode === 'ALEX2026' || pendingInviteCode === 'OWNER') {
          userPlan = 'owner';
        } else if (pendingInviteCode.startsWith('PRO')) {
          userPlan = 'pro';
        } else if (pendingInviteCode.startsWith('BIZ')) {
          userPlan = 'business';
        }
        
        localStorage.setItem('droplit_user_plan', userPlan);
        localStorage.removeItem('droplit_pending_invite_code');
        console.log('[Auth] Plan assigned:', userPlan);
      }
      
      // Hide onboarding, sync data
      hideOnboardingModal();
      
      // Check for first-time migration
      const migrated = localStorage.getItem('droplit_migrated_' + user.id);
      if (!migrated && typeof ideas !== 'undefined' && ideas.length > 0) {
        await migrateLocalData();
      } else {
        await pullFromServer();
      }
      
      updateSyncUI('synced', 'Synced');
      
      // Update account UI
      if (typeof updateAccountUI === 'function') {
        updateAccountUI();
      }
      
      // Welcome toast (only for non-dev logins)
      if (!isDevMode() && typeof toast === 'function') {
        toast('Welcome to DropLit! 🎉', 'success');
      }
      
      // Trigger encryption check after auth settles
      triggerEncryptionCheck(user);
      
    } else if (event === 'SIGNED_OUT') {
      console.log('[Auth] User signed out');
      currentUser = null;
      window.currentUser = null;
      window._authEventHandled = false;
      
      // Don't show modal in dev mode — just re-login
      if (isDevMode()) {
        console.log('[Auth] DEV MODE — re-login after signout');
        setTimeout(() => signInWithTestAccount(), 300);
      } else {
        showOnboardingModal();
      }
    }
  });
}

// ============================================
// ENCRYPTION CHECK (after auth)
// ============================================
function triggerEncryptionCheck(user) {
  setTimeout(() => {
    if (typeof DropLitKeys !== 'undefined' && typeof DropLitEncryptionUI !== 'undefined') {
      DropLitKeys.hasStoredKey(user.id).then(hasKey => {
        if (!hasKey) {
          DropLitEncryptionUI.showEncryptionSetupModal(user.id);
        } else if (typeof resumeEncryption === 'function') {
          resumeEncryption();
        }
      }).catch(err => {
        console.log('[Auth] Encryption check skipped:', err.message);
      });
    }
  }, 500);
}

// ============================================
// DEV: TEST ACCOUNT LOGIN
// ============================================
async function signInWithTestAccount() {
  try {
    updateSyncUI('syncing', 'Connecting...');
    if (typeof toast === 'function') toast('🔐 Dev login...', 'info');
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: 'test2@syntrise.com',
      password: '12345'
    });
    
    if (error) {
      if (typeof toast === 'function') toast('❌ Dev login error: ' + error.message, 'error');
      console.error('[Auth] Dev login error:', error);
      // Fallback: show login modal even in dev mode
      showOnboardingModal();
      return false;
    }
    
    currentUser = data.user;
    window.currentUser = currentUser;
    if (typeof toast === 'function') toast('✅ Dev: ' + currentUser.email, 'success');
    console.log('[Auth] Dev signed in:', currentUser.email);
    
    hideOnboardingModal();
    
    const migrated = localStorage.getItem('droplit_migrated_' + currentUser.id);
    if (!migrated && typeof ideas !== 'undefined' && ideas.length > 0) {
      await migrateLocalData();
    } else {
      await pullFromServer();
    }
    
    updateSyncUI('synced', 'Synced');
    
    if (typeof updateAccountUI === 'function') {
      updateAccountUI();
    }
    
    return true;
  } catch (error) {
    console.error('[Auth] Dev sign in error:', error);
    updateSyncUI('error', 'Auth error');
    return false;
  }
}

// ============================================
// OAUTH: GOOGLE
// ============================================
async function signInWithGoogle() {
  if (!ensureSupabaseClient()) {
    showOnboardingError('Database not available');
    return;
  }
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    
    if (error) {
      console.error('[Auth] Google sign in error:', error);
      showOnboardingError('Google sign in failed: ' + error.message);
    }
    // Redirect happens automatically
  } catch (err) {
    console.error('[Auth] Google sign in error:', err);
    showOnboardingError('Connection error');
  }
}

// ============================================
// OAUTH: APPLE
// ============================================
async function signInWithApple() {
  if (!ensureSupabaseClient()) {
    showOnboardingError('Database not available');
    return;
  }
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    
    if (error) {
      console.error('[Auth] Apple sign in error:', error);
      showOnboardingError('Apple sign in failed: ' + error.message);
    }
  } catch (err) {
    console.error('[Auth] Apple sign in error:', err);
    showOnboardingError('Connection error');
  }
}

// ============================================
// EMAIL + PASSWORD
// ============================================
async function signInWithEmail(email, password, isSignUp = false) {
  if (!ensureSupabaseClient()) {
    showOnboardingError('Database not available');
    return;
  }
  
  try {
    let result;
    
    if (isSignUp) {
      result = await supabaseClient.auth.signUp({
        email: email,
        password: password
      });
    } else {
      result = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });
    }
    
    if (result.error) {
      showOnboardingError(result.error.message);
      return;
    }
    
    // Success — auth state listener handles the rest
    
  } catch (err) {
    console.error('[Auth] Email sign in error:', err);
    showOnboardingError('Connection error');
  }
}

// ============================================
// ANONYMOUS SIGN IN (BACKUP)
// ============================================
async function signInAnonymously() {
  try {
    updateSyncUI('syncing', 'Connecting...');
    
    const { data, error } = await supabaseClient.auth.signInAnonymously();
    if (error) throw error;
    
    currentUser = data.user;
    window.currentUser = currentUser;
    console.log('[Auth] Signed in anonymously:', currentUser.id.substring(0, 8) + '...');
    
    const migrated = localStorage.getItem('droplit_migrated_' + currentUser.id);
    if (!migrated && typeof ideas !== 'undefined' && ideas.length > 0) {
      await migrateLocalData();
    } else {
      await pullFromServer();
    }
    
    updateSyncUI('synced', 'Synced');
    return true;
  } catch (error) {
    console.error('[Auth] Anonymous sign in error:', error);
    updateSyncUI('error', 'Auth error');
    return false;
  }
}

// ============================================
// INVITE CODE FUNCTIONS
// ============================================
async function checkInviteCode(code) {
  if (!ensureSupabaseClient()) {
    return { valid: false, error: 'Database not available' };
  }
  
  const normalizedCode = code.trim().toUpperCase();
  console.log('[Auth] Checking invite code:', normalizedCode);
  
  try {
    const { data, error } = await supabaseClient
      .from('beta_invites')
      .select('*')
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .maybeSingle();
    
    if (error) {
      console.error('[Auth] Invite check error:', error);
      return { valid: false, error: error.message || 'Database error' };
    }
    
    if (!data) {
      return { valid: false, error: 'Invalid invite code' };
    }
    
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { valid: false, error: 'Invite code expired' };
    }
    
    if (data.used_count >= data.max_uses) {
      return { valid: false, error: 'Invite code already used' };
    }
    
    return { 
      valid: true, 
      invite: data,
      name: data.intended_name || 'Beta Tester'
    };
  } catch (err) {
    console.error('[Auth] Check invite error:', err);
    return { valid: false, error: 'Error: ' + (err.message || 'Connection failed') };
  }
}

async function useInviteCode(inviteId, userId) {
  if (!supabaseClient) return false;
  
  try {
    await supabaseClient.from('beta_invite_uses').insert({
      invite_id: inviteId,
      user_id: userId,
      user_agent: navigator.userAgent
    });
    
    await supabaseClient.rpc('increment_invite_usage', { invite_id: inviteId });
    console.log('[Auth] Invite code used successfully');
    return true;
  } catch (err) {
    console.error('[Auth] Use invite error:', err);
    return true; // Non-critical, continue anyway
  }
}

// ============================================
// ONBOARDING UI FUNCTIONS
// ============================================
let _validateTimer = null;

function showOnboardingModal() {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    modal.classList.add('show');
    
    // Check for invite code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite');
    if (inviteCode) {
      const input = document.getElementById('onboardingInviteCode');
      if (input) {
        input.value = inviteCode.toUpperCase();
        validateInviteInput();
      }
    }
  }
}

function hideOnboardingModal() {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

function showOnboardingStep(step) {
  document.querySelectorAll('.onboarding-step').forEach(el => {
    el.classList.remove('active');
  });
  const target = document.getElementById('onboardingStep' + step);
  if (target) {
    target.classList.add('active');
  }
}

function showOnboardingError(message) {
  // Try both error containers (step 2 and step 3)
  const errorEl = document.getElementById('onboardingError') || document.getElementById('onboardingError2');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 5000);
  }
}

async function validateInviteInput() {
  const input = document.getElementById('onboardingInviteCode');
  const btn = document.getElementById('onboardingContinueBtn');
  const status = document.getElementById('onboardingInviteStatus');
  
  if (!input || !btn) return;
  
  const code = input.value.trim().toUpperCase();
  input.value = code;
  
  if (code.length < 4) {
    btn.disabled = true;
    if (status) status.textContent = '';
    return;
  }
  
  // Debounce — don't spam API on every keystroke
  if (_validateTimer) clearTimeout(_validateTimer);
  
  btn.disabled = true;
  if (status) {
    status.textContent = 'Checking...';
    status.className = 'onboarding-invite-status checking';
  }
  
  _validateTimer = setTimeout(async () => {
    const result = await checkInviteCode(code);
    
    if (result.valid) {
      btn.disabled = false;
      btn.dataset.inviteId = result.invite.id;
      if (status) {
        status.textContent = '✓ Welcome, ' + result.name + '!';
        status.className = 'onboarding-invite-status valid';
      }
    } else {
      btn.disabled = true;
      if (status) {
        status.textContent = '✗ ' + result.error;
        status.className = 'onboarding-invite-status invalid';
      }
    }
  }, 500);
}

function proceedToAuth() {
  const btn = document.getElementById('onboardingContinueBtn');
  const codeInput = document.getElementById('onboardingInviteCode');
  
  if (btn && !btn.disabled) {
    // Store invite for after auth completes
    const inviteId = btn.dataset.inviteId;
    if (inviteId) {
      localStorage.setItem('droplit_pending_invite', inviteId);
    }
    if (codeInput && codeInput.value) {
      localStorage.setItem('droplit_pending_invite_code', codeInput.value.trim().toUpperCase());
    }
    
    showOnboardingStep(2);
  }
}

function showEmailForm() {
  showOnboardingStep(3);
}

function backToAuthMethods() {
  showOnboardingStep(2);
}

async function submitEmailAuth(isSignUp) {
  const email = document.getElementById('onboardingEmail').value.trim();
  const password = document.getElementById('onboardingPassword').value;
  
  if (!email || !password) {
    showOnboardingError('Please enter email and password');
    return;
  }
  
  // Only check password length for sign-up, not sign-in
  if (isSignUp && password.length < 8) {
    showOnboardingError('Password must be at least 8 characters');
    return;
  }
  
  const btn = document.getElementById('onboardingEmailSubmit');
  if (btn) {
    btn.disabled = true;
    btn.textContent = isSignUp ? 'Creating account...' : 'Signing in...';
  }
  
  await signInWithEmail(email, password, isSignUp);
  
  if (btn) {
    btn.disabled = false;
    btn.textContent = isSignUp ? 'Create Account' : 'Sign In';
  }
}

// ============================================
// SYNC: MIGRATE LOCAL DATA TO SUPABASE
// ============================================
async function migrateLocalData() {
  if (!currentUser || typeof ideas === 'undefined' || ideas.length === 0) return;
  
  updateSyncUI('syncing', 'Migrating...');
  console.log('[Auth] Migrating', ideas.length, 'drops to Supabase...');
  
  try {
    const textDrops = ideas.filter(i => !i.isMedia && !i.image && !i.audioData);
    
    const dropsToInsert = textDrops.map(idea => ({
      user_id: currentUser.id,
      external_id: String(idea.id),
      content: idea.text || '',
      category: idea.category || 'inbox',
      tags: idea.tags || [],
      markers: idea.markers || [],
      source: 'droplit',
      language: 'ru',
      is_media: false,
      has_local_media: !!(idea.image || idea.audioData),
      is_merged: idea.isMerged || false,
      ai_generated: idea.aiGenerated || false,
      transcription: idea.transcription || null,
      original_text: idea.originalText || null,
      notes: idea.notes || null,
      local_id: String(idea.id),
      device_id: DEVICE_ID,
      metadata: {
        date: idea.date,
        time: idea.time,
        timestamp: idea.timestamp
      }
    }));
    
    if (dropsToInsert.length > 0) {
      for (let i = 0; i < dropsToInsert.length; i += 50) {
        const batch = dropsToInsert.slice(i, i + 50);
        const { error } = await supabaseClient
          .from('drops')
          .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
        
        if (error) console.error('[Auth] Migration batch error:', error);
      }
    }
    
    await supabaseClient.from('sync_log').insert({
      user_id: currentUser.id,
      action: 'migrate',
      device_id: DEVICE_ID,
      details: { count: dropsToInsert.length, total_local: ideas.length }
    });
    
    localStorage.setItem('droplit_migrated_' + currentUser.id, 'true');
    console.log('[Auth] Migrated', dropsToInsert.length, 'text drops');
    
    updateSyncUI('synced', 'Migrated!');
    if (typeof toast === 'function') toast('Synced ' + dropsToInsert.length + ' drops to cloud!', 'success');
    
  } catch (error) {
    console.error('[Auth] Migration error:', error);
    updateSyncUI('error', 'Migration failed');
  }
}

// ============================================
// SYNC: PULL DROPS FROM SERVER
// ============================================
async function pullFromServer() {
  if (!currentUser) return;
  
  try {
    const { count, error } = await supabaseClient
      .from('drops')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    
    if (count > 0) {
      console.log('[Auth] Server has', count, 'drops');
    }
    
    lastSyncTime = new Date();
  } catch (error) {
    console.error('[Auth] Pull error:', error);
  }
}

// ============================================
// SYNC: SINGLE DROP TO SERVER
// ============================================
async function syncDropToServer(idea, action = 'create') {
  if (!syncEnabled || !currentUser || !supabaseClient) {
    console.log('⏸️ Sync disabled or not connected');
    return false;
  }
  
  if (idea.isMedia || idea.image || idea.audioData) {
    console.log('⏸️ Skipping media drop sync (MVP)');
    return true;
  }
  
  try {
    updateSyncUI('syncing', 'Saving...');
    
    const dropData = {
      user_id: currentUser.id,
      external_id: String(idea.id),
      content: idea.text || '',
      category: idea.category || 'inbox',
      tags: idea.tags || [],
      markers: idea.markers || [],
      source: 'droplit',
      language: 'ru',
      is_media: !!(idea.isMedia || idea.image || idea.audioData),
      has_local_media: !!(idea.image || idea.audioData),
      is_merged: idea.isMerged || false,
      ai_generated: idea.aiGenerated || false,
      transcription: idea.transcription || null,
      original_text: idea.originalText || null,
      notes: idea.notes || null,
      local_id: String(idea.id),
      device_id: DEVICE_ID,
      metadata: {
        date: idea.date,
        time: idea.time,
        timestamp: idea.timestamp
      }
    };
    
    const { error } = await supabaseClient
      .from('drops')
      .upsert(dropData, { onConflict: 'external_id', ignoreDuplicates: false })
      .select();
    
    if (error) throw error;
    
    console.log('☁️ Synced drop', String(idea.id).substring(0, 8) + '...', '(' + action + ')');
    updateSyncUI('synced', 'Synced');
    lastSyncTime = new Date();
    
    return true;
  } catch (error) {
    console.error('[Auth] Sync error:', error);
    updateSyncUI('error', 'Sync failed');
    return false;
  }
}

// ============================================
// SYNC: DELETE DROP FROM SERVER
// ============================================
async function deleteDropFromServer(ideaId) {
  if (!syncEnabled || !currentUser || !supabaseClient) return false;
  
  try {
    updateSyncUI('syncing', 'Deleting...');
    
    const { error } = await supabaseClient
      .from('drops')
      .delete()
      .eq('external_id', String(ideaId))
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    
    console.log('🗑️ Deleted drop', String(ideaId).substring(0, 8) + '...');
    updateSyncUI('synced', 'Synced');
    return true;
  } catch (error) {
    console.error('[Auth] Delete sync error:', error);
    updateSyncUI('error', 'Delete failed');
    return false;
  }
}

// ============================================
// SYNC: MANUAL FULL SYNC
// ============================================
async function manualSync() {
  if (isSyncing) return;
  
  if (!currentUser) {
    if (typeof toast === 'function') toast('Not connected to cloud', 'warning');
    initAuth();
    return;
  }
  
  isSyncing = true;
  if (typeof toast === 'function') toast('Syncing...', 'info');
  
  try {
    const textDrops = (typeof ideas !== 'undefined' ? ideas : []).filter(i => !i.isMedia && !i.image && !i.audioData);
    let synced = 0;
    
    for (const idea of textDrops) {
      const success = await syncDropToServer(idea, 'sync');
      if (success) synced++;
    }
    
    lastSyncTime = new Date();
    updateLastSyncInfo();
    if (typeof toast === 'function') toast('Synced ' + synced + ' drops to cloud', 'success');
    
  } catch (error) {
    console.error('[Auth] Manual sync error:', error);
    if (typeof toast === 'function') toast('Sync failed: ' + error.message, 'error');
  }
  
  isSyncing = false;
}

// ============================================
// UI HELPERS
// ============================================
function updateLastSyncInfo() {
  const el = document.getElementById('lastSyncInfo');
  if (!el) return;
  
  if (lastSyncTime) {
    el.textContent = 'Last sync: ' + lastSyncTime.toLocaleTimeString();
  } else {
    el.textContent = 'Last sync: —';
  }
}

function updateSyncUI(status, text) {
  if (status === 'synced') {
    lastSyncTime = new Date();
    updateLastSyncInfo();
  }
}

// ============================================
// EXPOSE GLOBALS
// ============================================

// onclick handlers for onboarding modal HTML (same names as before)
window.onboardingValidateInvite = validateInviteInput;
window.onboardingProceedToAuth = proceedToAuth;
window.onboardingSignInGoogle = signInWithGoogle;
window.onboardingSignInApple = signInWithApple;
window.onboardingShowEmailForm = showEmailForm;
window.onboardingBackToAuth = backToAuthMethods;
window.onboardingSubmitEmail = submitEmailAuth;

// API used by index.html and other scripts
window.DropLitAuth = {
  initAuth,
  signInWithTestAccount,
  signInAnonymously,
  syncDropToServer,
  deleteDropFromServer,
  manualSync,
  pullFromServer,
  getSupabase: () => supabaseClient,
  getCurrentUser: () => currentUser,
  getDeviceId: () => DEVICE_ID,
  isAuthenticated: () => !!currentUser
};

// Keep DropLitOnboarding for backward compatibility
window.DropLitOnboarding = {
  init: initAuth,
  showModal: showOnboardingModal,
  hideModal: hideOnboardingModal,
  showStep: showOnboardingStep,
  checkInvite: checkInviteCode,
  signInWithGoogle: signInWithGoogle,
  signInWithApple: signInWithApple,
  signInWithEmail: signInWithEmail
};

// ============================================
// INIT ON DOM READY
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  // DOM already loaded — start immediately
  // Small delay to ensure Supabase SDK script has executed
  setTimeout(initAuth, 100);
}
