// ============================================
// DropLit Service Worker v1.0.0
// Push Notifications + Offline Support
// ============================================

const CACHE_NAME = 'droplit-v1';
const OFFLINE_URL = '/offline.html';

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(clients.claim());
});

// Push event - Handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'DropLit',
    body: 'Новое уведомление',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'droplit-notification',
    data: {}
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [
      { action: 'open', title: 'Открыть' },
      { action: 'dismiss', title: 'Позже' }
    ],
    data: data.data
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('droplit') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          const url = event.notification.data?.url || '/';
          return clients.openWindow(url);
        }
      })
  );
});

// Message event - Communication with main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: event.data.tag || 'droplit-local',
      data: event.data.data
    });
  }
});

// Periodic sync (for proactive checks when supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-insights') {
    event.waitUntil(checkForInsights());
  }
});

// Check for pending insights
async function checkForInsights() {
  try {
    const response = await fetch('https://ughfdhmyflotgsysvrrc.supabase.co/rest/v1/core_insights?status=eq.pending&limit=5', {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE'
      }
    });
    
    const insights = await response.json();
    
    for (const insight of insights) {
      await self.registration.showNotification(insight.title, {
        body: insight.content,
        icon: '/icons/icon-192.png',
        tag: `insight-${insight.id}`,
        data: { insightId: insight.id }
      });
    }
  } catch (error) {
    console.error('[SW] Check insights error:', error);
  }
}
