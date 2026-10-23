const fields=['first_submission_at','first_submission_by','explicit_locked_at','explicit_locked_by','explicit_lock_reason'];
/** Nullable additions preserve pre-window snapshots without inventing a submission time. */
export function checkRestoredAttendanceWindow(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='class_sessions'").get())return;
 const columns=db.prepare('PRAGMA table_info(class_sessions)').all().map(row=>row.name),present=fields.filter(field=>columns.includes(field)).length;
 if(!present)return;
 const fail=()=>{throw Error('Restored attendance submission window or explicit lock is invalid');};
 if(present!==fields.length)fail();
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const text=v=>typeof v==='string'&&v.length>0&&v.length<=500&&!/[\x00-\x1f\x7f]/.test(v);
 for(const row of db.prepare('SELECT '+fields.join(',')+' FROM class_sessions').all()){
  if(row.first_submission_at!==null&&!stamp(row.first_submission_at))fail();
  if(row.first_submission_by!==null&&!text(row.first_submission_by))fail();
  if((row.first_submission_at===null)!==(row.first_submission_by===null))fail();
  const locked=row.explicit_locked_at!==null;
  if(locked&&(!stamp(row.explicit_locked_at)||!text(row.explicit_locked_by)||!text(row.explicit_lock_reason)||row.explicit_lock_reason.trim().length===0))fail();
  if(!locked&&(row.explicit_locked_by!==null||row.explicit_lock_reason!==null))fail();
 }
}
