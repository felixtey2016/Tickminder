import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {TickGameShell} from "@/components/tickgame-shell";
import {TickGamePlayer} from "@/components/tickgame-player";
import {sejGame} from "@/components/tickgame-game-card";

export default async function BabOne({searchParams}: {searchParams: Promise<{lang?: string}>}) {
  const language = (await searchParams).lang==="en" ? "en" : "zh";
  await requireTickGameCatalog(language);
  return <TickGameShell language={language} backTo="sejarah">
    <h1>{sejGame.name}</h1>
    <TickGamePlayer title={sejGame.detail} language={language}/>
  </TickGameShell>;
}
