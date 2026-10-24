"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {PageState} from '@/components/page-state';
import {groupFetch} from '@/lib/group-client';
import {alertActionFailure,readApiJson,actionFailureMessage} from '@/lib/action-feedback';
import {t,registerTranslations} from '@/lib/i18n';
import './course-query.css';
import type {TeacherStudentPair} from '@/lib/teacher-student-options';
registerTranslations({}, {'分页':'Pagination','条':'records','上一页':'Previous page','下一页':'Next page','缺席待处理':'Absences awaiting action','已记录出席':'Recorded attendance','未来已安排课时':'Scheduled future teaching time','堂已上课':'completed lessons','待记录出席':'Awaiting attendance'});

export type CoursePageResponse<T>={items:T[];page:number;pages:number;total:number;pageSize:20;revision:number;teacherStudentPairs?:TeacherStudentPair[];classroomOptions?:Array<{id:string;title:string}>;summary?:{lessonCount:number;completedCount:number;durationMilliseconds:number}};
export function useCoursePageNumber(filters:Record<string,string>):[number,(page:number)=>void]{const key=JSON.stringify(filters),[state,setState]=useState({key,page:1});return[state.key===key?state.page:1,(page:number)=>setState({key,page})];}
/** An active course page never retains results from another range or identity. */
export function useCoursePage<T>(params:Record<string,string>,refreshKey?:unknown){
 const key=JSON.stringify(params),[version,setVersion]=useState(0),[state,setState]=useState<{key:string;data:CoursePageResponse<T>|null;loading:boolean;error:string}>({key:'',data:null,loading:true,error:''});
 const reload=useCallback(()=>setVersion(value=>value+1),[]),epoch=useRef(0);
 useEffect(()=>{window.addEventListener('tickminder:data-changed',reload);return()=>window.removeEventListener('tickminder:data-changed',reload);},[reload]);
 useEffect(()=>{
  const controller=new AbortController(),current=++epoch.current;
  setState({key,data:null,loading:true,error:''});
  void groupFetch('/api/courses?'+new URLSearchParams(JSON.parse(key)),{cache:'no-store',signal:controller.signal}).then(async response=>{
   const value=await readApiJson<CoursePageResponse<T>&{error?:string}>(response);
   if(!response.ok){if(response.status===401||response.status===403)window.dispatchEvent(new Event('timelyo:auth-refresh'));throw Error(value.error||t('页面加载失败'));}
   if(!Array.isArray(value.items)||!Number.isInteger(value.total)||!Number.isInteger(value.page))throw Error(t('页面加载失败'));
   if(!controller.signal.aborted&&current===epoch.current)setState({key,data:value,loading:false,error:''});
  }).catch(error=>{if(controller.signal.aborted||current!==epoch.current)return;setState({key,data:null,loading:false,error:actionFailureMessage(error)});alertActionFailure(error);});
  return()=>controller.abort();
 },[key,version,refreshKey]);
 return{...(state.key===key?state:{key,data:null,loading:true,error:''}),reload};
}
export function CoursePageState({loading,error,retry,children}:{loading:boolean;error:string;retry:()=>void;children:React.ReactNode}){
 return loading?<PageState kind="loading" title="正在加载…"/>:error?<PageState kind="error" title="页面加载失败" description={error} action="重试" onAction={retry}/>:<>{children}</>;
}
export function CoursePagination({data,onChange,disabled=false}:{data:{page:number;pages:number;total:number};onChange:(page:number)=>void;disabled?:boolean}){
 return data.pages>1?<nav className="course-query-pagination" aria-label={t('分页')}><Button variant="outline" disabled={disabled||data.page<=1} onClick={()=>onChange(data.page-1)}>{t('上一页')}</Button><span>{data.page} / {data.pages} · {data.total} {t('条')}</span><Button variant="outline" disabled={disabled||data.page>=data.pages} onClick={()=>onChange(data.page+1)}>{t('下一页')}</Button></nav>:null;
}
