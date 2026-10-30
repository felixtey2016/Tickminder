"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { Building2,ArrowRight,Copy,Plus,ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { PageState } from "@/components/page-state";
import { groupFetch } from "@/lib/group-client";
import { t } from "@/lib/i18n";
import { readApiJson,showActionToast } from "@/lib/action-feedback";
import { AcademicCatalogueAdmin } from './academic-catalogue-admin';
import './settings-compact.css';
import {SystemDiagnostics} from './system-diagnostics';

type Group={id:string;name:string;joinCode:string;active:boolean|number;admins?:number;teachers?:number;students?:number;classrooms?:number;chiefAdminId?:string|null;adminOptions?:{id:string;name:string}[]};
async function api(data?:Record<string,unknown>) {
  const response=await groupFetch("/api/groups",data?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data),cache:"no-store"}:{cache:"no-store"});
  const result=await readApiJson<{error?:string;groups?:Group[]}>(response);
  if(!response.ok)throw new Error(t(result.error||"请求失败"));
  return result;
}
function focusGroupControl(element:HTMLElement|null) {
  requestAnimationFrame(()=>{
    if(!element?.isConnected)return;
    element.focus({preventScroll:true});
    const bounds=element.getBoundingClientRect(),top=Math.max(0,document.querySelector(".topbar")?.getBoundingClientRect().bottom||0)+12;
    if(bounds.top<top||bounds.bottom>window.innerHeight-12)window.scrollTo({top:Math.max(0,window.scrollY+bounds.top-top),behavior:"smooth"});
  });
}
export function GroupConsole({isOwner,currentGroupId}:{isOwner:boolean;currentGroupId?:string|null}) {
  const [groups,setGroups]=useState<Group[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[name,setName]=useState(""),[editing,setEditing]=useState<string|null>(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [chiefDrafts,setChiefDrafts]=useState<Record<string,string>>({});
  const [chiefConfirmation,setChiefConfirmation]=useState<{group:Group;chiefAdminId:string}|null>(null);
  const createSummary=useRef<HTMLElement>(null),createForm=useRef<HTMLFormElement>(null),nameInput=useRef<HTMLInputElement>(null);
  function closeCreate(restoreFocus=createForm.current?.contains(document.activeElement)) {
    setCreateOpen(false);
    if(restoreFocus)focusGroupControl(createSummary.current);
  }
  const [origin,setOrigin]=useState("");useEffect(()=>setOrigin(window.location.origin),[]);
  const load=useCallback(async()=>{try{setError("");const result=await api();setGroups(result.groups||[]);}catch(e){setError((e as Error).message);}},[]);
  useEffect(()=>{void load();},[load]);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(busy)return;const restoreFocus=createForm.current?.contains(document.activeElement);setBusy(true);setError("");
    try{const old=groups?.find(g=>g.id===editing);await api({action:editing?"update":"create",id:editing,name,active:old?Boolean(old.active):true});setName("");setEditing(null);closeCreate(restoreFocus);await load();showActionToast("success","集团设置已保存");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
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
  async function setChief(){
    if(!chiefConfirmation)return;
    const {group,chiefAdminId}=chiefConfirmation;
    if(!chiefAdminId||chiefAdminId===group.chiefAdminId||!group.adminOptions?.some(admin=>admin.id===chiefAdminId))return;
    if(busy)return;setBusy(true);setError('');
    try{
      await api({action:'setChief',id:group.id,chiefAdminId,expectedChiefAdminId:group.chiefAdminId||null});
      setChiefConfirmation(null);
      setChiefDrafts(drafts=>{const next={...drafts};delete next[group.id];return next;});
      await load();showActionToast('success','admin.chiefSaved');
    }catch(e){
      setChiefConfirmation(null);
      setChiefDrafts(drafts=>{const next={...drafts};delete next[group.id];return next;});
      await load();setError((e as Error).message);
    }finally{setBusy(false);}
  }
  function chiefName(group:Group){return group.chiefAdminId?group.adminOptions?.find(admin=>admin.id===group.chiefAdminId)?.name||t('admin.chiefUnavailable'):t('admin.chiefUnassigned');}
  if(!groups)return <PageState kind={error?"error":"loading"} title={error||"正在加载…"} action={error?"重试":undefined} onAction={()=>void load()}/>;
  return <div className="group-console">
    {isOwner&&<details className="panel group-create-disclosure settings-disclosure" open={createOpen} onToggle={event=>setCreateOpen(event.currentTarget.open)}><summary ref={createSummary}><span>{t(editing?"编辑集团名称":"新增补习集团")}</span><ChevronDown size={18} aria-hidden="true"/></summary><form ref={createForm} className="group-create" onSubmit={save}><label>{t("集团名称")}<input ref={nameInput} required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><div className="button-row settings-actions"><Button disabled={busy}><Plus size={16}/>{t(editing?"保存修改":"创建集团")}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(null);setName("");closeCreate();}}>{t("取消")}</Button>}</div></form></details>}
    {error&&<div className="error" role="alert">{error}</div>}
    <div className="group-list">{groups.map(group=>{const selectedChief=chiefDrafts[group.id]??group.chiefAdminId??'',availableChiefs=group.adminOptions||[];return <section className="panel group-entry" key={group.id}>
      <div className="group-heading"><Building2 size={24} aria-hidden="true"/><div className="group-heading-copy"><h2>{group.name}</h2><p>{t(group.active?"已启用":"已停用")}{group.id===currentGroupId&&` · ${t("当前集团")}`}</p></div></div>
      {isOwner&&<dl className="group-counts"><div><dt>{t("管理员")}</dt><dd>{group.admins||0}</dd></div><div><dt>{t("老师")}</dt><dd>{group.teachers||0}</dd></div><div><dt>{t("学生")}</dt><dd>{group.students||0}</dd></div><div><dt>{t("班级")}</dt><dd>{group.classrooms||0}</dd></div></dl>}
      {isOwner&&<details className="group-chief-settings settings-disclosure">
        <summary><span>{t('admin.groupChief')}</span><strong>{chiefName(group)}</strong><ChevronDown size={18} aria-hidden="true"/></summary><div className="group-chief-controls">
        <p className="field-hint">{t('admin.chiefScope')}</p>
        <label>{t('admin.chiefSelect')}<select aria-label={t('admin.chiefSelect')+' · '+group.name} disabled={busy||!availableChiefs.length} value={selectedChief} onChange={event=>setChiefDrafts(drafts=>({...drafts,[group.id]:event.target.value}))}>
          <option value="" disabled>{t('admin.chiefSelectPlaceholder')}</option>
          {group.chiefAdminId&&!availableChiefs.some(admin=>admin.id===group.chiefAdminId)&&<option value={group.chiefAdminId} disabled>{t('admin.chiefUnavailable')}</option>}
          {availableChiefs.map(admin=><option key={admin.id} value={admin.id}>{admin.name}</option>)}
        </select></label>
        {!availableChiefs.length&&<p className="field-hint">{t('admin.chiefNoCandidates')}</p>}
        <div className="settings-actions"><Button variant="outline" disabled={busy||!selectedChief||selectedChief===group.chiefAdminId||!availableChiefs.some(admin=>admin.id===selectedChief)} onClick={()=>{setError('');setChiefConfirmation({group,chiefAdminId:selectedChief});}}>{t(group.chiefAdminId?'admin.chiefTransfer':'admin.chiefAssign')}</Button></div>
      </div></details>}
      {isOwner&&<div className="group-entry-primary settings-actions"><Button disabled={busy} onClick={()=>void enter(group)}>{t("管理此集团")}<ArrowRight size={16}/></Button></div>}
      <details className="group-invitation settings-disclosure"><summary><span>{t("新用户邀请链接")}</span><ChevronDown size={18} aria-hidden="true"/></summary><div className="group-invitation-content"><label>{t("新用户邀请链接")}<input readOnly value={origin?`${origin}/?group=${group.joinCode}`:""}/></label><p className="field-hint">{t("新用户通过此链接使用 Google 注册后，归入此集团并等待管理员分配角色。已有账号所属集团不变。")}</p><div className="settings-actions"><Button variant="outline" disabled={busy} onClick={()=>void copy(group)}><Copy size={16}/>{t("复制注册链接")}</Button></div></div></details>
      {isOwner&&<details className="group-entry-management settings-disclosure"><summary><span>{t("更多操作")}</span><ChevronDown size={18} aria-hidden="true"/></summary><div className="group-management-content"><div className="button-row settings-actions"><Button variant="outline" disabled={busy} onClick={()=>{setEditing(group.id);setName(group.name);setCreateOpen(true);focusGroupControl(nameInput.current);}}>{t("修改名称")}</Button><Button variant="outline" disabled={busy} onClick={()=>void toggle(group)}>{t(group.active?"停用集团":"启用集团")}</Button></div></div></details>}
    </section>;})}</div>
    {isOwner&&<SystemDiagnostics groups={groups} currentGroupId={currentGroupId}/>}{isOwner&&<AcademicCatalogueAdmin/>}
    <Dialog open={Boolean(chiefConfirmation)} onOpenChange={open=>{if(!open&&!busy)setChiefConfirmation(null);}}><DialogContent className="lesson-dialog group-chief-confirmation" showCloseButton={!busy}><DialogHeader><DialogTitle>{t(chiefConfirmation?.group.chiefAdminId?'admin.chiefConfirmTransfer':'admin.chiefConfirmAssign')}</DialogTitle><DialogDescription>{t('admin.chiefConfirmDescription')}</DialogDescription></DialogHeader>
      {chiefConfirmation&&<><dl className="group-chief-review"><div><dt>{t('集团名称')}</dt><dd>{chiefConfirmation.group.name}</dd></div><div><dt>{t('admin.chiefCurrent')}</dt><dd>{chiefName(chiefConfirmation.group)}</dd></div><div><dt>{t('admin.chiefNext')}</dt><dd>{chiefConfirmation.group.adminOptions?.find(admin=>admin.id===chiefConfirmation.chiefAdminId)?.name}</dd></div></dl><p className="group-chief-notice">{t(chiefConfirmation.group.chiefAdminId?'admin.chiefTransferNotice':'admin.chiefAssignNotice')}</p><div className="settings-actions"><Button variant="outline" disabled={busy} onClick={()=>setChiefConfirmation(null)}>{t('取消')}</Button><Button disabled={busy} onClick={()=>void setChief()}>{t('admin.chiefSave')}</Button></div></>}
    </DialogContent></Dialog>
  </div>;
}
