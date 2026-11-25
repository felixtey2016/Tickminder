import assert from 'node:assert/strict';
import {createFixtureLoader} from './fixture-loader.mjs';

let checks=0;const check=fn=>{fn();checks++;};
const load=createFixtureLoader({}),renderer=(await load('lib/receipt-render.ts')).module;
const institution={institutionName:'Fictional <Tuition> & Centre',address:'A long fictional address\n第二行地址',phone:'0120000000',email:'billing@example.test',template:'standard',themeColor:'#6040bf',bankName:'Example Bank',beneficiary:'Demo',bankAccount:'0000000',paymentNote:'Internal payment note not copied to receipt',invoiceNote:'Internal invoice note',invoicePrefix:'INV',logoAssetId:null,revision:1,dueDays:7};
const receipt={id:'receipt-fictional',number:'RCP-2032-000001',invoiceId:'invoice-fictional',invoiceNumber:'INV-2032-000001',student:{id:'student-fictional',name:'陈同学 <script>alert(1)</script>',syllabus:'IGCSE',grade:'Year 9'},institution,currency:'MYR',amountCents:12050,paidAt:'2032-06-02T15:30:00Z',method:'bank_transfer',reference:'BANK <ref> & 321',createdAt:'2032-06-02T15:31:00Z',serviceMonth:'2032-06',invoiceTotalCents:30000,balanceAfterCents:17950,notes:'CONFIDENTIAL STAFF NOTE',reason:'PRIVATE ADMIN REASON'};
for(const template of ['standard','centered','brand'])for(const lang of ['zh','en']){
 const html=renderer.renderReceiptHtml({...receipt,institution:{...institution,template}},{lang,nonce:'testNonce',logoDataUrl:'data:image/png;base64,iVBORw0KGgo='});
 check(()=>assert(html.includes('Fictional &lt;Tuition&gt; &amp; Centre')));
 check(()=>assert(html.includes('陈同学 &lt;script&gt;alert(1)&lt;/script&gt;')&&!html.includes('<script>alert(1)</script>')));
 check(()=>assert(html.includes('RM120.50')&&html.includes('RM300.00')&&html.includes('RM179.50')));
 check(()=>assert(html.includes('23:30')&&html.includes('2032')&&html.includes('GMT+8')));
 check(()=>assert(html.includes('BANK &lt;ref&gt; &amp; 321')));
 check(()=>assert(html.includes('RCP-2032-000001')&&html.includes('INV-2032-000001')));
 check(()=>assert(!html.includes('CONFIDENTIAL STAFF NOTE')&&!html.includes('PRIVATE ADMIN REASON')&&!html.includes('Internal invoice note')));
 check(()=>assert(html.includes('window.print()')&&html.includes('nonce="testNonce"')&&html.includes('@page{size:A4')&&html.includes('display:table-header-group')&&html.includes('break-inside:avoid')));
 check(()=>assert(html.includes('object-fit:contain')&&html.includes('data:image/png;base64,')));
 check(()=>assert(html.includes(lang==='zh'?'收款收据':'RECEIPT')));
}
const reversed=renderer.renderReceiptHtml(receipt,{lang:'en',reversedAt:'2032-06-03T00:15:00Z'});
check(()=>assert(reversed.includes('This payment has been reversed.')&&reversed.includes('08:15')));
check(()=>assert(!renderer.renderReceiptHtml(receipt,{logoDataUrl:'javascript:alert(1)'}).includes('javascript:alert')));
check(()=>assert(!renderer.renderReceiptHtml({...receipt,institution:{...institution,themeColor:'red;display:none'}},{}).includes('red;display:none')));
check(()=>assert(renderer.renderReceiptHtml({...receipt,institution:{...institution,themeColor:'#ffffff'}},{}).includes('--ink:#30234d')));
const long=renderer.renderReceiptHtml({...receipt,student:{...receipt.student,name:'Long_name_'.repeat(100)},reference:'Reference '.repeat(15)},{});
check(()=>assert(long.includes('overflow-wrap:anywhere')&&long.includes('Long_name_'.repeat(100))));

// Exercise real route response/CSP and late permission recheck with controlled service boundaries.
globalThis.__receiptFixture={actor:{id:'fictional-admin',role:'admin',groupId:'fictional-group'},receipt,permission:true,revokeAfterLogo:false};
const runtimeUrl='data:text/javascript;base64,'+Buffer.from(`
 export async function currentBusinessAccount(){return globalThis.__receiptFixture.actor;}
 export class InvoiceSettingsError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 export async function requireFinancePermission(actor){if(actor?.role!=='admin'||actor?.groupId!=='fictional-group'||!globalThis.__receiptFixture.permission)throw new InvoiceSettingsError('Forbidden',403);return actor.groupId;}
 export async function receiptDetail(actor,id){await requireFinancePermission(actor);if(id!=='receipt-fictional')throw new InvoiceSettingsError('Not found',404);return{receipt:globalThis.__receiptFixture.receipt,reversedAt:null};}
 export async function invoiceLogoDataUrl(){if(globalThis.__receiptFixture.revokeAfterLogo)globalThis.__receiptFixture.permission=false;return null;}
`).toString('base64');
const routeLoad=createFixtureLoader({runtimeUrl,runtimeFiles:['lib/auth.ts','lib/invoice-finance-server.ts','lib/invoice-settings.ts']}),route=(await routeLoad('app/api/receipts/[id]/print/route.ts')).module;
const request=()=>new Request('https://receipt.example.test/api/receipts/receipt-fictional/print?lang=zh'),context={params:Promise.resolve({id:'receipt-fictional'})};
let response=await route.GET(request(),context);check(()=>assert.equal(response.status,200));check(()=>assert(response.headers.get('cache-control').includes('private, no-store')));check(()=>assert(response.headers.get('content-security-policy').includes("default-src 'none'")&&response.headers.get('content-security-policy').includes("frame-ancestors 'self'")));check(()=>assert((response.headers.get('vary')||'').includes('x-tickminder-group')));
check(()=>assert((response.headers.get('content-type')||'').includes('text/html')));
globalThis.__receiptFixture.actor=null;response=await route.GET(request(),context);check(()=>assert.equal(response.status,401));
globalThis.__receiptFixture.actor={id:'teacher',role:'teacher',groupId:'fictional-group'};response=await route.GET(request(),context);check(()=>assert.equal(response.status,403));
globalThis.__receiptFixture.actor={id:'student',role:'student',groupId:'fictional-group'};response=await route.GET(request(),context);check(()=>assert.equal(response.status,403));
globalThis.__receiptFixture.actor={id:'other',role:'admin',groupId:'other-group'};response=await route.GET(request(),context);check(()=>assert.equal(response.status,403));
globalThis.__receiptFixture.actor={id:'fictional-admin',role:'admin',groupId:'fictional-group'};globalThis.__receiptFixture.revokeAfterLogo=true;response=await route.GET(request(),context);check(()=>assert.equal(response.status,403,'permission revoked during file read must deny final document response'));
delete globalThis.__receiptFixture;
console.log(`Receipt template and print route checks passed: ${checks}`);
