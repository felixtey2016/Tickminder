import {ArrowRight,CalendarDays} from 'lucide-react';
import {quizLinkPath} from '@/lib/quiz-link';
import {tikQuizPath} from '@/lib/tikquiz-route';
import {tickLearnProducts,tickLearnProductHref} from '@/lib/ticklearn-navigation';
import {dashboardCopy} from '@/lib/ticklearn-dashboard-copy';
import type {TickLearnDashboardData} from '@/lib/ticklearn-dashboard';
import {tickLearnOrigin,type TickLearnLanguage,type TickMinderEntry} from '@/lib/ticklearn-routes';

const schedule = 'https://www.moe.gov.my/index.php/Takwim-Peperiksaan-2026';

export function TickLearnDashboard({language,name,data,minderEntry}:{language:TickLearnLanguage;name?:string;data:TickLearnDashboardData|null;minderEntry?:TickMinderEntry}) {
  const copy = dashboardCopy[language];
  const quiz = tickLearnProducts[0];
  const quizHref = tickLearnProductHref(quiz.path,language,minderEntry);
  const quizPage = (path: string) => tickLearnProductHref(new URL(path,quiz.path).href,language,minderEntry);
  const recent = data?.recent;
  const stats = [
    {label:copy.completed,value:data?.completed ? copy.count(data.completed) : null},
    {label:copy.accuracy,value:data?.accuracy == null ? null : data.accuracy+'%'},
    {label:copy.streak,value:data?.completed ? copy.days(data.streak) : null,detail:copy.streakDetail},
  ];
  return <div className="ticklearn-dashboard">
    <div className="ticklearn-dashboard-welcome">
      <section className="ticklearn-dashboard-hero">
        {name&&<p className="ticklearn-dashboard-name">{name}</p>}
        <h1>{copy.welcome}</h1>
        <p>{copy.subtitle}</p>
        {data?.spm&&<a href={schedule} className="ticklearn-exam-link">
          <CalendarDays size={17} aria-hidden="true"/>
          {data.spm.inProgress ? copy.examInProgress : copy.spm(data.spm.days)}
        </a>}
      </section>
      {data&&<section className="ticklearn-plan" aria-labelledby="ticklearn-current-plan">
        <h2 id="ticklearn-current-plan">{copy.plan}</h2>
        <strong>{data.plan ? copy.free : copy.pro}</strong>
        {data.plan ? <>
          <p>{copy.quizzes(data.plan.quizzes)}</p>
          <p>{copy.quota(data.plan.remaining,data.plan.daily)}</p>
          <a href={tickLearnOrigin+'/tuition?lang='+language} className="ticklearn-dashboard-link">{copy.tuition}</a>
        </> : <p>{copy.unlimited}</p>}
      </section>}
    </div>
    <section aria-labelledby="ticklearn-quick-start">
      <h2 id="ticklearn-quick-start">{copy.quickStart}</h2>
      <div className="ticklearn-feature-grid">
        {[tickLearnProducts[1],quiz,tickLearnProducts[2]].map(({key,path,logo,name})=>{
          const [title,description,action] = copy[key];
          return <article key={key} className="ticklearn-feature">
            <img src={logo} width={132} height={58} alt={name}/>
            <h3>{title}</h3>
            <p>{description}</p>
            <a href={tickLearnProductHref(path,language,minderEntry)} className="ticklearn-dashboard-link">{action}<ArrowRight size={16} aria-hidden="true"/></a>
          </article>;
        })}
      </div>
    </section>
    <section aria-labelledby="ticklearn-study-overview">
      <h2 id="ticklearn-study-overview">{copy.stats}</h2>
      {data ? <dl className="ticklearn-stat-grid">{stats.map(({label,value,detail})=><div className="ticklearn-stat" key={label}>
        <dt>{label}</dt>
        <dd className={value ? undefined : 'ticklearn-stat-empty'}>{value??copy.noData}</dd>
        {detail&&<dd className="ticklearn-stat-detail">{detail}</dd>}
      </div>)}</dl> : <p role="status">{copy.unavailable}</p>}
    </section>
    <section aria-labelledby="ticklearn-recent-practice" className="ticklearn-recent">
      <div className="ticklearn-recent-heading">
        <h2 id="ticklearn-recent-practice">{copy.recent}</h2>
        <a className="ticklearn-dashboard-link" href={quizPage(tikQuizPath('history'))}>{copy.history}</a>
      </div>
      {recent ? <>
        <h3>{recent.title}</h3>
        <p>{recent.status === 'in_progress' ? copy.inProgress : recent.score === null ? copy.pending : copy.score(recent.score)}</p>
        <div className="ticklearn-recent-actions">
          {recent.canRetry&&<a className="ticklearn-dashboard-button" href={quizPage(quizLinkPath(recent.quizId))}>{copy.retry}</a>}
          {recent.status === 'in_progress'
            ? <a className="ticklearn-dashboard-button" href={quizPage(tikQuizPath('play',recent.id))}>{copy.resume}</a>
            : <a className="ticklearn-dashboard-link" href={quizPage(tikQuizPath('results',recent.id))}>{copy.review}</a>}
        </div>
      </> : data&&<>
        <p>{copy.empty}</p>
        <a className="ticklearn-dashboard-button" href={quizHref}>{copy.first}</a>
      </>}
    </section>
  </div>;
}
