"use client";
import type {AcademicCatalogue} from '@/lib/academic-catalogue';
import {t} from '@/lib/i18n';
export type StudentProfile={syllabusId:string;grade:string;age:string};
export function StudentProfileFields({catalogue,value,onChange,disabled=false}:{catalogue:AcademicCatalogue|null;value:StudentProfile;onChange:(value:StudentProfile)=>void;disabled?:boolean}){
 const syllabuses=(catalogue?.syllabuses||[]).filter(item=>item.active||item.id===value.syllabusId),syllabus=syllabuses.find(item=>item.id===value.syllabusId);
 const gradeLabel=t(value.syllabusId==='stpm'?'学期（可选）':value.syllabusId==='a-level'?'阶段（可选）':'年级（可选）');
 return <>
  <label>{t('课程体系')}<select aria-label={t('课程体系')} required disabled={disabled||!catalogue} value={value.syllabusId} onChange={event=>onChange({...value,syllabusId:event.target.value,grade:''})}><option value="">{t('请选择')}</option>{syllabuses.map(item=><option key={item.id} value={item.id}>{item.name}{!item.active?` · ${t('已停用')}`:''}</option>)}</select></label>
  <label>{gradeLabel}<select aria-label={gradeLabel} disabled={disabled||!syllabus} value={value.grade} onChange={event=>onChange({...value,grade:event.target.value})}><option value="">{t('尚未填写')}</option>{syllabus?.grades.map(grade=><option key={grade}>{grade}</option>)}</select></label>
  <label>{t('年龄（可选）')}<input aria-label={t('年龄（可选）')} type="number" min="0" max="100" step="1" disabled={disabled} value={value.age} onChange={event=>onChange({...value,age:event.target.value})}/></label>
 </>;
}
