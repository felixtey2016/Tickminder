'use client';
import {useRef,useState} from 'react';
import {Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {showActionToast} from '@/lib/action-feedback';
import {getLanguage} from '@/lib/i18n';
import {isQuizLinkId,quizLinkPath} from '@/lib/quiz-link';

const text=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
export default function QuizCopyLinkButton({quizId,disabled=false}:{quizId:string;disabled?:boolean}){
 const [copying,setCopying]=useState(false),[manualUrl,setManualUrl]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function copyLink(){
  if(disabled||copying||!isQuizLinkId(quizId))return;
  const url=new URL(quizLinkPath(quizId),window.location.origin).href;
  setCopying(true);
  try{await navigator.clipboard.writeText(url);showActionToast('success',text('Quiz 链接已复制','Quiz link copied'));}
  catch{setManualUrl(url);}finally{setCopying(false);}
 }
 return <>
  <Button type="button" variant="outline" data-testid="quiz-copy-link" disabled={disabled||copying||!isQuizLinkId(quizId)} onClick={()=>void copyLink()}><Link2 size={17}/>{text('复制链接','Copy link')}</Button>
  <Dialog open={Boolean(manualUrl)} onOpenChange={open=>{if(!open)setManualUrl('');}}><DialogContent className="quiz-confirm-dialog" data-testid="quiz-link-copy-dialog" onOpenAutoFocus={event=>{event.preventDefault();input.current?.focus();input.current?.select();}}>
   <DialogTitle>{text('复制 Quiz 链接','Copy quiz link')}</DialogTitle>
   <DialogDescription>{text('长按或选择下面的链接后复制。链接不会改变可见范围，接收者仍需登录并获授权。','Select or press and hold the link to copy it. Recipients must sign in and have access; the link does not change visibility.')}</DialogDescription>
   <label className="quiz-field"><span>{text('Quiz 链接','Quiz link')}</span><input ref={input} data-testid="quiz-copy-link-value" type="text" value={manualUrl} readOnly style={{fontSize:16}} onFocus={event=>event.currentTarget.select()} onClick={event=>event.currentTarget.select()}/></label>
   <div className="quiz-confirm-actions"><Button type="button" variant="outline" onClick={()=>{input.current?.focus();input.current?.select();}}>{text('选择链接','Select link')}</Button><Button type="button" onClick={()=>setManualUrl('')}>{text('关闭','Close')}</Button></div>
  </DialogContent></Dialog>
 </>;
}
