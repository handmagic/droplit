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
// PENDING NOTIFICATIONS (Command Reminders)
// ============================================

async function checkPendingNotifications() {
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
    
    // Get pending notifications for current user
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/pending_notifications?user_id=eq.${currentUser.id}&status=eq.pending&order=created_at.asc&limit=10`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[Notifications] pending_notifications table not found');
      }
      return;
    }
    
    const notifications = await response.json();
    console.log('[Notifications] Found pending:', notifications.length);
    
    if (notifications?.length > 0) {
      for (const notif of notifications) {
        // Show notification
        await showCommandNotification(notif);
        
        // Mark as delivered
        await markNotificationDelivered(notif.id, token);
      }
    }
  } catch (error) {
    console.log('[Notifications] Check pending error:', error.message);
  }
}

async function showCommandNotification(notif) {
  console.log('[Notifications] Showing command notification:', notif.title);
  
  // Try SW notification first (works when app is in background)
  if (Notification.permission === 'granted') {
    try {
      const registration = await getServiceWorkerRegistration();
      if (registration) {
        await registration.showNotification(notif.title, {
          body: notif.body,
          icon: notif.icon || '/icons/icon-192.png',
          badge: notif.badge || '/icons/badge-72.png',
          tag: notif.tag || `command-${notif.id}`,
          vibrate: [200, 100, 200],
          requireInteraction: true,
          data: notif.data
        });
        console.log('[Notifications] SW notification shown');
        return;
      }
    } catch (error) {
      console.warn('[Notifications] SW notification failed:', error);
    }
    
    // Fallback to regular notification
    try {
      new Notification(notif.title, {
        body: notif.body,
        icon: notif.icon || '/icons/icon-192.png',
        tag: notif.tag || `command-${notif.id}`
      });
      console.log('[Notifications] Regular notification shown');
    } catch (error) {
      console.warn('[Notifications] Regular notification failed:', error);
    }
  } else {
    // No permission - show in-app toast
    if (typeof toast === 'function') {
      toast(`⚡ ${notif.title}: ${notif.body}`, 'info', 5000);
    }
    console.log('[Notifications] Shown as toast (no permission)');
  }
}

async function markNotificationDelivered(notifId, token) {
  try {
    const SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';
    
    await fetch(
      `${SUPABASE_URL}/rest/v1/pending_notifications?id=eq.${notifId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ 
          status: 'delivered', 
          delivered_at: new Date().toISOString() 
        })
      }
    );
    console.log('[Notifications] Marked as delivered:', notifId);
  } catch (error) {
    console.warn('[Notifications] Mark delivered error:', error);
  }
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
  
  // Check pending command notifications after auth is ready (3 seconds delay)
  setTimeout(checkPendingNotifications, 3000);
  
  // Check insights after auth is ready (4 seconds delay)
  setTimeout(checkPendingInsights, 4000);
  
  // Periodic check for new notifications and insights
  setInterval(checkPendingNotifications, 30000); // Every 30 seconds
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
  checkPendingNotifications,
  showCommandNotification,
  markNotificationDelivered,
  checkPendingInsights,
  showInsightBanner,
  showPushNotification,
  dismissInsight,
  initProactiveFeatures
};
