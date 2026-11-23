import {currentBusinessAccount} from '@/lib/auth';
import {launchTickGame} from '@/lib/tickgame-demo';

export async function GET() {
  const account = await currentBusinessAccount();
  if (account?.role !== 'admin') return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return launchTickGame();
}
