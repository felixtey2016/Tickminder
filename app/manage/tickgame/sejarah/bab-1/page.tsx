import {tickMinderEntry} from '@/lib/ticklearn-routes';
import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {TickGameShell} from "@/components/tickgame-shell";
import {TickGamePlayer} from "@/components/tickgame-player";
import {sejGame} from "@/components/tickgame-game-card";

export default async function BabOne({searchParams}: {searchParams: Promise<{lang?: string;minderFrom?:string}>}) {
  const query=await searchParams;
  const language = query.lang==="en" ? "en" : "zh";
  const minderEntry=tickMinderEntry(query.minderFrom);
  const access=await requireTickGameCatalog(language);
  return <TickGameShell language={language} backTo="sejarah" learning={access==='reader'} minderEntry={minderEntry}>
    <h1>{sejGame.name}</h1>
    <TickGamePlayer title={sejGame.detail} language={language}/>
  </TickGameShell>;
}
