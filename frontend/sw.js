/**
 * CCO — FISCALIZAÇÃO OPERACIONAL
 * Service Worker v3.5.0 (Mapa Operacional CartoDB & Presença em Tempo Real)
 * Estratégia Network-First, sem interceptação espúria de APIs, atualização instantânea.
 */

const CACHE_NAME = 'cco-fiscalizacao-v3.5.0-mapa-cartodb';
const STATIC_ASSETS = [
  '/',
  '/app',
  '/app.html',
  '/app-supervisao.html',
  '/formulario.html',
  '/dashboard.html',
  '/plantoes.html',
  '/relatorios.html',
  '/postos.html',
  '/viaturas.html',
  '/supervisores.html',
  '/distribuicao-postos.html',
  '/classificar-postos.html',
  '/configuracoes.html',
  '/login.html',
  '/css/main.css',
  '/css/forms.css',
  '/css/responsive.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/formulario.js',
  '/js/dashboard.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/favicon.png',
  '/manifest.json'
];

// Instalação com ativação imediata (skipWaiting)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pré-cache de assets complementares concluído com avisos:', err);
      });
    })
  );
});

// Ativação e limpeza rigorosa de todos os caches obsoletos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purgando cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. REQUISIÇÕES DE API E HEALTH CHECK (/api/, /health, /api/health):
  // NUNCA cachear nem interceptar. Acesso 100% direto à rede para integridade dos dados em tempo real.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/api/health') {
    return;
  }

  // 2. NAVEGAÇÃO E ASSETS ESTÁTICOS:
  // Network-First: Sempre busca a versão mais recente na rede. Se estiver sem conexão, usa o cache local.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Dispositivo realmente sem internet: busca do cache
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Se for navegação de página e não tiver cache específico
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/app') || await caches.match('/app-supervisao.html') || await caches.match('/index.html');
          if (fallback) return fallback;
        }

        return new Response('Sem conexão com o servidor. Verifique seu Wi-Fi ou dados móveis.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});

// Mensagens para atualização instantânea
self.addEventListener('message', (event) => {
  if (event.data && (event.data.action === 'skipWaiting' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});
