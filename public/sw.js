/* Service worker — Atlas de poche
   Stratégie :
   - Pages (HTML) : RÉSEAU D'ABORD → toujours la dernière version quand on a Internet,
     et la version en cache en secours quand on est hors-ligne.
   - Autres ressources (icônes, manifest…) : cache d'abord, mise à jour en arrière-plan.
   La version ci-dessous sert à vider l'ancien cache lors d'une mise à jour. */
const CACHE = "atlas-de-poche-v24";

const ASSETS = [
  "/",
  "/index.html",
  "/globe.html",
  "/contact.html",
  "/manifest.json",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png"
];

// Installation : on met en cache le "coquille" de l'application.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation : on supprime les anciens caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Récupération des ressources.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  // Pages : réseau d'abord (toujours à jour), cache en secours hors-ligne.
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Autres ressources : cache d'abord, puis réseau (et mise à jour en arrière-plan).
  event.respondWith(
    caches.match(req).then((cached) => {
      const fromNetwork = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fromNetwork;
    })
  );
});
