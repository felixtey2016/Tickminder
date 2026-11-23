import {env} from 'cloudflare:workers';

export const catalogOrigin = 'https://tickgame.tickminder.com';
export const gameOrigin = 'https://play-tickgame.tickminder.com';
export const gamePrefix = 'sej-f4-bab-1/1.7.1/';
export const gameTitle = 'Sejarah Tingkatan 4 · Bab 1';
const keyPath = 'private/session-signing-key';
const cookie = '__Host-tickgame-session';
export const catalogCookie = '__Host-tickgame-catalog';
type TicketPurpose = 'launch'|'play'|'enter'|'catalog';
export const tickGameAppOrigins = ['https://www.tickminder.com', 'https://tickminder.com'];
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
  html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', wasm:'application/wasm', json:'application/json',
  zip:'application/zip', pdf:'application/pdf', png:'image/png', webp:'image/webp', jpg:'image/jpeg', jpeg:'image/jpeg',
  webm:'video/webm', mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', opus:'audio/ogg', m4a:'audio/mp4', mp4:'video/mp4',
};
const csp = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors " + catalogOrigin;

export async function tickGameAsset(request: Request, bucket?: R2Bucket) {
  const url = new URL(request.url);
  if (!bucket || (request.method!=='GET' && request.method!=='HEAD')) return missing();
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
  const objectKey = gamePrefix + path;
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

export async function openTickGameCatalog(language: 'en'|'zh') {
  const bucket = env.TICKGAME_ASSETS;
  const key = bucket && await signingKey(bucket);
  if (!key) return null;
  const ticket = await issue(key,'enter',launchLifetime);
  return catalogOrigin+'/enter?lang='+language+'&ticket='+ticket;
}

export async function hasTickGameCatalogSession(value?: string, bucket = env.TICKGAME_ASSETS) {
  if (!bucket || !value || value.length>150) return false;
  const key = await signingKey(bucket);
  return Boolean(key && await valid(key,value,'catalog',sessionLifetime));
}

export async function tickGameCatalogRoute(request: Request, bucket?: R2Bucket) {
  const url = new URL(request.url);
  if (request.method!=='GET' && request.method!=='HEAD') return missing();
  const language = url.searchParams.get('lang')==='en'?'en':'zh';
  const next = tickGameAppOrigins[0]+'/manage/tickgame?lang='+language;
  if (url.pathname === '/enter') {
    const ticket = url.searchParams.get('ticket');
    if (!bucket || !ticket || ticket.length>150) return missing();
    const key = await signingKey(bucket);
    if (!key || !await valid(key,ticket,'enter',launchLifetime)) return missing();
    const session = await issue(key,'catalog',sessionLifetime);
    return new Response(null,{status:303,headers:{...privateHeaders,
      Location:'/?lang='+language,'Set-Cookie':sessionCookie(catalogCookie,session)}});
  }
  if (url.pathname === '/play') {
    const value = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-tickgame-catalog=([^;]+)/)?.[1];
    return await hasTickGameCatalogSession(value,bucket) ? launchTickGame(bucket) : missing();
  }
  const section = url.pathname.replace(/\/$/,'');
  if (section === '' || section === '/sejarah') {
    url.pathname = '/manage/tickgame'+section;
    return url;
  }
  if (url.pathname.startsWith('/_next/') || ['/branding/tickgame-logo.webp','/tickminder-logo.svg'].includes(url.pathname)) return url;
  if (url.pathname === '/signin') return new Response(null,{status:303,headers:{...privateHeaders,Location:next}});
  return missing();
}
