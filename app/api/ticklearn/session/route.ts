import {currentIdentity} from '@/lib/auth';
import {tickLearnOrigin} from '@/lib/ticklearn-routes';

export const dynamic = 'force-dynamic';

export async function GET(request:Request) {
  const headers = new Headers({'Cache-Control':'private, no-store',Vary:'Origin'});
  if (request.headers.get('Origin') !== tickLearnOrigin) return new Response(null,{status:403,headers});
  headers.set('Access-Control-Allow-Origin',tickLearnOrigin);
  headers.set('Access-Control-Allow-Credentials','true');
  const identity=await currentIdentity();
  return new Response(null,{status:identity ? 204 : 401,headers});
}
