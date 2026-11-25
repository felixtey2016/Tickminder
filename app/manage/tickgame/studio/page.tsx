import {notFound} from 'next/navigation';
import {requireTickGameCatalog} from '@/lib/tickgame-catalog-access';
import {studioGames} from '@/lib/tickgame-studio-server';
import {uploadId} from '@/lib/tickgame-studio-schema';
import {TickGameShell} from '@/components/tickgame-shell';
import {TickGameStudio} from '@/components/tickgame-studio';

export default async function StudioPage({searchParams}:{searchParams:Promise<{lang?:string;game?:string}>}){
  const query=await searchParams;
  const language=query.lang==='en'?'en':'zh';
  await requireTickGameCatalog(language,true);
  if(query.game&&!uploadId.safeParse(query.game).success)notFound();
  const game=query.game?(await studioGames()).find(item=>item.id===query.game):undefined;
  if(query.game&&!game)notFound();
  return <TickGameShell language={language} backHref={game?'/games/'+game.id:'/'}>
    <TickGameStudio language={language} game={game}/>
  </TickGameShell>;
}
