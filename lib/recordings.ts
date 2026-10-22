export type RecordingStatus = 'draft' | 'published';
export type Recording = {
  id:string;classroomId:string;classroomTitle:string;subject:string;teacherName:string;sessionId:string|null;
  lessonDate:string;title:string;description:string;driveUrl:string;status:RecordingStatus;audienceMode:'classroom'|'selected';revision:number;
  createdAt:string;updatedAt:string;createdBy:string;canEdit:boolean;canDelete:boolean;recipientCount:number;
  students?:string[];
};
export class RecordingError extends Error { constructor(message:string,readonly status=400){super(message);} }
export const recordingText=(value:unknown)=>typeof value==='string'?value.trim():'';
export function recordingDate(value:unknown){
 const date=recordingText(value);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new RecordingError('请选择有效的上课日期');
 return date;
}
export function recordingDriveUrl(value:unknown){
 const raw=recordingText(value);let url:URL;
 try{url=new URL(raw);}catch{throw new RecordingError('请粘贴有效的 Google Drive 影片链接');}
 if(raw.length>2048||url.protocol!=='https:'||url.hostname.toLowerCase()!=='drive.google.com'||url.username||url.password||url.port)throw new RecordingError('只支持 https://drive.google.com 的影片链接');
 const match=url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|preview|edit))?\/?$/);
 const id=match?.[1]||(/^\/(?:open|uc)\/?$/.test(url.pathname)?url.searchParams.get('id'):null);
 if(!id||!/^[-A-Za-z0-9_]{10,200}$/.test(id))throw new RecordingError('请使用影片的分享链接，不能使用文件夹链接');
 const result=new URL('https://drive.google.com/file/d/'+id+'/view'),resourceKey=url.searchParams.get('resourcekey');
 if(resourceKey){if(!/^[-A-Za-z0-9_]{1,200}$/.test(resourceKey))throw new RecordingError('Google Drive 链接格式无效');result.searchParams.set('resourcekey',resourceKey);}
 return result.toString();
}
export function recordingStudents(value:unknown){
 if(!Array.isArray(value)||value.length>500||value.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>80))throw new RecordingError('请选择有效的班级学生');
 return [...new Set(value.map(v=>v.trim()))].sort();
}
export function recordingCursor(value:unknown):[string,string,string]|null{
 const raw=recordingText(value);if(!raw)return null;
 try{if(raw.length>500)throw Error();const data=JSON.parse(atob(raw));if(!Array.isArray(data)||data.length!==3||!/^\d{4}-\d{2}-\d{2}$/.test(data[0])||typeof data[1]!=='string'||data[1].length>40||typeof data[2]!=='string'||data[2].length>100)throw Error();return data as [string,string,string];}catch{throw new RecordingError('分页信息已失效，请刷新列表');}
}
