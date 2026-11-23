import {AppearanceToggle} from "@/components/appearance-toggle";

export function TickGameShell({language,backTo,children}: {
  language:"zh"|"en";
  backTo?:"subjects"|"sejarah";
  children:React.ReactNode;
}) {
  const links = {
    subjects: ["/",language==="zh" ? "全部科目" : "All subjects"],
    sejarah: ["/sejarah",language==="zh" ? "返回 Sejarah" : "Back to Sejarah"],
    manage: ["https://www.tickminder.com/manage",language==="zh" ? "返回 Tickminder" : "Back to Tickminder"],
  } as const;
  const [href,label] = links[backTo || "manage"];
  return <main className="legal-shell legal-reader tickgame-shell" lang={language==="zh" ? "zh-CN" : "en"} data-testid="tickgame-admin-page">
    <header className="legal-topbar">
      <a href={`/?lang=${language}`} className="legal-brand tickgame-brand" aria-label="TickGame">
        <img src="/branding/tickgame-logo.webp" width={72} height={72} alt=""/>
      </a>
      <div className="legal-topbar-tools">
        <AppearanceToggle language={language}/>
        <a className="legal-back" href={`${href}?lang=${language}`}>{label}</a>
      </div>
    </header>
    <article className="legal-paper">{children}</article>
  </main>;
}
