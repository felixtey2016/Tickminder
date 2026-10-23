"use client";
import { useAdminAction } from "./admin-permission-context";
import {CourseCompletionFilter} from "@/components/course-completion-filter";
import {matchesCourseCompletion} from "@/lib/course-completion";
import {useFilterPreference} from "@/lib/filter-preferences";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {groupFetch} from '@/lib/group-client';
import {getLanguage,t} from '@/lib/i18n';
import {readApiJson} from '@/lib/action-feedback';
import {attendanceLabels,type AttendanceSession} from '@/lib/attendance-types';
import {durationMillisecondsBetween,formatDurationBetween,formatDurationMilliseconds} from '@/lib/duration-format';
import {mayCheckIn,malaysiaMonth} from '@/lib/lesson-rules';
import {attendanceEditWindow,attendanceLockMessages} from '@/lib/attendance-edit-window';
import {registerAttendanceWindowTranslations} from '@/lib/attendance-window-i18n';
import './attendance-window.css';
import {LessonHistory} from './lesson-history';
registerAttendanceWindowTranslations();
type Mutate=(body:Record<string,unknown>)=>Promise<boolean>;
const local=(iso:string|null)=>iso?new Date(Date.parse(iso)+8*3600_000).toISOString().slice(0,16):'';
const stamp=(iso:string)=>new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kuala_Lumpur'}).format(new Date(iso));
const title=(s:AttendanceSession)=>s.sessionType==='group'?s.classroomTitle:s.participants[0]?.studentName;
function teachingDurationMilliseconds(session: Pick<AttendanceSession,'teachingStatus'|'actualStart'|'actualEnd'>) {
 if(session.teachingStatus==='pending')return null;
 return session.teachingStatus==='taught'?durationMillisecondsBetween(session.actualStart,session.actualEnd):0;
}
function sumTeachingDurationMilliseconds(sessions: AttendanceSession[]) {
 return sessions.reduce<number|null>((total,session)=>{
  const duration=teachingDurationMilliseconds(session);
  return total===null||duration===null?null:total+duration;
 },0);
}
type Draft={lessonId:string;name:string;status:string;arrivedAt:string;leftAt:string;note:string;chargeable:boolean};
export function AttendanceWindowInfo({session}:{session:AttendanceSession}){
 const window=attendanceEditWindow(session),precise=(iso:string)=>new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Kuala_Lumpur'}).format(new Date(iso));
 if(!session.firstSubmissionAt&&!window.recorded&&!window.lockCode)return null;
 return <div className="attendance-window-info" role="status">
  {session.firstSubmissionAt&&window.deadline?<><p>{t('首次提交')} · {precise(session.firstSubmissionAt)} · GMT+8</p><p>{t('老师可更正至')} · <strong>{precise(window.deadline)}</strong> · GMT+8</p><p className="muted">{t('再次更正不会延长24小时窗口。')}</p></>:window.recorded&&<p>{t(attendanceLockMessages.unknown_history)}</p>}
  {window.lockCode&&window.lockCode!=='unknown_history'&&<p>{t(attendanceLockMessages[window.lockCode])}</p>}
  {session.explicitLockedAt&&session.explicitLockReason&&<p><strong>{t('锁定原因')}</strong> · {session.explicitLockReason}</p>}
 </div>;
}
export function SessionAttendanceDialog({session:seed,role,mutate,busy,close,review=false,loadedSession=false}:{session:AttendanceSession;role:'admin'|'teacher';mutate:Mutate;busy:boolean;close:()=>void;review?:boolean;loadedSession?:boolean}){
 const can=useAdminAction(),canView=can('attendance.view');
 const [session,setSession]=useState<AttendanceSession|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[confirmed,setConfirmed]=useState(false),[teaching,setTeaching]=useState('taught'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[note,setNote]=useState(''),[reason,setReason]=useState(''),[participants,setParticipants]=useState<Draft[]>([]),[now,setNow]=useState(Date.now);
 const op=useRef<{key:string;id:string}|null>(null),inFlight=useRef(false),loadSeq=useRef(0),canUseSeed=useRef(loadedSession);
 const window=session?attendanceEditWindow(session,now):null,locked=Boolean(!can(review?'attendance.review':'attendance.edit')||session?.explicitLockedAt||session?.invoiceLocked||role==='teacher'&&window&&!window.teacherCanEdit);
 async function load(useSeed=false){const seq=++loadSeq.current;setLoading(true);setError('');setSession(null);setParticipants([]);setConfirmed(false);try{let s=seed;if(!useSeed){const r=await groupFetch('/api/attendance?sessionId='+encodeURIComponent(seed.id),{cache:'no-store'}),data=await readApiJson<{session:AttendanceSession;error?:string}>(r);if(!r.ok)throw Error(t(data.error||'考勤暂时无法载入，请重试'));s=data.session;}if(seq!==loadSeq.current)return;setSession(s);setTeaching(s.teachingStatus==='pending'?'taught':s.teachingStatus);setStart(local(s.actualStart||s.plannedStart));setEnd(local(s.actualEnd||s.plannedEnd));setNote(s.attendanceNote||'');setReason('');setNow(Date.now());setParticipants(s.participants.map(p=>({lessonId:p.lessonId,name:p.studentName,status:p.attendanceStatus==='pending'?'present':p.attendanceStatus,arrivedAt:local(p.arrivedAt),leftAt:local(p.leftAt),note:p.attendanceNote||'',chargeable:p.chargeable===null?p.attendanceStatus!=='absent':Boolean(p.chargeable)})));setConfirmed(false);}catch(e){if(seq===loadSeq.current)setError(e instanceof Error?e.message:t('考勤暂时无法载入，请重试'));}finally{if(seq===loadSeq.current)setLoading(false);}}
 useEffect(()=>{if(!canView){setSession(null);setParticipants([]);canUseSeed.current=false;return;}const useSeed=canUseSeed.current;canUseSeed.current=false;void load(useSeed);const timer=setInterval(()=>setNow(Date.now()),15000);return()=>{loadSeq.current++;clearInterval(timer);};},[seed.id,canView]);
 function update(id:string,patch:Partial<Draft>){setParticipants(rows=>rows.map(p=>p.lessonId===id?{...p,...patch}:p));setConfirmed(false);}
 async function send(body:Record<string,unknown>,finish:()=>void|Promise<void>){if(inFlight.current)return;inFlight.current=true;setWorking(true);setError('');const key=JSON.stringify(body);if(op.current?.key!==key)op.current={key,id:crypto.randomUUID()};try{if(await mutate({...body,operationId:op.current.id})){op.current=null;await finish();}else{await load();setError(previous=>previous||t('未能保存，请检查提示后重试。'));}}finally{setWorking(false);inFlight.current=false;}}
 async function save(){
  if(!session||!confirmed||locked)return;
  if((window?.recorded||session.firstSubmissionAt)&&!reason.trim()){setError(t('请填写本次考勤更正原因'));return;}
  await send({action:review?'reviewSessionAttendance':'saveSessionAttendance',sessionId:session.id,revision:session.revision,teachingStatus:teaching,actualStart:start,actualEnd:end,note,reason:reason.trim(),participants:participants.map(p=>({lessonId:p.lessonId,status:teaching==='taught'?p.status:'absent',arrivedAt:p.arrivedAt,leftAt:p.leftAt,note:p.note,chargeable:teaching==='teacher_absent'?false:p.chargeable}))},close);
 }
 async function changeLock(){if(!session||role!=='admin'||!can('attendance.review'))return;if(!reason.trim()){setError(t('请填写锁定或解锁原因'));return;}await send({action:session.explicitLockedAt?'unlockSessionAttendance':'lockSessionAttendance',sessionId:session.id,revision:session.revision,reason:reason.trim()},load);}
 return <Dialog open={can('attendance.view')} onOpenChange={open=>{if(!open&&!working)close();}}><DialogContent className="content-edit-dialog session-attendance-dialog" overlayClassName="content-edit-overlay" showCloseButton={!working} onInteractOutside={e=>{if(working)e.preventDefault();}}><DialogTitle>{t(review?'复核课次考勤':session?.teachingStatus==='pending'?'登记课次考勤':'课程考勤与更正')}</DialogTitle><DialogDescription>{title(seed)} · {seed.subject} · {seed.participantCount} {t('位学生')}</DialogDescription>{loading&&<p role="status">{t('正在加载…')}</p>}{error&&<p role="alert" className="notice">{error}</p>}{!loading&&session&&<form className="learning-form" noValidate onSubmit={e=>{e.preventDefault();void save();}}><p>{stamp(session.plannedStart)} – {stamp(session.plannedEnd)} · GMT+8</p><AttendanceWindowInfo session={session}/>
  <label>{t('实际授课情况')}<select aria-label={t('实际授课情况')} disabled={review||locked||working} value={teaching} onChange={e=>{setTeaching(e.target.value);if(e.target.value!=="taught")setParticipants(rows=>rows.map(p=>({...p,status:"absent",chargeable:false})));setConfirmed(false);}}>{['taught','not_taught','teacher_absent'].map(v=><option key={v} value={v}>{t(attendanceLabels[v])}</option>)}</select></label>
  {teaching==='taught'&&<div className="form-pair"><label>{t('实际授课开始')}<input type="datetime-local" aria-label={t('实际授课开始')} required disabled={review||locked||working} value={start} onChange={e=>{setStart(e.target.value);setConfirmed(false);}}/><small>{start.slice(0,10)} · GMT+8</small></label><label>{t('实际授课结束')}<input type="datetime-local" aria-label={t('实际授课结束')} required disabled={review||locked||working} value={end} onChange={e=>{setEnd(e.target.value);setConfirmed(false);}}/><small>{end.slice(0,10)} · GMT+8</small></label></div>}
  <p className="attendance-teaching-total">{t('本课次老师授课时长')} · {teaching==='taught'?formatDurationBetween(start,end,getLanguage()):formatDurationMilliseconds(0,getLanguage())}</p>
  {!review&&!locked&&<p className="muted">{t('保存后考勤自动确认，无需管理员再次复核。')}</p>}<section className="attendance-participants"><div className="section-head"><h3>{t('学生考勤')} · {participants.length}</h3>{!review&&!locked&&teaching==='taught'&&<Button type="button" variant="outline" disabled={working} onClick={()=>{setParticipants(rows=>rows.map(p=>({...p,status:'present',arrivedAt:'',leftAt:'',chargeable:true})));setConfirmed(false);}}>{t('全班设为出席')}</Button>}</div>
   {participants.map(p=><article className="attendance-person" key={p.lessonId} data-lesson-id={p.lessonId}><strong>{p.name}</strong><label>{t('出席状态')}<select aria-label={p.name+' · '+t('出席状态')} disabled={review||locked||working||teaching!=='taught'} value={teaching==='taught'?p.status:'absent'} onChange={e=>update(p.lessonId,{status:e.target.value,chargeable:e.target.value!=='absent'})}>{['present','absent','late','early_leave','late_early'].map(v=><option key={v} value={v}>{t(attendanceLabels[v])}</option>)}</select></label>
    {teaching==='taught'&&['late','late_early'].includes(p.status)&&<label>{t('到达时间')}<input type="datetime-local" aria-label={p.name+' · '+t('到达时间')} required disabled={review||locked||working} value={p.arrivedAt} onChange={e=>update(p.lessonId,{arrivedAt:e.target.value})}/></label>}
    {teaching==='taught'&&['early_leave','late_early'].includes(p.status)&&<label>{t('离开时间')}<input type="datetime-local" aria-label={p.name+' · '+t('离开时间')} required disabled={review||locked||working} value={p.leftAt} onChange={e=>update(p.lessonId,{leftAt:e.target.value})}/></label>}
    <details><summary>{t('备注与考勤历史')}</summary><label>{t('学生考勤备注')}<textarea maxLength={500} disabled={review||locked||working} value={p.note} onChange={e=>update(p.lessonId,{note:e.target.value})}/></label><LessonHistory lessonId={p.lessonId}/></details>
    {role==='admin'&&<label className="check-row"><input type="checkbox" disabled={locked||working||teaching==='teacher_absent'||!can('attendance.edit')} checked={teaching==='teacher_absent'?false:p.chargeable} onChange={e=>update(p.lessonId,{chargeable:e.target.checked})}/>{t('标记为收费')}</label>}
   </article>)}
  </section><label>{t('课次授课备注')}<textarea maxLength={500} disabled={review||locked||working} value={note} onChange={e=>{setNote(e.target.value);setConfirmed(false);}}/></label>
  {((window?.recorded||session.firstSubmissionAt)&&!locked||role==='admin'&&can('attendance.review'))&&<label>{t('本次操作原因')}<textarea aria-label={t('本次操作原因')} maxLength={500} disabled={working} value={reason} onChange={e=>setReason(e.target.value)}/><small className="muted">{t('更正、锁定或解锁必须填写原因，最多500字。')}</small></label>}
  {!locked&&<label className="check-row attendance-confirm"><input type="checkbox" required disabled={working} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('确认一次登记本课次全部学生')} · {participants.length} {t('位学生')}</label>}
  <div className="class-session-controls">{!locked&&<Button adminGrant={review?"attendance.review":"attendance.edit"} disabled={busy||working||!confirmed||Boolean((window?.recorded||session.firstSubmissionAt)&&!reason.trim())}>{t(working?'正在保存…':review?'确认复核全部考勤':'保存并确认考勤')}</Button>}{role==='admin'&&can('attendance.review')&&<Button type="button" variant="outline" disabled={busy||working||!reason.trim()} onClick={()=>void changeLock()}>{t(session.explicitLockedAt?'解锁考勤':'锁定考勤')}</Button>}<Button type="button" variant="outline" disabled={working} onClick={()=>void load()}>{t('重新载入')}</Button><Button type="button" variant="outline" disabled={working} onClick={close}>{t('关闭')}</Button></div>
 </form>}{!loading&&!session&&<Button variant="outline" onClick={()=>void load()}>{t('重试')}</Button>}</DialogContent></Dialog>;
}

export function SessionAttendanceLoaderDialog({sessionId,role,review=false,mutate,busy,close}:{sessionId:string;role:'admin'|'teacher';review?:boolean;mutate:Mutate;busy:boolean;close:()=>void}){
 const can=useAdminAction(),canView=can('attendance.view');
 const [session,setSession]=useState<AttendanceSession|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),seq=useRef(0);
 async function load(){const current=++seq.current;setLoading(true);setError('');setSession(null);try{const response=await groupFetch('/api/attendance?sessionId='+encodeURIComponent(sessionId),{cache:'no-store'}),data=await readApiJson<{session:AttendanceSession;error?:string}>(response);if(!response.ok||!data.session)throw Error(t(data.error||'考勤暂时无法载入，请重试'));if(current===seq.current)setSession(data.session);}catch(error){if(current===seq.current)setError(error instanceof Error?error.message:t('考勤暂时无法载入，请重试'));}finally{if(current===seq.current)setLoading(false);}}
 useEffect(()=>{if(!canView){setSession(null);return;}void load();return()=>{seq.current++;};},[sessionId,canView]);
 if(!canView)return null;
 if(session)return <SessionAttendanceDialog session={session} role={role} review={review} mutate={mutate} busy={busy} close={close} loadedSession/>;
 return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="content-edit-dialog session-attendance-dialog"><DialogTitle>{t('课程考勤与更正')}</DialogTitle><DialogDescription>{t('正在核对最新课次与操作权限')}</DialogDescription>{loading?<p role="status">{t('正在加载…')}</p>:<><p role="alert">{error}</p><div className="class-session-controls"><Button type="button" variant="outline" onClick={()=>void load()}>{t('重试')}</Button><Button type="button" variant="outline" onClick={close}>{t('关闭')}</Button></div></>}</DialogContent></Dialog>;
}

export function SessionAttendanceBoard({sessions,role,mutate,busy,mode='lessons',month,serverMode=false,total}:{serverMode?:boolean;total?:number;sessions?:AttendanceSession[];role:'teacher'|'admin';mutate:Mutate;busy:boolean;mode?:'lessons'|'records'|'attention'|'review';month?:string}){
 const [selected,setSelected]=useState<{session:AttendanceSession;review:boolean}|null>(null),[teacher,setTeacher]=useState('');
 const [completion,setCompletion]=useFilterPreference<string>('attendance-courses-'+mode+'-completion','all');
 if(!sessions)return <section className="panel"><p role="status">{t('正在加载…')}</p></section>;
 const now=new Date().toISOString(),rows=serverMode?sessions:sessions.filter(s=>s.status!=='cancelled'&&(!teacher||s.teacherName===teacher)&&(!month||malaysiaMonth(s.actualStart||s.plannedStart)===month)&&(mode==='records'?s.teachingStatus!=='pending':mode==='review'?s.teachingStatus!=='pending'&&!s.attendanceReviewedAt:mode==='attention'?(s.teachingStatus==='pending'&&s.plannedEnd<now)||(s.teachingStatus!=='pending'&&!s.attendanceReviewedAt):matchesCourseCompletion(s,completion))).sort((a,b)=>mode==='records'?b.plannedStart.localeCompare(a.plannedStart):a.plannedStart.localeCompare(b.plannedStart));
 return <section className="panel session-attendance-board"><div className="section-head"><h2>{t(mode==='records'?'课次考勤记录':mode==='review'?'待复核课次':mode==='attention'?'出席待处理':'课程与全班考勤')}</h2><span>{total??rows.length} {t('堂课')}</span></div>{role==='admin'&&!serverMode&&<label>{t('筛选老师')}<select aria-label={t('筛选老师')} value={teacher} onChange={e=>setTeacher(e.target.value)}><option value="">{t('所有老师')}</option>{[...new Set(sessions.map(s=>s.teacherName))].sort().map(name=><option key={name}>{name}</option>)}</select></label>}
  {mode==='lessons'&&!serverMode&&<CourseCompletionFilter value={completion} onChange={setCompletion} testId="teacher-course-completion-filter"/>}{!rows.length?<p className="muted">{t(mode==='records'?'此范围暂无课次考勤':mode==='lessons'?'没有符合条件的记录':'此范围没有待处理课次')}</p>:rows.map(s=><article className="attendance-session" data-session-id={s.id} key={s.id}><strong>{title(s)} · {s.subject}</strong><span>{stamp(s.plannedStart)} – {stamp(s.plannedEnd)}</span><small>{s.teacherName} · {s.participantCount} {t('位学生')} · {t(s.teachingStatus==='pending'?'未登记':s.attendanceReviewedAt?'已确认考勤':'待复核')}</small>{s.teachingStatus!=='pending'&&<p>{t('老师授课时长')} · {formatDurationMilliseconds(teachingDurationMilliseconds(s),getLanguage())}</p>}
   <AttendanceWindowInfo session={s}/><details><summary>{t('考勤明细')}</summary>{s.participants.map(p=><div className="attendance-detail" key={p.lessonId}><strong>{p.studentName}</strong><span>{t(attendanceLabels[p.attendanceStatus]||p.attendanceStatus)}</span>{p.arrivedAt&&p.leftAt&&<small>{stamp(p.arrivedAt)} – {stamp(p.leftAt)} · {formatDurationBetween(p.arrivedAt,p.leftAt,getLanguage())}</small>}<LessonHistory lessonId={p.lessonId}/></div>)}</details>
   <div className="class-session-controls"><Button adminGrant="attendance.view" variant="outline" disabled={busy||(role==='teacher'&&s.teachingStatus==='pending'&&!mayCheckIn(s.plannedStart,now))} onClick={()=>setSelected({session:s,review:false})}>{t(s.teachingStatus==='pending'?'登记课次考勤':role==='teacher'&&!attendanceEditWindow(s).teacherCanEdit?'查看考勤':'更正课次考勤')}</Button>{role==='admin'&&s.teachingStatus!=='pending'&&!s.attendanceReviewedAt&&<Button adminGrant="attendance.review" disabled={busy} onClick={()=>setSelected({session:s,review:true})}>{t('复核课次考勤')}</Button>}</div>
  </article>)}{selected&&<SessionAttendanceDialog session={selected.session} review={selected.review} role={role} busy={busy} mutate={mutate} close={()=>setSelected(null)}/>}
 </section>;
}

export function TeachingHoursPanel({sessions,month}:{sessions?:AttendanceSession[];month:string}){if(!sessions)return <p role="status">{t('正在加载…')}</p>;const rows=sessions.filter(s=>s.status!=='cancelled'&&s.teachingStatus!=='pending'&&malaysiaMonth(s.actualStart||s.plannedStart)===month),total=sumTeachingDurationMilliseconds(rows),approved=sumTeachingDurationMilliseconds(rows.filter(s=>s.attendanceReviewedAt));return <section className="panel teaching-hours"><h2>{month} · {t('老师授课时长')}</h2><div className="timetable-summary"><strong>{formatDurationMilliseconds(total,getLanguage())} · {t('已登记')}</strong><span>{formatDurationMilliseconds(approved,getLanguage())} · {t('已确认考勤')}</span><span>{rows.length} {t('堂课')}</span></div><p className="muted">{t('按课次实际授课起止时间计算，整班只计一次；按实际开始日期归属月份。')}</p>{rows.map(s=><div className="portal-record" key={s.id}><strong>{title(s)} · {s.subject} · {s.teacherName}</strong><span>{stamp(s.actualStart||s.plannedStart)} · {t(attendanceLabels[s.teachingStatus])} · {s.attendanceReviewedAt?t('已确认考勤'):t('待复核')}</span><b>{formatDurationMilliseconds(teachingDurationMilliseconds(s),getLanguage())}</b></div>)}{!rows.length&&<p>{t('此范围暂无课次考勤')}</p>}</section>;}
