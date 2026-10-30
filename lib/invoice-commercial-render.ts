import type {InvoiceDocument,InvoicePrintLine,InvoiceBillTo} from './invoice';
import {invoiceLessonCancelled,invoiceLessonDuration} from './invoice';
import type {InvoiceInstitutionSnapshot} from './invoice-settings';
import type {InvoiceRenderOptions} from './invoice-render';
import type {ReceiptPrintableDocument,ReceiptRenderOptions} from './receipt-render';

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const e=escape;
const section=(name:string,body:string,tag='div')=>'<'+tag+' class="'+name+'">'+body+'</'+tag+'>';
const row=(label:string,value:string,name='')=>'<div'+(name?' class="'+name+'"':'')+'><span>'+e(label)+'</span><strong>'+value+'</strong></div>';
const money=(cents:number)=>'RM'+(cents/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const validNumber=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
function day(value:string|null|undefined,zh:boolean,month=false,time=false){
 if(!value)return'—';
 const input=month?value+'-01T00:00:00+08:00':/^\d{4}-\d\d-\d\d$/.test(value)?value+'T00:00:00+08:00':value;
 const date=new Date(input);if(!Number.isFinite(date.getTime()))return'—';
 return new Intl.DateTimeFormat(zh?'zh-CN':'en-MY',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:month?'long':'short',...(!month?{day:'2-digit'}:{}),...(time?{hour:'2-digit',minute:'2-digit',hourCycle:'h23' as const}:{})}).format(date);
}
function clock(value:string|null|undefined){if(!value)return'—';const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date):'—';}
function duration(seconds:number,zh:boolean){const minutes=Math.max(0,Math.round(seconds/60)),h=Math.floor(minutes/60),m=minutes%60;return zh?(h?h+'小时':'')+(m?m+'分钟':h?'':'0分钟'):[h?h+' h':'',m?m+' min':h?'':'0 min'].filter(Boolean).join(' ');}
function theme(settings:InvoiceInstitutionSnapshot){
 const accent=/^#[0-9a-fA-F]{6}$/.test(settings.themeColor)?settings.themeColor:'#6040bf';
 const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),light=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.18;
 return{accent,ink:light?'#292334':accent,heroInk:light?'#211a31':'#fff',layout:['standard','centered','brand'].includes(settings.template)?settings.template:'standard'};
}
function identity(settings:InvoiceInstitutionSnapshot,zh:boolean,logoDataUrl?:string|null){
 const T=(cn:string,en:string)=>zh?cn:en;
 const image=logoDataUrl&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logoDataUrl)?'<img class="logo" src="'+e(logoDataUrl)+'" alt="">':'';
 const legal=text(settings.legalName),name=text(settings.institutionName);
 const numbers=[settings.registrationNumber?T('注册编号：','Registration no.: ')+settings.registrationNumber:'',settings.taxId?'TIN: '+settings.taxId:'',settings.sstRegistrationNumber?T('SST 注册编号：','SST registration no.: ')+settings.sstRegistrationNumber:''].filter(Boolean).map(value=>'<span>'+e(value)+'</span>').join('');
 return section('issuer',image+section('issuer-copy','<h1>'+e(name)+'</h1>'+(legal&&legal!==name?'<p class="legal-name">'+e(legal)+'</p>':'')+(settings.address?'<p class="address">'+e(settings.address)+'</p>':'')+([settings.phone,settings.email].filter(Boolean).length?'<p>'+e([settings.phone,settings.email].filter(Boolean).join(' · '))+'</p>':'')+(numbers?'<p class="identifiers">'+numbers+'</p>':'')));
}
function customer(party:InvoiceBillTo|undefined,student:{name:string},zh:boolean,receipt=false){
 const T=(cn:string,en:string)=>zh?cn:en,name=text(party?.name)||student.name;
 return section('customer','<span class="label">'+T(receipt?'收款对象':'账单对象',receipt?'RECEIVED FROM':'BILL TO')+'</span><h3>'+e(name)+'</h3>'+(party?.address?'<p class="address">'+e(party.address)+'</p>':'')+([party?.phone,party?.email].filter(Boolean).length?'<p>'+e([party?.phone,party?.email].filter(Boolean).join(' · '))+'</p>':'')+(party?.registrationNumber?'<p>'+e(T('注册编号：','Registration no.: ')+party.registrationNumber)+'</p>':'')+(party?.taxId?'<p>'+e('TIN: '+party.taxId)+'</p>':'')+(name!==student.name?'<p class="student">'+e(T('学生：','Student: ')+student.name)+'</p>':''));
}
const css=[
 '*{box-sizing:border-box}html{color:#282333;background:#eeedf2;font-family:Arial,"Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:12px;line-height:1.5}body{margin:0;padding:24px}h1,h2,h3,p{margin:0}button{font:inherit}.print-tools{max-width:794px;margin:0 auto 14px;display:flex;justify-content:flex-end}.print-tools button{border:0;border-radius:7px;background:#5135ae;color:white;padding:11px 18px;min-height:44px;cursor:pointer}.paper{max-width:794px;min-height:980px;margin:auto;padding:38px 42px;background:white;overflow-wrap:anywhere;box-shadow:0 2px 14px #21173512}.head{padding-bottom:20px;border-bottom:2px solid var(--accent)}.header-top{display:flex;justify-content:space-between;gap:22px;align-items:flex-start}.issuer{display:flex;gap:14px;min-width:0;flex:1}.issuer-copy{min-width:0}.issuer h1{font-size:22px;font-weight:700;line-height:1.25;margin-bottom:7px}.issuer p{font-size:10px;color:#625b6e;margin:2px 0}.issuer .legal-name{font-weight:600;color:#393241}.address{white-space:pre-line}.identifiers span{display:inline-block;margin-right:10px}.logo{width:66px;height:66px;flex:0 0 66px;object-fit:contain}.document-title{flex:none;text-align:right}.document-title h2{font-size:27px;font-weight:750;letter-spacing:1px;color:var(--ink)}.badge{display:inline-block;margin-top:7px;font-weight:700;font-size:10px;padding:4px 8px;border:1px solid #d8d1e5;border-radius:4px;color:#615471}.badge.void,.badge.reversed{border-color:#a52f3f;color:#a52f3f}.badge.paid{border-color:#86a697;color:#32634e}.bill-row{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:23px 0 25px}.label{display:block;font-size:10px;font-weight:700;letter-spacing:.8px;color:#7b7189;margin-bottom:7px}.customer h3{font-size:16px;margin-bottom:4px}.customer p{font-size:11px;color:#625b6e;margin:2px 0}.customer .student{margin-top:7px;color:#40364d}.metadata{display:grid;gap:7px;align-content:start}.metadata>div{display:grid;grid-template-columns:minmax(90px,auto) minmax(0,1fr);gap:12px}.metadata span{color:#716878;font-size:11px}.metadata strong{text-align:right;font-weight:600;font-size:11px}.charges{width:100%;border-collapse:collapse;table-layout:fixed}.charges th{padding:11px 7px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.2px;background:#f5f3f8;color:#665b73;border-top:1px solid #ded8e6;border-bottom:1px solid #ded8e6}.charges td{padding:13px 7px;border-bottom:1px solid #e5e0ea;vertical-align:top;font-size:11px}.charges td:first-child{font-weight:600}.charges small{display:block;font-size:9px;color:#7a7183;font-weight:400;margin-top:2px}.number{text-align:right!important;font-variant-numeric:tabular-nums}.amount{white-space:nowrap;font-weight:600}.totals-wrap{display:flex;justify-content:flex-end;margin:21px 0 24px}.totals{width:280px;display:grid;gap:8px}.totals>div{display:flex;align-items:baseline;justify-content:space-between;gap:18px;font-size:11px}.totals span{color:#6d6278}.totals strong{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}.totals .grand{margin-top:4px;padding-top:12px;border-top:1px solid #d8d0e3;font-size:15px}.totals .grand strong{font-size:20px;color:var(--ink)}.totals .balance{font-size:13px;font-weight:700;border-top:1px solid #e3ddeb;padding-top:10px;margin-top:3px}.payment{border-top:1px solid #e3ddeb;padding-top:17px;margin-top:18px}.payment h3,.notes h3{font-size:10px;color:#7a6f86;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px}.payment p{font-size:11px;white-space:pre-line;margin:2px 0}.payment .reference{font-size:10px;color:#6f637c;margin-top:7px}.notes{margin-top:17px}.notes p{white-space:pre-line;font-size:11px;color:#62586f}.draft-note{margin-top:22px;padding-top:10px;border-top:1px solid #e5e0eb;font-size:10px;font-weight:600;color:#8b6b2d}.receipt .totals{width:310px}.centered .header-top{display:block;text-align:center}.centered .issuer{display:flex;flex-direction:column;align-items:center;gap:9px}.centered .logo{width:52px;height:52px;flex-basis:52px}.centered .document-title{margin-top:14px;text-align:center}.centered .document-title h2{font-size:23px}.branded{border-top:7px solid var(--accent)}.branded .head{border-bottom:1px solid #e1dce9}.branded .document-title{background:var(--accent);padding:10px 14px;border-radius:4px}.branded .document-title h2{font-size:22px;color:var(--hero-ink)}.branded .badge{color:var(--hero-ink);border-color:currentColor}.branded .badge.void,.branded .badge.reversed{background:white;color:#a52f3f;border-color:#a52f3f}.annex{margin-top:22px;min-height:0}.annex h2{font-size:17px;margin-bottom:4px}.annex>p{font-size:11px;color:#72677e;margin-bottom:18px}.annex table{width:100%;border-collapse:collapse;table-layout:fixed}.annex td,.annex th{padding:8px 5px;text-align:left;border-bottom:1px solid #e3deea;font-size:10px;vertical-align:top}.annex th{background:#f6f4f9;font-size:9px}.annex small{font-size:9px;color:#786c84;display:block}.receipt .reference{font-size:11px;margin:12px 0 0}',
 '@page{size:A4;margin:12mm}@media print{html,body{background:white;margin:0;padding:0}.print-tools{display:none!important}.paper{max-width:none;min-height:0;padding:0;box-shadow:none}.branded{border-top-width:5px}.head,.bill-row,.totals-wrap,.payment,.notes,tr{break-inside:avoid}.charges thead,.annex thead{display:table-header-group}.paper.annex{break-before:page;page-break-before:always;margin-top:0}.paper{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
 '@media(max-width:600px){body{padding:9px}.paper{padding:23px 20px;min-height:0}.header-top{gap:13px}.issuer{gap:10px}.issuer h1{font-size:18px}.logo{width:48px;height:48px;flex-basis:48px}.document-title h2{font-size:21px;letter-spacing:.3px}.branded .document-title{padding:8px 10px}.branded .document-title h2{font-size:18px}.bill-row{grid-template-columns:1fr;gap:18px;margin:22px 0}.charges td,.charges th{padding:10px 5px;font-size:10px}.charges th{font-size:9px}.charges small{font-size:9px}.totals,.receipt .totals{width:100%;max-width:300px}.metadata strong{max-width:100%}}'
].join('\n');
function html(body:string,title:string,settings:InvoiceInstitutionSnapshot,zh:boolean,nonce?:string){
 const colors=theme(settings),toolbar=nonce?section('print-tools','<button type="button" id="print-document">'+(zh?'打印 / 保存 PDF':'Print / Save PDF')+'</button>'):'';
 const script=nonce?'<script nonce="'+e(nonce)+'">document.getElementById("print-document").addEventListener("click",function(){window.print()});</script>':'';
 return'<!doctype html><html lang="'+(zh?'zh-CN':'en')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>'+e(title)+'</title><style>'+css+'</style></head><body style="--accent:'+colors.accent+';--ink:'+colors.ink+';--hero-ink:'+colors.heroInk+'">'+toolbar+body+script+'</body></html>';
}
function quantity(invoice:InvoiceDocument,line:InvoicePrintLine):number|null{
 if(validNumber(line.quantity))return line.quantity;
 let sources=invoice.sourceLines.filter(source=>JSON.stringify([source.subjectKey,source.mode,source.unitAmountCents,source.rateVersionId])===line.id&&!invoiceLessonCancelled(source)&&source.status!=='pending');
 if(!sources.length)sources=invoice.sourceLines.filter(source=>source.subject===line.subject&&source.mode===line.mode&&source.unitAmountCents===line.unitAmountCents&&!invoiceLessonCancelled(source)&&source.status!=='pending');
 if(!sources.length)return null;
 if(line.mode==='hour')return sources.reduce((n,source)=>n+(validNumber(source.billableSeconds)?source.billableSeconds:0)/3600,0);
 if(line.mode==='month')return sources.filter(source=>!source.lessonId).reduce((n,source)=>n+(validNumber(source.quantity)?source.quantity:0),0);
 if(line.mode==='lesson')return sources.reduce((n,source)=>n+(validNumber(source.quantity)?source.quantity:0),0);
 return null;
}
function quantityLabel(invoice:InvoiceDocument,line:InvoicePrintLine,zh:boolean){
 const value=quantity(invoice,line);if(value===null||!value&&line.amountCents!==0)return'—';
 const short=(n:number)=>n.toLocaleString('en-MY',{maximumFractionDigits:2,useGrouping:false});
 if(line.mode==='hour'){
  if(Math.abs(value*100-Math.round(value*100))<1e-7)return short(value)+(zh?' 小时':' h');
  return duration(value*3600,zh);
 }
 if(line.mode==='month'){
  const days=new Date(Date.UTC(Number(invoice.month.slice(0,4)),Number(invoice.month.slice(5,7)),0)).getUTCDate(),numerator=Math.round(value*days);
  const qty=value>0&&Math.abs(value-Math.round(value))>1e-8&&Math.abs(numerator/days-value)<1e-8?numerator+'/'+days:short(value);
  return qty+(zh?' 月':' mo');
 }
 return short(value)+(line.mode==='lesson'?(zh?' 堂':' lesson'+(value===1?'':'s')):'');
}
function priceLabel(invoice:InvoiceDocument,line:InvoicePrintLine,zh:boolean){
 const q=quantity(invoice,line),rate=line.unitAmountCents;
 if(rate===null||line.rateOverride||q!==null&&Math.round(q*rate)!==line.amountCents)return'—';
 return money(rate)+'<small>'+e(line.mode==='hour'?(zh?'每小时':'per hour'):line.mode==='month'?(zh?'每月':'per month'):line.mode==='lesson'?(zh?'每堂':'per lesson'):'')+'</small>';
}
function lessonAnnex(invoice:InvoiceDocument,zh:boolean){
 const T=(cn:string,en:string)=>zh?cn:en;
 const lines=invoice.sourceLines.filter(line=>line.lessonId&&!invoiceLessonCancelled(line));if(!lines.length)return'';
 const labels:Record<string,string>={present:T('出席','Present'),late:T('迟到','Late'),early_leave:T('早退','Early departure'),late_early:T('迟到及早退','Late / early'),late_early_leave:T('迟到及早退','Late / early'),absent:T('缺席','Absent'),student_absent:T('学生缺席','Student absent'),teacher_absent:T('老师缺席','Teacher absent'),completed:T('已完成','Completed'),scheduled:T('未完成','Scheduled'),pending:T('待确认','Pending')};
 const rows=lines.map(line=>'<tr><td>'+e(day(line.date,zh))+'</td><td>'+e(line.subject)+(line.teacherName?'<small>'+e(line.teacherName)+'</small>':'')+'</td><td>'+e(clock(line.plannedStart)+'–'+clock(line.plannedEnd))+'</td><td>'+e(labels[line.attendanceStatus]||line.attendanceStatus)+'</td><td>'+e(duration(line.displayDurationSeconds??invoiceLessonDuration(line),zh))+'</td><td class="number">'+(line.amountCents===null?'—':money(line.amountCents))+'</td></tr>').join('');
 return section('paper annex','<h2>'+T('课次附件','Lesson appendix')+'</h2><p>'+e(invoice.number||T('草稿','DRAFT'))+' · '+e(invoice.student.name)+' · GMT+8</p><table><thead><tr><th>'+T('日期','Date')+'</th><th>'+T('科目 / 老师','Subject / teacher')+'</th><th>'+T('排课时间','Scheduled time')+'</th><th>'+T('出勤','Attendance')+'</th><th>'+T('时长','Duration')+'</th><th class="number">'+T('金额','Amount')+'</th></tr></thead><tbody>'+rows+'</tbody></table>','article');
}
export function renderCompactInvoiceHtml(invoice:InvoiceDocument,options:InvoiceRenderOptions={}){
 const zh=options.lang==='zh',T=(cn:string,en:string)=>zh?cn:en,s=invoice.institution,finance=options.finance,draft=invoice.status!=='issued';
 const badge=draft?'<span class="badge draft">DRAFT</span>':finance?'<span class="badge '+e(finance.status)+'">'+e(({unpaid:'UNPAID',partially_paid:'PARTIALLY PAID',paid:'PAID',void:'VOID'} as Record<string,string>)[finance.status]||'')+'</span>':'';
 const head=section('head',section('header-top',identity(s,zh,options.logoDataUrl)+section('document-title','<h2>INVOICE</h2>'+badge)),'header');
 const meta=row(T('账单编号','Invoice no.'),e(invoice.number||'DRAFT'))+row(T('开单日期','Issue date'),e(day(invoice.issuedAt,zh)))+row(T('付款期限','Due date'),e(day(invoice.dueDate,zh)))+row(T('服务月份','Service period'),e(day(invoice.month,zh,true)));
 const billed=section('bill-row',customer(invoice.billTo,invoice.student,zh)+section('metadata',meta));
 const lines=invoice.lines.filter(line=>line.lessonCount>0||line.amountCents!==0||line.mode==='month');
 const units=lines.some(line=>line.mode!==null||line.unitAmountCents!==null);
 const items=lines.map(line=>'<tr><td>'+e(line.subject)+(line.rateOverride?'<small>'+T('调整金额','Adjusted fee')+'</small>':'')+'</td>'+(units?'<td class="number">'+e(quantityLabel(invoice,line,zh))+'</td><td class="number">'+priceLabel(invoice,line,zh)+'</td>':'')+'<td class="number amount">'+money(line.amountCents)+'</td></tr>').join('');
 const additions=invoice.additions.filter(line=>line.kind==='charge'&&line.amountCents!==0).map(line=>'<tr><td>'+e(line.label)+'</td>'+(units?'<td class="number">1</td><td class="number">'+money(line.amountCents)+'</td>':'')+'<td class="number amount">'+money(line.amountCents)+'</td></tr>').join('');
 const table='<table class="charges">'+(units?'<colgroup><col style="width:43%"><col style="width:18%"><col style="width:20%"><col style="width:19%"></colgroup>':'<colgroup><col style="width:75%"><col style="width:25%"></colgroup>')+'<thead><tr><th>'+T('项目','Description')+'</th>'+(units?'<th class="number">'+T('数量','Qty')+'</th><th class="number">'+T('单价','Unit price')+'</th>':'')+'<th class="number">'+T('金额（MYR）','Amount (MYR)')+'</th></tr></thead><tbody>'+items+additions+'</tbody></table>';
 const discounts=invoice.additions.filter(line=>line.kind==='discount');
 let totals=(invoice.discountCents||lines.length+invoice.additions.filter(line=>line.kind==='charge'&&line.amountCents!==0).length>1?row(T('小计','Subtotal'),money(invoice.subtotalCents)):'');
 if(invoice.discountCents){const named=discounts.length>0&&discounts.length<=4&&discounts.reduce((n,line)=>n+line.amountCents,0)===invoice.discountCents;totals+=named?discounts.map(line=>row(line.label,'− '+money(line.amountCents))).join(''):row(T('折扣','Discount'),'− '+money(invoice.discountCents));}
 totals+=row(T('账单总额','Invoice total'),money(invoice.totalCents),'grand');
 if(finance&&!draft){
  if(finance.adjustedTotalCents!==invoice.totalCents){const change=finance.adjustedTotalCents-invoice.totalCents;totals+=row(T('账单调整','Adjustments'),(change<0?'− ':'+ ')+money(Math.abs(change)))+row(T('调整后金额','Adjusted total'),money(finance.adjustedTotalCents));}
  if(finance.paidCents>0)totals+=row(T('已付','Paid'),money(finance.paidCents));
  if(finance.paidCents>0||finance.adjustedTotalCents!==invoice.totalCents||finance.status==='void')totals+=row(T('尚欠金额','Balance due'),money(finance.status==='void'?0:finance.remainingCents),'balance');
  if(finance.creditBalanceCents>0&&finance.status!=='void')totals+=row(T('结余','Credit balance'),money(finance.creditBalanceCents));
 }
 const bank=[s.bankName,s.beneficiary,s.bankAccount].filter(Boolean),reference=invoice.number?'<p class="reference">'+e(T('付款参考：','Payment reference: ')+invoice.number)+'</p>':'';
 const payment=bank.length||s.paymentNote?section('payment','<h3>'+T('付款资料','Payment details')+'</h3>'+(bank.length?'<p>'+e(bank.join(' · '))+'</p>':'')+reference+(s.paymentNote?'<p>'+e(s.paymentNote)+'</p>':''),'section'):'';
 const notes=[...new Set([invoice.notes,s.invoiceNote].map(text).filter(Boolean))].join('\n');
 const note=notes?section('notes','<h3>'+T('备注','Notes')+'</h3><p>'+e(notes)+'</p>','section'):'';
 const draftNote=draft?section('draft-note',options.preview?T('示例 · 不可用于付款','Sample · Not for payment.'):T('草稿 · 尚未发出','Draft · Not issued.')):'';
 const main=section('paper '+(theme(s).layout==='brand'?'branded':theme(s).layout),head+billed+table+section('totals-wrap',section('totals',totals))+payment+note+draftNote,'article');
 return html(main+(options.lessons?lessonAnnex(invoice,zh):''),(invoice.number||'DRAFT')+' · '+invoice.student.name,s,zh,options.nonce);
}
export function renderCompactReceiptHtml(receipt:ReceiptPrintableDocument,options:ReceiptRenderOptions={}){
 const zh=options.lang==='zh',T=(cn:string,en:string)=>zh?cn:en,s=receipt.institution;
 const title='<h2>RECEIPT</h2>'+(options.reversedAt?'<span class="badge reversed">REVERSED</span>':'');
 const head=section('head',section('header-top',identity(s,zh,options.logoDataUrl)+section('document-title',title)),'header');
 const methods:Record<string,string>={cash:T('现金','Cash'),bank_transfer:T('银行转账','Bank transfer'),duitnow:'DuitNow',tng:'Touch ’n Go',other:T('其他','Other')};
 const metadata=row(T('收据编号','Receipt no.'),e(receipt.number))+row(T('收款日期','Payment date'),e(day(receipt.paidAt,zh,false,true))+' GMT+8')+row(T('收款方式','Payment method'),e(methods[receipt.method]||receipt.method))+row(T('对应账单','Invoice no.'),e(receipt.invoiceNumber))+row(T('服务月份','Service period'),e(day(receipt.serviceMonth,zh,true)))+(receipt.reference?row(T('付款参考号','Payment reference'),e(receipt.reference)):'')+(options.reversedAt?row(T('撤销时间','Reversed'),e(day(options.reversedAt,zh,false,true))+' GMT+8'):'');
 const billed=section('bill-row',customer(receipt.billTo,receipt.student,zh,true)+section('metadata',metadata));
 const table='<table class="charges"><colgroup><col style="width:70%"><col style="width:30%"></colgroup><thead><tr><th>'+T('项目','Description')+'</th><th class="number">'+T('金额（MYR）','Amount (MYR)')+'</th></tr></thead><tbody><tr><td>'+T('学费收款','Tuition payment')+'</td><td class="number amount">'+money(receipt.amountCents)+'</td></tr></tbody></table>';
 const totals=row(T('收款时账单金额','Invoice total at payment'),money(receipt.invoiceTotalCents))+row(T('本次实收','Amount received'),money(receipt.amountCents),'grand')+row(T('收款后欠款','Balance after payment'),money(receipt.balanceAfterCents));
 const main=section('paper receipt '+(theme(s).layout==='brand'?'branded':theme(s).layout),head+billed+table+section('totals-wrap',section('totals',totals)),'article');
 return html(main,receipt.number+' · '+receipt.student.name,s,zh,options.nonce);
}