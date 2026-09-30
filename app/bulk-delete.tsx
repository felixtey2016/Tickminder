"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogState } from "@/lib/use-dialog-state";
import { alertActionFailure, readApiJson } from "@/lib/action-feedback";
import { getLanguage, t } from "@/lib/i18n";
import type { Mutate } from "./directory-tools";
type RecordItem = {id:string;label:string};
type Preview = { items:Array<{id:string;label:string;date?:string;effects:Array<{table:string;count:number;retained:boolean}>;hours:number;checkedIn:number}>; blocked:Array<{id:string;error:string}>; fingerprint:string;previewAt:string };
const effectNames:Record<string,string> = {accounts:"账号",sessions:"登录会话",assignments:"账号科目关联",study_blocks:"个人学习安排",local_credentials:"密码登录",google_identities:"Google 登录关联",login_attempts:"登录尝试记录",plans:"学生科目绑定",teachers:"老师名单",students:"学生名单",lessons:"课程",reschedule_requests:"改期申请",homework:"功课",homework_recipients:"功课分配与分数",homework_submissions:"功课提交记录",teaching_materials:"教学资料",material_recipients:"资料分配",classroom_announcements:"班级公告",classroom_members:"班级成员",classrooms:"班级"};
export function BulkDeleteTool({kind,records,mutate,busy,single=false,message}: {kind:string;records:RecordItem[];mutate:Mutate;busy:boolean;single?:boolean;message?:string}) {
  const [open,setOpen] = useDialogState<boolean|null>(`delete-preview-${kind}-${single?records[0]?.id:"bulk"}`,null);
  const [selected,setSelected] = useState<string[]>([]), [preview,setPreview] = useState<Preview|null>(null), [loading,setLoading] = useState(false);
  const inFlight = useRef(false);
  const chosen = selected.filter(id=>records.some(r=>r.id===id));
  async function loadPreview(ids:string[]) {
    if(inFlight.current || busy)return; inFlight.current=true;setLoading(true);setPreview(null);
    try {
      const response=await fetch("/api/manage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"previewDelete",entries:ids.map(id=>({kind,id}))})});
      const data=await readApiJson<Preview & {error?:string}>(response);
      if(!response.ok) throw new Error(t(data.error || "请求失败"));
      setPreview(data);
    }catch(e){alertActionFailure(e);}finally{setLoading(false);inFlight.current=false;}
  }
  function start(){setSelected(single?[records[0].id]:[]);setPreview(null);setOpen(true);if(single)void loadPreview([records[0].id]);}
  return <><Button type="button" size="sm" variant="outline" className="danger-action" disabled={busy||!records.length} onClick={start}>{t(single?"永久删除":"批量删除…")}</Button>
    <Dialog open={Boolean(open)} onOpenChange={next=>{if(!next&&!loading&&!busy)setOpen(null);}}><DialogContent className="lesson-dialog directory-dialog deletion-dialog"><DialogHeader><DialogTitle>{t(preview?"删除影响预览":"选择要删除的记录")}</DialogTitle></DialogHeader>
      <p className="muted">{t("永久删除无法恢复。历史操作日志保留；共用 PDF 仅在没有任何引用时清理。")}</p>{message&&<p>{t(message)}</p>}
      {!single&&!preview&&!loading&&<><div className="learning-card-actions"><Button type="button" variant="outline" size="sm" onClick={()=>setSelected(records.slice(0,50).map(r=>r.id))}>{t("选择当前列表（最多 50 条）")}</Button><Button type="button" size="sm" variant="outline" onClick={()=>setSelected([])}>{t("清空选择")}</Button></div><div className="delete-selection">{records.map(r=><label className="check-row" key={r.id}><input type="checkbox" checked={chosen.includes(r.id)} disabled={!chosen.includes(r.id)&&chosen.length>=50} onChange={e=>setSelected(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id))}/>{r.label}</label>)}</div><Button disabled={!chosen.length||busy} onClick={()=>void loadPreview(chosen)}>{t("预览删除影响")} · {chosen.length}</Button></>}
      {loading&&<p role="status">{t("正在核对删除影响…")}</p>}
      {single&&!preview&&!loading&&<Button onClick={()=>void loadPreview(chosen)}>{t("重新预览")}</Button>}
      {preview&&<><div className="delete-impact">{preview.items.map(item=><article key={item.id}><strong>{item.label}</strong>{item.date&&<small>{new Intl.DateTimeFormat(getLanguage()==="zh"?"zh-CN":"en-GB",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"medium",timeStyle:"short"}).format(new Date(item.date))}</small>}<ul>{item.effects.map((effect,i)=><li key={i}>{t(effect.retained?"保留，解除功课关联":"删除")} · {t(effectNames[effect.table]||"关联记录")}：{effect.count}</li>)}</ul>{kind==="lesson"&&<p>{t("已打卡课程")}：{item.checkedIn} · {t("已上课时减少")}：{item.hours.toFixed(2)} h</p>}</article>)}{preview.blocked.map(item=><article className="error" key={item.id}><strong>{records.find(r=>r.id===item.id)?.label||t("所选记录")}</strong><p>{t(item.error)}</p></article>)}</div>
        {["account","teacher","student","plan","classroom"].includes(kind)&&<p>{t("独立排课及历史课时保留。已导入 Google Sheet 的数字不会自动撤回。")}</p>}
        {kind==="lesson"&&<p>{t("网站课时统计将更新；已导入 Google Sheet 的数字不会自动撤回。")}</p>}
        {preview.blocked.length>0&&<p role="alert">{t("部分记录无法删除，请调整选择后重新预览。此次不会删除任何记录。")}</p>}
        <div className="learning-card-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>setPreview(null)}>{t("调整选择")}</Button><Button className="danger-action" disabled={busy||loading||preview.blocked.length>0||!preview.items.length} onClick={async()=>{if(inFlight.current)return;inFlight.current=true;try{if(await mutate({action:"permanentDelete",entries:chosen.map(id=>({kind,id})),fingerprint:preview.fingerprint,previewAt:preview.previewAt,confirm:true})){setOpen(null);setSelected([]);setPreview(null);}else setPreview(null);}finally{inFlight.current=false;}}}>{t("确认永久删除")} · {preview.items.length}</Button></div>
      </>}
    </DialogContent></Dialog></>;
}
