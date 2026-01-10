// ============================================
// DROPLIT ONBOARDING v1.0
// Invite Codes + OAuth + Encryption Setup
// ============================================

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';
  
  let supabaseClient = null;

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function initSupabase() {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return true;
    }
    return false;
  }

  // ============================================
  // INVITE CODE FUNCTIONS
  // ============================================
  
  async function checkInviteCode(code) {
    if (!supabaseClient) {
      if (!initSupabase()) {
        console.error('[Onboarding] No Supabase client');
        return { valid: false, error: 'Database not available' };
      }
    }
    
    const normalizedCode = code.trim().toUpperCase();
    console.log('[Onboarding] Checking code:', normalizedCode);
    
    try {
      // Use maybeSingle() - doesn't error if no rows found
      const { data, error } = await supabaseClient
        .from('beta_invites')
        .select('*')
        .eq('code', normalizedCode)
        .eq('is_active', true)
        .maybeSingle();
      
      console.log('[Onboarding] Response:', { data, error });
      
      if (error) {
        console.error('[Onboarding] Supabase error:', error);
        return { valid: false, error: error.message || 'Database error' };
      }
      
      if (!data) {
        return { valid: false, error: 'Invalid invite code' };
      }
      
      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { valid: false, error: 'Invite code expired' };
      }
      
      // Check usage limit
      if (data.used_count >= data.max_uses) {
        return { valid: false, error: 'Invite code already used' };
      }
      
      return { 
        valid: true, 
        invite: data,
        name: data.intended_name || 'Beta Tester'
      };
      
    } catch (err) {
      console.error('[Onboarding] Check invite error:', err);
      return { valid: false, error: 'Error: ' + (err.message || 'Connection failed') };
    }
  }
  
  async function useInviteCode(inviteId, userId) {
    if (!supabaseClient) return false;
    
    try {
      // Record usage
      await supabaseClient.from('beta_invite_uses').insert({
        invite_id: inviteId,
        user_id: userId,
        user_agent: navigator.userAgent
      });
      
      // Increment counter
      await supabaseClient.rpc('increment_invite_usage', { invite_id: inviteId });
      
      return true;
    } catch (err) {
      console.error('[Onboarding] Use invite error:', err);
      // Non-critical, continue anyway
      return true;
    }
  }

  // ============================================
  // OAUTH FUNCTIONS
  // ============================================
  
  async function signInWithGoogle() {
    if (!supabaseClient) {
      if (!initSupabase()) {
        showOnboardingError('Database not available');
        return;
      }
    }
    
    try {
      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      
      if (error) {
        console.error('[Onboarding] Google sign in error:', error);
        showOnboardingError('Google sign in failed: ' + error.message);
      }
      // Redirect happens automatically
      
    } catch (err) {
      console.error('[Onboarding] Google sign in error:', err);
      showOnboardingError('Connection error');
    }
  }
  
  async function signInWithApple() {
    if (!supabaseClient) {
      if (!initSupabase()) {
        showOnboardingError('Database not available');
        return;
      }
    }
    
    try {
      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      
      if (error) {
        console.error('[Onboarding] Apple sign in error:', error);
        showOnboardingError('Apple sign in not configured yet');
      }
      
    } catch (err) {
      console.error('[Onboarding] Apple sign in error:', err);
      showOnboardingError('Connection error');
    }
  }
  
  async function signInWithEmail(email, password, isSignUp = false) {
    if (!supabaseClient) {
      if (!initSupabase()) {
        showOnboardingError('Database not available');
        return;
      }
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
      
      // Success - handle in auth state change listener
      
    } catch (err) {
      console.error('[Onboarding] Email sign in error:', err);
      showOnboardingError('Connection error');
    }
  }

  // ============================================
  // UI FUNCTIONS
  // ============================================
  
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
    // Hide all steps
    document.querySelectorAll('.onboarding-step').forEach(el => {
      el.classList.remove('active');
    });
    // Show target step
    const target = document.getElementById('onboardingStep' + step);
    if (target) {
      target.classList.add('active');
    }
  }
  
  function showOnboardingError(message) {
    const errorEl = document.getElementById('onboardingError');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }
  }
  
  function showOnboardingSuccess(message) {
    const successEl = document.getElementById('onboardingSuccess');
    if (successEl) {
      successEl.textContent = message;
      successEl.style.display = 'block';
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
    
    // Check code
    btn.disabled = true;
    if (status) {
      status.textContent = 'Checking...';
      status.className = 'onboarding-invite-status checking';
    }
    
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
  }
  
  function proceedToAuth() {
    const btn = document.getElementById('onboardingContinueBtn');
    if (btn && !btn.disabled) {
      // Store invite ID for after auth
      const inviteId = btn.dataset.inviteId;
      if (inviteId) {
        localStorage.setItem('droplit_pending_invite', inviteId);
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
    
    if (password.length < 6) {
      showOnboardingError('Password must be at least 6 characters');
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
  // AUTH STATE LISTENER
  // ============================================
  
  function setupAuthListener() {
    if (!supabaseClient) {
      if (!initSupabase()) return;
    }
    
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Onboarding] Auth state:', event);
      
      if (event === 'SIGNED_IN' && session?.user) {
        // User just signed in
        const user = session.user;
        
        // Check and use pending invite
        const pendingInvite = localStorage.getItem('droplit_pending_invite');
        if (pendingInvite) {
          await useInviteCode(pendingInvite, user.id);
          localStorage.removeItem('droplit_pending_invite');
        }
        
        // Update global currentUser
        if (typeof window.currentUser !== 'undefined') {
          window.currentUser = user;
        }
        
        // Hide onboarding
        hideOnboardingModal();
        
        // Show success
        if (typeof toast === 'function') {
          toast('Welcome to DropLit! 🎉', 'success');
        }
        
        // Check if encryption is set up
        setTimeout(() => {
          if (typeof DropLitKeys !== 'undefined' && typeof DropLitEncryptionUI !== 'undefined') {
            DropLitKeys.hasStoredKey(user.id).then(hasKey => {
              if (!hasKey) {
                // Show encryption setup
                DropLitEncryptionUI.showEncryptionSetupModal(user.id);
              } else {
                // Auto-restore encryption
                if (typeof resumeEncryption === 'function') {
                  resumeEncryption();
                }
              }
            });
          }
        }, 500);
        
      } else if (event === 'SIGNED_OUT') {
        // User signed out - show onboarding
        showOnboardingModal();
      }
    });
  }

  // ============================================
  // CHECK IF ONBOARDING NEEDED
  // ============================================
  
  async function checkOnboardingNeeded() {
    if (!supabaseClient) {
      if (!initSupabase()) return true;
    }
    
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      
      if (!session) {
        // No session - show onboarding
        return true;
      }
      
      // Has session - update currentUser and continue
      if (typeof window.currentUser !== 'undefined') {
        window.currentUser = session.user;
      }
      
      return false;
      
    } catch (err) {
      console.error('[Onboarding] Check session error:', err);
      return true;
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  async function initOnboarding() {
    console.log('[Onboarding] Initializing...');
    
    // Wait for Supabase SDK
    if (typeof supabase === 'undefined') {
      console.log('[Onboarding] Waiting for Supabase SDK...');
      setTimeout(initOnboarding, 100);
      return;
    }
    
    initSupabase();
    setupAuthListener();
    
    // Check if onboarding needed
    const needsOnboarding = await checkOnboardingNeeded();
    
    if (needsOnboarding) {
      showOnboardingModal();
    } else {
      console.log('[Onboarding] User already authenticated');
      // Trigger encryption check
      if (typeof window.currentUser !== 'undefined' && window.currentUser) {
        setTimeout(() => {
          if (typeof resumeEncryption === 'function') {
            resumeEncryption();
          }
        }, 1000);
      }
    }
  }

  // ============================================
  // EXPOSE GLOBAL FUNCTIONS
  // ============================================
  
  window.DropLitOnboarding = {
    init: initOnboarding,
    showModal: showOnboardingModal,
    hideModal: hideOnboardingModal,
    showStep: showOnboardingStep,
    checkInvite: checkInviteCode,
    signInWithGoogle: signInWithGoogle,
    signInWithApple: signInWithApple,
    signInWithEmail: signInWithEmail
  };
  
  // Expose for onclick handlers
  window.onboardingValidateInvite = validateInviteInput;
  window.onboardingProceedToAuth = proceedToAuth;
  window.onboardingSignInGoogle = signInWithGoogle;
  window.onboardingSignInApple = signInWithApple;
  window.onboardingShowEmailForm = showEmailForm;
  window.onboardingBackToAuth = backToAuthMethods;
  window.onboardingSubmitEmail = submitEmailAuth;

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnboarding);
  } else {
    // Small delay to ensure other scripts loaded
    setTimeout(initOnboarding, 200);
  }

})();
