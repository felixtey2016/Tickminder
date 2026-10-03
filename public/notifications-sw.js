/* No fetch handler: authenticated pages, API responses and PDFs are never cached. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data;
  try{data=event.data.json();}catch{return;}
  if(!data || typeof data.title!=='string' || typeof data.body!=='string')return;
  event.waitUntil(self.registration.showNotification(data.title.slice(0,100),{
    body:data.body.slice(0,250),icon:'/timelyo-logo.png',badge:'/timelyo-logo.png',
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
