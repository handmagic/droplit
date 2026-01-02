// ============================================
// DROPLIT NOTIFICATIONS v1.0
// Push Notifications & Proactive Insights
// ============================================

// ============================================
// PUSH NOTIFICATIONS & PROACTIVE INSIGHTS
// ============================================

let currentInsight = null;
const INSIGHTS_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Register Service Worker
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw-droplit.js');
      console.log('✅ Service Worker registered');
      return registration;
    } catch (error) {
      console.warn('⚠️ Service Worker registration failed:', error);
    }
  }
}

// Check notification permission
function checkNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return;
  }
  
  if (Notification.permission === 'default') {
    // Show permission banner after 30 seconds
    setTimeout(() => {
      const dismissed = localStorage.getItem('notif_banner_dismissed');
      if (!dismissed) {
        document.getElementById('notifBanner').classList.add('show');
      }
    }, 30000);
  }
}

// Request notification permission
async function requestNotifPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast('Уведомления включены!', 'success');
      // Test notification
      new Notification('DropLit', {
        body: 'Теперь ASKI сможет напоминать о важном!',
        icon: '/icons/icon-192.png'
      });
    }
  } catch (error) {
    console.error('Notification permission error:', error);
  }
  dismissNotifBanner();
}

// Dismiss notification banner
function dismissNotifBanner() {
  document.getElementById('notifBanner').classList.remove('show');
  localStorage.setItem('notif_banner_dismissed', 'true');
}

// Check for pending insights
async function checkPendingInsights() {
  if (!currentUser) return;
  
  try {
    // Get session token for RLS
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_ANON_KEY;
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/core_insights?user_id=eq.${currentUser.id}&status=eq.pending&order=priority.desc&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const insights = await response.json();
    
    if (insights?.length > 0) {
      showInsightBanner(insights[0]);
    }
  } catch (error) {
    console.warn('Check insights error:', error);
  }
}

// Show insight banner
function showInsightBanner(insight) {
  currentInsight = insight;
  
  const banner = document.getElementById('insightsBanner');
  const title = document.getElementById('insightTitle');
  const text = document.getElementById('insightText');
  
  // Set icon based on type
  const icon = banner.querySelector('.insights-banner-icon');
  if (insight.insight_type === 'birthday_reminder') {
    icon.textContent = '🎂';
  } else if (insight.insight_type === 'event_reminder') {
    icon.textContent = '📅';
  } else {
    icon.textContent = '💡';
  }
  
  title.textContent = insight.title;
  text.textContent = insight.content;
  
  banner.classList.add('show');
  
  // Also show browser notification if permitted
  if (Notification.permission === 'granted') {
    new Notification(insight.title, {
      body: insight.content,
      icon: '/icons/icon-192.png',
      tag: `insight-${insight.id}`
    });
  }
}

// Dismiss insight
async function dismissInsight() {
  document.getElementById('insightsBanner').classList.remove('show');
  
  if (currentInsight && currentUser) {
    try {
      // Get session token for RLS
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      
      await fetch(
        `${SUPABASE_URL}/rest/v1/core_insights?id=eq.${currentInsight.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ status: 'dismissed' })
        }
      );
    } catch (error) {
      console.warn('Dismiss insight error:', error);
    }
  }
  
  currentInsight = null;
}

// Initialize proactive features
function initProactiveFeatures() {
  registerServiceWorker();
  checkNotificationPermission();
  
  // Check insights on load (after auth)
  setTimeout(checkPendingInsights, 3000);
  
  // Periodic check
  setInterval(checkPendingInsights, INSIGHTS_CHECK_INTERVAL);
}

// Start when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initProactiveFeatures, 2000);
});

console.log('🧠 Syntrise CORE integration loaded');
console.log('🔔 Proactive features initialized');

// ============================================
// EXPORTS
// ============================================
window.DropLitNotifications = {
  registerServiceWorker,
  checkNotificationPermission,
  requestNotifPermission,
  dismissNotifBanner,
  checkPendingInsights,
  showInsightBanner,
  dismissInsight,
  initProactiveFeatures
};
