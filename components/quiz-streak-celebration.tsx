'use client';

import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {t} from '@/lib/i18n';
import '@/app/quiz-streak.css';

const milestones = [3,5,10];
const stars = [[-86,-49], [80,-58], [-55,30], [76,22], [-31,-71], [34,-61]];
const confettiColors = ['#f6c541','#a88afa','#ff8ea7','#6950be','#43b899'];

export function quizStreakMilestone(count:number) {
  return count > 10 || milestones.includes(count) ? count : undefined;
}

export function quizStreakImage(milestone:number|'perfect'|'correct') {
  const image = typeof milestone === 'number' && milestone > 10 ? 'correct' : milestone;
  return '/tickquiz-streak/' + image + '.webp';
}

function Confetti({pieces}:{pieces:number}) {
  return <div className="quiz-streak-confetti">
    {Array.from({length:pieces},(_,index) => <span key={index} style={{
      '--strip-x': ((index * 29 + 6) % 100) + '%',
      '--strip-color': confettiColors[index % confettiColors.length],
      '--strip-drift': ((index % 5 - 2) * 14) + 'px',
      '--strip-delay': (index % 7 * 40) + 'ms',
      '--strip-rotation': (index % 2 ? 200 : -160) + 'deg',
    } as CSSProperties}/>)}
  </div>;
}

function useCelebrationTimeout(onEnd:()=>void,duration:number) {
  useEffect(() => {
    const timer = window.setTimeout(onEnd,duration);
    return () => window.clearTimeout(timer);
  },[onEnd,duration]);
}

export function QuizStreakCelebration({milestone,onEnd,withConfetti}:{milestone:number;onEnd:()=>void;withConfetti:boolean}) {
  const [imageReady,setImageReady] = useState(false);
  const message = t('quiz.streakCelebration').replace('{count}',String(milestone));
  const compact = milestone > 10;
  useCelebrationTimeout(onEnd,compact ? 900 : 1200);

  return <>
    <span className="sr-only" role="status">{message}</span>
    {createPortal(
      <div className="quiz-streak-overlay" aria-hidden="true">
        {milestone === 10 && withConfetti && <Confetti pieces={14}/>}
        <div className={'quiz-streak-card'+(compact?' quiz-streak-card-compact':'')}>
          {milestone >= 5 && !compact && <div className="quiz-streak-stars">
            {stars.map(([x,y],index) => <span key={index} style={{
              '--star-x': x + 'px', '--star-y': y + 'px', '--star-delay': (index * 26) + 'ms',
            } as CSSProperties}>✦</span>)}
          </div>}
          <img src={quizStreakImage(milestone)} alt="" width="128" height="128" hidden={!imageReady}
            onLoad={() => setImageReady(true)} />
          <span className="quiz-streak-message">{message}</span>
        </div>
      </div>,
      document.body,
    )}
  </>;
}

export function QuizCompletionCelebration({onEnd}:{onEnd:()=>void}) {
  useCelebrationTimeout(onEnd,1950);
  return createPortal(
    <div className="quiz-streak-overlay quiz-completion-overlay" aria-hidden="true"><Confetti pieces={38}/></div>,
    document.body,
  );
}

export function QuizCorrectRing({correct,total}:{correct:number;total:number}) {
  const offset = 100 - (total ? correct / total * 100 : 0);
  return <div className="quiz-correct-ring" role="img"
    aria-label={t('quiz.questionsCorrect').replace('{correct}',String(correct)).replace('{total}',String(total))}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle className="quiz-correct-ring-track" cx="50" cy="50" r="43"/>
      {correct>0&&<circle className="quiz-correct-ring-fill" cx="50" cy="50" r="43" pathLength="100"
        style={{'--quiz-ring-offset':offset} as CSSProperties}/>}
    </svg>
    <div aria-hidden="true"><strong>{correct} / {total}</strong><span>{t('quiz.correctCountLabel')}</span></div>
  </div>;
}
