/* Authenticated pages, API responses and PDFs are never cached. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data;
  try{data=event.data.json();}catch{return;}
  if(!data || typeof data.title!=='string' || typeof data.body!=='string')return;
  event.waitUntil(self.registration.showNotification(data.title.slice(0,100),{
    body:data.body.slice(0,250),
    icon:data.visual==='class-start'?'/mascots/notify-class-start-192.png':data.visual==='class-reminder'?'/mascots/notify-class-reminder-192.png':'/tickminder-logo-192.png',
    image:data.visual==='class-start'?'/mascots/notify-class-start-512.png':data.visual==='class-reminder'?'/mascots/notify-class-reminder-512.png':undefined,
    badge:'/notification-badge.png',
    tag:typeof data.id==='string'?'tickminder:'+data.id.slice(0,100):'tickminder',
    data:{url:'/?view=notifications'},renotify:false,
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){
      const url=new URL(client.url);
      if(url.origin===self.location.origin && url.pathname==='/'){
        // Navigation also works when an already open page has not mounted its
        // signed-in workspace; the validated view request survives sign-in.
        await client.navigate('/?view=notifications');return client.focus();
      }
    }
    return self.clients.openWindow('/?view=notifications');
  })());
});


// Only public, immutable bundles and brand illustrations are cached.
// Navigations, API responses and authenticated PDFs always use the network.
const ASSET_CACHE = 'tickminder-public-assets-v1';
function publicAsset(url) {
  return url.origin === self.location.origin && !url.search &&
    (/^\/_next\/static\/.*\.(?:js|css|woff2?)$/.test(url.pathname) ||
     /^\/(?:mascots\/[a-z0-9-]+|tickminder-logo(?:-\d+)?|notification-badge)\.(?:svg|png)$/.test(url.pathname));
}
async function assetResponse(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached && request.cache !== 'reload') return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic' && !/private|no-store/i.test(response.headers.get('cache-control') || '')) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 100)).map(key => cache.delete(key)));
  }
  return response;
}
self.addEventListener('fetch', event => {
  if (event.request.method === 'GET' && publicAsset(new URL(event.request.url))) event.respondWith(assetResponse(event.request));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache-public-assets' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(url => { try { return typeof url === 'string' && publicAsset(new URL(url, self.location.origin)); } catch { return false; } }).slice(0, 30);
  event.waitUntil(Promise.allSettled(urls.map(url => assetResponse(new Request(url)))));
});
