// ===================================================================
// Hall of Fame — Service Worker
// Rôle : une fois la page chargée une première fois avec succès,
// la mettre (elle + le manifeste) en cache pour permettre les
// ouvertures suivantes même si l'hébergement (GitHub Pages) est
// lent, injoignable ou hors service.
// ===================================================================

const CACHE_NAME = 'hof-cache-v1';

// --- Installation : on n'y précharge rien de fixe, car on ne connaît
// pas à l'avance le nom exact du fichier HTML déployé. La page elle-même
// demande explicitement au SW de se mettre en cache via un message
// 'CACHE_URLS' juste après l'enregistrement (voir le <script> du HTML).
self.addEventListener('install', (event) => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(
				keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
			))
			.then(() => self.clients.claim())
	);
});

// --- Messages venant de la page ---
self.addEventListener('message', (event) => {
	const data = event.data || {};

	if (data.type === 'SKIP_WAITING') {
		self.skipWaiting();
		return;
	}

	if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
		event.waitUntil(
			caches.open(CACHE_NAME).then((cache) => Promise.all(
				data.urls.map((url) =>
					fetch(url, { cache: 'reload' })
						.then((resp) => {
							if (resp && resp.ok) return cache.put(url, resp.clone());
						})
						.catch(() => {
							// Silencieux : si le réseau échoue ici, on gardera
							// simplement ce qui est déjà en cache (le cas échéant).
						})
				)
			))
		);
	}
});

// --- Stratégie réseau : "cache d'abord, réseau en secours,
// et rafraîchissement du cache en tâche de fond" (stale-while-revalidate).
// Ne s'applique qu'aux requêtes GET du même origine : les appels vers
// l'API Google Drive / gapi restent en direct (la sync a besoin du réseau
// de toute façon), et ne sont ni interceptés ni mis en cache ici.
self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	event.respondWith(
		caches.open(CACHE_NAME).then(async (cache) => {
			const cached = await cache.match(req);

			const networkFetch = fetch(req)
				.then((resp) => {
					if (resp && resp.ok) cache.put(req, resp.clone());
					return resp;
				})
				.catch(() => null);

			if (cached) {
				// On répond immédiatement avec le cache, et on met à jour
				// discrètement en arrière-plan si le réseau est disponible.
				event.waitUntil(networkFetch);
				return cached;
			}

			// Rien en cache pour cette URL précise : on tente le réseau.
			const fresh = await networkFetch;
			if (fresh) return fresh;

			// Réseau indisponible ET rien en cache pour cette URL :
			// pour une navigation (ouverture de page), on essaie de
			// servir n'importe quelle page HTML déjà en cache plutôt
			// que de renvoyer une erreur brute.
			if (req.mode === 'navigate') {
				const keys = await cache.keys();
				const htmlEntry = keys.find((k) => {
					const u = new URL(k.url);
					return u.pathname.endsWith('.html') || u.pathname.endsWith('/');
				});
				if (htmlEntry) return cache.match(htmlEntry);
			}

			return new Response(
				'Hors ligne — cette ressource n\'a pas encore été mise en cache lors d\'une visite précédente.',
				{ status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
			);
		})
	);
});
