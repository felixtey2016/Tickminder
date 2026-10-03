import type { Language } from "@/lib/i18n";

export function LegalLinks({ language, className = "" }: { language: Language; className?: string }) {
  return <nav className={`legal-links ${className}`} aria-label={language === "en" ? "Legal information" : "法律与隐私"}>
    <a href={`/terms?lang=${language}`}>{language === "en" ? "Terms and Conditions" : "服务条款"}</a>
    <span aria-hidden="true">·</span>
    <a href={`/privacy?lang=${language}`}>{language === "en" ? "Privacy Policy" : "隐私政策"}</a>
  </nav>;
}
