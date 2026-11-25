'use client';

import {useState} from 'react';
import {X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {t} from '@/lib/i18n';

const quizImageUrl=(id:string)=>'/api/quiz-images?id='+encodeURIComponent(id);

export function QuizPicture({id, alt, source}: {id: string; alt: string; source?: (id: string) => string}) {
  const [enlarged, setEnlarged] = useState(false);
  const src = source ? source(id) : quizImageUrl(id);
  return <>
    <button type="button" className="quiz-picture" aria-label={t('quiz.enlarge')+' · '+alt} onClick={() => setEnlarged(true)}>
      <img src={src} alt={alt} loading="lazy" width={640} height={320}/>
    </button>
    <Dialog open={enlarged} onOpenChange={setEnlarged}>
      <DialogContent className="quiz-image-dialog quiz-player-wave3" overlayClassName="quiz-image-overlay" showCloseButton={false}>
        <div className="quiz-player-heading">
          <DialogTitle>{alt}</DialogTitle>
          <DialogClose asChild><Button type="button" variant="ghost" className="quiz-player-close" aria-label={t('quiz.close')}><X size={20} aria-hidden="true"/></Button></DialogClose>
        </div>
        <DialogDescription className="sr-only">{t('quiz.enlarge')}</DialogDescription>
        <img src={src} alt={alt} width={1000} height={700}/>
      </DialogContent>
    </Dialog>
  </>;
}
