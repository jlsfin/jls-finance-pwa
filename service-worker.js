// Service Worker for JLS Finance PWA
const CACHE_NAME = 'jls-finance-v1.0.0'
const STATIC_CACHE_NAME = 'jls-finance-static-v1.0.0'
const DYNAMIC_CACHE_NAME = 'jls-finance-dynamic-v1.0.0'

// Files to cache immediately
const STATIC_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/supabase-config.js',
    '/indexeddb-config.js',
    'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
    'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/date-fns@2.29.3/index.min.js'
]

// Install event - cache static files
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...')
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching static files')
                return cache.addAll(STATIC_FILES)
            })
            .then(() => {
                console.log('Service Worker: Static files cached')
                return self.skipWaiting()
            })
            .catch(error => {
                console.error('Service Worker: Error caching static files', error)
            })
    )
})

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...')
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName)
                            return caches.delete(cacheName)
                        }
                    })
                )
            })
            .then(() => {
                console.log('Service Worker: Activated')
                return self.clients.claim()
            })
    )
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const { request } = event
    const url = new URL(request.url)

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return
    }

    // Handle API requests differently
    if (url.pathname.includes('/api/') || url.hostname.includes('supabase')) {
        event.respondWith(networkFirstStrategy(request))
        return
    }

    // Handle static files
    if (STATIC_FILES.some(file => request.url.includes(file))) {
        event.respondWith(cacheFirstStrategy(request))
        return
    }

    // Handle other requests
    event.respondWith(networkFirstStrategy(request))
})

// Cache first strategy (for static files)
async function cacheFirstStrategy(request) {
    try {
        const cachedResponse = await caches.match(request)
        if (cachedResponse) {
            return cachedResponse
        }

        const networkResponse = await fetch(request)
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME)
            cache.put(request, networkResponse.clone())
        }
        return networkResponse
    } catch (error) {
        console.error('Cache first strategy failed:', error)
        return new Response('Offline - Content not available', {
            status: 503,
            statusText: 'Service Unavailable'
        })
    }
}

// Network first strategy (for dynamic content and API calls)
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request)
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME)
            cache.put(request, networkResponse.clone())
        }
        
        return networkResponse
    } catch (error) {
        console.log('Network failed, trying cache:', error)
        
        const cachedResponse = await caches.match(request)
        if (cachedResponse) {
            return cachedResponse
        }

        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/')
        }

        return new Response('Offline - Content not available', {
            status: 503,
            statusText: 'Service Unavailable'
        })
    }
}

// Background sync for offline data
self.addEventListener('sync', event => {
    console.log('Service Worker: Background sync triggered', event.tag)
    
    if (event.tag === 'sync-offline-data') {
        event.waitUntil(syncOfflineData())
    }
    
    if (event.tag === 'send-whatsapp-messages') {
        event.waitUntil(sendPendingWhatsAppMessages())
    }
})

// Sync offline data when connection is restored
async function syncOfflineData() {
    try {
        console.log('Service Worker: Syncing offline data...')
        
        // This would communicate with the main app to sync data
        const clients = await self.clients.matchAll()
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_OFFLINE_DATA'
            })
        })
        
        console.log('Service Worker: Offline data sync initiated')
    } catch (error) {
        console.error('Service Worker: Error syncing offline data', error)
    }
}

// Send pending WhatsApp messages
async function sendPendingWhatsAppMessages() {
    try {
        console.log('Service Worker: Sending pending WhatsApp messages...')
        
        const clients = await self.clients.matchAll()
        clients.forEach(client => {
            client.postMessage({
                type: 'SEND_PENDING_WHATSAPP'
            })
        })
        
        console.log('Service Worker: WhatsApp message sync initiated')
    } catch (error) {
        console.error('Service Worker: Error sending WhatsApp messages', error)
    }
}

// Push notification handling
self.addEventListener('push', event => {
    console.log('Service Worker: Push notification received')
    
    const options = {
        body: event.data ? event.data.text() : 'New notification from JLS Finance',
        icon: '/manifest.json',
        badge: '/manifest.json',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Open App',
                icon: '/manifest.json'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/manifest.json'
            }
        ]
    }
    
    event.waitUntil(
        self.registration.showNotification('JLS Finance', options)
    )
})

// Notification click handling
self.addEventListener('notificationclick', event => {
    console.log('Service Worker: Notification clicked')
    
    event.notification.close()
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        )
    }
})

// Periodic background sync (for EMI reminders)
self.addEventListener('periodicsync', event => {
    console.log('Service Worker: Periodic sync triggered', event.tag)
    
    if (event.tag === 'daily-emi-reminders') {
        event.waitUntil(sendDailyEMIReminders())
    }
})

// Send daily EMI reminders
async function sendDailyEMIReminders() {
    try {
        console.log('Service Worker: Sending daily EMI reminders...')
        
        const clients = await self.clients.matchAll()
        clients.forEach(client => {
            client.postMessage({
                type: 'SEND_DAILY_EMI_REMINDERS'
            })
        })
        
        console.log('Service Worker: Daily EMI reminders initiated')
    } catch (error) {
        console.error('Service Worker: Error sending EMI reminders', error)
    }
}

// Handle messages from main thread
self.addEventListener('message', event => {
    console.log('Service Worker: Message received', event.data)
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(DYNAMIC_CACHE_NAME)
                .then(cache => cache.addAll(event.data.urls))
        )
    }
})

