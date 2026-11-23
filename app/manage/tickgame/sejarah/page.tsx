import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {TickGameShell} from "@/components/tickgame-shell";
import {TickGamePlayer} from "@/components/tickgame-player";
import {gameTitle} from "@/lib/tickgame-demo";

export default async function SejarahGames({searchParams}: {searchParams: Promise<{lang?: string}>}) {
  const language = (await searchParams).lang === "en" ? "en" : "zh";
  await requireTickGameCatalog(language);
  return <TickGameShell language={language} subject>
    <TickGamePlayer title={gameTitle} language={language}/>
  </TickGameShell>;
}
