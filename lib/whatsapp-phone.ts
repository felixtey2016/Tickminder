export function normalizeWhatsAppPhone(value: unknown) {
  if(typeof value!=='string'||value.length>40)throw new Error('请填写含国家代码的 WhatsApp 号码，例如 +60123456789');
  const phone=value.trim().replace(/[\s()+-]/g,'').replace(/^00/,'');
  if(!/^[1-9][0-9]{7,14}$/.test(phone))throw new Error('请填写含国家代码的 WhatsApp 号码，例如 +60123456789');
  return phone;
}
export function whatsappIdentity(account:{id?:string;role:string;name:string;teacherName?:string|null;studentName?:string|null}) {
  // Administrators bind their own stable account, never an inferred teacher/student.
  return account.role==='teacher'?account.teacherName:account.role==='student'?account.studentName:account.role==='pending'?account.name:account.role==='admin'?account.id:null;
}
