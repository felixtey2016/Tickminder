import {BookOpen,ChevronRight} from "lucide-react";
import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {TickGameShell} from "@/components/tickgame-shell";
import {SejarahGameCards} from "@/components/tickgame-game-card";

export default async function TickGamePage({searchParams}: {searchParams: Promise<{lang?: string}>}) {
  const language = (await searchParams).lang==="en" ? "en" : "zh";
  await requireTickGameCatalog(language);
  return <TickGameShell language={language}>
    <div className="tickgame-demo">
      <h1>{language==="zh" ? "选择科目" : "Choose a subject"}</h1>
      <a className="tickgame-subject" href={`/sejarah?lang=${language}`}>
        <BookOpen size={20} aria-hidden="true"/>
        <span>Sejarah</span>
        <ChevronRight size={18} aria-hidden="true"/>
      </a>
      <h2>{language==="zh" ? "游戏" : "Games"}</h2>
      <SejarahGameCards language={language}/>
    </div>
  </TickGameShell>;
}
