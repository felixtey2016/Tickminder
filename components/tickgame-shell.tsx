import {AppearanceToggle} from "@/components/appearance-toggle";

export function TickGameShell({language,subject,children}: {
  language:"zh"|"en";
  subject?:boolean;
  children:React.ReactNode;
}) {
  const back = subject
    ? language === "zh" ? "返回科目" : "Back to subjects"
    : language === "zh" ? "返回管理" : "Back to Manage";
  return <main className="legal-shell legal-reader" lang={language === "zh" ? "zh-CN" : "en"} data-testid="tickgame-admin-page">
    <header className="legal-topbar">
      <a href={`https://www.tickminder.com/manage?lang=${language}`} className="legal-brand">
        <img src="/tickminder-logo.svg" width={36} height={36} alt=""/>
        <strong>Tickminder</strong>
      </a>
      <div className="legal-topbar-tools">
        <AppearanceToggle language={language}/>
        <a className="legal-back" href={`${subject ? "/" : "https://www.tickminder.com/manage"}?lang=${language}`}>{back}</a>
      </div>
    </header>
    <article className="legal-paper">
      <div className="legal-document-head">
        <h1><img src="/branding/tickgame-logo.webp" width={176} height={176} alt="TickGame"/></h1>
        {children}
      </div>
    </article>
  </main>;
}
