export const RESOURCE_TABLES=['resource_catalog','resource_assignments','resource_reports','resource_operations','file_extra_references'];
// History may outlive an account, public approval or an archived class. Restore
// its immutable relationships without reapplying today's publication decision.
export const RESOURCE_REPLAY_TRIGGERS=['resource_assignment_insert'];
export function checkRestoredResources(db){
 const count=db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN("+RESOURCE_TABLES.map(()=>'?').join(',')+")").get(...RESOURCE_TABLES).n;
 if(!count)return;if(count!==RESOURCE_TABLES.length)throw Error('Incomplete restored resource library');
 const fail=()=>{throw Error('Restored resource library is invalid');},stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const url=v=>{try{const u=new URL(v);return typeof v==='string'&&v.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.hostname.includes('.')&&!u.hostname.includes(':')&&!/^\d+(?:\.\d+){3}$/.test(u.hostname)&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.localhost');}catch{return false;}};
 if(db.prepare("SELECT 1 FROM resource_catalog r LEFT JOIN tuition_groups g ON g.id=r.group_id LEFT JOIN pdf_files f ON f.id=r.file_id WHERE g.id IS NULL OR r.kind='file' AND (f.id IS NULL OR f.group_id<>r.group_id OR r.public_status<>'private' OR r.license_type NOT IN('permission','original')) LIMIT 1").get())fail();
 for(const r of db.prepare('SELECT * FROM resource_catalog').all()){
  if(!r.owner_id||!r.title.trim()||r.title.length>200||r.description.length>3000||!r.syllabus_id||!r.syllabus_name||!r.source_name||r.source_name.length>200||!r.authorization_note||r.authorization_note.length>2000||!url(r.source_url)||r.kind==='link'&&!url(r.link_url)||!stamp(r.created_at)||!stamp(r.updated_at)||!Number.isSafeInteger(r.revision)||r.revision<1||r.public_status==='approved'&&(!r.approved_by||!stamp(r.approved_at))||r.public_requested_at!==null&&!stamp(r.public_requested_at))fail();
 }
 if(db.prepare("SELECT 1 FROM resource_assignments a LEFT JOIN resource_catalog r ON r.id=a.resource_id LEFT JOIN classrooms c ON c.id=a.classroom_id AND c.group_id=a.group_id LEFT JOIN classroom_folders f ON f.id=a.folder_id AND f.group_id=a.group_id AND f.classroom_id=a.classroom_id WHERE r.id IS NULL OR c.id IS NULL OR a.folder_id IS NOT NULL AND f.id IS NULL OR a.file_id IS NOT r.file_id OR r.kind='file' AND r.group_id<>a.group_id LIMIT 1").get())fail();
 for(const a of db.prepare('SELECT * FROM resource_assignments').all())if(!a.assigned_by||!stamp(a.created_at)||!stamp(a.updated_at))fail();
 if(db.prepare("SELECT 1 FROM resource_reports p LEFT JOIN resource_catalog r ON r.id=p.resource_id LEFT JOIN resource_assignments a ON a.id=p.assignment_id AND a.resource_id=p.resource_id AND a.group_id=p.group_id WHERE r.id IS NULL OR p.assignment_id IS NOT NULL AND a.id IS NULL OR r.kind='file' AND p.group_id<>r.group_id LIMIT 1").get())fail();
 for(const r of db.prepare('SELECT * FROM resource_reports').all())if(!r.reporter_id||!r.reason||!stamp(r.created_at)||(r.status==='resolved'&&(!r.resolved_by||!stamp(r.resolved_at))))fail();
 for(const o of db.prepare('SELECT * FROM resource_operations').all()){if(!o.actor_id||!o.action||!/^[a-f0-9]{64}$/.test(o.request_hash)||!stamp(o.created_at))fail();try{JSON.parse(o.result_json);}catch{fail();}}
 for(const r of db.prepare('SELECT * FROM file_extra_references').all()){
  const table=({pdf:'pdf_files',quiz_image:'quiz_images',invoice_logo:'invoice_brand_assets'})[r.asset_kind];
  if(r.asset_kind!=='pdf'||!table||!/^[a-z][a-z0-9_]{0,63}$/.test(r.source_kind)||!r.source_id||r.source_id.length>160||!stamp(r.created_at)||!db.prepare('SELECT 1 FROM '+table+' WHERE id=? AND group_id=?').get(r.file_id,r.group_id))fail();
 }
}
