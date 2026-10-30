"use client";

import {useId,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {BRAND_NAME} from "@/lib/brand";
import {groupFetch} from "@/lib/group-client";
import {alertActionFailure,readApiJson,showActionToast} from "@/lib/action-feedback";
import {type Language,t} from "@/lib/i18n";
import {studentContactMessage} from "@/lib/student-contact";
import "./student-contact-onboarding.css";

export type StudentContactSaved={ok:true;contactPhone:string;contactPhoneKind:"student"|"parent";contactPhoneUpdatedAt:string};
export function StudentContactForm({name,initialPhone,initialKind,language,onSaved,onboarding=false}:{name:string;initialPhone?:string|null;initialKind?:"student"|"parent"|null;language:Language;onSaved:(contact:StudentContactSaved)=>Promise<void>;onboarding?:boolean}){
 const zh=language==="zh",id=useId(),[phone,setPhone]=useState(initialPhone||"+60"),[kind,setKind]=useState<"student"|"parent">(initialKind||"student"),[busy,setBusy]=useState(false),inFlight=useRef(false);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(inFlight.current)return;
  if(!phone.trim()){alertActionFailure(new Error(zh?"请输入包含国家区号的电话号码":"Enter a phone number with its country code."));return;}
  inFlight.current=true;setBusy(true);
  try{
   const response=await groupFetch("/api/student-contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone,kind})});
   const result=await readApiJson<StudentContactSaved&{error?:string}>(response);
   if(!response.ok)throw new Error(studentContactMessage(result.error||"保存失败，请重试",language));
   setPhone(result.contactPhone);setKind(result.contactPhoneKind);await onSaved(result);
   if(!onboarding)showActionToast("success",zh?"联系号码已保存":"Contact number saved.");
  }catch(error){alertActionFailure(error);}finally{inFlight.current=false;setBusy(false);}
 }
 return <form className="student-contact-form" onSubmit={submit} noValidate aria-busy={busy}>
  <label htmlFor={id+"-name"}>{zh?"学生姓名":"Student name"}<input id={id+"-name"} value={name} readOnly autoComplete="name" aria-readonly="true"/></label>
  <fieldset disabled={busy}><legend>{zh?"这是谁的号码？":"Whose number is this?"}</legend><div className="student-contact-kinds">{(["student","parent"] as const).map(value=><label key={value} className={kind===value?"selected":""}><input type="radio" name={id+"-kind"} value={value} checked={kind===value} onChange={()=>setKind(value)}/><span>{value==="student"?(zh?"学生本人":"Student"):(zh?"家长":"Parent")}</span></label>)}</div></fieldset>
  <div className="student-contact-phone"><label htmlFor={id+"-phone"}>{zh?"电话号码":"Phone number"}</label><input id={id+"-phone"} type="tel" inputMode="tel" autoComplete="tel" aria-label={zh?"电话号码":"Phone number"} maxLength={40} required disabled={busy} value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+60 12 345 6789" dir="ltr" aria-describedby={id+"-phone-hint"}/><small id={id+"-phone-hint"}>{zh?"请包含国家区号，例如 +60（马来西亚）、+65（新加坡）。":"Include the country code, e.g. +60 (Malaysia) or +65 (Singapore)."}</small></div>
  <Button type="submit" disabled={busy} className="student-contact-submit">{busy?(zh?"正在保存…":"Saving…"):onboarding?(zh?"保存并继续":"Save and continue"):(zh?"保存联系号码":"Save contact number")}</Button>
 </form>;
}
export function StudentContactOnboarding({name,language,changeLanguage,onCompleted,logout}:{name:string;language:Language;changeLanguage:(next:Language)=>void;onCompleted:()=>Promise<void>;logout:()=>Promise<void>}){
 const zh=language==="zh";
 return <main className="auth-shell"><div className="auth-card student-contact-onboarding">
  <div className="language-switch" role="group" aria-label={t("语言")}><button type="button" aria-pressed={zh} onClick={()=>changeLanguage("zh")}>中文</button><span className="language-divider" aria-hidden="true">|</span><button type="button" aria-pressed={!zh} onClick={()=>changeLanguage("en")}>EN</button></div>
  <span className="brand-logo"><img src="/tickminder-logo.svg" width="48" height="48" alt={BRAND_NAME}/></span><h1>{zh?"填写联系号码":"Add a contact number"}</h1><p>{zh?"填写学生本人或家长的电话号码，方便补习中心联系。":"Add the student's or a parent's phone number so your centre can contact you."}</p>
  <StudentContactForm name={name} language={language} onboarding onSaved={onCompleted}/>
  <Button type="button" variant="outline" className="student-contact-logout" onClick={logout}>{t("退出登录")}</Button>
 </div></main>;
}