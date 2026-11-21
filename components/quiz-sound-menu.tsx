'use client';

import {useId} from 'react';
import {Volume2,VolumeX} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Switch} from '@/components/ui/switch';
import type {Language} from '@/lib/i18n';
import type {useQuizSound} from '@/lib/quiz-sound';

export function QuizSoundMenu({language,audio}:{language:Language;audio:ReturnType<typeof useQuizSound>}){
 const {preferences,change}=audio;
 const title=language==='zh'?'声音设置':'Sound settings';
 const music=useId(),effects=useId(),musicLabel=useId(),musicHelp=useId();
 return <Popover>
  <PopoverTrigger asChild>
   <Button type="button" variant="outline" size="icon" className="quiz-sound-trigger" aria-label={title} title={title}>
    {preferences.effects?<Volume2 size={20} aria-hidden="true"/>:<VolumeX size={20} aria-hidden="true"/>}
   </Button>
  </PopoverTrigger>
  <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="quiz-sound-menu" aria-label={title}>
   <label className="quiz-sound-setting" htmlFor={music}>
    <span><span id={musicLabel}>{language==='zh'?'背景音乐':'Background music'}</span><small id={musicHelp}>{language==='zh'?'曲目准备中':'Tracks coming soon'}</small></span>
    <Switch id={music} aria-labelledby={musicLabel} aria-describedby={musicHelp} checked={preferences.music} onCheckedChange={enabled=>change('music',enabled)}/>
   </label>
   <label className="quiz-sound-setting" htmlFor={effects}>
    <span>{language==='zh'?'答题提示音':'Answer sounds'}</span>
    <Switch id={effects} checked={preferences.effects} onCheckedChange={enabled=>change('effects',enabled)}/>
   </label>
  </PopoverContent>
 </Popover>;
}
