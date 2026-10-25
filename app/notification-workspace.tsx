'use client';
import {usePageHistoryState,canNavigateBack} from '@/lib/page-history';
import type {NotificationDestination as Target,NotificationLessonRecord} from '@/lib/notification-navigation';
import type {Language} from '@/lib/i18n';
import type {LearningMutate} from './learning-portal';
import {NotificationCentre} from './notifications';
import NotificationDestination from './notification-destination';

export function NotificationWorkspace({role,language,learningMutate,courseMutate,onLesson,busy}:{role:'student'|'teacher'|'admin'|'pending';language:Language;learningMutate:LearningMutate;courseMutate:LearningMutate;onLesson:(lesson:NotificationLessonRecord)=>void;busy:boolean}){
 const [target,setTarget,replaceTarget]=usePageHistoryState<Target|null>('notification.target',null);
 return target&&role!=='pending'?<NotificationDestination key={JSON.stringify(target)} target={target} role={role} language={language} learningMutate={learningMutate} courseMutate={courseMutate} onLesson={onLesson} busy={busy} onBack={()=>{if(canNavigateBack())window.history.back();else replaceTarget(null);}}/>:<NotificationCentre language={language} onOpen={setTarget}/>;
}
