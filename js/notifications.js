// ============================================
// DROPLIT NOTIFICATIONS v1.1
// Push Notifications & Proactive Insights
// ============================================

let currentInsight = null;
const INSIGHTS_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ============================================
// SERVICE WORKER (uses main sw.js)
// ============================================

// Note: sw.js is already registered in index.html
// This function gets the existing registration
async function getServiceWorkerRegistration() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('[Notifications] Service Worker ready');
      return registration;
    } catch (error) {
      console.warn('[Notifications] Service Worker not ready:', error);
      return null;
    }
  }
  return null;
}

// ============================================
// NOTIFICATION PERMISSION
// ============================================

function checkNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('[Notifications] Not supported in this browser');
    return;
  }
  
  if (Notification.permission === 'default') {
    // Show permission banner after 30 seconds
    setTimeout(() => {
      const dismissed = localStorage.getItem('notif_banner_dismissed');
      if (!dismissed) {
        const banner = document.getElementById('notifBanner');
        if (banner) {
          banner.classList.add('show');
        }
      }
    }, 30000);
  } else if (Notification.permission === 'granted') {
    console.log('[Notifications] Permission already granted');
  }
}

async function requestNotifPermission() {
  try {
    const permission = await Notification.requestPermission();
    console.log('[Notifications] Permission result:', permission);
    
    if (permission === 'granted') {
      toast('Notifications enabled!', 'success');
      
      // Test notification
      const registration = await getServiceWorkerRegistration();
      if (registration) {
        registration.showNotification('DropLit', {
          body: 'ASKI can now remind you about important things!',
          icon: '/icons/icon-192.png',
          tag: 'test-notification'
        });
      } else {
        // Fallback to regular notification
        new Notification('DropLit', {
          body: 'ASKI can now remind you about important things!',
          icon: '/icons/icon-192.png'
        });
      }
    } else {
      console.log('[Notifications] Permission denied or dismissed');
    }
  } catch (error) {
    console.error('[Notifications] Permission error:', error);
  }
  dismissNotifBanner();
}

function dismissNotifBanner() {
  const banner = document.getElementById('notifBanner');
  if (banner) {
    banner.classList.remove('show');
  }
  localStorage.setItem('notif_banner_dismissed', 'true');
}

// ============================================
// PROACTIVE INSIGHTS
// ============================================

async function checkPendingInsights() {
  if (typeof currentUser === 'undefined' || !currentUser) {
    return;
  }
  
  try {
    // Get Supabase client
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      console.log('[Notifications] Supabase not ready');
      return;
    }
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      return;
    }
    
    const token = session.access_token;
    const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/core_insights?user_id=eq.${currentUser.id}&status=eq.pending&order=priority.desc&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      // Table might not exist yet - that's OK
      if (response.status === 404) {
        console.log('[Notifications] core_insights table not found');
      }
      return;
    }
    
    const insights = await response.json();
    
    if (insights?.length > 0) {
      showInsightBanner(insights[0]);
    }
  } catch (error) {
    // Silent fail - insights are optional
    console.log('[Notifications] Check insights:', error.message);
  }
}

function showInsightBanner(insight) {
  currentInsight = insight;
  
  const banner = document.getElementById('insightsBanner');
  const title = document.getElementById('insightTitle');
  const text = document.getElementById('insightText');
  
  if (!banner || !title || !text) {
    console.warn('[Notifications] Insight banner elements not found');
    return;
  }
  
  // Set icon based on type
  const icon = banner.querySelector('.insights-banner-icon');
  if (icon) {
    if (insight.insight_type === 'birthday_reminder') {
      icon.textContent = '🎂';
    } else if (insight.insight_type === 'event_reminder') {
      icon.textContent = '📅';
    } else if (insight.insight_type === 'alarm') {
      icon.textContent = '⏰';
    } else {
      icon.textContent = '💡';
    }
  }
  
  title.textContent = insight.title;
  text.textContent = insight.content;
  
  banner.classList.add('show');
  
  // Also show browser/SW notification if permitted
  if (Notification.permission === 'granted') {
    showPushNotification(insight.title, insight.content, `insight-${insight.id}`);
  }
}

async function showPushNotification(title, body, tag) {
  try {
    const registration = await getServiceWorkerRegistration();
    if (registration) {
      registration.showNotification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: tag
      });
    }
  } catch (error) {
    console.warn('[Notifications] Push notification failed:', error);
  }
}

async function dismissInsight() {
  const banner = document.getElementById('insightsBanner');
  if (banner) {
    banner.classList.remove('show');
  }
  
  if (currentInsight && typeof currentUser !== 'undefined' && currentUser) {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
          const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';
          
          await fetch(
            `${SUPABASE_URL}/rest/v1/core_insights?id=eq.${currentInsight.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ status: 'dismissed' })
            }
          );
        }
      }
    } catch (error) {
      console.warn('[Notifications] Dismiss insight error:', error);
    }
  }
  
  currentInsight = null;
}

// ============================================
// INITIALIZE
// ============================================

function initProactiveFeatures() {
  console.log('[Notifications] Initializing proactive features...');
  
  // Check notification permission status
  checkNotificationPermission();
  
  // Check insights after auth is ready (3 seconds delay)
  setTimeout(checkPendingInsights, 3000);
  
  // Periodic check for new insights
  setInterval(checkPendingInsights, INSIGHTS_CHECK_INTERVAL);
  
  console.log('[Notifications] Proactive features initialized');
}

// Start when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initProactiveFeatures, 2000);
});

// ============================================
// EXPORTS
// ============================================
window.DropLitNotifications = {
  getServiceWorkerRegistration,
  checkNotificationPermission,
  requestNotifPermission,
  dismissNotifBanner,
  checkPendingInsights,
  showInsightBanner,
  showPushNotification,
  dismissInsight,
  initProactiveFeatures
};
