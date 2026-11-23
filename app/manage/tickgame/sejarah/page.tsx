import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {TickGameShell} from "@/components/tickgame-shell";
import {SejarahGameCards} from "@/components/tickgame-game-card";

export default async function SejarahGames({searchParams}: {searchParams: Promise<{lang?: string}>}) {
  const language = (await searchParams).lang==="en" ? "en" : "zh";
  await requireTickGameCatalog(language);
  return <TickGameShell language={language} backTo="subjects">
    <div className="tickgame-demo">
      <h1>Sejarah</h1>
      <SejarahGameCards language={language}/>
    </div>
  </TickGameShell>;
}
