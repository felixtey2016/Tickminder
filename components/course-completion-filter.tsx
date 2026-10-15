"use client";
import {t} from "@/lib/i18n";
import type {CourseCompletionFilter as Completion} from "@/lib/course-completion";
export function CourseCompletionFilter({value,onChange,testId}:{value:string;onChange:(value:Completion)=>void;testId:string}){
 return <label className="course-completion-field">{t("课程完成状态")}<select aria-label={t("课程完成状态")} data-testid={testId} value={['all','completed','incomplete'].includes(value)?value:'all'} onChange={event=>onChange(event.target.value as Completion)}><option value="all">{t("全部课程")}</option><option value="completed">{t("已完成")}</option><option value="incomplete">{t("未完成")}</option></select></label>;
}
