import {env} from 'cloudflare:workers';
import {uploadId,validPackagePath} from './tickgame-studio-schema';
import {bundlePrefix,studioApi,studioCover,studioDraft,studioGames,studioReady} from './tickgame-studio-server';
import {tickLearnAccountOrigin, tickLearnStudyOrigin, tickLearnGamePath, tickLearnReturn, tickMinderOrigin} from './ticklearn-routes';
import {hashToken, toBase64Url, type Account} from './auth';
import {boundAccountSessionHash} from './account-session';
import {tickLearnHomeLogo,tickLearnProducts,tickLearnSessionScript} from './ticklearn-navigation';

export const catalogOrigin = 'https://tickgame-staging.tickminder-qa-ngedu.workers.dev';
export const gameOrigin = 'https://tickgame-player-staging.tickminder-qa-ngedu.workers.dev';
export const gamePrefix = 'sej-f4-bab-1/1.7.1/';
export const gameTitle = 'Sejarah Tingkatan 4 · Bab 1';
const keyPath = 'private/session-signing-key';
const cookie = '__Host-tickgame-session';
export const catalogCookie = '__Host-tickgame-catalog';
export const catalogMinderCookie = '__Host-tickgame-minder';
type TicketPurpose = 'launch'|'play'|`bundle-${string}`;
const bundlePurpose=(game:string,version:string):TicketPurpose=>`bundle-${game}-${version}`;
export const tickGameAppOrigins = ['https://tickminder-staging.tickminder-qa-ngedu.workers.dev', 'https://tickminder-staging-alt.tickminder-qa-ngedu.workers.dev'];
const encoder = new TextEncoder();
const launchLifetime = 90;
const sessionLifetime = 2 * 60 * 60;
let cachedKey: {key: CryptoKey; until: number} | undefined;

async function signingKey(bucket: R2Bucket) {
  if (cachedKey && cachedKey.until > Date.now()) return cachedKey.key;
  const item = await bucket.get(keyPath);
  if (!item || item.size !== 32) return null;
  const key = await crypto.subtle.importKey('raw', await item.arrayBuffer(), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
  cachedKey = {key, until: Date.now() + 60_000};
  return key;
}

async function issue(key: CryptoKey, purpose: TicketPurpose, life: number) {
  const payload = purpose + '.' + (Math.floor(Date.now()/1000)+life) + '.' + crypto.randomUUID();
  const signature = await crypto.subtle.sign('HMAC',key,encoder.encode(payload));
  return payload + '.' + btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=+$/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function valid(key: CryptoKey, value: string, purpose: TicketPurpose, lifetime: number) {
  const parts = value.split('.');
  const now = Math.floor(Date.now()/1000);
  const expires = Number(parts[1]);
  if (parts.length!==4 || parts[0]!==purpose || !Number.isSafeInteger(expires) || expires<=now || expires>now+lifetime ||
    !/^[a-f0-9-]{36}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  const signature = Uint8Array.from(atob(parts[3].replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
  return crypto.subtle.verify('HMAC',key,signature,encoder.encode(parts.slice(0,3).join('.')));
}

const privateHeaders = {'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const missing = () => new Response('Not found',{status:404,headers:privateHeaders});

export async function launchTickGame(bucket = env.TICKGAME_ASSETS) {
  if (!bucket) return missing();
  const key = await signingKey(bucket);
  if (!key) return missing();
  const ticket = await issue(key,'launch',launchLifetime);
  return new Response(null,{status:303,headers:{...privateHeaders,Location:gameOrigin+'/start?ticket='+ticket}});
}

const types: Record<string,string> = {
  html:'text/html; charset=utf-8', htm:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8', mjs:'text/javascript; charset=utf-8', wasm:'application/wasm', json:'application/json',
  svg:'image/svg+xml', ico:'image/x-icon', gif:'image/gif', avif:'image/avif', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf',
  zip:'application/zip', pdf:'application/pdf', png:'image/png', webp:'image/webp', jpg:'image/jpeg', jpeg:'image/jpeg',
  webm:'video/webm', mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', opus:'audio/ogg', m4a:'audio/mp4', mp4:'video/mp4',
};
const csp = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors " + catalogOrigin;

export async function tickGameAsset(request: Request, bucket?: R2Bucket) {
  const url = new URL(request.url);
  if (!bucket || (request.method!=='GET' && request.method!=='HEAD')) return missing();
  const bundle=/^\/bundle\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([^/]{1,240})\/(.*)$/.exec(url.pathname);
  if(bundle){
    const [,game,version,ticket,file]=bundle;
    let path:string;
    try{path=decodeURIComponent(file)||'index.html';}catch{return missing();}
    if(!uploadId.safeParse(game).success||!uploadId.safeParse(version).success||!validPackagePath(path))return missing();
    const key=await signingKey(bucket);
    if(!key||!await valid(key,ticket,bundlePurpose(game,version),sessionLifetime))return missing();
    return packageFile(request,bucket,bundlePrefix(game,version)+path,path);
  }
  if (url.pathname === '/start') {
    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length>150) return missing();
    const key = await signingKey(bucket);
    if (!key || !await valid(key,ticket,'launch',launchLifetime)) return missing();
    const session = await issue(key,'play',sessionLifetime);
    return new Response(null,{status:303,headers:{...privateHeaders,Location:'/play/',
      'Set-Cookie':cookie+'='+session+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+sessionLifetime}});
  }
  if (!url.pathname.startsWith('/play/')) return missing();
  const session = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-tickgame-session=([^;]+)/)?.[1];
  if (!session || session.length>150) return missing();
  const key = await signingKey(bucket);
  if (!key || !await valid(key,session,'play',sessionLifetime)) return missing();
  let path: string;
  try { path=decodeURIComponent(url.pathname.slice('/play/'.length)) || 'index.html'; } catch { return missing(); }
  if (path.split('/').some(segment=>!segment || segment==='.' || segment==='..' || /[\\:\u0000-\u001f]/.test(segment))) return missing();
  return packageFile(request,bucket,gamePrefix+path,path);
}

async function packageFile(request:Request,bucket:R2Bucket,objectKey:string,path:string){
  if(request.headers.has('service-worker'))return missing();
  const rangeHeader = request.headers.get('range');
  let range: {offset:number;length:number;size:number} | undefined;
  if (request.method==='GET' && rangeHeader) {
    const metadata = await bucket.head(objectKey);
    if (!metadata) return missing();
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    const start = match?.[1] ? Number(match[1]) : Math.max(0,metadata.size-Number(match?.[2]));
    const end = match?.[1] && match[2] ? Math.min(Number(match[2]),metadata.size-1) : metadata.size-1;
    if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=metadata.size || end<start) {
      return new Response(null,{status:416,headers:{...privateHeaders,'Content-Range':'bytes */'+metadata.size}});
    }
    range = {offset:start,length:end-start+1,size:metadata.size};
  }
  const object = request.method==='HEAD' ? await bucket.head(objectKey) : await bucket.get(objectKey,range ? {range:{offset:range.offset,length:range.length}} : undefined);
  if (!object) return missing();
  const headers = new Headers({...privateHeaders,'Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'X-Robots-Tag':'noindex, nofollow','Content-Type':types[path.split('.').pop()?.toLowerCase()||'']||'application/octet-stream',
    'Content-Length':String(range?.length??object.size),'Accept-Ranges':'bytes'});
  if (path.endsWith('.pdf')) headers.set('Content-Disposition','attachment');
  if (range) headers.set('Content-Range','bytes '+range.offset+'-'+(range.offset+range.length-1)+'/'+range.size);
  return new Response('body' in object ? object.body as ReadableStream : null,{status:range ? 206 : 200,headers});
}

function sessionCookie(name: string, value: string) {
  return name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+sessionLifetime;
}

const catalogToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const catalogTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const catalogSessionActive = `EXISTS(SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id
  WHERE s.token_hash=c.source_hash AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.disabled_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM local_credentials l WHERE l.account_id=a.id AND l.must_change_password=1)
  AND ((c.access='admin' AND a.role='admin') OR (c.access='reader' AND a.role IN ('admin','teacher','student','parent','learner'))))`;

export async function openTickGameCatalog(language:'en'|'zh', account:Account, access:'admin'|'reader'='admin', destination?:URL) {
  const database=env.DB, sourceHash=boundAccountSessionHash(account);
  if(!database||!sourceHash||!env.TICKGAME_ASSETS)return null;
  const ticket=catalogToken(), now=Math.floor(Date.now()/1000);
  await database.batch([
    database.prepare('DELETE FROM tickgame_catalog_sessions WHERE token_hash IN (SELECT token_hash FROM tickgame_catalog_sessions WHERE expires_at<=? LIMIT 30)').bind(now),
    database.prepare(`INSERT INTO tickgame_catalog_sessions(token_hash,source_hash,purpose,access,expires_at)
      SELECT ?,token_hash,'handoff',?,? FROM sessions WHERE token_hash=? AND account_id=?`)
      .bind(await hashToken(ticket),access,now+launchLifetime,sourceHash,account.id),
  ]);
  const params = new URLSearchParams({lang:language,ticket});
  if(destination)params.set('next',destination.href);
  return catalogOrigin+'/enter?'+params;
}

export async function tickGameCatalogAccess(value?: string) {
  const database=env.DB;
  if(!database||!value||!catalogTokenPattern.test(value))return null;
  const row=await database.prepare(`SELECT access FROM tickgame_catalog_sessions c WHERE token_hash=?
    AND purpose='catalog' AND expires_at>? AND ${catalogSessionActive}`)
    .bind(await hashToken(value),Math.floor(Date.now()/1000)).first<{access:'reader'|'admin'}>();
  return row?.access??null;
}

export async function hasTickGameCatalogSession(value?:string) {
  return Boolean(await tickGameCatalogAccess(value));
}

export async function tickGameCatalogRoute(request: Request, bucket?: R2Bucket) {
  const url = new URL(request.url);
  const catalogSession=()=>request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-tickgame-catalog=([^;]+)/)?.[1];
  if(url.pathname==='/studio-api'){
    if(!bucket || request.headers.get('origin')!==catalogOrigin ||
       await tickGameCatalogAccess(catalogSession())!=='admin')return missing();
    return studioApi(request,bucket);
  }
  if (request.method!=='GET' && request.method!=='HEAD') return missing();
  const language = url.searchParams.get('lang')==='en'?'en':'zh';
  const next = new URL('/api/ticklearn/game',tickLearnStudyOrigin);
  next.searchParams.set('next',url.href);
  if (url.pathname === '/enter') {
    const ticket = url.searchParams.get('ticket');
    if (!bucket || !env.DB || !ticket || !catalogTokenPattern.test(ticket))return missing();
    const session=catalogToken(),now=Math.floor(Date.now()/1000);
    const redeemed=await env.DB.prepare(`UPDATE tickgame_catalog_sessions AS c SET token_hash=?,purpose='catalog',expires_at=?
      WHERE token_hash=? AND purpose='handoff' AND expires_at>? AND ${catalogSessionActive} RETURNING access`)
      .bind(await hashToken(session),now+sessionLifetime,await hashToken(ticket),now).first();
    if(!redeemed)return missing();
    const destination=tickLearnReturn(url.searchParams.get('next'),language);
    const minder=destination.searchParams.get('learn')==='1' ? null : tickMinderOrigin(destination.searchParams.get('minder'));
    destination.searchParams.delete('minder');
    const location=destination.origin===catalogOrigin?destination.pathname+destination.search:'/?lang='+language;
    const headers=new Headers({...privateHeaders,Location:location});
    headers.append('Set-Cookie',sessionCookie(catalogCookie,session));
    headers.append('Set-Cookie',minder ? sessionCookie(catalogMinderCookie,minder===tickLearnAccountOrigin?'www':'apex') : catalogMinderCookie+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
    return new Response(null,{status:303,headers});
  }
  if (url.pathname === '/play') {
    const value = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-tickgame-catalog=([^;]+)/)?.[1];
    const access=await tickGameCatalogAccess(value);
    if(!bucket||!access)return missing();
    const game=url.searchParams.get('game');
    if(!game)return launchTickGame(bucket);
    if(!uploadId.safeParse(game).success)return missing();
    const preview=url.searchParams.get('version');
    if(preview&&(access!=='admin'||!uploadId.safeParse(preview).success))return missing();
    const version=preview || (await studioGames(bucket)).find(item=>item.id===game)?.version;
    if(!version || !await studioReady(bucket,game,version))return missing();
    const key=await signingKey(bucket);
    if(!key)return missing();
    const ticket=await issue(key,bundlePurpose(game,version),sessionLifetime);
    return new Response(null,{status:303,headers:{...privateHeaders,Location:gameOrigin+'/bundle/'+game+'/'+version+'/'+ticket+'/'}});

  }
  if (url.pathname === '/covers/sej-f4-bab-1') {
    const value = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-tickgame-catalog=([^;]+)/)?.[1];
    if (!bucket || !await hasTickGameCatalogSession(value)) return missing();
    const key = gamePrefix+'web-presplash.png';
    const object = request.method==='HEAD' ? await bucket.head(key) : await bucket.get(key);
    if (!object) return missing();
    return new Response('body' in object ? object.body as ReadableStream : null,{
      headers:{...privateHeaders,'Cache-Control':'private, max-age=600','Content-Type':'image/png','Content-Length':String(object.size)},
    });
  }
  const studioImage=/^\/covers\/([a-f0-9-]{36})$/.exec(url.pathname);
  if(studioImage){
    const game=studioImage[1], version=url.searchParams.get('version');
    const access=await tickGameCatalogAccess(catalogSession());
    if(!bucket||!uploadId.safeParse(game).success||!access)return missing();
    if(version&&(access!=='admin'||!uploadId.safeParse(version).success))return missing();
    const source=version ? await studioDraft(bucket,game,version)
      : (await studioGames(bucket)).find(item=>item.id===game);
    if(!source)return missing();
    const object=await studioCover(bucket,game,source.cover,request.method==='HEAD');
    if(!object)return missing();
    return new Response('body' in object ? object.body as ReadableStream : null,{headers:{...privateHeaders,
      'Cache-Control':'private, max-age=300','Content-Type':source.cover.type,'Content-Length':String(object.size)}});
  }
  const section = url.pathname.replace(/\/$/,'');
  if (section === '' || section === '/sejarah' || section === '/sejarah/bab-1' || section==='/studio' || /^\/games\/[a-f0-9-]{36}$/.test(section)) {
    const access=await tickGameCatalogAccess(catalogSession());
    if(section==='/studio'||url.searchParams.has('version')) {
      if(access!=='admin')return missing();
    } else if((!access || url.searchParams.get('learn')==='1' && (access==='admin'||request.headers.get('cookie')?.includes(catalogMinderCookie+'='))) && tickLearnGamePath(url.pathname)) {
      return new Response(null,{status:303,headers:{...privateHeaders,Location:next.href}});
    }
    url.pathname = '/manage/tickgame'+section;
    return url;
  }
  if (url.pathname.startsWith('/_next/') || ['/branding/ticklearn-navigation.css',tickLearnSessionScript,'/tickminder-logo.svg',tickLearnHomeLogo,...tickLearnProducts.map(({logo})=>logo)].includes(url.pathname)) return url;
  if (url.pathname === '/signin') return new Response(null,{status:303,headers:{...privateHeaders,Location:next.href}});
  return missing();
}
