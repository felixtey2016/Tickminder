import {tickMinderEntry,tickMinderEntryQuery} from '@/lib/ticklearn-routes';
import {BookOpen,ChevronRight} from "lucide-react";
import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {studioGames} from "@/lib/tickgame-studio-server";
import {TickGameShell} from "@/components/tickgame-shell";
import {GameCards,gamePageSize} from "@/components/tickgame-game-card";

export default async function TickGamePage({searchParams}: {searchParams: Promise<{lang?:string;minderFrom?:string;subject?:string;limit?:string}>}) {
  const query=await searchParams;
  const language=query.lang==="en" ? "en" : "zh";
  const minderEntry=tickMinderEntry(query.minderFrom);
  const access=await requireTickGameCatalog(language);
  const games=await studioGames();
  const subjects=[...new Set(games.map(game=>game.subject))].filter(subject=>subject.toLowerCase()!=='sejarah');
  const active=subjects.find(subject=>subject===query.subject);
  const visible=active?games.filter(game=>game.subject===active):games;
  const limit=gamePageSize(query.limit);
  return <TickGameShell language={language} learning={access==='reader'} minderEntry={minderEntry}>
    <div className="tickgame-demo">
      <h1>{language==="zh" ? "选择科目" : "Choose a subject"}</h1>
      <a className="tickgame-subject" href={'/sejarah?lang='+language+tickMinderEntryQuery(minderEntry)}>
        <BookOpen size={20} aria-hidden="true"/>
        <span>Sejarah</span>
        <ChevronRight size={18} aria-hidden="true"/>
      </a>
      {subjects.length>0&&<nav className="tickgame-subject-links" aria-label={language==='zh'?'按科目筛选':'Filter by subject'}>
        <a className="tickgame-fullscreen-button" href={'/?lang='+language+tickMinderEntryQuery(minderEntry)} aria-current={active?undefined:'page'}>{language==='zh'?'全部':'All'}</a>
        {subjects.map(subject=><a className="tickgame-fullscreen-button" key={subject} aria-current={subject===active?'page':undefined}
          href={'/?'+new URLSearchParams({lang:language,subject})+tickMinderEntryQuery(minderEntry)}>{subject}</a>)}
      </nav>}
      <h2>{active||(language==="zh" ? "游戏" : "Games")}</h2>
      <GameCards minderEntry={minderEntry} games={visible.slice(0,limit)} includeSejarah={!active} language={language}/>
      {visible.length>limit&&<div><a className="tickgame-fullscreen-button"
        href={'/?'+new URLSearchParams({lang:language,limit:String(limit+24),...(active?{subject:active}:{})})+tickMinderEntryQuery(minderEntry)}>
        {language==='zh'?'加载更多':'Load more'}
      </a></div>}
      {access==='admin'&&<div><a className="tickgame-fullscreen-button" href={'/studio?lang='+language}>
        {language==='zh'?'新增游戏':'Add a game'}
      </a></div>}
    </div>
  </TickGameShell>;
}
