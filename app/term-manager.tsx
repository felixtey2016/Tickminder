"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { useDialogState } from "@/lib/use-dialog-state";
import { t } from "@/lib/i18n";
export type Term = {id:string;name:string;isCurrent:number|boolean};
export function TermManager({terms,mutate,busy}:{terms:Term[];mutate:(body:Record<string,unknown>)=>Promise<{ok:boolean}>;busy:boolean}){
 const [open,setOpen]=useDialogState<boolean|null>("term-manager",null);
 const [id,setId]=useState(""),[name,setName]=useState(""),[isCurrent,setCurrent]=useState(false);
 return <><Button type="button" size="sm" variant="outline" onClick={()=>{setId("");setName("");setCurrent(false);setOpen(true);}}>{t("管理学期")}</Button><Dialog open={Boolean(open)} onOpenChange={next=>setOpen(next?true:null)}><DialogContent className="lesson-dialog"><DialogHeader><DialogTitle>{t("管理学期")}</DialogTitle></DialogHeader><p className="muted">{t("学期用于整理班级，不会更改课程、功课日期或课时。旧班级可在编辑时归入学期。")}</p><form onSubmit={async e=>{e.preventDefault();if(await mutate({action:"saveTerm",id,name,isCurrent}).then(r=>r.ok)){setId("");setName("");setCurrent(false);}}}><label>{t("学期名称")}<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder={t("例如：2026 下半年")}/></label><label className="check-row"><input type="checkbox" checked={isCurrent} onChange={e=>setCurrent(e.target.checked)}/>{t("设为当前学期")}</label><div className="learning-card-actions"><Button disabled={busy}>{t("保存学期")}</Button>{id&&<Button type="button" variant="outline" onClick={()=>{setId("");setName("");setCurrent(false);}}>{t("新增学期")}</Button>}</div></form>{terms.map(term=><div className="user-row" key={term.id}><strong>{term.name}{term.isCurrent?` · ${t("当前学期")}`:""}</strong><Button type="button" size="sm" variant="outline" onClick={()=>{setId(term.id);setName(term.name);setCurrent(Boolean(term.isCurrent));}}>{t("编辑")}</Button></div>)}</DialogContent></Dialog></>;
}
