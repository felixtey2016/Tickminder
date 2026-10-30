/** Ordinary contact details are self-declared, never proof of WhatsApp ownership. */
export type StudentContactKind='student'|'parent';
export type StudentContactInput={phone:string;kind:StudentContactKind};
export type StudentContactFields={contactPhone?:string|null;contactPhoneKind?:string|null;contactPhoneUpdatedAt?:string|null};
export class StudentContactError extends Error {constructor(message:string,readonly status=400){super(message);}}
const english:Record<string,string>={
 '请填写含国家代码的联系电话，例如 +60123456789':'Enter a phone number with its country code, for example +60123456789.',
 '请选择学生本人或家长的联系电话':'Choose whether this is the student’s or parent’s phone number.',
 '联系电话资料格式无效':'The contact details are invalid.',
 '请先完成登录账号设置':'Complete your login setup first.',
 '只有当前学生可以修改自己的联系电话':'Only the current student can update their contact number.',
 '学生账号或联系电话已改变，请刷新后重试':'The student account or contact number changed. Refresh and try again.',
 '联系电话暂时无法保存，请稍后重试':'The contact number could not be saved. Please try again.',
 '登录已过期，请重新登录':'Your session expired. Please sign in again.',
 '请求来源无效':'This request is not allowed.',
};
export function studentContactMessage(message:string,language:'zh'|'en'){return language==='en'?(english[message]||message):message;}
export function normalizeStudentContactPhone(value:unknown){
 if(typeof value!=='string'||value.length>40||!/^[+0-9 ()\-]+$/.test(value))throw new StudentContactError('请填写含国家代码的联系电话，例如 +60123456789');
 const digits=value.trim().replace(/[ ()\-]/g,'').replace(/^00/,'+');
 const phone=digits.startsWith('+')?digits:'+'+digits;
 if(!/^\+[1-9][0-9]{7,14}$/.test(phone))throw new StudentContactError('请填写含国家代码的联系电话，例如 +60123456789');
 return phone;
}
export function parseStudentContactInput(value:unknown):StudentContactInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new StudentContactError('联系电话资料格式无效');
 const data=value as Record<string,unknown>;
 if(Object.keys(data).some(key=>!['phone','kind'].includes(key)))throw new StudentContactError('联系电话资料格式无效');
 if(data.kind!=='student'&&data.kind!=='parent')throw new StudentContactError('请选择学生本人或家长的联系电话');
 return{phone:normalizeStudentContactPhone(data.phone),kind:data.kind};
}
export function hasStudentContact(value:StudentContactFields|null|undefined){
 return Boolean(value&&typeof value.contactPhone==='string'&&/^\+[1-9][0-9]{7,14}$/.test(value.contactPhone)&&['student','parent'].includes(value.contactPhoneKind||'')&&typeof value.contactPhoneUpdatedAt==='string'&&Number.isFinite(Date.parse(value.contactPhoneUpdatedAt)));
}
export function studentContactRequired(account:(StudentContactFields&{role:string;studentName?:string|null;disabledAt?:string|null;nameConfirmedAt?:string|null})|null|undefined,ready:boolean){
 return Boolean(ready&&account?.role==='student'&&account.studentName&&!account.disabledAt&&account.nameConfirmedAt&&!hasStudentContact(account));
}
