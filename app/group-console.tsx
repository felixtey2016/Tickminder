"use client";
import { useCallback,useEffect,useState } from "react";
import { Building2,ArrowRight,Copy,Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state";
import { groupFetch } from "@/lib/group-client";
import { t } from "@/lib/i18n";
import { readApiJson,showActionToast } from "@/lib/action-feedback";

type Group={id:string;name:string;joinCode:string;active:boolean|number;admins?:number;teachers?:number;students?:number;classrooms?:number;chiefAdminId?:string|null;adminOptions?:{id:string;name:string}[]};
async function api(data?:Record<string,unknown>) {
  const response=await groupFetch("/api/groups",data?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data),cache:"no-store"}:{cache:"no-store"});
  const result=await readApiJson<{error?:string;groups?:Group[]}>(response);
  if(!response.ok)throw new Error(t(result.error||"请求失败"));
  return result;
}
export function GroupConsole({isOwner,currentGroupId}:{isOwner:boolean;currentGroupId?:string|null}) {
  const [groups,setGroups]=useState<Group[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[name,setName]=useState(""),[editing,setEditing]=useState<string|null>(null);
  const [origin,setOrigin]=useState("");useEffect(()=>setOrigin(window.location.origin),[]);
  const load=useCallback(async()=>{try{setError("");const result=await api();setGroups(result.groups||[]);}catch(e){setError((e as Error).message);}},[]);
  useEffect(()=>{void load();},[load]);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try{const old=groups?.find(g=>g.id===editing);await api({action:editing?"update":"create",id:editing,name,active:old?Boolean(old.active):true});setName("");setEditing(null);await load();showActionToast("success","集团设置已保存");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function enter(group:Group) {
    if(busy)return;setBusy(true);setError("");
    try{await api({action:"switch",id:group.id});sessionStorage.setItem("tickminder-group-view","home");window.location.assign("/");}catch(e){setError((e as Error).message);setBusy(false);}
  }
  async function toggle(group:Group) {
    if(busy)return;setBusy(true);setError("");
    try{await api({action:"update",id:group.id,name:group.name,active:!group.active});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function copy(group:Group) {
    try{await navigator.clipboard.writeText(`${window.location.origin}/?group=${encodeURIComponent(group.joinCode)}`);showActionToast("success","邀请链接已复制");}catch{setError(t("无法复制，请手动复制邀请链接"));}
  }
  async function setChief(group:Group,chiefAdminId:string){
    if(busy)return;setBusy(true);setError('');
    try{await api({action:'setChief',id:group.id,chiefAdminId:chiefAdminId||null});await load();showActionToast('success','quiz.chiefSaved');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(!groups)return <PageState kind={error?"error":"loading"} title={error||"正在加载…"} action={error?"重试":undefined} onAction={()=>void load()}/>;
  return <div className="group-console">
    {isOwner&&<form className="panel group-create" onSubmit={save}><h2>{t(editing?"编辑集团名称":"新增补习集团")}</h2><label>{t("集团名称")}<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><div className="button-row"><Button disabled={busy}><Plus size={16}/>{t(editing?"保存修改":"创建集团")}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(null);setName("");}}>{t("取消")}</Button>}</div></form>}
    {error&&<div className="error" role="alert">{error}</div>}
    <div className="group-list">{groups.map(group=><section className="panel group-entry" key={group.id}>
      <div className="group-heading"><Building2 size={24} aria-hidden="true"/><div><h2>{group.name}</h2><p>{t(group.active?"已启用":"已停用")}{group.id===currentGroupId&&` · ${t("当前集团")}`}</p></div></div>
      {isOwner&&<dl className="group-counts"><div><dt>{t("管理员")}</dt><dd>{group.admins||0}</dd></div><div><dt>{t("老师")}</dt><dd>{group.teachers||0}</dd></div><div><dt>{t("学生")}</dt><dd>{group.students||0}</dd></div><div><dt>{t("班级")}</dt><dd>{group.classrooms||0}</dd></div></dl>}
      {isOwner&&<label>{t('quiz.chiefAdmin')}<select aria-label={t('quiz.chiefAdmin')+' · '+group.name} disabled={busy} value={group.chiefAdminId||''} onChange={event=>void setChief(group,event.target.value)}><option value="">{t('quiz.noChiefAdmin')}</option>{group.chiefAdminId&&!group.adminOptions?.some(a=>a.id===group.chiefAdminId)&&<option value={group.chiefAdminId}>{t('quiz.chiefUnavailable')}</option>}{group.adminOptions?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><span className="field-hint">{t('quiz.chiefScope')}</span></label>}
      <label>{t("新用户邀请链接")}<input readOnly value={origin?`${origin}/?group=${group.joinCode}`:""}/></label>
      <p className="field-hint">{t("新用户通过此链接使用 Google 注册后，归入此集团并等待管理员分配角色。已有账号所属集团不变。")}</p>
      <div className="button-row"><Button variant="outline" disabled={busy} onClick={()=>void copy(group)}><Copy size={16}/>{t("复制注册链接")}</Button>{isOwner&&<><Button disabled={busy} onClick={()=>void enter(group)}>{t("管理此集团")}<ArrowRight size={16}/></Button><Button variant="outline" disabled={busy} onClick={()=>{setEditing(group.id);setName(group.name);window.scrollTo({top:0,behavior:"smooth"});}}>{t("修改名称")}</Button><Button variant="outline" disabled={busy} onClick={()=>void toggle(group)}>{t(group.active?"停用集团":"启用集团")}</Button></>}</div>
    </section>)}</div>
  </div>;
}
