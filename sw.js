const CACHE_NAME = 'hall-of-fame-v1.0.0';
const STATIC_CACHE = 'hall-of-fame-static-v1';
const DATA_CACHE = 'hall-of-fame-data-v1';

// Fichiers à mettre en cache lors de l'installation
const urlsToCache = [
  '/Hall_of_fame_mobile.html',
  '/manifest.json'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Mise en cache des fichiers statiques');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DATA_CACHE && cacheName !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes Google Drive API (laisser passer en ligne)
  if (url.origin.includes('googleapis.com') || 
      url.origin.includes('accounts.google.com') ||
      url.origin.includes('www.gstatic.com')) {
    return; // Laisser passer normalement
  }

  // Stratégie Cache First pour tout le reste
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          console.log('[SW] Servi depuis cache:', request.url);
          return response;
        }

        // Si pas en cache, essayer de récupérer en ligne
        return fetch(request)
          .then((response) => {
            // Vérifier si la réponse est valide
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Cloner la réponse
            const responseToCache = response.clone();

            // Déterminer quel cache utiliser
            const cacheName = url.pathname.includes('.csv') ? DATA_CACHE : STATIC_CACHE;

            caches.open(cacheName)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // En cas d'échec réseau, retourner une page hors ligne si disponible
            console.log('[SW] Erreur réseau pour:', request.url);
            return caches.match('/Hall_of_fame_mobile.html');
          });
      })
  );
});

// Gestion des messages depuis l'application
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Effacer le cache des données si demandé
  if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
    event.waitUntil(
      caches.delete(DATA_CACHE).then(() => {
        console.log('[SW] Cache données effacé');
        return self.clients.matchAll();
      }).then((clients) => {
        clients.forEach(client => client.postMessage({ type: 'DATA_CACHE_CLEARED' }));
      })
    );
  }
});

// Synchronisation en arrière-plan (pour futures fonctionnalités)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[SW] Synchronisation des données...');
  // Logique de synchronisation à implémenter selon besoins
}
