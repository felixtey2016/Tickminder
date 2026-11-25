import {tickMinderEntry,tickMinderEntryQuery} from '@/lib/ticklearn-routes';
import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {studioGames} from "@/lib/tickgame-studio-server";
import {TickGameShell} from "@/components/tickgame-shell";
import {GameCards,gamePageSize} from "@/components/tickgame-game-card";

export default async function SejarahGames({searchParams}: {searchParams: Promise<{lang?: string;limit?:string;minderFrom?:string}>}) {
  const query=await searchParams;
  const language=query.lang==="en" ? "en" : "zh";
  const minderEntry=tickMinderEntry(query.minderFrom);
  const access=await requireTickGameCatalog(language);
  const games=(await studioGames()).filter(game=>game.subject.toLowerCase()==='sejarah');
  const limit=gamePageSize(query.limit);
  return <TickGameShell language={language} backTo="subjects" learning={access==='reader'} minderEntry={minderEntry}>
    <div className="tickgame-demo">
      <h1>Sejarah</h1>
      <GameCards minderEntry={minderEntry} games={games.slice(0,limit)} includeSejarah language={language}/>
      {games.length>limit&&<a className="tickgame-fullscreen-button"
        href={'/sejarah?'+new URLSearchParams({lang:language,limit:String(limit+24)})+tickMinderEntryQuery(minderEntry)}>
        {language==='zh'?'加载更多':'Load more'}
      </a>}
    </div>
  </TickGameShell>;
}
