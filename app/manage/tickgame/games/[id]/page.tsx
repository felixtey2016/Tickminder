import {tickMinderEntry} from '@/lib/ticklearn-routes';
import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireTickGameCatalog} from '@/lib/tickgame-catalog-access';
import {studioDraft,studioGames,studioReady} from '@/lib/tickgame-studio-server';
import {uploadId} from '@/lib/tickgame-studio-schema';
import {TickGameShell} from '@/components/tickgame-shell';
import {TickGamePlayer} from '@/components/tickgame-player';

export default async function UploadedGame({params,searchParams}:{
  params:Promise<{id:string}>;searchParams:Promise<{lang?:string;version?:string;minderFrom?:string}>;
}){
  const [{id},query]=await Promise.all([params,searchParams]);
  const language=query.lang==='en'?'en':'zh';
  const minderEntry=tickMinderEntry(query.minderFrom);
  const access=await requireTickGameCatalog(language,Boolean(query.version));
  if(!uploadId.safeParse(id).success)notFound();
  const bucket=env.TICKGAME_ASSETS;
  const version=query.version;
  if(!bucket||version&&!uploadId.safeParse(version).success)notFound();
  const game=version ? await studioDraft(bucket,id,version) : (await studioGames(bucket)).find(item=>item.id===id);
  if(!game||version&&!await studioReady(bucket,id,version))notFound();
  const src='/play?'+new URLSearchParams({game:id,...(version?{version}:{})});
  return <TickGameShell language={language} backTo="subjects" learning={access==='reader'} minderEntry={minderEntry}>
    <div className="tickgame-demo">
      <h1>{game.title}</h1>
      {game.description&&<p>{game.description}</p>}
      {version?<p>{language==='zh'?'草稿预览':'Draft preview'}</p>:access==='admin'&&<div>
        <a className="tickgame-fullscreen-button" href={'/studio?'+new URLSearchParams({lang:language,game:id})}>
          {language==='zh'?'上传新版本':'Upload a new version'}
        </a>
      </div>}
      <TickGamePlayer language={language} title={game.subject} src={src}/>
    </div>
  </TickGameShell>;
}
