/** Check immutable extra-lesson decisions against their invoice and ledger.
 * Historical decisions keep their frozen schedule facts even after later edits. */
export function checkRestoredMonthlyExtras(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invoice_monthly_extra_decisions'").get())return;
 const fail=()=>{throw Error('Restored monthly extra decisions or ledger references are invalid');};
 const integer=(v,min=0,max=100000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const text=(v,max=1000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const parse=value=>{try{return JSON.parse(value);}catch{fail();}};
 const decisions=db.prepare('SELECT * FROM invoice_monthly_extra_decisions ORDER BY group_id,invoice_id,subject_key,confirmed_excess_count').all();
 const prior=new Map();
 for(const row of decisions){
  const invoice=db.prepare('SELECT * FROM invoices WHERE group_id=? AND id=?').get(row.group_id,row.invoice_id),op=db.prepare('SELECT * FROM invoice_finance_operations WHERE group_id=? AND operation_id=?').get(row.group_id,row.operation_id),event=row.event_id?db.prepare('SELECT * FROM invoice_finance_events WHERE group_id=? AND id=?').get(row.group_id,row.event_id):null;
  const version=db.prepare('SELECT v.*,r.student_id,r.subject_key FROM billing_rate_versions v JOIN billing_rates r ON r.group_id=v.group_id AND r.id=v.rate_id WHERE v.group_id=? AND v.id=?').get(row.group_id,row.rate_version_id);
  if(!invoice||invoice.status!=='issued'||invoice.billing_scope!=='monthly'||invoice.student_id!==row.student_id||!op||op.action!=='confirmMonthlyExtra'||op.actor_id!==row.actor_id||op.created_at!==row.created_at||!version||version.student_id!==row.student_id||version.subject_key!==row.subject_key||version.mode!=='month'||version.included_sessions!==row.included_sessions)fail();
  if(!text(row.id,100)||!text(row.reason)||!text(row.actor_id,200)||!instant(row.created_at)||!integer(row.included_sessions,1,62)||!integer(row.scheduled_sessions)||!integer(row.previous_excess_count)||!integer(row.confirmed_excess_count,row.previous_excess_count+1)||row.confirmed_excess_count!==Math.max(0,row.scheduled_sessions-row.included_sessions)||!integer(row.amount_cents)||!/^[a-f0-9]{64}$/.test(row.basis_hash))fail();
  const result=parse(op.result_json),source=parse(row.source_json),allowance=source?.allowance,facts=source?.lessonFacts;
  if(result?.ok!==true||result.invoiceId!==row.invoice_id||result.decisionId!==row.id||result.eventId!==row.event_id||result.approvedAmountCents!==row.amount_cents||result.confirmedExcessCount!==row.confirmed_excess_count||!integer(result.invoiceRevision))fail();
  if(!allowance||allowance.includedSessions!==row.included_sessions||allowance.scheduledSessions!==row.scheduled_sessions||allowance.extraSessions!==row.confirmed_excess_count||!Array.isArray(allowance.rateVersionIds)||allowance.rateVersionIds.length!==1||allowance.rateVersionIds[0]!==row.rate_version_id||!Array.isArray(allowance.lessonIds)||!Array.isArray(facts)||facts.length<row.scheduled_sessions||new Set(facts.map(x=>x.id)).size!==facts.length||JSON.stringify(facts.map(x=>x.id).sort())!==JSON.stringify([...allowance.lessonIds].sort()))fail();
  for(const fact of facts)if(!text(fact.id,100)||!instant(fact.start)||!instant(fact.end)||Date.parse(fact.end)<=Date.parse(fact.start)||!text(fact.subject,200)||fact.replacement!==null&&!text(fact.replacement,100))fail();
  const key=JSON.stringify([row.group_id,row.invoice_id,row.subject_key]),previous=prior.get(key);
  const doc=parse(invoice.document_json),initial=doc.sourceLines?.find(line=>line.subjectKey===row.subject_key&&line.monthlyExtra&&line.status!=='pending'&&line.amountCents!==null);
  if(row.previous_excess_count!==(previous?.confirmed_excess_count??initial?.monthlyAllowance?.extraSessions??0))fail();
  if(row.amount_cents===0){if(row.event_id!==null||event)fail();}
  else if(!event||event.kind!=='charge'||event.invoice_id!==row.invoice_id||event.operation_id!==row.operation_id||event.amount_cents!==row.amount_cents||event.actor_id!==row.actor_id||event.reason!==row.reason||event.expected_revision+1!==result.invoiceRevision)fail();
  prior.set(key,row);
 }
 for(const op of db.prepare("SELECT group_id,operation_id FROM invoice_finance_operations WHERE action='confirmMonthlyExtra'").all())if(decisions.filter(row=>row.group_id===op.group_id&&row.operation_id===op.operation_id).length!==1)fail();
}
