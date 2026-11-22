'use client';

import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {t} from '@/lib/i18n';
import '@/app/quiz-streak.css';

const milestones = [3,5,10] as const;
type Milestone = typeof milestones[number];
const durationMs = 1200;
const stars = [[-86,-49], [80,-58], [-55,30], [76,22], [-31,-71], [34,-61]];
const confettiColors = ['#f6c541','#a88afa','#ff8ea7','#6950be'];

export function quizStreakMilestone(count:number) {
  return milestones.find(milestone => milestone === count);
}

export function quizStreakImage(milestone:Milestone|'perfect') {
  return '/tickquiz-streak/' + milestone + '.webp';
}

export function QuizStreakCelebration({milestone,onEnd}:{milestone:Milestone;onEnd:()=>void}) {
  const [imageReady,setImageReady] = useState(false);
  const message = t('quiz.streakCelebration').replace('{count}',String(milestone));

  useEffect(() => {
    const timer = window.setTimeout(onEnd,durationMs);
    return () => window.clearTimeout(timer);
  },[onEnd]);

  return <>
    <span className="sr-only" role="status">{message}</span>
    {createPortal(
      <div className="quiz-streak-overlay" aria-hidden="true">
        {milestone === 10 && <div className="quiz-streak-confetti">
          {Array.from({length:14},(_,index) => <span key={index} style={{
            '--strip-x': ((index * 29 + 6) % 100) + '%',
            '--strip-color': confettiColors[index % confettiColors.length],
            '--strip-drift': ((index % 5 - 2) * 14) + 'px',
            '--strip-delay': (index % 4 * 45) + 'ms',
            '--strip-rotation': (index % 2 ? 200 : -160) + 'deg',
          } as CSSProperties}/>)}
        </div>}
        <div className="quiz-streak-card">
          {milestone >= 5 && <div className="quiz-streak-stars">
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
