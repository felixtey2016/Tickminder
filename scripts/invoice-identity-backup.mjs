/** Optional invoice identity fields extend existing JSON snapshots without a schema migration. */
const plain=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const text=(value,max,multiline=false)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&(multiline||!/[\r\n\t]/.test(value));
export function validInvoiceIssuerIdentity(value){
 if(!plain(value))return false;
 return [['legalName',160],['registrationNumber',80],['taxId',40],['sstRegistrationNumber',80]].every(([key,max])=>value[key]===undefined||text(value[key],max));
}
export function validInvoiceBillTo(value){
 if(value===undefined)return true;
 if(!plain(value)||!text(value.name,160)||!value.name.trim()||!text(value.address,700,true))return false;
 for(const [key,max]of [['email',200],['phone',80],['taxId',40],['registrationNumber',80]])if(value[key]!==undefined&&!text(value[key],max))return false;
 return !value.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email);
}
export function validInvoicePrintMetadata(doc){
 if(doc.extension?.printVersion!==undefined&&doc.extension.printVersion!==2)return false;
 for(const row of doc.lines||[]){
  if(row.rateOverride!==undefined&&typeof row.rateOverride!=='boolean')return false;
  if(row.quantity===undefined)continue;
  if(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0||row.quantity>Number.MAX_SAFE_INTEGER)return false;
  let quantity=0,amount=0,found=false;
  for(const source of doc.sourceLines||[]){
   if(source.status==='pending'||source.lessonStatus==='cancelled'||source.sessionStatus==='cancelled'||source.attendanceStatus==='cancelled')continue;
   if(JSON.stringify([source.subjectKey,source.mode,source.unitAmountCents,source.rateVersionId])!==row.id)continue;
   found=true;const value=source.mode==='month'?(source.lessonId?0:source.quantity):source.mode==='hour'?source.billableSeconds/3600:source.mode==='lesson'?source.quantity:0;
   if(typeof value!=='number'||!Number.isFinite(value)||value<0)return false;
   quantity+=value;amount+=source.amountCents??0;
  }
  if(!found||Math.abs(row.quantity-quantity)>1e-9||row.amountCents!==amount)return false;
  if(row.rateOverride!==undefined&&row.rateOverride!==(row.unitAmountCents!==null&&Math.round(quantity*row.unitAmountCents)!==row.amountCents))return false;
 }
 return true;
}
