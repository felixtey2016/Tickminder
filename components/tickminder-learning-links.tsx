import type {ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';
import {tickLearnHomeLogo} from '@/lib/ticklearn-navigation';
import {tickLearnGameOrigin} from '@/lib/ticklearn-routes';
import type {Language} from '@/lib/i18n';
import {ProductEntryLogo} from './product-entry-logo';
import './navigation-hub.css';

export function TickMinderLearningLinks({language,quiz,watchPreview,quizBadge,section='all'}:{
  language:Language;quiz:boolean;watchPreview?:string;quizBadge?:ReactNode;section?:'all'|'study';
}) {
  const learn='/api/ticklearn/entry?from=minder&lang='+language;
  const game=new URL('/',tickLearnGameOrigin);
  game.searchParams.set('lang',language);
  const gameQuery=new URLSearchParams({from:'minder',next:game.href});
  const watch=watchPreview?new URL(watchPreview):null;
  watch?.searchParams.set('lang',language);
  const quizLink=quiz&&<a className="navigation-hub-item" href={'/quizzes?lang='+language} data-testid="hub-quizzes"><ProductEntryLogo product="quiz"/>{quizBadge}</a>;
  const links=<>
    {watch&&<a className="navigation-hub-item" href={watch.href} data-testid={section==='study'?'watch-home-entry':'watch-admin-preview'}><ProductEntryLogo product="play"/></a>}
    <a className="navigation-hub-item" href={'/api/ticklearn/game?'+gameQuery} data-testid="tickgame-admin-entry"><ProductEntryLogo product="game"/></a>
  </>;
  if(section==='study')return <nav className="tickminder-study-section" aria-label={language==='zh'?'自主学习':'Self-paced learning'}>
    <a className="navigation-hub-item tickminder-study-feature" href={learn} data-testid="ticklearn-hub-entry">
      <img src={tickLearnHomeLogo} width={44} height={44} alt=""/>
      <strong>{language==='zh'?'TickLearn 自主学习':'TickLearn Self-paced Learning'}</strong>
      <ChevronRight size={20} aria-hidden="true"/>
    </a>
    <div className="tickminder-learning-links">{links}</div>
  </nav>;
  return <nav className="tickminder-learning-links" aria-label={language==='zh'?'学习平台':'Learning products'}>
    <a className="navigation-hub-item" href={learn} data-testid="ticklearn-hub-entry"><ProductEntryLogo product="learn"/></a>
    {quizLink}
    {links}
  </nav>;
}
