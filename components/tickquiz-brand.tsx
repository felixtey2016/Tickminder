import {TICK_QUIZ_NAME} from '@/lib/brand';

export function TickQuizBrand() {
  return <span className="tikquiz-brand" role="img" aria-label={TICK_QUIZ_NAME}>
    <span className="tikquiz-brand-mascot" aria-hidden="true">
      <img src="/tikquiz-logo.webp" alt="" width={740} height={260}/>
    </span>
    <span className="tikquiz-brand-name" aria-hidden="true">Tick<span>quiz</span></span>
  </span>;
}
