import { BRAND_NAME } from "@/lib/brand";
import { LEGAL_CONTACT, LEGAL_VERSION, SERVICE_OPERATOR, termsContent, privacyContent, type LegalLanguage } from "@/lib/legal-content";

const labels = {
  zh: { back: "返回应用", updated: "更新日期", operator: "运营者", contact: "联系邮箱", contents: "目录", terms: "服务条款", privacy: "隐私政策", language: "页面语言" },
  en: { back: "Back to app", updated: "Updated", operator: "Operator", contact: "Contact", contents: "Contents", terms: "Terms and Conditions", privacy: "Privacy Policy", language: "Document language" },
  ms: { back: "Kembali ke aplikasi", updated: "Dikemas kini", operator: "Pengendali", contact: "Hubungi", contents: "Kandungan", terms: "Terma dan Syarat", privacy: "Dasar Privasi", language: "Bahasa dokumen" },
};

export function LegalDocument({ document, language }: { document: "terms" | "privacy"; language: LegalLanguage }) {
  const lang = document === "terms" && language === "ms" ? "en" : language;
  const copy = document === "terms" ? termsContent[lang as "zh" | "en"] : privacyContent[lang];
  const text = labels[lang];
  return <main className="legal-shell" lang={lang === "zh" ? "zh-CN" : lang}>
    <header className="legal-topbar"><a href="/" className="legal-brand"><img src="/tickminder-logo.svg" width="36" height="36" alt=""/><strong>{BRAND_NAME}</strong></a><a className="legal-back" href="/">← {text.back}</a></header>
    <article className="legal-paper">
      <div className="legal-document-head"><p className="eyebrow">{BRAND_NAME}</p><h1>{copy.title}</h1><p className="legal-summary">{copy.summary}</p>
        <div className="legal-meta"><span>{text.updated}: {LEGAL_VERSION}</span><span>{text.operator}: {SERVICE_OPERATOR}</span></div>
        <nav className="legal-languages" aria-label={text.language}>{(["zh", "en", ...(document === "privacy" ? ["ms"] : [])] as LegalLanguage[]).map(item => <a key={item} href={`/${document}?lang=${item}`} aria-current={lang === item ? "page" : undefined}>{item === "zh" ? "中文" : item === "en" ? "English" : "Bahasa Melayu"}</a>)}</nav>
      </div>
      <nav className="legal-contents" aria-label={text.contents}><strong>{text.contents}</strong>{copy.sections.map((section, i) => <a href={`#section-${i + 1}`} key={section.title}>{section.title}</a>)}</nav>
      <div className="legal-sections">{copy.sections.map((section, i) => <section id={`section-${i + 1}`} key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</div>
      <footer className="legal-document-footer"><p>{text.contact}: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a></p><nav aria-label={text.contents}><a href={`/terms?lang=${lang === "ms" ? "en" : lang}`}>{text.terms}</a><a href={`/privacy?lang=${lang}`}>{text.privacy}</a><a href="/">{text.back}</a></nav></footer>
    </article>
  </main>;
}
