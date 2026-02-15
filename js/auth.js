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
let _bgSyncInterval = null;
const SYNC_INTERVAL_MS = 60000;   // 60 seconds
const SYNC_MIN_AGE_MS = 120000;   // 2 minutes (wait for NEW period)

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
      startBackgroundSync();
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
      
      startBackgroundSync();
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
      stopBackgroundSync();
      
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
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'https://www.googleapis.com/auth/drive.appfolder',
        queryParams: {
          access_type: 'offline'
        }
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
    
    const dropsToInsert = textDrops.map(idea => mapDropToServer(idea));
    
    if (dropsToInsert.length > 0) {
      for (let i = 0; i < dropsToInsert.length; i += 50) {
        const batch = dropsToInsert.slice(i, i + 50);
        const { error } = await supabaseClient
          .from('drops')
          .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
        
        if (error) console.error('[Auth] Migration batch error:', error);
      }
    }
    
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
    // Check if local storage already has drops
    const localRaw = localStorage.getItem('droplit_ideas');
    const localDrops = localRaw ? JSON.parse(localRaw) : [];
    
    // Count server drops
    const { count, error: countErr } = await supabaseClient
      .from('drops')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id);
    
    if (countErr) throw countErr;
    
    console.log('[Auth] Server has', count, 'drops, local has', localDrops.length);
    
    // If local is populated, skip full pull (backgroundSync handles incremental)
    if (localDrops.length > 0) {
      lastSyncTime = new Date();
      return;
    }
    
    // Local is empty but server has data → full pull (cache cleared, new device, etc.)
    if (count === 0) {
      lastSyncTime = new Date();
      return;
    }
    
    console.log('[Auth] Local empty, pulling', count, 'drops from server...');
    if (typeof updateSyncUI === 'function') updateSyncUI('syncing', 'Restoring...');
    
    // Fetch all drops in pages of 500
    const allServerDrops = [];
    const PAGE_SIZE = 500;
    let from = 0;
    
    while (from < count) {
      const { data, error } = await supabaseClient
        .from('drops')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allServerDrops.push(...data);
      from += data.length;
      
      console.log('[Auth] Fetched', allServerDrops.length, '/', count);
    }
    
    // Convert server drops → local format
    const encModule = window.DropLitEncryption;
    const keysModule = window.DropLitKeys;
    let encKey = null;
    
    // Try to get decryption key
    if (encModule?.decryptDrop && keysModule?.retrieveKey) {
      try {
        const keyData = await keysModule.retrieveKey(currentUser.id);
        if (keyData?.key) encKey = keyData.key;
      } catch (e) { /* no key */ }
    }
    
    const restoredDrops = [];
    let decryptedCount = 0;
    let plaintextCount = 0;
    let failedCount = 0;
    
    for (const serverDrop of allServerDrops) {
      try {
        let localDrop;
        
        if (serverDrop.encrypted_content && serverDrop.encryption_version > 0 && encKey) {
          // Decrypt encrypted drop
          const decrypted = await encModule.decryptDrop(serverDrop, encKey);
          localDrop = mapServerToLocal(decrypted, serverDrop);
          decryptedCount++;
        } else if (serverDrop.encrypted_content && !encKey) {
          // Encrypted but no key — store minimal info
          localDrop = mapServerToLocal(null, serverDrop);
          localDrop._encrypted = true;
          localDrop._needsDecryption = true;
          failedCount++;
        } else {
          // Plaintext drop
          localDrop = mapServerToLocal(null, serverDrop);
          plaintextCount++;
        }
        
        restoredDrops.push(localDrop);
        
      } catch (dropErr) {
        console.warn('[Auth] Failed to process drop:', serverDrop.external_id, dropErr.message);
        failedCount++;
      }
    }
    
    // Sort by timestamp descending (newest first)
    restoredDrops.sort((a, b) => b.id - a.id);
    
    // Save to localStorage
    localStorage.setItem('droplit_ideas', JSON.stringify(restoredDrops));
    
    // Rebuild sync tracker (all these drops are already on server)
    const syncTracker = {};
    const now = Date.now();
    for (const d of restoredDrops) {
      syncTracker[String(d.id)] = now;
    }
    localStorage.setItem('droplit_sync_tracker_' + currentUser.id, JSON.stringify(syncTracker));
    
    console.log('[Auth] ✅ Restored', restoredDrops.length, 'drops (' +
      decryptedCount + ' decrypted, ' + plaintextCount + ' plaintext, ' + failedCount + ' failed)');
    
    // Trigger UI refresh
    if (typeof render === 'function') render();
    if (typeof toast === 'function') {
      toast('Restored ' + restoredDrops.length + ' drops', 'success');
    }
    
    lastSyncTime = new Date();
    if (typeof updateSyncUI === 'function') updateSyncUI('synced', 'Restored');
    
  } catch (error) {
    console.error('[Auth] Pull error:', error);
    if (typeof updateSyncUI === 'function') updateSyncUI('error', 'Restore failed');
  }
}

/**
 * Convert server drop → local format (for localStorage)
 * Inverse of mapDropToServer
 */
function mapServerToLocal(decryptedData, serverDrop) {
  const meta = serverDrop.metadata || {};
  
  const local = {
    // ID: use external_id (which is our original Date.now() id)
    id: parseInt(serverDrop.external_id) || Date.now(),
    
    // Text content (from decrypted data or server plaintext)
    text: decryptedData?.text || serverDrop.content || '',
    
    // Category and classification
    category: serverDrop.category || 'inbox',
    
    // Timestamps
    timestamp: meta.timestamp || serverDrop.created_at,
    date: meta.date || null,
    time: meta.time || null,
    
    // Creator
    creator: serverDrop.creator || 'user',
    source: serverDrop.source || 'droplit',
    
    // Tags and markers
    tags: serverDrop.tags || [],
    markers: serverDrop.markers || [],
    
    // Flags
    isMedia: serverDrop.is_media || false,
    isMerged: serverDrop.is_merged || false,
    aiGenerated: serverDrop.ai_generated || false,
    
    // Text fields
    transcription: decryptedData?.transcription || serverDrop.transcription || null,
    originalText: serverDrop.original_text || null,
    notes: decryptedData?.notes || serverDrop.notes || null,
    
    // Media (from decrypted or metadata)
    audioData: decryptedData?.audioData || null,
    image: decryptedData?.image || null,
    audioFormat: meta.audio_format || null,
    audioSize: meta.audio_size || null,
    duration: meta.audio_duration || null,
    
    // Geo (sensitive, from decrypted only)
    geo: decryptedData?.geo || null,
    
    // Session
    sessionId: meta.session_id || null,
    
    // Lifecycle
    lifecycle_state: serverDrop.is_archived ? 'archived' : 'active',
    
    // Privacy
    privacy_level: serverDrop.privacy_level || 'standard',
    
    // Media vault references (OPFS / Cloud)
    mediaRef: meta.media_ref || null,
    mediaSize: meta.media_size || null,
    mediaSaved: meta.media_saved || false,
    cloudRef: meta.cloud_ref || null,
    originalWidth: meta.original_width || null,
    originalHeight: meta.original_height || null,
    
    // Sync marker
    synced: true,
    syntrise_id: serverDrop.id  // server UUID
  };
  
  return local;
}

// ============================================
// SYNC: MAP CLIENT DROP → SERVER SCHEMA
// ============================================
function mapDropToServer(drop, options = {}) {
  const { encrypted = null, privacyLevel = null } = options;
  const isMedia = !!(drop.isMedia || drop.image || drop.audioData);
  const hasTextContent = !!(drop.text || drop.transcription);
  
  // Determine drop_type
  let dropType = 'text';
  if (drop.audioData) dropType = 'audio';
  else if (drop.image) dropType = 'photo';
  else if (drop.isLink) dropType = 'link';
  else if (drop.isMerged) dropType = 'merged';
  
  const serverDrop = {
    user_id: currentUser.id,
    external_id: String(drop.id),
    
    // Classification (real DB columns)
    drop_group: 'info',
    drop_type: dropType,
    category: drop.category || 'inbox',
    tags: drop.tags || [],
    markers: drop.markers || [],
    
    // Creator & source
    creator: drop.creator || 'user',
    source: drop.source || 'droplit',
    language: 'ru',
    
    // Flags
    is_media: isMedia,
    has_local_media: isMedia,
    is_merged: drop.isMerged || false,
    ai_generated: drop.aiGenerated || false,
    
    // Sync tracking
    local_id: String(drop.id),
    device_id: DEVICE_ID,
    
    // Processing (core-worker will pick up)
    processed: false,
    deep_process: hasTextContent,
    
    // Archive state
    is_archived: drop.lifecycle_state === 'archived',
    
    // Privacy
    privacy_level: privacyLevel || drop.privacy_level || 'standard'
  };
  
  // --- CONTENT: encrypted vs plaintext ---
  if (encrypted && encrypted.encrypted_content) {
    // Encrypted mode: sensitive fields in blob, plaintext cleared
    serverDrop.encrypted_content = encrypted.encrypted_content;
    serverDrop.encryption_nonce = encrypted.encryption_nonce;
    serverDrop.encryption_version = encrypted.encryption_version || 1;
    // Use empty strings (not null) — Supabase has NOT NULL constraints
    serverDrop.content = '';
    serverDrop.transcription = '';
    serverDrop.original_text = '';
    serverDrop.notes = '';
  } else {
    // Plaintext mode (no key, legacy)
    serverDrop.content = drop.text || drop.transcription || '';
    serverDrop.transcription = drop.transcription || '';
    serverDrop.original_text = drop.originalText || '';
    serverDrop.notes = drop.notes || '';
    serverDrop.encryption_version = 0;
  }
  
  // Metadata (non-sensitive, always open for filtering/sorting)
  serverDrop.metadata = {
    date: drop.date,
    time: drop.time,
    timestamp: drop.timestamp,
    session_id: drop.sessionId || null,
    source_file: drop.sourceFile || null,
    source_drop_id: drop.sourceDropId || null,
    // Media vault references (OPFS / Cloud)
    ...(drop.mediaRef ? {
      media_ref: drop.mediaRef,
      media_size: drop.mediaSize || null,
      media_saved: drop.mediaSaved || false,
      cloud_ref: drop.cloudRef || null,
      original_width: drop.originalWidth || null,
      original_height: drop.originalHeight || null
    } : {}),
    // Media-specific metadata (non-sensitive)
    ...(isMedia ? {
      media_status: hasTextContent ? 'described' : 'raw',
      audio_format: drop.audioFormat || null,
      audio_size: drop.audioSize || null,
      audio_duration: drop.duration || null,
      image_dimensions: drop.imageDimensions || null
    } : {})
  };
  
  return serverDrop;
}

// ============================================
// BACKGROUND SYNC — MAIN ENGINE
// ============================================
async function backgroundSync() {
  // Guards
  if (!syncEnabled || !currentUser || !supabaseClient) return;
  if (isSyncing) return;
  
  // Read drops from localStorage directly (don't depend on global 'ideas')
  let localDrops;
  try {
    const raw = localStorage.getItem('droplit_ideas');
    localDrops = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[Sync] Cannot read localStorage:', e);
    return;
  }
  
  if (!localDrops || localDrops.length === 0) return;
  
  isSyncing = true;
  console.log('[Sync] Checking', localDrops.length, 'local drops...');
  
  try {
    // --- STEP 1: Find drops that need syncing ---
    const now = Date.now();
    const toSync = [];
    const toDelete = [];
    
    // Get list of synced external_ids from Supabase
    const syncTracker = JSON.parse(localStorage.getItem('droplit_sync_tracker_' + currentUser.id) || '{}');
    
    for (const drop of localDrops) {
      if (!drop || !drop.id) continue;
      
      const dropAge = now - drop.id;  // id = Date.now() at creation
      
      // Skip too new (< 2 min, user may delete)
      if (dropAge < SYNC_MIN_AGE_MS) continue;
      
      // Media without text: still sync metadata (media_ref, size, type)
      // Original file stays in OPFS/Cloud, only metadata goes to Supabase
      
      // Skip if already synced and not modified
      const syncedAt = syncTracker[String(drop.id)];
      const updatedAt = drop._updatedAt || drop.id;
      if (syncedAt && syncedAt >= updatedAt) continue;
      
      // Needs sync
      toSync.push(drop);
    }
    
    // --- STEP 2: Find locally deleted drops ---
    const localIds = new Set(localDrops.map(i => String(i.id)));
    for (const extId in syncTracker) {
      if (!localIds.has(extId)) {
        toDelete.push(extId);
      }
    }
    
    // Nothing to do
    if (toSync.length === 0 && toDelete.length === 0) {
      isSyncing = false;
      return;
    }
    
    // --- STEP 3: Upsert new/updated drops ---
    if (toSync.length > 0) {
      console.log('[Sync] Syncing', toSync.length, 'drops...');
      updateSyncUI('syncing', 'Saving...');
      
      // --- Resolve encryption key (once per cycle, not per drop) ---
      const encModule = window.DropLitEncryption;
      const keysModule = window.DropLitKeys;
      let encKey = null;
      
      if (encModule?.encryptDrop && keysModule?.retrieveKey && currentUser) {
        try {
          const keyData = await keysModule.retrieveKey(currentUser.id);
          if (keyData?.key) encKey = keyData.key;
        } catch (e) { /* no key — plaintext mode */ }
      }
      
      if (encKey) {
        console.log('[Sync] 🔐 Encryption active');
      }
      
      // --- Resolve ZK search availability ---
      const zkModule = window.DropLitZKSearch;
      const zkReady = zkModule?.isReady?.() && zkModule?.generateDropTokens;
      
      // --- Resolve audit availability ---
      const auditModule = window.DropLitAudit;
      const auditReady = auditModule?.logDropCreate || auditModule?.logSyncPush;
      
      // --- Process and upsert in batches ---
      const zkTokenQueue = [];  // {external_id, tokens} — sync after upsert
      
      for (let i = 0; i < toSync.length; i += 20) {
        const batchDrops = toSync.slice(i, i + 20);
        const batch = [];
        
        for (const d of batchDrops) {
          // Privacy check: maximum = local only, never sync
          if (encModule?.shouldSync && !encModule.shouldSync(d)) {
            console.log('[Sync] Skip local-only drop:', String(d.id).substring(0, 8));
            syncTracker[String(d.id)] = now;  // mark so we don't re-check
            continue;
          }
          
          let serverDrop;
          
          if (encKey) {
            // --- ENCRYPTED PATH ---
            try {
              // 1. Generate ZK search tokens BEFORE encryption (from plaintext)
              if (zkReady) {
                try {
                  const tokens = await zkModule.generateDropTokens(d);
                  if (tokens?.length > 0) {
                    zkTokenQueue.push({ external_id: String(d.id), tokens });
                  }
                } catch (zkErr) {
                  console.warn('[Sync] ZK token generation failed:', zkErr.message);
                }
              }
              
              // 2. Encrypt sensitive fields (text, audioData, image, notes, geo)
              const encrypted = await encModule.encryptDrop(d, encKey);
              
              // 3. Build server object with encrypted content
              serverDrop = mapDropToServer(d, {
                encrypted: encrypted,
                privacyLevel: d.privacy_level || 'standard'
              });
              
            } catch (encErr) {
              // Encryption failed — NEVER send plaintext as fallback
              // This protects against partial encryption bugs leaking data
              console.error('[Sync] Encryption failed, SKIPPING drop:', encErr.message);
              continue;
            }
          } else {
            // --- PLAINTEXT PATH (no key setup yet) ---
            serverDrop = mapDropToServer(d);
          }
          
          batch.push(serverDrop);
        }
        
        if (batch.length === 0) continue;
        
        const { error } = await supabaseClient
          .from('drops')
          .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
        
        if (error) {
          console.error('[Sync] Batch error:', error);
        } else {
          const synced = now;
          for (const d of batchDrops) {
            syncTracker[String(d.id)] = synced;
          }
        }
      }
      
      // --- STEP 3b: Sync ZK search tokens ---
      // Tokens go to separate table, need server-side drop UUID
      if (zkTokenQueue.length > 0 && encKey) {
        for (const item of zkTokenQueue) {
          try {
            // Look up server UUID by external_id
            const { data: dropRow } = await supabaseClient
              .from('drops')
              .select('id')
              .eq('external_id', item.external_id)
              .eq('user_id', currentUser.id)
              .maybeSingle();
            
            if (dropRow?.id) {
              await supabaseClient
                .from('drop_search_tokens')
                .upsert({
                  drop_id: dropRow.id,
                  tokens: item.tokens,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'drop_id' });
            }
          } catch (zkSyncErr) {
            // Non-critical: drop is synced, tokens can retry next cycle
            console.warn('[Sync] ZK token sync failed:', zkSyncErr.message);
          }
        }
        console.log('[Sync] ZK tokens synced:', zkTokenQueue.length, 'drops');
      }
      
      // --- STEP 3c: Audit trail ---
      if (auditReady) {
        try {
          if (auditModule.logSyncPush) {
            await auditModule.logSyncPush({ 
              count: toSync.length, 
              encrypted: !!encKey 
            });
          }
        } catch (auditErr) {
          // Non-critical
        }
      }
    }
    
    // --- STEP 4: Delete remotely ---
    if (toDelete.length > 0) {
      console.log('[Sync] Deleting', toDelete.length, 'drops from server...');
      
      for (const extId of toDelete) {
        const { error } = await supabaseClient
          .from('drops')
          .delete()
          .eq('external_id', extId)
          .eq('user_id', currentUser.id);
        
        if (error) {
          console.error('[Sync] Delete error for', extId, ':', error);
        } else {
          delete syncTracker[extId];
        }
      }
    }
    
    // --- STEP 5: Save tracker & update UI ---
    localStorage.setItem('droplit_sync_tracker_' + currentUser.id, JSON.stringify(syncTracker));
    lastSyncTime = new Date();
    updateSyncUI('synced', 'Synced');
    updateLastSyncInfo();
    
    if (toSync.length > 0 || toDelete.length > 0) {
      console.log('[Sync] Done:', toSync.length, 'upserted,', toDelete.length, 'deleted');
    }
    
  } catch (error) {
    console.error('[Sync] Background sync error:', error);
    updateSyncUI('error', 'Sync error');
  }
  
  isSyncing = false;
}

// ============================================
// SYNC: START / STOP BACKGROUND SYNC
// ============================================
function startBackgroundSync() {
  if (_bgSyncInterval) return;  // already running
  
  console.log('[Sync] Starting background sync (every', SYNC_INTERVAL_MS / 1000, 'sec)');
  
  // Run first sync after 10 seconds (give app time to load)
  setTimeout(backgroundSync, 10000);
  
  // Then every 60 seconds
  _bgSyncInterval = setInterval(backgroundSync, SYNC_INTERVAL_MS);
}

function stopBackgroundSync() {
  if (_bgSyncInterval) {
    clearInterval(_bgSyncInterval);
    _bgSyncInterval = null;
    console.log('[Sync] Background sync stopped');
  }
}

// ============================================
// SYNC: LEGACY WRAPPERS (backward compatibility)
// ============================================

// syncDropToServer — now just marks drop for next backgroundSync cycle
// Kept for existing call sites that pass drop argument
async function syncDropToServer(idea, action = 'create') {
  if (!syncEnabled || !currentUser) return false;
  // Drop will be picked up by backgroundSync on next cycle
  // Just mark as updated so sync knows to process it
  if (idea) {
    idea._updatedAt = Date.now();
  }
  console.log('[Sync] Drop queued for background sync:', String(idea?.id).substring(0, 8) + '...');
  return true;
}

// deleteDropFromServer — immediate delete (don't wait for bg cycle)
async function deleteDropFromServer(ideaId) {
  if (!syncEnabled || !currentUser || !supabaseClient) return false;
  
  try {
    const { error } = await supabaseClient
      .from('drops')
      .delete()
      .eq('external_id', String(ideaId))
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    
    // Remove from sync tracker
    const trackerKey = 'droplit_sync_tracker_' + currentUser.id;
    const tracker = JSON.parse(localStorage.getItem(trackerKey) || '{}');
    delete tracker[String(ideaId)];
    localStorage.setItem(trackerKey, JSON.stringify(tracker));
    
    console.log('🗑️ Deleted drop', String(ideaId).substring(0, 8) + '...');
    return true;
  } catch (error) {
    console.error('[Sync] Delete error:', error);
    return false;
  }
}

// manualSync — triggers immediate background sync
async function manualSync() {
  if (isSyncing) return;
  
  if (!currentUser) {
    if (typeof toast === 'function') toast('Not connected to cloud', 'warning');
    initAuth();
    return;
  }
  
  if (typeof toast === 'function') toast('Syncing...', 'info');
  
  await backgroundSync();
  
  // Cloud media sync (if enabled)
  if (window.DropLitCloudGDrive?.isEnabled()) {
    try {
      const cloudResult = await window.DropLitCloudGDrive.syncAll();
      if (cloudResult.uploaded > 0) {
        console.log('[Auth] Cloud sync:', cloudResult.uploaded, 'media files uploaded');
      }
    } catch (e) {
      console.warn('[Auth] Cloud media sync error:', e.message);
    }
  }
  
  if (typeof toast === 'function') toast('Sync complete!', 'success');
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
  backgroundSync,
  startBackgroundSync,
  stopBackgroundSync,
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
