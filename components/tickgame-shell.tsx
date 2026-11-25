import {TickLearnPreferences} from '@/components/ticklearn-preferences';
import {TickLearnBack,TickLearnNavigation} from '@/components/ticklearn-navigation';
import {cookies} from 'next/headers';
import {catalogMinderCookie} from '@/lib/tickgame-demo';
import {tickLearnAccountOrigin,tickLearnStudyOrigin,tickMinderApexOrigin,tickMinderEntryQuery,type TickMinderEntry} from '@/lib/ticklearn-routes';

export async function TickGameShell({language,backTo,backHref,children,learning=false,minderEntry}: {
  language:"zh"|"en";
  backTo?:"subjects"|"sejarah";
  backHref?:string;
  children:React.ReactNode;
  learning?:boolean;
  minderEntry?:TickMinderEntry;
}) {
  const destinations = {subjects: "/", sejarah: "/sejarah"};
  const mode=(await cookies()).get(catalogMinderCookie)?.value;
  const minder=mode==='www'?tickLearnAccountOrigin : mode==='apex'?tickMinderApexOrigin : null;
  learning=learning&&!minder;
  const href = backHref || (backTo ? destinations[backTo] : minder ? minder+'/' : (learning?tickLearnStudyOrigin+'/ticklearn/study':tickLearnAccountOrigin+'/manage'));
  const label = backTo || backHref
    ? (language==="zh" ? "返回" : "Back")
    : (language==="zh" ? "返回 Tickminder" : "Back to Tickminder");
  return <main className={'legal-shell legal-reader tickgame-shell'+(learning?' ticklearn-app-view':'')} lang={language==="zh" ? "zh-CN" : "en"} data-testid="tickgame-admin-page">
    {learning&&<TickLearnNavigation active="game" language={language} minderEntry={minderEntry}/>}
    <header className="legal-topbar">
      <a href={'/?lang='+language+tickMinderEntryQuery(minderEntry)} className="legal-brand tickgame-brand">
        <img src="/branding/tickgame-logo.webp" width={72} height={72} alt=""/>
        <strong>TickGame</strong>
      </a>
      <div className="legal-topbar-tools">
        <TickLearnPreferences language={language} languages={['zh','en']}/>
        {learning?<TickLearnBack language={language} minderEntry={minderEntry} href={href+'?lang='+language+tickMinderEntryQuery(minderEntry)}/>:<a className="legal-back tickgame-back" href={href+'?lang='+language}>{label}</a>}
      </div>
    </header>
    <article className="legal-paper">{children}</article>
  </main>;
}
