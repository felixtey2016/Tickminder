"use client";
import { useAdminAction } from "./admin-permission-context";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {t} from '@/lib/i18n';
type Row={student:string;syllabusId:string|null;syllabus:string;fromGrade:string|null;toGrade:string|null;eligible:boolean;reason:string};
export function StudentPromotions(){
 const can=useAdminAction();
 const [expanded,setExpanded]=useState(false),[cycle,setCycle]=useState(new Date().getFullYear()+1),[rows,setRows]=useState<Row[]|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[reload,setReload]=useState(0);
 const generation=useRef(0);
 useEffect(()=>{
  if(!expanded)return;const controller=new AbortController(),gen=++generation.current;setRows(null);setLoading(true);setError('');setDone('');
  void groupFetch('/api/student-promotions?cycle='+cycle,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json() as {error?:string;items:Row[]};if(!r.ok)throw Error(d.error||'晋级名单暂时无法加载，请重试');if(gen!==generation.current)return;setRows(d.items);setSelected(d.items.filter((x:Row)=>x.eligible).map((x:Row)=>x.student));}).catch(e=>{if(!controller.signal.aborted)setError(t(e.message));}).finally(()=>{if(gen===generation.current)setLoading(false);});
  return()=>{controller.abort();generation.current++;};
 },[expanded,cycle,reload]);
 async function promote(){
  if(busy||!rows||!selected.length)return;
  if(!window.confirm(t('确认将选中的学生晋升至所列下一年级？历史课程和成绩会保留原记录。')))return;
  setBusy(true);setError('');setDone('');
  try{const response=await groupFetch('/api/student-promotions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cycle,students:rows.filter(r=>selected.includes(r.student))})}),data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error||'请刷新名单确认晋级结果后再重试');setRows(old=>old?.map(r=>selected.includes(r.student)?{...r,eligible:false,reason:'此学年已晋级'}:r)||null);setSelected([]);setDone(t('所选学生已晋级'));window.dispatchEvent(new Event('tickminder-roster-updated'));}catch(e){setError(t((e as Error).message));}finally{setBusy(false);}
 }
 if(!can("students.promote"))return null;
 return <details className="student-promotions" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>{t('年度批量晋级')}</summary><p className="field-hint">{t('先核对下一年级，取消勾选留级或暂不晋级的学生。毕业、年级待补充及已晋级的学生不会自动处理。')}</p><label>{t('新学年')}<input type="number" min={2000} max={2200} step={1} disabled={busy} value={cycle} onChange={e=>setCycle(Number(e.target.value))}/></label>{loading&&<p role="status">{t('正在加载…')}</p>}{error&&<p className="error" role="alert">{error}</p>}{done&&<p role="status">{done}</p>}{rows&&<><div className="button-row"><Button disabled={busy} size="sm" variant="outline" onClick={()=>setSelected(rows.filter(r=>r.eligible).map(r=>r.student))}>{t('全选可晋级学生')}</Button><Button disabled={busy} size="sm" variant="outline" onClick={()=>setSelected([])}>{t('取消全选')}</Button></div><ul className="promotion-list">{rows.map(r=><li key={r.student}><label className="check-row"><input type="checkbox" disabled={busy||!r.eligible} checked={selected.includes(r.student)} onChange={e=>setSelected(old=>e.target.checked?[...old,r.student]:old.filter(n=>n!==r.student))}/><span><strong>{r.student}</strong><small>{r.syllabus} · {r.fromGrade||t('年级待补充')}{r.toGrade?` → ${r.toGrade}`:''}{r.reason?` · ${t(r.reason)}`:''}</small></span></label></li>)}</ul>{!rows.length&&<p>{t('暂无学生')}</p>}<Button disabled={busy||!selected.length} onClick={()=>void promote()}>{t(busy?'正在保存…':'确认所选学生晋级')} ({selected.length})</Button></>}{error&&<Button variant="outline" disabled={busy} onClick={()=>setReload(x=>x+1)}>{t('刷新名单')}</Button>}</details>;
}
