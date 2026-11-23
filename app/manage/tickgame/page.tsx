import {requireTickGameCatalog} from "@/lib/tickgame-catalog-access";
import {BookOpen,ChevronRight} from "lucide-react";
import {TickGameShell} from "@/components/tickgame-shell";

export default async function TickGamePage({searchParams}: {searchParams: Promise<{lang?: string}>}) {
  const language = (await searchParams).lang === "en" ? "en" : "zh";
  await requireTickGameCatalog(language);
  return <TickGameShell language={language}>
    <section className="tickgame-demo">
      <h2>{language==="zh" ? "选择科目" : "Choose a subject"}</h2>
      <a className="tickgame-subject" href={`/sejarah?lang=${language}`}>
        <BookOpen size={24} aria-hidden="true"/>
        <span>Sejarah</span>
        <ChevronRight size={20} aria-hidden="true"/>
      </a>
    </section>
  </TickGameShell>;
}
