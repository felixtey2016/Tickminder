import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
import {createSession,currentIdentity,hashToken,StaleSessionCredentialError,toBase64Url} from '@/lib/auth';
import {tickLearnAccountOrigin,tickLearnAuthLink,tickLearnContinue,tickLearnEntryLink,tickLearnGoogleCookie,tickLearnLanguage,tickLearnReturn,tickLearnStudyOrigin,tickMinderApexOrigin,tickMinderOrigin} from '@/lib/ticklearn-routes';

const entryPath='/api/ticklearn/entry';
const nonceCookie='__Host-ticklearn-entry';
const nonceAge=90;
const opaque=/^[A-Za-z0-9_-]{43}$/;
const encoder=new TextEncoder();

function entryUrl(origin:string,destination:URL,language:string) {
  const url=new URL(entryPath,origin);
  url.searchParams.set('lang',language);
  url.searchParams.set('next',destination.href);
  return url;
}

function redirect(destination:URL|string,cookie?:string) {
  const headers=new Headers({Location:String(destination),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
  if(cookie)headers.append('Set-Cookie',cookie);
  return new Response(null,{status:303,headers});
}

function nonceHeader(value:string,age:number) {
  return nonceCookie+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
}

async function handoffKey(secret:string) {
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode('ticklearn-entry-study-v1:'+secret));
  return crypto.subtle.importKey('raw',hash,{name:'AES-GCM'},false,['encrypt','decrypt']);
}

async function sealSession(token:string,nonce:string,key:CryptoKey) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const content=encoder.encode(JSON.stringify({token,until:Date.now()+nonceAge*1000}));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(nonce)},key,content));
  const packet=new Uint8Array(iv.length+encrypted.length);
  packet.set(iv);
  packet.set(encrypted,iv.length);
  return toBase64Url(packet);
}

async function openSession(packet:string,nonce:string,key:CryptoKey) {
  if(!/^[A-Za-z0-9_-]{110,180}$/.test(packet))return null;
  try {
    const bytes=Uint8Array.from(atob(packet.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:encoder.encode(nonce)},key,bytes.slice(12));
    const {token,until}=JSON.parse(new TextDecoder().decode(plaintext)) as {token:string;until:number};
    return opaque.test(token)&&Number.isSafeInteger(until)&&until>Date.now()?token:null;
  } catch {
    return null;
  }
}


export async function GET(request:Request) {
  const url=new URL(request.url);
  const businessOrigin=tickMinderOrigin(url.origin);
  if(!businessOrigin&&url.origin!==tickLearnStudyOrigin)return new Response(null,{status:404});
  const language=tickLearnLanguage(url.searchParams.get('lang'));
  const destination=tickLearnReturn(url.searchParams.get('next'),language);
  const login=tickLearnAuthLink(destination,language);
  const challenge=url.searchParams.get('challenge')||'';
  const google=url.searchParams.get('source')==='google';

  if(businessOrigin&&!opaque.test(challenge)){
    const source = businessOrigin === tickMinderApexOrigin ? 'apex' : 'www';
    if(url.searchParams.get('from')==='minder')destination.searchParams.set('minderFrom',source);
    return redirect(tickLearnEntryLink(destination,language,source));
  }
  const secret=env.PASSWORD_RECOVERY_SECRET;
  if(!secret||secret.length<32)return redirect(login);

  if(businessOrigin){
    if(google&&businessOrigin!==tickLearnAccountOrigin)return redirect(login);
    const jar=await cookies();
    const token=jar.get(google?tickLearnGoogleCookie:'tuition_session')?.value||'';
    if(!opaque.test(token)||(!google&&!await currentIdentity())){
      return !google&&businessOrigin===tickLearnAccountOrigin
        ? redirect(tickLearnEntryLink(destination,language,'apex')) : redirect(login);
    }
    const forward=entryUrl(tickLearnStudyOrigin,destination,language);
    forward.searchParams.set('code',await sealSession(token,challenge,await handoffKey(secret)));
    return redirect(forward,google?tickLearnGoogleCookie+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0':undefined);
  }

  const code=url.searchParams.get('code');
  if(!code){
    if(!google&&await currentIdentity())return redirect(tickLearnContinue(destination),nonceHeader('',0));
    const nonce=toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const source=entryUrl(url.searchParams.get('source')==='apex'?tickMinderApexOrigin:tickLearnAccountOrigin,destination,language);
    source.searchParams.set('challenge',nonce);
    if(google)source.searchParams.set('source','google');
    return redirect(source,nonceHeader(nonce,nonceAge));
  }

  const nonce=(await cookies()).get(nonceCookie)?.value||'';
  if(!opaque.test(nonce))return redirect(login,nonceHeader('',0));
  const token=await openSession(code,nonce,await handoffKey(secret));
  if(!token)return redirect(login,nonceHeader('',0));
  const sourceHash=await hashToken(token);
  const source=await env.DB?.prepare('SELECT account_id AS accountId FROM sessions WHERE token_hash=? AND expires_at>?')
    .bind(sourceHash,new Date().toISOString()).first<{accountId:string}>();
  if(!source)return redirect(login,nonceHeader('',0));

  try {
    // Issue a host-local session while the source session is still live.
    const session=await createSession(source.accountId,request,undefined,true,sourceHash);
    const response=redirect(tickLearnContinue(destination),nonceHeader('',0));
    response.headers.append('Set-Cookie','tuition_session='+session.token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Expires='+new Date(session.expiresAt).toUTCString());
    return response;
  } catch(error) {
    if(error instanceof StaleSessionCredentialError)return redirect(login,nonceHeader('',0));
    throw error;
  }
}
