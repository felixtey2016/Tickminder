import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {currentBusinessAccount} from "@/lib/auth";
import {AppearanceToggle} from "@/components/appearance-toggle";
import "@/components/legal-document.css";
import "@/components/tickgame-demo.css";
import {TickGamePlayer} from "@/components/tickgame-player";
import {gameTitle} from "@/lib/tickgame-demo";

export const metadata: Metadata = {title: "TickGame · Tickminder", robots: {index: false, follow: false}};

export default async function TickGamePage({searchParams}: {searchParams: Promise<{lang?: string}>}) {
  const account = await currentBusinessAccount();
  if (account?.role !== "admin") notFound();

  const language = (await searchParams).lang === "en" ? "en" : "zh";
  const back = language === "zh" ? "返回管理" : "Back to Manage";
  return <main className="legal-shell legal-reader" lang={language === "zh" ? "zh-CN" : "en"} data-testid="tickgame-admin-page">
    <header className="legal-topbar">
      <a href={`/manage?lang=${language}`} className="legal-brand">
        <img src="/tickminder-logo.svg" width={36} height={36} alt=""/>
        <strong>Tickminder</strong>
      </a>
      <div className="legal-topbar-tools">
        <AppearanceToggle language={language}/>
        <a className="legal-back" href={`/manage?lang=${language}`}>{back}</a>
      </div>
    </header>
    <article className="legal-paper">
      <div className="legal-document-head">
        <h1><img src="/branding/tickgame-logo.webp" width={176} height={176} alt="TickGame"/></h1>
        <TickGamePlayer title={gameTitle} language={language}/>
      </div>
    </article>
  </main>;
}
