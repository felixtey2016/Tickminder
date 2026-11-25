import {currentBusinessAccount,currentIdentity} from '@/lib/auth';
import {openTickGameCatalog} from '@/lib/tickgame-demo';
import {tickLearnAuthLink,tickLearnGameOrigin,tickLearnLanguage,tickLearnReturn,tickLearnStudyOrigin,tickMinderOrigin} from '@/lib/ticklearn-routes';

const headers = {'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};

export async function GET(request:Request) {
  const url = new URL(request.url);
  const requested = tickLearnReturn(url.searchParams.get('next'),tickLearnLanguage(url.searchParams.get('lang')));
  const destination = requested.origin===tickLearnGameOrigin ? requested : new URL('/',tickLearnGameOrigin);
  const language = destination.searchParams.get('lang')==='en' ? 'en' : 'zh';
  const identity = await currentIdentity();
  if(!identity)return Response.redirect(tickLearnAuthLink(destination,language),303);
  if(identity.account.role==='pending'||identity.local?.mustChangePassword) {
    return new Response(language==='zh'?'请先完成账号设置。':'Complete your account setup first.',{status:403,headers});
  }
  destination.searchParams.delete('minder');
  const minderOrigin = url.searchParams.get('from')==='minder' && identity.account.role!=='learner' ? tickMinderOrigin(url.origin) : null;
  if(minderOrigin){
    destination.searchParams.delete('learn');
    destination.searchParams.set('minder',minderOrigin);
  }
  if(url.origin===tickLearnStudyOrigin)destination.searchParams.set('learn','1');
  const administrator = destination.searchParams.get('learn')!=='1' && identity.account.role==='admin' && (await currentBusinessAccount())?.role==='admin';
  const entry=await openTickGameCatalog(language,identity.account,administrator?'admin':'reader',destination);
  if(!entry)return new Response(null,{status:503,headers});
  return new Response(null,{status:303,headers:{...headers,Location:entry}});
}
