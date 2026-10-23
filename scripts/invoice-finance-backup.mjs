export const INVOICE_FINANCE_TABLES=['invoice_finance_accounts','invoice_finance_operations','invoice_payments','invoice_receipt_sequences','invoice_receipts','invoice_finance_events','invoice_attendance_corrections'];
export const INVOICE_FINANCE_REPLAY_TRIGGERS=['invoice_finance_account_insert','invoice_finance_event_guard','invoice_finance_event_apply','invoice_correction_open'];

/** Reconcile immutable ledger history instead of trusting cached money totals. */
export function checkRestoredInvoiceFinance(db){
 const present=INVOICE_FINANCE_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
 if(!present.length)return;
 const fail=()=>{throw Error('Restored invoice finance ledger, receipt or balance is invalid');};
 if(present.length!==INVOICE_FINANCE_TABLES.length)fail();
 const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<=100000000;
 const text=(v,max=2000)=>typeof v==='string'&&v.length<=max;
 const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const inheritedInstant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const json=v=>{try{return JSON.parse(v);}catch{fail();}};
 const payments=db.prepare('SELECT * FROM invoice_payments').all(),receipts=db.prepare('SELECT * FROM invoice_receipts').all(),events=db.prepare('SELECT * FROM invoice_finance_events').all(),accounts=db.prepare('SELECT * FROM invoice_finance_accounts').all();
 const identity=(group,id)=>JSON.stringify([group,id]),accountMap=new Map(accounts.map(a=>[identity(a.group_id,a.invoice_id),a]));
 const prepaymentEvents=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='prepayment_events'").get()?db.prepare("SELECT * FROM prepayment_events WHERE kind IN('apply','release')").all():[];
 const receiptBalances=new Map();
 const operations=new Map(db.prepare('SELECT * FROM invoice_finance_operations').all().map(o=>{
  const result=json(o.result_json);
  if(!text(o.actor_id,200)||!o.actor_id||!text(o.action,100)||!o.action||!/^[a-f0-9]{64}$/.test(o.request_hash)||!text(o.execution_id,100)||!o.execution_id||!timestamp(o.created_at)||!result||result.ok!==true||typeof result.invoiceId!=='string'||!integer(result.revision,1))fail();
  return[identity(o.group_id,o.operation_id),o];
 }));
 for(const payment of payments){
  const account=accountMap.get(identity(payment.group_id,payment.invoice_id)),op=operations.get(identity(payment.group_id,payment.operation_id));
  if(!account||payment.student_id!==account.student_id||!op||op.actor_id!==payment.created_by||!integer(payment.amount_cents,1)||!timestamp(payment.paid_at)||!timestamp(payment.created_at)||!['cash','bank_transfer','duitnow','tng','other'].includes(payment.method)||!text(payment.reference)||!text(payment.notes))fail();
  if(events.filter(e=>e.group_id===payment.group_id&&e.payment_id===payment.id&&e.kind==='payment').length!==1||receipts.filter(r=>r.group_id===payment.group_id&&r.payment_id===payment.id).length!==1)fail();
 }
 for(const account of accounts){
  const invoice=db.prepare('SELECT * FROM invoices WHERE group_id=? AND id=?').get(account.group_id,account.invoice_id);
  if(!invoice||invoice.status!=='issued'||invoice.student_id!==account.student_id||invoice.total_cents!==account.original_total_cents||!integer(account.original_total_cents)||!timestamp(account.created_at)||!timestamp(account.updated_at))fail();
  const rows=[...events.filter(e=>e.group_id===account.group_id&&e.invoice_id===account.invoice_id),...prepaymentEvents.filter(e=>e.group_id===account.group_id&&e.invoice_id===account.invoice_id).map(e=>({...e,expected_revision:e.expected_invoice_revision,prepayment:true}))].sort((a,b)=>a.expected_revision-b.expected_revision);
  const totals={charge_cents:0,credit_cents:0,received_cents:0,reversed_cents:0,refunded_cents:0,...('prepayment_cents'in account?{prepayment_cents:0}:{})},paid=new Map();let voided=null;
  for(const [index,event]of rows.entries()){
   if(event.prepayment){
    const net=totals.received_cents-totals.reversed_cents-totals.refunded_cents+totals.prepayment_cents,due=account.original_total_cents+totals.charge_cents-totals.credit_cents;
    if(voided||event.expected_revision!==index||event.student_id!==account.student_id||!integer(event.amount_cents,1)||!timestamp(event.created_at)||!timestamp(event.occurred_at)||event.kind==='apply'&&event.amount_cents>due-net||event.kind==='release'&&event.amount_cents>totals.prepayment_cents)fail();
    totals.prepayment_cents+=event.kind==='apply'?event.amount_cents:-event.amount_cents;continue;
   }
   const op=operations.get(identity(event.group_id,event.operation_id));
   if(voided||event.expected_revision!==index||!op||op.actor_id!==event.actor_id||json(op.result_json).invoiceId!==account.invoice_id||!timestamp(event.occurred_at)||!timestamp(event.created_at)||!text(event.reason)||!text(event.notes)||!text(event.reference)||!['','cash','bank_transfer','duitnow','tng','other'].includes(event.method))fail();
   const amount=event.amount_cents,net=totals.received_cents-totals.reversed_cents-totals.refunded_cents+(totals.prepayment_cents||0),due=account.original_total_cents+totals.charge_cents-totals.credit_cents;
   if(!integer(amount,['void','attendance_correction'].includes(event.kind)?0:1)||event.kind!=='payment'&&!event.reason.trim())fail();
   if(event.kind==='payment'){
    const payment=payments.find(p=>p.id===event.payment_id&&p.group_id===event.group_id&&p.invoice_id===event.invoice_id);
    if(!payment||paid.has(event.payment_id)||payment.amount_cents!==amount||payment.operation_id!==event.operation_id||amount>due-net)fail();
    paid.set(event.payment_id,{amount,refunded:0,reversed:false});receiptBalances.set(identity(event.group_id,event.payment_id),{due,balance:due-net-amount});totals.received_cents+=amount;
   }else if(event.kind==='reverse'||event.kind==='refund'){
    const payment=paid.get(event.payment_id);if(!payment||payment.reversed)fail();
    const originalPayment=payments.find(p=>p.group_id===event.group_id&&p.id===event.payment_id);
    if(!originalPayment||Date.parse(event.occurred_at)<Date.parse(originalPayment.paid_at))fail();
    if(event.kind==='reverse'){if(payment.refunded||payment.amount!==amount)fail();payment.reversed=true;totals.reversed_cents+=amount;}
    else{if(amount>payment.amount-payment.refunded)fail();payment.refunded+=amount;totals.refunded_cents+=amount;}
   }else if(event.kind==='charge'){if(event.payment_id!==null||due+amount>100000000)fail();totals.charge_cents+=amount;}
   else if(event.kind==='credit'){if(event.payment_id!==null||amount>due-(totals.prepayment_cents||0))fail();totals.credit_cents+=amount;}
   else if(event.kind==='void'){if(event.payment_id!==null||amount!==0||net!==0)fail();voided=event;}
   else if(event.kind==='attendance_correction'){if(event.payment_id!==null||amount!==0)fail();}
   else fail();
  }
  if(account.revision!==rows.length||Object.entries(totals).some(([key,value])=>account[key]!==value))fail();
  if(voided?(account.voided_at!==voided.occurred_at||account.voided_by!==voided.actor_id||account.void_reason!==voided.reason):(account.voided_at!==null||account.voided_by!==null||account.void_reason!==''))fail();
 }
 for(const event of events)if(!accountMap.has(identity(event.group_id,event.invoice_id)))fail();
 for(const [key,operation]of operations){
  const related=events.filter(e=>identity(e.group_id,e.operation_id)===key).sort((a,b)=>a.expected_revision-b.expected_revision),result=json(operation.result_json);
  if(!related.length||result.revision!==related.at(-1).expected_revision+1||result.eventId!==related[0].id||related.some(e=>e.invoice_id!==result.invoiceId))fail();
  const allowed={recordPayment:['payment'],reversePayment:['reverse'],refund:['refund','credit'],adjust:['charge','credit'],void:['void'],correctAttendance:['attendance_correction','charge','credit']}[operation.action];
  if(!allowed||related.some(e=>!allowed.includes(e.kind)))fail();
  if(operation.action==='recordPayment'){
   const payment=payments.find(p=>identity(p.group_id,p.operation_id)===key),receipt=payment&&receipts.find(r=>r.group_id===payment.group_id&&r.payment_id===payment.id);
   if(!payment||!receipt||result.paymentId!==payment.id||result.receiptId!==receipt.id||result.number!==receipt.number)fail();
  }
 }
 for(const receipt of receipts){
  const payment=payments.find(p=>p.id===receipt.payment_id&&p.group_id===receipt.group_id),account=accountMap.get(identity(receipt.group_id,receipt.invoice_id)),doc=json(receipt.document_json);
  const sequence=db.prepare('SELECT * FROM invoice_receipt_sequences WHERE group_id=? AND year=?').get(receipt.group_id,receipt.sequence_year);
  if(!payment||!account||payment.invoice_id!==receipt.invoice_id||!sequence||!/^20\d\d$/.test(receipt.sequence_year)||!integer(receipt.sequence_value,1)||sequence.last_value<receipt.sequence_value||!timestamp(receipt.created_at))fail();
  const invoice=db.prepare('SELECT * FROM invoices WHERE group_id=? AND id=?').get(receipt.group_id,receipt.invoice_id),original=json(invoice.document_json);
  const balances=receiptBalances.get(identity(receipt.group_id,receipt.payment_id));
  if(!doc||doc.id!==receipt.id||doc.number!==receipt.number||doc.invoiceId!==receipt.invoice_id||doc.invoiceNumber!==invoice.number||doc.currency!=='MYR'||doc.amountCents!==payment.amount_cents||doc.paidAt!==payment.paid_at||doc.method!==payment.method||doc.reference!==payment.reference||doc.serviceMonth!==invoice.month||JSON.stringify(doc.student)!==JSON.stringify(original.student)||JSON.stringify(doc.institution)!==JSON.stringify(original.institution)||!balances||doc.invoiceTotalCents!==balances.due||doc.balanceAfterCents!==balances.balance||doc.createdAt!==payment.created_at||receipt.created_at!==payment.created_at)fail();
  if(!['standard','centered','brand'].includes(doc.institution.template)||!/^#[a-f0-9]{6}$/i.test(doc.institution.themeColor))fail();
  if(doc.institution.logoAssetId&&!db.prepare('SELECT 1 FROM invoice_brand_assets WHERE group_id=? AND id=?').get(receipt.group_id,doc.institution.logoAssetId))fail();
 }
 for(const seq of db.prepare('SELECT * FROM invoice_receipt_sequences').all())if(!/^20\d\d$/.test(seq.year)||!integer(seq.last_value,1))fail();
 const corrections=db.prepare('SELECT * FROM invoice_attendance_corrections').all();
 for(const row of corrections){
  const event=events.find(e=>e.group_id===row.group_id&&e.id===row.event_id),op=operations.get(identity(row.group_id,row.operation_id)),before=json(row.before_json),after=json(row.after_json);
  const invoice=db.prepare('SELECT document_json FROM invoices WHERE group_id=? AND id=?').get(row.group_id,row.invoice_id),doc=invoice&&json(invoice.document_json);
  if(row.active!==0||!timestamp(row.closed_at)||!timestamp(row.created_at)||row.closed_at<row.created_at||!event||event.kind!=='attendance_correction'||event.invoice_id!==row.invoice_id||event.operation_id!==row.operation_id||event.actor_id!==row.actor_id||event.reason!==row.reason||!op||op.action!=='correctAttendance'||op.actor_id!==row.actor_id||!before||!after||!doc||!doc.sourceLines.some(l=>l.lessonId===row.lesson_id))fail();
  if(before.id!==row.lesson_id||before.sessionId!==row.session_id||!Number.isSafeInteger(before.sessionRevision)||before.sessionRevision<1||before.student!==doc.student.name||after.reviewedBy!==row.actor_id||after.reviewedAt!==row.created_at||!['present','absent','late','early_leave','late_early'].includes(after.attendanceKind)||!['completed','student_absent'].includes(after.status)||![0,1].includes(after.chargeable))fail();
  if(after.attendanceKind==='absent'?(after.status!=='student_absent'||after.actualStart!==null||after.actualEnd!==null):(after.status!=='completed'||!inheritedInstant(after.actualStart)||!inheritedInstant(after.actualEnd)||Date.parse(after.actualStart)>=Date.parse(after.actualEnd)))fail();
 }
 for(const event of events.filter(e=>e.kind==='attendance_correction'))if(corrections.filter(c=>c.group_id===event.group_id&&c.event_id===event.id).length!==1)fail();
 if(db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
