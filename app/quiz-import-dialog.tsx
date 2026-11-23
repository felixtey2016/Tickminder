'use client';
import {useRef,useState,type DragEvent} from 'react';
import {BookOpen,ChevronDown,Download,Loader2,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {alertActionFailure} from '@/lib/action-feedback';
import {t,type Language} from '@/lib/i18n';
import './quiz-editor-wave3.css';

export default function QuizImportDialog({language,disabled=false,onImport,onClose,presentation='dialog'}:{language:Language;disabled?:boolean;onImport:(file:File)=>Promise<boolean>;onClose:()=>void;presentation?:'page'|'dialog'}){
 const page=presentation==='page',Title=page?'h1':DialogTitle,Description=page?'p':DialogDescription;
 const input=useRef<HTMLInputElement>(null),dragDepth=useRef(0),inFlight=useRef(false);
 const [busy,setBusy]=useState(false),[dragging,setDragging]=useState(false),[error,setError]=useState(''),[errorDetails,setErrorDetails]=useState('');
 const text=(zh:string,en:string)=>language==='zh'?zh:en,working=disabled||busy;
 function failure(value:unknown){const raw=value instanceof Error?value.message:t('quiz.importFailed'),lines=raw.split(/\r?\n/).filter(line=>line.trim()),message=t(lines[0]||'quiz.importFailed');setError(message.slice(0,240));setErrorDetails(lines.length>1?raw:'');alertActionFailure(new Error(message.slice(0,240)));}
 async function importFiles(files:File[]){
  if(working||inFlight.current)return;
  setError('');setErrorDetails('');
  if(files.length!==1){failure(new Error(text('每次请选择一个 ZIP 文件。','Choose one ZIP file at a time.')));return;}
  const file=files[0];
  if(!/\.zip$/i.test(file.name)){failure(new Error(text('请选择 .zip 文件。','Choose a .zip file.')));return;}
  if(file.size>20*1024*1024){failure(new Error(text('ZIP 文件不能超过 20 MB。','ZIP files must be 20 MB or smaller.')));return;}
  if(!file.size){failure(new Error(text('ZIP 文件为空。','The ZIP file is empty.')));return;}
  inFlight.current=true;setBusy(true);
  try{if(await onImport(file)){if(!page)onClose();}else failure(new Error('quiz.importFailed'));}catch(value){failure(value);}finally{inFlight.current=false;setBusy(false);}
 }
 const filesDrag=(event:DragEvent)=>Array.from(event.dataTransfer.types).includes('Files');
 function resetDrag(){dragDepth.current=0;setDragging(false);}
 function dragEnter(event:DragEvent<HTMLButtonElement>){if(!filesDrag(event))return;event.preventDefault();event.stopPropagation();if(working)return;dragDepth.current++;setDragging(true);}
 function dragOver(event:DragEvent<HTMLButtonElement>){if(!filesDrag(event))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=working?'none':'copy';}
 function dragLeave(event:DragEvent<HTMLButtonElement>){if(!dragDepth.current)return;event.preventDefault();event.stopPropagation();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false);}
 function drop(event:DragEvent<HTMLButtonElement>){if(!filesDrag(event))return;event.preventDefault();event.stopPropagation();resetDrag();void importFiles(Array.from(event.dataTransfer.files));}
 const body=<>
  <Title>{t('quiz.import')}</Title>
  <Description>{text('导入后检查题目再保存。可见范围预选公开，可在共享设置修改。','Review the questions before saving. Public is preselected and can be changed in Sharing.')}</Description>
  <input ref={input} data-testid="quiz-import-file" type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden disabled={working} onChange={event=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';if(files.length)void importFiles(files);}}/>
  <button type="button" className={'quiz-import-dropzone'+(dragging?' is-dragging':'')} data-testid="quiz-import-dropzone" disabled={working} onClick={()=>input.current?.click()} onDragEnter={dragEnter} onDragOver={dragOver} onDragLeave={dragLeave} onDragEnd={resetDrag} onDrop={drop}>
   {working?<Loader2 size={28} className="quiz-import-spinner" aria-hidden="true"/>:<Upload size={28} aria-hidden="true"/>}<strong>{working?t('quiz.importing'):text('选择 ZIP 文件','Choose ZIP file')}</strong><span>{text('也可将文件拖到这里','Or drag and drop it here')}</span><small>ZIP · 20 MB max · {text('一次一个文件','One file at a time')}</small>
  </button>
  {working&&<p className="quiz-import-status" role="status">{t('quiz.importing')}</p>}
  {error&&<div className="quiz-import-error" data-testid="quiz-import-error" role="alert"><p>{error}</p>{errorDetails&&<details data-testid="quiz-import-error-details"><summary>{text('查看全部问题','View all issues')}</summary><pre>{errorDetails}</pre></details>}</div>}
  <details className="quiz-import-tutorial" data-testid="quiz-import-tutorial"><summary><BookOpen size={17} aria-hidden="true"/>{text('教学','Tutorial')}<ChevronDown size={16} aria-hidden="true"/></summary><div>
   <ol>
    <li>{text('把提示词给 AI，注明年级、课程体系（如 SPM 或 IGCSE）、科目、主题和题目语言。有参考资料也可以一并提供。','Give your AI the prompt, grade, curriculum (such as SPM or IGCSE), subject, topic and question languages. Reference material is optional.')}</li>
    <li>{text('可选华文、英文、马来文，或明确指定多种，例如「英文和马来文」。资料缺漏时，AI 应先提问。','Choose Chinese, English, Malay, or an explicit combination such as English and Malay. The AI should ask for any missing details first.')}</li>
    <li>{text('原创题需要图表或示意图时，可以让 AI 生成。检查图中的标注、数值和单位是否与题目及答案一致。','For original questions, the AI can generate diagrams or charts where needed. Check that the labels, values and units match the question and answer.')}</li>
    <li>{text('导入 ZIP 后，检查自动带入的分类、各语言题目和答案，再保存草稿。解题步骤可选填。','Review the imported classification, language versions and answers before saving the draft. Worked solutions are optional.')}</li>
   </ol>
   <pre aria-label={text('ZIP 文件结构','ZIP structure')}>questions.txt{'\n'}images/  ({text('选填','optional')})</pre>
   <div className="quiz-import-downloads"><a href="/downloads/tickminder-quiz-ai-prompt.txt" download data-testid="quiz-import-prompt-download"><Download size={16} aria-hidden="true"/>{text('下载 AI 提示词','Download AI prompt')}</a><a href="/downloads/tickminder-quiz-example.zip" download data-testid="quiz-import-sample-download"><Download size={16} aria-hidden="true"/>{text('示例 ZIP','Example ZIP')}</a></div>
  </div></details>
 </>;
 if(page)return <section className="quiz-import-dialog tikquiz-form-page" data-testid="quiz-import-dialog"><button type="button" className="tikquiz-form-back" disabled={working} onClick={onClose}>{t('quiz.back')}</button>{body}</section>;
 return <Dialog open onOpenChange={open=>{if(!open&&!working)onClose();}}><DialogContent className="quiz-import-dialog" overlayClassName="content-edit-overlay" data-testid="quiz-import-dialog" closeDisabled={working} onDragOver={event=>{if(filesDrag(event))event.preventDefault();}} onDrop={event=>{if(filesDrag(event))event.preventDefault();}}>{body}</DialogContent></Dialog>;
}
