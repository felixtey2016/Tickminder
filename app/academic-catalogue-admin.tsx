"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {ChevronDown} from 'lucide-react';
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import type {AcademicCatalogue, CatalogueScope} from '@/lib/academic-catalogue';
import {groupFetch} from '@/lib/group-client';
import {t} from '@/lib/i18n';

/** Both catalogues are platform configuration, independent of the selected group. */
export function AcademicCatalogueAdmin(){
 const [scope,setScope]=useState<CatalogueScope>('student');
 return <section className="panel academic-catalogue-admin"><div className="settings-section-heading"><h2>{t('分类菜单管理')}</h2><p className="muted">{t('两套菜单分别管理。学生科目菜单适用于所有集团；Quiz 菜单适用于所有账号类型。')}</p></div><div className="button-row settings-actions catalogue-scope-actions" role="group" aria-label={t('选择分类菜单')}><Button aria-pressed={scope==='student'} variant={scope==='student'?'default':'outline'} onClick={()=>setScope('student')}>{t('学生科目菜单')}</Button><Button aria-pressed={scope==='quiz'} variant={scope==='quiz'?'default':'outline'} onClick={()=>setScope('quiz')}>{t('Quiz 菜单')}</Button></div><CatalogueEditor key={scope} scope={scope}/></section>;
}
function CatalogueEditor({scope}:{scope:CatalogueScope}){
 const {catalogue,loading,error,reload}=useAcademicCatalogue(scope);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const [syllabusName,setSyllabusName]=useState(''),[grades,setGrades]=useState(''),[syllabusId,setSyllabusId]=useState(''),[subjectName,setSubjectName]=useState(''),[aliases,setAliases]=useState(''),[newGrade,setNewGrade]=useState('');
 const list=catalogue?.syllabuses||[];
 const split=(value:string)=>value.split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
 async function save(syllabuses:AcademicCatalogue['syllabuses']){
  if(!catalogue||busy)return false;setBusy(true);setFailure('');setMessage('');
  try{const response=await groupFetch('/api/academic-catalogues',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scope,expectedRevision:catalogue.revision,syllabuses})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(t(result.error||'分类菜单未能保存，请重试'));await reload();setMessage(t('分类菜单已更新'));return true;}catch(e){setFailure((e as Error).message);return false;}finally{setBusy(false);}
 }
 if(!catalogue)return <div role={error?'alert':'status'}><p>{t(error||'正在加载…')}</p>{error&&<Button variant="outline" onClick={()=>void reload()}>{t('重试')}</Button>}</div>;
 return <div className="catalogue-editor" aria-busy={busy||loading}>
  <div className="catalogue-meta"><p className="field-hint">{t('停用后不再提供新选择，现有学生、班级和测验记录会保留。')}</p><span className="catalogue-version">{t('版本')} {catalogue.revision}</span></div>
  {(failure||message)&&<p role={failure?'alert':'status'} className={failure?'error':'success'}>{failure||message}</p>}
  {error&&<div role="alert" className="error settings-actions"><span>{t(error)}</span><Button size="sm" variant="outline" onClick={()=>void reload()}>{t('重试')}</Button></div>}
  <div className="catalogue-list">{list.map(s=><details key={s.id} className="settings-disclosure"><summary><span className="catalogue-syllabus-title">{s.name}</span><span className="catalogue-syllabus-meta">{s.subjects.filter(x=>x.active).length} {t('科目')}{!s.active&&` · ${t('已停用')}`}</span><ChevronDown size={18} aria-hidden="true"/></summary><div className="catalogue-syllabus-content"><div className="button-row settings-actions"><Button size="sm" disabled={busy} variant="outline" onClick={()=>void save(list.map(item=>item.id===s.id?{...item,active:!item.active}:item))}>{t(s.active?'停用 Syllabus':'启用 Syllabus')}</Button></div><p className="field-hint">{t('年级')}：{s.grades.join(' · ')||t('尚未设置')}</p>{s.subjects.map(subject=><div className="user-row catalogue-subject-row" key={subject.id}><div className="catalogue-subject-copy"><strong>{subject.name}</strong><small>{subject.aliases.join(' · ')}</small></div><Button disabled={busy} size="sm" variant="outline" onClick={()=>void save(list.map(item=>item.id===s.id?{...item,subjects:item.subjects.map(x=>x.id===subject.id?{...x,active:!x.active}:x)}:item))}>{t(subject.active?'停用':'恢复启用')}</Button></div>)}</div></details>)}</div>
  <div className="catalogue-additions">
    <details className="catalogue-addition settings-disclosure"><summary><span>{t('新增 Syllabus')}</span><ChevronDown size={18} aria-hidden="true"/></summary><fieldset disabled={busy} className="catalogue-controls"><legend className="sr-only">{t('新增 Syllabus')}</legend><form onSubmit={async e=>{e.preventDefault();const id=crypto.randomUUID();if(await save([...list,{id,name:syllabusName.trim(),active:true,grades:split(grades),subjects:[]}])){setSyllabusName('');setGrades('');setSyllabusId(id);}}}><label>{t('Syllabus 名称')}<input required maxLength={80} value={syllabusName} onChange={e=>setSyllabusName(e.target.value)} placeholder="UEC"/></label><label>{t('年级选项（用逗号分隔，可选）')}<input maxLength={1000} value={grades} onChange={e=>setGrades(e.target.value)} placeholder="Year 7, Year 8"/></label><Button>{t('添加 Syllabus')}</Button></form></fieldset></details>
    <details className="catalogue-addition settings-disclosure"><summary><span>{t('添加科目或年级')}</span><ChevronDown size={18} aria-hidden="true"/></summary><fieldset disabled={busy} className="catalogue-controls"><legend className="sr-only">{t('添加科目或年级')}</legend><label>{t('Syllabus')}<select required value={syllabusId} onChange={e=>setSyllabusId(e.target.value)}><option value="">{t('请选择')}</option>{list.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><form onSubmit={async e=>{e.preventDefault();if(!syllabusId)return;const subject={id:crypto.randomUUID(),name:subjectName.trim(),active:true,aliases:split(aliases)};if(await save(list.map(s=>s.id===syllabusId?{...s,subjects:[...s.subjects,subject]}:s))){setSubjectName('');setAliases('');}}}><label>{t('科目名称')}<input required maxLength={80} value={subjectName} onChange={e=>setSubjectName(e.target.value)}/></label><label>{t('科目别名（用逗号分隔，可选）')}<input maxLength={1000} value={aliases} onChange={e=>setAliases(e.target.value)}/></label><Button disabled={!syllabusId}>{t('添加科目')}</Button></form><form onSubmit={async e=>{e.preventDefault();if(!syllabusId)return;if(await save(list.map(s=>s.id===syllabusId?{...s,grades:[...s.grades,newGrade.trim()]}:s)))setNewGrade('');}}><label>{t('新增年级')}<input required maxLength={80} value={newGrade} onChange={e=>setNewGrade(e.target.value)}/></label><Button disabled={!syllabusId}>{t('添加年级')}</Button></form></fieldset></details>
  </div>
 </div>;
}
