"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Button} from '@/components/ui/button';
import {PageState} from '@/components/page-state';
import {groupFetch} from '@/lib/group-client';
import {alertActionFailure,readApiJson,actionFailureMessage} from '@/lib/action-feedback';
import {t,registerTranslations} from '@/lib/i18n';
import './course-query.css';
import './course-wave2.css';
import type {RescheduleProposal} from './reschedule-panel';
import type {TeacherStudentPair} from '@/lib/teacher-student-options';
import {getPrivateReadSnapshot,subscribePrivateReadLifecycle,invalidatePrivateReads} from '@/lib/private-read-lifecycle';
import {privateReadFlight,PrivateReadInvalidatedError} from '@/lib/private-read-flight';
import {courseOptionsKey,courseOptionsSnapshot,reusableCourseOptions,type CourseOptionsSnapshot} from '@/lib/course-option-reuse';
registerTranslations({}, {'分页':'Pagination','条':'records','上一页':'Previous page','下一页':'Next page','缺席待处理':'Absences awaiting action','已记录出席':'Recorded attendance','未来已安排课时':'Scheduled future teaching time','堂已上课':'completed lessons','待记录出席':'Awaiting attendance'});

export type CoursePageResponse<T>={items:T[];proposals?:RescheduleProposal[];page:number;pages:number;total:number;pageSize:20;revision:number;teacherStudentPairs?:TeacherStudentPair[];classroomOptions?:Array<{id:string;title:string}>;summary?:{lessonCount:number;completedCount:number;durationMilliseconds:number}};
export function useCoursePageNumber(filters:Record<string,string>):[number,(page:number)=>void]{const key=JSON.stringify(filters),[state,setState]=useState({key,page:1});return[state.key===key?state.page:1,(page:number)=>setState({key,page})];}
/** An active course page never retains results from another range or identity. */
export function useCoursePage<T>(params:Record<string,string>|null,refreshKey?:unknown,optionsSource?:CourseOptionsSnapshot|null){
 const context=useSyncExternalStore(subscribePrivateReadLifecycle,getPrivateReadSnapshot,getPrivateReadSnapshot),enabled=params!==null,query=new URLSearchParams(Object.entries(params||{}).sort(([a],[b])=>a.localeCompare(b))).toString();
 const key=JSON.stringify([context.identity,context.groupId,context.clearEpoch,query]),[state,setState]=useState<{key:string;data:CoursePageResponse<T>|null;loading:boolean;error:string}>({key:'',data:null,loading:true,error:''});
 const optionKey=courseOptionsKey(params,context,refreshKey),optionRef=useRef<CourseOptionsSnapshot|null>(null),sourceRef=useRef(optionsSource);sourceRef.current=optionsSource;
 if(optionRef.current?.key!==optionKey)optionRef.current=null;
 const epoch=useRef(0),latest=useRef(key);latest.current=key;
 const reload=useCallback(()=>{epoch.current++;if(getPrivateReadSnapshot().blocked)window.dispatchEvent(new Event('timelyo:auth-refresh'));else invalidatePrivateReads('manual-refresh');},[]);
 useEffect(()=>{
  const controller=new AbortController(),current=++epoch.current;
  if(!enabled){setState({key,data:null,loading:false,error:''});return()=>controller.abort();}
  setState(previous=>({key,data:previous.key===key?previous.data:null,loading:!context.authError,error:context.authError}));
  if(context.blocked||!context.identity||context.identity==='anonymous')return()=>controller.abort();
  const known=new URLSearchParams(query).get('optionsOnly')==='1'?null:reusableCourseOptions(optionKey,optionRef.current,sourceRef.current);
  const read=(omitOptions:boolean)=>{
   const requestParams=new URLSearchParams(query);requestParams.delete('includeOptions');if(omitOptions)requestParams.set('includeOptions','0');
   const url='/api/courses?'+requestParams;
   return privateReadFlight.read({kind:'courses',identity:context.identity,url,signal:controller.signal,load:async signal=>{
    const response=await groupFetch(url,{cache:'no-store',signal});
   const value=await readApiJson<CoursePageResponse<T>&{error?:string}>(response);
    if(!response.ok)throw Error(value.error||t('页面加载失败'));return value;
  },validate:(result:unknown)=>{
    const value=result as CoursePageResponse<T>;
   if(!Array.isArray(value.items)||!Number.isInteger(value.total)||!Number.isInteger(value.page))throw Error(t('页面加载失败'));
    return value;
   }});
  };
  void read(Boolean(known)).then(async value=>{
    if(controller.signal.aborted||current!==epoch.current||latest.current!==key||getPrivateReadSnapshot().epoch!==context.epoch)return;
    // A newer server revision requires a newly authorized complete option read.
    // Never relabel old names with the revision of a newer detail response.
    if(known&&value.teacherStudentPairs===undefined){
     if(value.revision!==known.revision)value=await read(false);
     else value={...value,teacherStudentPairs:known.pairs.map(pair=>({...pair}))};
    }
    if(!controller.signal.aborted&&current===epoch.current&&latest.current===key&&getPrivateReadSnapshot().epoch===context.epoch){optionRef.current=courseOptionsSnapshot(optionKey,value);setState({key,data:value,loading:false,error:''});}
  }).catch(error=>{if(controller.signal.aborted||current!==epoch.current||latest.current!==key||error instanceof PrivateReadInvalidatedError)return;setState(previous=>({key,data:previous.key===key?previous.data:null,loading:false,error:actionFailureMessage(error)}));alertActionFailure(error);});
  return()=>controller.abort();
 },[key,query,context,refreshKey,enabled,optionKey,optionsSource?.key,optionsSource?.revision]);
 return{...(state.key===key?state:{key,data:null,loading:enabled,error:''}),reload,optionsSnapshot:optionRef.current};
}
export function CoursePageState({loading,error,retry,children,data}:{loading:boolean;error:string;retry:()=>void;children:React.ReactNode;data?:unknown}){
 if(!data)return loading?<PageState kind="loading" title="正在加载…"/>:error?<PageState kind="error" title="页面加载失败" description={error} action="重试" onAction={retry}/>:<>{children}</>;
 return <>{error?<p role="alert">{error} <Button variant="outline" onClick={retry}>{t('重试')}</Button></p>:loading?<p className="muted" role="status">{t('正在加载…')}</p>:null}{children}</>;
}
export function CoursePagination({data,onChange,disabled=false}:{data:{page:number;pages:number;total:number};onChange:(page:number)=>void;disabled?:boolean}){
 return data.pages>1?<nav className="course-query-pagination" aria-label={t('分页')}><Button variant="outline" disabled={disabled||data.page<=1} onClick={()=>onChange(data.page-1)}>{t('上一页')}</Button><span>{data.page} / {data.pages} · {data.total} {t('条')}</span><Button variant="outline" disabled={disabled||data.page>=data.pages} onClick={()=>onChange(data.page+1)}>{t('下一页')}</Button></nav>:null;
}
