// Service Worker — push + instalabilidade do PWA.
//
// A REGRA DESTE ARQUIVO, que veio de um incidente e não de conveniência: **nenhum asset da
// aplicação é cacheado**. JS e CSS do build têm hash no nome; servir um do cache depois de um
// deploy dá ChunkLoadError em quem está com a aba aberta — foi por isso que existe o
// `src/utils/chunkLoadRecovery.js`. Toda requisição vai para a rede, sempre.
//
// O único arquivo cacheado é `/offline.html`, e ele existe por um motivo específico: o Chrome
// só oferece "instalar aplicativo" quando existe um handler de `fetch` registrado. Sem o
// handler abaixo não há PWA instalável — e, de quebra, quem perde o sinal na fábrica vê uma
// tela da empresa em vez do dinossauro do navegador.

const CACHE_OFFLINE = 'orion-offline-v1';
const PAGINA_OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    // Limpa cache antigo, MENOS o nosso: a versão anterior deste SW apagava tudo, e sem esta
    // exceção a página offline seria apagada logo depois de ser gravada.
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n !== CACHE_OFFLINE).map((n) => caches.delete(n)));

    const cache = await caches.open(CACHE_OFFLINE);
    // `reload` ignora o cache HTTP: garante a versão nova da página a cada deploy.
    await cache.add(new Request(PAGINA_OFFLINE, { cache: 'reload' }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n !== CACHE_OFFLINE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/**
 * Rede primeiro, e SÓ para navegação.
 *
 * Note o que este handler NÃO faz: ele não chama `respondWith` para requisições que não são
 * navegação. Isso deixa JS, CSS, imagens e as chamadas de API passarem direto pelo navegador,
 * sem o SW no meio — que é exatamente a propriedade que evita o ChunkLoadError.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET' || req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (e) {
      // Rede caiu: entrega a página da empresa. Se nem ela estiver em cache, deixa o
      // navegador mostrar o erro dele — melhor que um `undefined` virar tela branca.
      const cache = await caches.open(CACHE_OFFLINE);
      const offline = await cache.match(PAGINA_OFFLINE);
      if (offline) return offline;
      throw e;
    }
  })());
});

// Receber notificações push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Nova Mensagem';
  const options = {
    body: data.body || 'Você tem uma nova mensagem',
    icon: data.icon || '/logo.png',
    badge: '/logo.png',
    tag: data.tag || 'chat-message',
    data: data.data || {},
    requireInteraction: false,
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const urlToOpen = data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
      return undefined;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
