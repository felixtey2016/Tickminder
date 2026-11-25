// Account notification choices and re-enable cutoffs survive disaster recovery.
export const NOTIFICATION_PREFERENCE_COLUMNS=['account_id','courses_enabled','homework_enabled','fees_enabled','courses_since','homework_since','fees_since','updated_at'];
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function checkRestoredNotificationPreferences(db){
 const columns=db.prepare('PRAGMA table_info(notification_preferences)').all().map(row=>row.name);
 if(!columns.length)return; // Older snapshots retain their historical schema during verification.
 if(columns.sort().join('|')!==NOTIFICATION_PREFERENCE_COLUMNS.slice().sort().join('|'))throw Error('Incomplete restored notification preferences schema');
 const fail=()=>{throw Error('Invalid restored notification preferences');};
 if(db.prepare('SELECT 1 FROM notification_preferences p LEFT JOIN accounts a ON a.id=p.account_id WHERE a.id IS NULL LIMIT 1').get())fail();
 for(const row of db.prepare('SELECT * FROM notification_preferences').all()){
  if(typeof row.account_id!=='string'||!row.account_id||!instant(row.updated_at))fail();
  for(const category of ['courses','homework','fees'])if(![0,1].includes(row[category+'_enabled'])||(row[category+'_since']!==''&&!instant(row[category+'_since'])))fail();
 }
}
