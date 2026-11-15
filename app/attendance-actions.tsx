"use client";
import {lazy,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {LessonTimeRange} from '@/components/lesson-time-range';
import {validLessonRange} from '@/lib/lesson-time-range';
import type {AttendanceSession} from '@/lib/attendance-types';
import {getLanguage} from '@/lib/i18n';
import {registerAttendanceActionTranslations} from '@/lib/attendance-actions-i18n';
import {useAdminAction} from './admin-permission-context';
import {CoursePageState,CoursePagination,useCoursePage,useCoursePageNumber} from './course-query-ui';
import './attendance-actions.css';
registerAttendanceActionTranslations();

const SessionAttendanceDialog=lazy(()=>import('./session-attendance').then(m=>({default:m.SessionAttendanceDialog})));
type Mutate=(body:Record<string,unknown>)=>Promise<boolean>;
const copy=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
const stamp=(value:string)=>new Date(value).toLocaleString(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'});
const sessionTitle=(session:AttendanceSession)=>session.sessionType==='group'?session.classroomTitle:session.participants[0]?.studentName;

export function CancelOriginalDialog({session,mutate,busy,close}:{session:AttendanceSession;mutate:Mutate;busy:boolean;close:()=>void}) {
 const [working,setWorking]=useState(false),[error,setError]=useState(''),operation=useRef(crypto.randomUUID()),inFlight=useRef(false);
 const group=session.sessionType==='group';
 async function save(){
  if(busy||inFlight.current)return;inFlight.current=true;setWorking(true);setError('');
  try{const body=group?{action:'cancelClassSession',sessionId:session.id,revision:session.revision}:{action:'cancel',id:session.participants[0]?.lessonId,sessionRevision:session.revision};
   if(await mutate({...body,scope:'single',operationId:operation.current}))close();else setError(copy('未能取消，请检查提示后重试。','Could not cancel. Check the message and retry.'));
  }finally{inFlight.current=false;setWorking(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!working)close();}}><DialogContent className="content-edit-dialog attendance-action-dialog" closeDisabled={working}><DialogTitle>{copy('取消原课程','Cancel original lesson')}</DialogTitle><DialogDescription>{sessionTitle(session)} · {session.subject}</DialogDescription><p>{stamp(session.plannedStart)} – {stamp(session.plannedEnd)}</p><p>{copy('将取消原课程，并按现有取消规则处理；课程和操作历史会保留。','The original lesson will be cancelled under the existing cancellation rules. Its record and history are retained.')}</p>{group&&<p className="notice">{copy('这会取消整班本课次，影响所有参与学生。','This cancels this entire class session for all participants.')}</p>}{error&&<p role="alert" className="notice">{error}</p>}<div className="class-session-controls"><Button adminGrant="lessons.cancel" variant="destructive" disabled={busy||working} onClick={()=>void save()}>{copy(working?'正在取消…':'确认取消原课程',working?'Cancelling…':'Confirm cancellation')}</Button><Button variant="outline" disabled={working} onClick={close}>{copy('返回','Back')}</Button></div></DialogContent></Dialog>;
}

function MakeupDialog({session,mutate,busy,close}:{session:AttendanceSession;mutate:Mutate;busy:boolean;close:()=>void}) {
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[ids,setIds]=useState(()=>session.participants.map(p=>p.lessonId)),[working,setWorking]=useState(false),[error,setError]=useState('');
 const operation=useRef<{key:string;id:string}|null>(null),inFlight=useRef(false);
 async function save(){
  if(busy||inFlight.current||!ids.length||!validLessonRange(start,end))return;
  inFlight.current=true;setWorking(true);setError('');
  const body={action:'scheduleMakeupSession',sessionId:session.id,revision:session.revision,lessonIds:[...ids].sort(),start,end},key=JSON.stringify(body);
  if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
  try{if(await mutate({...body,operationId:operation.current.id}))close();else setError(copy('未能安排，请检查提示；如原课程已改变，请关闭后重新打开。','Could not schedule. Check the message; reopen if the original lesson has changed.'));}finally{inFlight.current=false;setWorking(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!working)close();}}><DialogContent className="content-edit-dialog attendance-action-dialog" closeDisabled={working}><DialogTitle>{copy('安排补课','Schedule makeup')}</DialogTitle><DialogDescription>{sessionTitle(session)} · {session.subject} · {session.teacherName}</DialogDescription><p className="muted">{copy('原课程','Original lesson')} · {stamp(session.plannedStart)}</p><form className="learning-form" onSubmit={event=>{event.preventDefault();void save();}}>
  <fieldset className="makeup-students"><legend>{copy('需要补课的学生','Students needing makeup')}</legend>{session.participants.map(p=><label className="check-row" key={p.lessonId}><input type="checkbox" checked={ids.includes(p.lessonId)} disabled={busy||working} onChange={e=>setIds(previous=>e.target.checked?[...previous,p.lessonId]:previous.filter(id=>id!==p.lessonId))}/>{p.studentName}</label>)}</fieldset>
  <LessonTimeRange start={start} end={end} disabled={busy||working} onChange={(a,b)=>{setStart(a);setEnd(b);}}/>
  <p className="muted">{copy('尚未确定日期可以直接关闭，记录仍保留在待安排补课。补课会关联原课程，不会再次收取原课程费用。','Close without saving if the date is undecided; the original stays in the makeup queue. The makeup links to its original lesson without charging the original again.')}</p>
  {error&&<p role="alert" className="notice">{error}</p>}<div className="class-session-controls"><Button adminGrant="lessons.create" disabled={busy||working||!ids.length||!validLessonRange(start,end)}>{copy(working?'正在保存…':'确认安排补课',working?'Saving…':'Confirm makeup')}</Button><Button type="button" variant="outline" disabled={working} onClick={close}>{copy('暂不安排','Not now')}</Button></div>
 </form></DialogContent></Dialog>;
}

export function PendingMakeupBoard({month,mutate,busy,onOpenFinance}:{month:string;mutate:Mutate;busy:boolean;onOpenFinance?:()=>void}) {
 const can=useAdminAction(),base={view:'sessions',mode:'makeup',month},[page,setPage]=useCoursePageNumber(base),query=useCoursePage<AttendanceSession>({...base,page:String(page)});
 const [selected,setSelected]=useState<{session:AttendanceSession;action:'makeup'|'cancel'|'attendance'}|null>(null);
 useEffect(()=>{if(query.data&&page>query.data.pages)setPage(query.data.pages);},[query.data,page,setPage]);
 return <section className="panel session-attendance-board pending-makeup-board" data-testid="pending-makeup-board"><div className="section-head"><h2>{copy('待安排补课','Makeup to schedule')}</h2>{query.data&&<span>{query.data.total} {copy('堂课','lessons')}</span>}</div><p className="muted">{copy('日期未定的课次会一直保留在这里，不受月份限制。','Lessons stay here until scheduled or cancelled, regardless of the selected month.')}</p><CoursePageState {...query} retry={query.reload}>{query.data&&<>{!query.data.total&&<p className="muted">{copy('暂无待安排补课','No makeup lessons to schedule')}</p>}{query.data.items.map(s=><article className="attendance-session" key={s.id} data-session-id={s.id}><strong>{sessionTitle(s)} · {s.subject}</strong><span>{stamp(s.plannedStart)}</span><small>{s.teacherName} · {copy('待安排补课，日期未定','Makeup pending; date undecided')}</small><p>{s.participants.map(p=>p.studentName).join('、')}</p><div className="class-session-controls"><Button adminGrant="lessons.create" disabled={busy} onClick={()=>setSelected({session:s,action:'makeup'})}>{copy('安排补课','Schedule makeup')}</Button><Button adminGrant="attendance.view" variant="outline" disabled={busy} onClick={()=>setSelected({session:s,action:'attendance'})}>{copy('查看或更正考勤','View or correct attendance')}</Button>{can('lessons.cancel')&&(s.sessionType!=='group'||s.teachingStatus!=='taught'&&s.participants.length===s.participantCount)&&<Button variant="outline" disabled={busy} onClick={()=>setSelected({session:s,action:'cancel'})}>{copy('取消原课程','Cancel original lesson')}</Button>}</div></article>)}<CoursePagination data={query.data} onChange={setPage}/></>}</CoursePageState>
  {selected?.action==='makeup'&&<MakeupDialog session={selected.session} mutate={mutate} busy={busy} close={()=>setSelected(null)}/>}{selected?.action==='cancel'&&<CancelOriginalDialog session={selected.session} mutate={mutate} busy={busy} close={()=>setSelected(null)}/>}{selected?.action==='attendance'&&<SessionAttendanceDialog session={selected.session} role="admin" mutate={mutate} busy={busy} close={()=>setSelected(null)} onOpenFinance={onOpenFinance}/>}
 </section>;
}
