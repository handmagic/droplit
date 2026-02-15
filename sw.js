// ============================================
// DropLit Service Worker v2.0.1
// Caching + Offline + Push + Command Executor
// ============================================

const CACHE_NAME = 'droplit-v2.0.3';
const EXECUTOR_ID = 'service_worker';
const CHECK_INTERVAL = 15000; // 15 seconds
const CLAIM_TIMEOUT = 60000; // 60 seconds

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
  // Google Fonts loaded via <link> in HTML, not cacheable cross-origin in SW
];

// Supabase config (injected from main app)
let SUPABASE_URL = 'https://ughfdhmyflotgsysvrrc.supabase.co';
let SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaGZkaG15ZmxvdGdzeXN2cnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDgwMTEsImV4cCI6MjA4MjQyNDAxMX0.s6oAvyk6gJU0gcJV00HxPnxkvWIbhF2I3pVnPMNVcrE';

// Command check interval
let commandCheckInterval = null;

// ============================================
// INSTALL: Cache core assets
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v2.0.1...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================
// ACTIVATE: Clean old caches, start scheduler
// ============================================
// IMPORTANT: transformers-cache holds the 23MB ML model (MiniLM/e5-small).
// Deleting it forces re-download every SW update (40s desktop, 90s mobile).
// We preserve it and only delete old droplit-* versioned caches.
const PRESERVE_CACHES = ['transformers-cache'];

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && !PRESERVE_CACHES.includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Preserved caches:', PRESERVE_CACHES.join(', '));
        // Start command scheduler
        startCommandScheduler();
        return self.clients.claim();
      })
  );
});

// ============================================
// FETCH: Network first, fallback to cache
// Smart caching: skip API calls, preserve model files
// ============================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  
  // Never cache API calls (Supabase, Vercel functions, etc.)
  const skipCache = 
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/rest/') ||
    url.hostname.includes('api.anthropic.com') ||
    url.hostname.includes('api.openai.com') ||
    url.hostname.includes('api.elevenlabs.io');

  if (skipCache) {
    // Network only for API calls — no caching
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          // Cache ML models in their own cache, everything else in app cache
          const targetCache = url.hostname.includes('huggingface.co') || 
                              url.hostname.includes('cdn-lfs') 
                              ? 'transformers-cache' : CACHE_NAME;
          caches.open(targetCache).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Try all caches for offline fallback
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// ============================================
// COMMAND SCHEDULER
// ============================================

function startCommandScheduler() {
  if (commandCheckInterval) {
    clearInterval(commandCheckInterval);
  }
  
  console.log('[SW] Starting command scheduler');
  
  // Check immediately
  setTimeout(checkCommands, 3000);
  
  // Then periodically
  commandCheckInterval = setInterval(checkCommands, CHECK_INTERVAL);
}

async function checkCommands() {
  console.log('[SW] === checkCommands started ===');
  
  try {
    // Method 1: Check IndexedDB for local commands
    const localCommands = await getLocalPendingCommands();
    console.log('[SW] Local commands found:', localCommands.length);
    
    for (const cmd of localCommands) {
      if (new Date(cmd.scheduled_at) <= new Date()) {
        await executeLocalCommand(cmd);
      }
    }
    
    // Method 2: Check Supabase for synced commands (if online)
    console.log('[SW] Online status:', navigator.onLine);
    if (navigator.onLine) {
      await checkSupabaseCommands();
    } else {
      console.log('[SW] Offline, skipping Supabase check');
    }
    
  } catch (error) {
    console.error('[SW] Command check error:', error);
  }
  
  console.log('[SW] === checkCommands finished ===');
}

// ============================================
// LOCAL COMMAND EXECUTION (IndexedDB)
// ============================================

async function getLocalPendingCommands() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('droplit_commands', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('commands')) {
        const store = db.createObjectStore('commands', { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('scheduled_at', 'scheduled_at', { unique: false });
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('commands', 'readonly');
      const store = tx.objectStore('commands');
      const index = store.index('status');
      const query = index.getAll('pending');
      
      query.onsuccess = () => {
        const commands = query.result.filter(cmd => 
          new Date(cmd.scheduled_at) <= new Date()
        );
        resolve(commands);
      };
      
      query.onerror = () => reject(query.error);
    };
  });
}

async function executeLocalCommand(cmd) {
  console.log('[SW] Executing local command:', cmd.title);
  
  try {
    // Show notification
    await self.registration.showNotification(`⚡ ${cmd.title}`, {
      body: cmd.content || cmd.title,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: `command-${cmd.id}`,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: {
        command_id: cmd.id,
        action: 'open_command'
      },
      actions: [
        { action: 'done', title: '✓ Done' },
        { action: 'snooze', title: '⏰ Snooze' }
      ]
    });
    
    // Update status in IndexedDB
    await updateLocalCommandStatus(cmd.id, 'executed');
    
    // Notify main app
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'COMMAND_EXECUTED',
        command_id: cmd.id,
        executor: EXECUTOR_ID
      });
    });
    
    console.log('[SW] Command executed:', cmd.id);
    
  } catch (error) {
    console.error('[SW] Execute error:', error);
  }
}

async function updateLocalCommandStatus(id, status) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('droplit_commands', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('commands', 'readwrite');
      const store = tx.objectStore('commands');
      
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const cmd = getRequest.result;
        if (cmd) {
          cmd.status = status;
          cmd.executed_at = new Date().toISOString();
          cmd.executor = EXECUTOR_ID;
          store.put(cmd);
        }
        resolve();
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// SUPABASE COMMAND CHECK
// ============================================

async function checkSupabaseCommands() {
  console.log('[SW] checkSupabaseCommands called, online:', navigator.onLine);
  
  try {
    // Check for pending notifications from Supabase
    const url = `${SUPABASE_URL}/rest/v1/pending_notifications?status=eq.pending&limit=5`;
    console.log('[SW] Fetching:', url);
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    console.log('[SW] Response status:', response.status);
    
    if (!response.ok) {
      console.error('[SW] Response not ok:', response.status, response.statusText);
      return;
    }
    
    const notifications = await response.json();
    console.log('[SW] Found notifications:', notifications.length, notifications);
    
    for (const notif of notifications) {
      console.log('[SW] Showing notification:', notif.title);
      
      await self.registration.showNotification(notif.title, {
        body: notif.body,
        icon: notif.icon || '/icons/icon-192.png',
        badge: notif.badge || '/icons/badge-72.png',
        tag: notif.tag || `notif-${notif.id}`,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: notif.data
      });
      
      console.log('[SW] Notification shown, marking as delivered');
      
      // Mark as delivered
      await fetch(
        `${SUPABASE_URL}/rest/v1/pending_notifications?id=eq.${notif.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'delivered', delivered_at: new Date().toISOString() })
        }
      );
      
      console.log('[SW] Marked as delivered:', notif.id);
    }
    
  } catch (error) {
    console.error('[SW] Supabase check error:', error);
  }
}

// ============================================
// PUSH: Handle incoming push notifications
// ============================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'DropLit',
    body: 'New notification',
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
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Later' }
    ],
    data: data.data
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ============================================
// NOTIFICATION CLICK: Handle user interaction
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action, event.notification.tag);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  
  // Handle command-specific actions
  if (event.action === 'done' && data.command_id) {
    // Mark as completed
    event.waitUntil(
      updateLocalCommandStatus(data.command_id, 'completed')
        .then(() => notifyClients({ type: 'COMMAND_COMPLETED', command_id: data.command_id }))
    );
    return;
  }
  
  if (event.action === 'snooze' && data.command_id) {
    // Snooze for 10 minutes
    event.waitUntil(
      snoozeCommand(data.command_id, 10)
        .then(() => notifyClients({ type: 'COMMAND_SNOOZED', command_id: data.command_id }))
    );
    return;
  }
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Default: open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('droplit') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          const url = data.url || '/';
          return clients.openWindow(url);
        }
      })
  );
});

async function snoozeCommand(id, minutes) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('droplit_commands', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('commands', 'readwrite');
      const store = tx.objectStore('commands');
      
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const cmd = getRequest.result;
        if (cmd) {
          cmd.status = 'pending';
          cmd.scheduled_at = new Date(Date.now() + minutes * 60000).toISOString();
          store.put(cmd);
        }
        resolve();
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}

async function notifyClients(message) {
  const clientList = await clients.matchAll();
  clientList.forEach(client => client.postMessage(message));
}

// ============================================
// MESSAGE: Communication with main app
// ============================================
self.addEventListener('message', async (event) => {
  console.log('[SW] Message received:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'SHOW_NOTIFICATION':
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: data.tag || 'droplit-local',
        data: data.data
      });
      break;
      
    case 'SYNC_COMMAND':
      // Save command to IndexedDB for background execution
      await saveCommandToIndexedDB(data);
      break;
      
    case 'CANCEL_COMMAND':
      await updateLocalCommandStatus(data.command_id, 'cancelled');
      break;
      
    case 'UPDATE_CONFIG':
      if (data.supabase_url) SUPABASE_URL = data.supabase_url;
      if (data.supabase_key) SUPABASE_KEY = data.supabase_key;
      break;
      
    case 'CHECK_COMMANDS_NOW':
      await checkCommands();
      break;
  }
});

async function saveCommandToIndexedDB(cmd) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('droplit_commands', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('commands')) {
        const store = db.createObjectStore('commands', { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('scheduled_at', 'scheduled_at', { unique: false });
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('commands', 'readwrite');
      const store = tx.objectStore('commands');
      store.put(cmd);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// PERIODIC SYNC: Background checks
// ============================================
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync:', event.tag);
  
  if (event.tag === 'check-commands') {
    event.waitUntil(checkCommands());
  }
  
  if (event.tag === 'check-insights') {
    event.waitUntil(checkSupabaseCommands());
  }
});

// ============================================
// SYNC: Online recovery
// ============================================
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-commands') {
    event.waitUntil(syncCommandsToSupabase());
  }
});

async function syncCommandsToSupabase() {
  // Sync locally executed commands to Supabase
  // Implementation depends on your sync strategy
  console.log('[SW] Syncing commands to Supabase...');
}

console.log('[SW] DropLit Service Worker v2.0.1 loaded');
