import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers = new Map(), stored = new Map(), fetched = [], shown = [];
const cache = {async match(request){return stored.get(request.url);},async put(request,response){stored.set(request.url,response);},async keys(){return [...stored.keys()].map(url=>new Request(url));},async delete(request){return stored.delete(request.url);}};
const self = {location:{origin:'https://test.invalid'},addEventListener:(kind,handler)=>handlers.set(kind,handler),skipWaiting(){},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async()=>{}},registration:{showNotification:async(title,options)=>shown.push({title,options})}};
const fetch = async request => {
  fetched.push(request.url);
  const response=new Response('public asset',{headers:{'cache-control':request.url.includes('no-store')?'no-store':'public, max-age=31536000'}});
  Object.defineProperty(response,'type',{value:'basic'});return response;
};
vm.runInNewContext(fs.readFileSync(new URL('../public/notifications-sw.js',import.meta.url),'utf8'),{self,fetch,caches:{open:async()=>cache},URL,Request,Promise});
async function request(path,options){let response;handlers.get('fetch')({request:new Request('https://test.invalid'+path,options),respondWith:p=>{response=p;}});return response?await response:null;}
for(const path of ['/','/?view=calendar','/api/state','/api/notifications','/api/files/private-id','/terms','/student.pdf','/_next/static/secret.js?token=x'])assert.equal(await request(path),null,path);
assert.equal(stored.size,0,'Private data never enters the asset cache');
await request('/_next/static/compiled-app.js');await request('/_next/static/compiled-app.js');assert.equal(fetched.length,1,'Repeat visits reuse public bundles');
await request('/_next/static/compiled-app.js',{cache:'reload'});assert.equal(fetched.length,2,'Explicit reload can refresh cached bundles');
await request('/mascots/no-store.svg');await request('/mascots/no-store.svg');assert.equal(fetched.length,4,'No-store is respected');
let warmed;handlers.get('message')({data:{type:'cache-public-assets',urls:['https://test.invalid/tickminder-logo.svg','https://test.invalid/api/state','https://foreign.invalid/_next/static/app.js','http://[bad']},waitUntil:p=>warmed=p});await warmed;
assert.ok(stored.has('https://test.invalid/tickminder-logo.svg'));assert.ok(!fetched.some(url=>url.includes('/api/')));
let pushed;handlers.get('push')({data:{json:()=>({id:'test',title:'即将上课',body:'科学 · 10:00',visual:'class-reminder'})},waitUntil:p=>pushed=p});await pushed;
assert.equal(shown.length,1);assert.match(shown[0].options.icon,/notify-class-reminder/);assert.equal(shown[0].options.data.url,'/?view=notifications');
console.log('PASS: public asset reuse/reload; private API/HTML/PDF exclusions; no-store; bounded warm URLs; push displays without an open page. Simulated browser runtime.');
