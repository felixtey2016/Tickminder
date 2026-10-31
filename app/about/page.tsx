import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { LEGAL_CONTACT, SERVICE_OPERATOR } from "@/lib/legal-content";
import "./about.css";

export const metadata: Metadata = {
  title: `About ${BRAND_NAME}`,
  description: `${BRAND_NAME} brings tuition centre schedules, attendance, class files, homework, quizzes and authorised financial records together.`,
  alternates: {
    canonical: "https://www.tickminder.com/about",
    languages: { en: "https://www.tickminder.com/about", "zh-CN": "https://www.tickminder.com/about?lang=zh" },
  },
};

const content = {
  en: {
    language: "Page language", intro: "For tuition centres", title: "Your tuition centre, organised.",
    summary: `${BRAND_NAME} is a learning and administration platform for teachers, students, parents and administrators. Manage classes, share learning materials and keep the right people up to date.`,
    open: `Open ${BRAND_NAME}`, features: "What you can do", featuresIntro: "Everyday teaching and administration in one workspace.",
    cards: [
      { title: "Lessons & attendance", text: "Schedule one-to-one and group classes, check the calendar, record attendance and manage rescheduling." },
      { title: "Class files & homework", text: "Organise teaching PDFs in class folders, assign homework and review submissions." },
      { title: "Quizzes & practice", text: "Create and share quizzes, complete practice and review results." },
      { title: "Fees & financial records", text: "Authorised users can manage invoices, receipts, payments and teacher pay records." },
      { title: "Parents & students", text: "Students see their assigned learning. Linked parents can view their children’s courses, attendance and any financial records they are authorised to access." },
      { title: "Accounts & permissions", text: "Administrators manage accounts and access. Available features and records depend on each user’s role and permissions." },
    ],
    driveTitle: "Bring selected PDFs from Google Drive", optional: "Optional connection",
    driveText: "Teachers and authorised administrators can choose PDF files in Google Drive, review their selection, then import copies into a class folder. Original Drive files stay unchanged.",
    driveAccount: "If your Tickminder account is linked to Google, that account is suggested when you connect Drive. Google may still ask you to choose an account or give permission.",
    privacy: "Privacy Policy", terms: "Terms and Conditions", contact: "Contact", operator: "Operated by",
  },
  zh: {
    language: "页面语言", intro: "为补习机构而设", title: "教学与管理，一目了然。",
    summary: `${BRAND_NAME} 为老师、学生、家长及管理员提供课程与教学管理平台，将排课、学习资料和日常记录集中在一起。`,
    open: `打开 ${BRAND_NAME}`, features: "主要功能", featuresIntro: "在同一个平台处理日常教学与管理。",
    cards: [
      { title: "课程与出勤", text: "安排一对一与大班课程，查看日历、记录出勤及处理课程改期。" },
      { title: "班级资料与功课", text: "以班级文件夹整理教学 PDF，分配功课及查看提交记录。" },
      { title: "Quiz 与练习", text: "制作和分享 Quiz，完成练习并查看作答结果。" },
      { title: "学费与财务记录", text: "获授权的用户可管理账单、收据、收付款及老师薪资记录。" },
      { title: "家长与学生", text: "学生查看分配给自己的学习内容；已关联家长可查看孩子的课程、出勤及获授权的财务记录。" },
      { title: "账号与权限", text: "管理员管理账号及访问权限，每个用户可使用的功能和资料按身份与权限分配。" },
    ],
    driveTitle: "从 Google Drive 导入选定的 PDF", optional: "可选连接",
    driveText: "老师及获授权的管理员可在 Google Drive 选择 PDF，预览清单后将副本导入班级文件夹。Drive 中的原文件保持不变。",
    driveAccount: "若 Tickminder 账号已绑定 Google，连接 Drive 时会优先提示该账号。Google 仍可能要求选择账号或确认授权。",
    privacy: "隐私政策", terms: "服务条款", contact: "联系邮箱", operator: "运营者",
  },
};

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const language = params.lang === "zh" ? "zh" : "en";
  const text = content[language];
  return <main className="public-about" lang={language === "zh" ? "zh-CN" : "en"}>
    <div className="public-about-shell">
      <header className="public-about-header">
        <a className="public-about-brand" href="/" aria-label={`${BRAND_NAME} — ${text.open}`}><img src="/tickminder-logo.svg" width="44" height="44" alt=""/><strong>{BRAND_NAME}</strong></a>
        <nav className="public-about-languages" aria-label={text.language}>
          <a href="/about" lang="en" aria-current={language === "en" ? "page" : undefined}>English</a>
          <a href="/about?lang=zh" lang="zh-CN" aria-current={language === "zh" ? "page" : undefined}>中文</a>
        </nav>
      </header>
      <section className="public-about-hero" aria-labelledby="about-title">
        <p className="public-about-kicker">{text.intro}</p>
        <h1 id="about-title">{text.title}</h1>
        <p className="public-about-summary">{text.summary}</p>
        <a className="public-about-primary" href="/">{text.open}<span aria-hidden="true">→</span></a>
      </section>
      <section className="public-about-features" aria-labelledby="about-features">
        <div className="public-about-section-head"><h2 id="about-features">{text.features}</h2><p>{text.featuresIntro}</p></div>
        <div className="public-about-grid">{text.cards.map(card => <article className="public-about-card" key={card.title}><h3>{card.title}</h3><p>{card.text}</p></article>)}</div>
      </section>
      <section className="public-about-drive" aria-labelledby="about-drive">
        <p className="public-about-kicker">{text.optional}</p>
        <h2 id="about-drive">{text.driveTitle}</h2>
        <p>{text.driveText}</p><p>{text.driveAccount}</p>
        <a href={`/privacy?lang=${language}`}>{text.privacy}<span aria-hidden="true"> →</span></a>
      </section>
      <footer className="public-about-footer">
        <div><strong>{BRAND_NAME}</strong><p>{text.operator}: {SERVICE_OPERATOR}</p><p>{text.contact}: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a></p></div>
        <nav aria-label={language === "zh" ? "法律文件" : "Legal documents"}><a href={`/privacy?lang=${language}`}>{text.privacy}</a><a href={`/terms?lang=${language}`}>{text.terms}</a></nav>
      </footer>
    </div>
  </main>;
}