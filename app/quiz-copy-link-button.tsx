'use client';
import {useRef,useState} from 'react';
import {Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {showActionToast} from '@/lib/action-feedback';
import {getLanguage} from '@/lib/i18n';
import {isQuizLinkId,quizLinkPath} from '@/lib/quiz-link';

const text=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
export default function QuizCopyLinkButton({quizId,assignmentId,disabled=false}:{quizId:string;assignmentId?:string;disabled?:boolean}){
 const [copying,setCopying]=useState(false),[manualUrl,setManualUrl]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function copyLink(){
  if(disabled||copying||!isQuizLinkId(quizId)||(assignmentId!==undefined&&!isQuizLinkId(assignmentId)))return;
  const url=new URL(quizLinkPath(quizId,assignmentId),window.location.origin).href;
  setCopying(true);
  try{await navigator.clipboard.writeText(url);showActionToast('success',assignmentId?text('本次作业链接已复制','Assignment link copied'):text('自主练习链接已复制','Practice link copied'));}
  catch{setManualUrl(url);}finally{setCopying(false);}
 }
 return <>
  <Button type="button" variant="outline" data-testid={assignmentId?'quiz-copy-assignment-link':'quiz-copy-link'} disabled={disabled||copying||!isQuizLinkId(quizId)||(assignmentId!==undefined&&!isQuizLinkId(assignmentId))} onClick={()=>void copyLink()}><Link2 size={17}/>{assignmentId?text('复制本次作业链接','Copy assignment link'):text('复制练习链接','Copy practice link')}</Button>
  <Dialog open={Boolean(manualUrl)} onOpenChange={open=>{if(!open)setManualUrl('');}}><DialogContent className="quiz-confirm-dialog quiz-library-dialog" data-testid="quiz-link-copy-dialog" onOpenAutoFocus={event=>{event.preventDefault();input.current?.focus();input.current?.select();}}>
   <DialogTitle>{assignmentId?text('复制本次作业链接','Copy assignment link'):text('复制自主练习链接','Copy practice link')}</DialogTitle>
   <DialogDescription>{assignmentId?text('只有本次布置的学生可以作答，完成后计入这次作业。','Assigned students sign in to answer. Their responses count towards this assignment.'):text('此链接用于自主练习，不计入某一次布置的作业。','This link is for self-practice, separate from an assigned task.')}</DialogDescription>
   <label className="quiz-field"><span>{text('Quiz 链接','Quiz link')}</span><input ref={input} data-testid="quiz-copy-link-value" type="text" value={manualUrl} readOnly style={{fontSize:16}} onFocus={event=>event.currentTarget.select()} onClick={event=>event.currentTarget.select()}/></label>
   <div className="quiz-confirm-actions"><Button type="button" variant="outline" onClick={()=>{input.current?.focus();input.current?.select();}}>{text('选择链接','Select link')}</Button><Button type="button" onClick={()=>setManualUrl('')}>{text('关闭','Close')}</Button></div>
  </DialogContent></Dialog>
 </>;
}
