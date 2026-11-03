"use client";

import {useId, type ReactNode} from "react";
import {ArrowRight, BookOpen, ClipboardCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {usePageHistoryState} from "@/lib/page-history";
import {getLanguage} from "@/lib/i18n";
import {TaskInbox} from "./task-inbox";
import "./homework-tasks-workspace.css";

const label=(zh:string,en:string)=>getLanguage()==="zh"?zh:en;

export function HomeworkTasksWorkspace({role,canHomework,canTasks,canReview,children,onOpenTask,onClasses}:{
  role:"admin"|"teacher"|"student";canHomework:boolean;canTasks:boolean;canReview:boolean;
  children:ReactNode;onOpenTask:(classroomId:string,taskId:string)=>void;onClasses:()=>void;
}){
  const id=useId();
  const [chosen,setChosen]=usePageHistoryState("homeworkTasks.tab",canHomework?"homework":"tasks");
  const tabs=[...(canHomework?[{id:"homework",text:label("功课","Homework"),Icon:BookOpen}]:[]),...(canTasks?[{id:"tasks",text:label("任务","Tasks"),Icon:ClipboardCheck}]:[])];
  const active=tabs.some(tab=>tab.id===chosen)?chosen:tabs[0]?.id;
  function choose(value:string){if(window.dispatchEvent(new Event("tickminder-navigate",{cancelable:true})))setChosen(value);}
  return <div className="homework-tasks-workspace" data-testid="homework-tasks-workspace">
    <div className="homework-tasks-tabs" role="tablist" aria-label={label("功课与任务","Homework and tasks")} onKeyDown={event=>{
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      event.preventDefault();const current=tabs.findIndex(tab=>tab.id===active),next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(current+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
      choose(tabs[next].id);document.getElementById(id+"-"+tabs[next].id)?.focus();
    }}>{tabs.map(tab=><button type="button" key={tab.id} id={id+"-"+tab.id} role="tab" aria-selected={active===tab.id} aria-controls={id+"-panel-"+tab.id} tabIndex={active===tab.id?0:-1} onClick={()=>choose(tab.id)}><tab.Icon size={18} aria-hidden="true"/>{tab.text}</button>)}</div>
    {canHomework&&<div role="tabpanel" id={id+"-panel-homework"} aria-labelledby={id+"-homework"} hidden={active!=="homework"}>{children}</div>}
    {canTasks&&<div role="tabpanel" id={id+"-panel-tasks"} aria-labelledby={id+"-tasks"} hidden={active!=="tasks"}>
      {active==="tasks"?<>
        {(role==="student"||canReview)&&<TaskInbox role={role} onOpen={onOpenTask}/>}
        <div className="homework-tasks-class-link"><Button type="button" variant="outline" onClick={onClasses}>{label("查看班级任务与记录","Class tasks and records")}<ArrowRight size={17} aria-hidden="true"/></Button></div>
      </>:null}
    </div>}
  </div>;
}
