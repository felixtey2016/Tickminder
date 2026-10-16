import assert from 'node:assert/strict';
import { zlibSync } from 'fflate';
import { createFixtureLoader } from './fixture-loader.mjs';
const load=createFixtureLoader({}),logo=(await load('lib/invoice-logo.ts')).module,render=(await load('lib/invoice-render.ts')).module;
let checks=0;const check=fn=>{fn();checks++;};
const u32=n=>Uint8Array.of(n>>>24,n>>>16,n>>>8,n),join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const part of parts){out.set(part,i);i+=part.length;}return out;};
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;}return(n^0xffffffff)>>>0;}
function chunk(name,data){const part=join(new TextEncoder().encode(name),data);return join(u32(data.length),part,u32(crc(part)));}
function png(raw,{width=2,height=1,depth=8,color=6,palette,transparency,interlace=0}={}){return join(Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',join(u32(width),u32(height),Uint8Array.of(depth,color,0,0,interlace))),...(palette?[chunk('PLTE',Uint8Array.from(palette))]:[]),...(transparency?[chunk('tRNS',Uint8Array.from(transparency))]:[]),chunk('IDAT',zlibSync(Uint8Array.from(raw))),chunk('IEND',new Uint8Array()));}
const transparent=png([0,95,65,180,0,95,65,180,255]);check(()=>assert.deepEqual(logo.inspectInvoiceLogo(transparent),{width:2,height:1}));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(png([0,95,65,180,255,95,65,180,255])),/透明背景/));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(png([0,95,65,180,0,95,65,180,0])),/完全透明/));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(new TextEncoder().encode('a renamed JPEG.png')),/PNG/));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(png([0,0,0,0,0,0,0,0,255],{width:4096})),/2048/));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(png([0,0,0,0,0,0,0,0,255],{interlace:1})),/非交错/));
const corrupt=transparent.slice();corrupt[41]^=1;check(()=>assert.throws(()=>logo.inspectInvoiceLogo(corrupt),/格式无效/));
check(()=>assert.deepEqual(logo.inspectInvoiceLogo(png([0,64],{depth:1,color:3,palette:[0,0,0,255,255,255],transparency:[0,255]})),{width:2,height:1}));
check(()=>assert.deepEqual(logo.inspectInvoiceLogo(png([0,0,255],{color:0,transparency:[0,0]})),{width:2,height:1}));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(png([0,0,255],{color:0})),/透明背景/));
check(()=>assert.throws(()=>logo.inspectInvoiceLogo(png([0,95,65,180,0,95,65,180,255,1])),/格式无效/));
const settings={institutionName:'Next Genn <script>alert(1)</script>',address:'An address',phone:'0120000000',email:'billing@example.com',template:'standard',themeColor:'#6040bf',bankName:'Example Bank',beneficiary:'Demo',bankAccount:'0000000',paymentNote:'Please quote invoice number.',invoiceNote:'For review',invoicePrefix:'INV',logoAssetId:null,revision:1,dueDays:7};
for(const template of ['standard','centered','brand']){
 const invoice=render.sampleInvoiceDocument({...settings,template}),html=render.renderInvoiceHtml(invoice,{lang:'en',lessons:true,preview:true});
 check(()=>assert(html.includes('Next Genn &lt;script&gt;alert(1)&lt;/script&gt;')));
 check(()=>assert(!html.includes('<script>alert(1)</script>')));
 check(()=>assert(html.includes('DRAFT')&&html.includes('Not for payment.')));
 check(()=>assert(html.includes('18:30–20:00')&&html.includes('1 hour 30 minutes')));
 check(()=>assert(html.includes('RM540.00')&&html.includes('@page{size:A4')));
 check(()=>assert.equal(invoice.sourceLines.length,8));
 const issued=render.renderInvoiceHtml({...invoice,status:'issued',number:'INV-202610-0001',issuedAt:'2026-10-01T00:00:00Z'},{lang:'zh',lessons:true,nonce:'abc123',logoDataUrl:'data:image/png;base64,'+Buffer.from(transparent).toString('base64')});
 check(()=>assert(issued.includes('INV-202610-0001')&&!issued.includes('账单草稿，尚未正式发出')));
 check(()=>assert(issued.includes('nonce="abc123"')&&issued.includes('window.print()')&&issued.includes('1小时30分钟')));
 check(()=>assert(issued.includes('object-fit:contain')&&issued.includes('data:image/png;base64,')));
}
check(()=>assert.equal(render.invoiceEscape('"<>&\''),'&quot;&lt;&gt;&amp;&#39;'));
console.log(`Invoice PNG and template risk checks passed: ${checks}`);
