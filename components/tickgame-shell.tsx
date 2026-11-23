import {AppearanceToggle} from "@/components/appearance-toggle";

export function TickGameShell({language,backTo,children}: {
  language:"zh"|"en";
  backTo?:"subjects"|"sejarah";
  children:React.ReactNode;
}) {
  const destinations = {subjects: "/", sejarah: "/sejarah"};
  const href = backTo ? destinations[backTo] : "https://www.tickminder.com/manage";
  const label = backTo
    ? (language==="zh" ? "返回" : "Back")
    : (language==="zh" ? "返回 Tickminder" : "Back to Tickminder");
  return <main className="legal-shell legal-reader tickgame-shell" lang={language==="zh" ? "zh-CN" : "en"} data-testid="tickgame-admin-page">
    <header className="legal-topbar">
      <a href={`/?lang=${language}`} className="legal-brand tickgame-brand">
        <img src="/branding/tickgame-logo.webp" width={72} height={72} alt=""/>
        <strong>TickGame</strong>
      </a>
      <div className="legal-topbar-tools">
        <AppearanceToggle language={language}/>
        <a className="legal-back tickgame-back" href={`${href}?lang=${language}`}>{label}</a>
      </div>
    </header>
    <article className="legal-paper">{children}</article>
  </main>;
}
