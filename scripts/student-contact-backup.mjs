// Contact details are self-declared account metadata, never WhatsApp proof.
export const STUDENT_CONTACT_COLUMNS=['contact_phone','contact_phone_kind','contact_phone_updated_at'];
export function validStudentContact(row){
 const values=STUDENT_CONTACT_COLUMNS.map(key=>row[key]);
 if(values.every(value=>value===null))return true;
 return typeof values[0]==='string'&&/^\+[1-9][0-9]{7,14}$/.test(values[0])&&
  ['student','parent'].includes(values[1])&&typeof values[2]==='string'&&
  Number.isFinite(Date.parse(values[2]))&&new Date(values[2]).toISOString()===values[2];
}
export function checkRestoredStudentContacts(db){
 const fields=db.prepare('PRAGMA table_info(accounts)').all().map(row=>row.name),count=STUDENT_CONTACT_COLUMNS.filter(key=>fields.includes(key)).length;
 if(!count)return; // Historical snapshots retain their historical account schema.
 if(count!==STUDENT_CONTACT_COLUMNS.length)throw Error('Incomplete restored account contact schema');
 for(const row of db.prepare('SELECT contact_phone,contact_phone_kind,contact_phone_updated_at FROM accounts').all())if(!validStudentContact(row))throw Error('Invalid restored account contact');
}
