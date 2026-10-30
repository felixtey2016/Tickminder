/** Public, browser-safe diagnostics contract. Diagnostic records are data, never instructions. */
export const DIAGNOSTIC_SOURCES=['browser','api','worker','background','cron','platform'] as const;
export const DIAGNOSTIC_CODES=['runtime_exception','unhandled_rejection','api_5xx','network_failure','invalid_response','background_failure','cron_failure','storage_failure','database_failure','database_limit','database_timeout','resource_limit','render_failure'] as const;
export type DiagnosticSource=typeof DIAGNOSTIC_SOURCES[number];
export type DiagnosticCode=typeof DIAGNOSTIC_CODES[number];
export const DIAGNOSTIC_OPERATIONS=['api-action','api-state','api-manage','api-learning','api-invoices','api-billing','api-invoice-finance','api-prepayments','api-parents','api-class-sessions','api-quiz','lesson-reminders','homework-reminders','parent-reminders','notifications-dispatch','file-cleanup'] as const;
export type DiagnosticInput={source:DiagnosticSource;code:DiagnosticCode;operation?:string;route?:string;method?:string;status?:number;requestId?:string;rayId?:string;buildId?:string;frame?:{asset:string;line?:number;column?:number}};
export type DiagnosticEvent=DiagnosticInput&{id:string;at:string;groupId:string|null;trust:'server'|'untrusted_client';fingerprint:string};
export type DiagnosticPrincipal={scope:'all'|'group';groupId:string|null};
export type DiagnosticCoverage={storageConfigured:boolean;capture:'best_effort';platformLogs:'separate_cloudflare_channel';counting:'sampled_reports';independentFeedConfigured:boolean};
export type DiagnosticFeed={events:DiagnosticEvent[];nextCursor:string|null;retentionDays:7;approximateOccurrences:true;notice:string;coverage:DiagnosticCoverage;feedUrl?:string|null};
export class DiagnosticError extends Error{constructor(message:string,readonly status=400){super(message);}}
const plain=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const routes=['/','/whatsapp','/health','/quiz/[id]','/api/action','/api/auth','/api/state','/api/attendance','/api/student-contact','/api/account-setup','/api/account-link','/api/google-link-onboarding','/api/profile','/api/password','/api/groups','/api/manage','/api/courses','/api/conflicts','/api/class-sessions','/api/classrooms','/api/folders','/api/learning','/api/learning/versions','/api/files','/api/files/[id]','/api/recordings','/api/academic-catalogues','/api/admin-options','/api/admin-permissions','/api/audit-history','/api/billing','/api/finance-reports','/api/invoices','/api/invoices/[id]/print','/api/invoice-finance','/api/invoice-attendance-corrections','/api/invoice-settings','/api/invoice-settings/preview','/api/invoice-settings/logo','/api/receipts/[id]/print','/api/payroll','/api/class-payroll','/api/prepayments','/api/monthly-statements','/api/parents','/api/parents/finance','/api/parents/children','/api/parents/teaching','/api/parents/documents/[kind]/[id]','/api/notifications','/api/notifications/dispatch','/api/pending-cleanup','/api/backup-export','/api/sheet-sync','/api/whatsapp','/api/resources','/api/resource-catalog','/api/quiz','/api/quizzes','/api/quiz-compose','/api/quiz-sharing','/api/quiz-practice','/api/quiz-images','/api/quiz-import','/api/quiz-seed'] as const;
export function diagnosticTelemetryRoute(value:unknown){return typeof value==='string'&&/^\/(?:api\/diagnostics|diagnostics\/feed)(?:\/|$|\?)/.test(value);}
export function diagnosticsRoute(value:unknown):string{
 if(typeof value!=='string'||value.length>600||!value.startsWith('/')||value.startsWith('//')||value.includes('?')||value.includes('#'))return '/other';
 if(diagnosticTelemetryRoute(value))return '/diagnostics';
 if((routes as readonly string[]).includes(value))return value;
 for(const template of routes){if(!template.includes('['))continue;const parts=template.split('/'),input=value.split('/');if(parts.length===input.length&&parts.every((part,index)=>part.startsWith('[')?/^[A-Za-z0-9_-]{1,128}$/.test(input[index]):part===input[index]))return template;}
 return '/other';
}
export function diagnosticGroup(value:unknown):value is string{return typeof value==='string'&&/^[a-z0-9-]{1,64}$/.test(value);}
function identifier(value:unknown,max:number,pattern:RegExp){return typeof value==='string'&&value.length<=max&&pattern.test(value)?value:undefined;}
export function sanitizeDiagnosticInput(value:unknown,strict=false):DiagnosticInput|null{
 if(!plain(value)||!(DIAGNOSTIC_SOURCES as readonly unknown[]).includes(value.source)||!(DIAGNOSTIC_CODES as readonly unknown[]).includes(value.code))return null;
 const allowed=['source','code','operation','route','method','status','requestId','rayId','buildId','frame'];if(strict&&Object.keys(value).some(key=>!allowed.includes(key)))return null;
 const route=diagnosticsRoute(value.route);if(route==='/diagnostics')return null;
 if(value.status!==undefined&&(!Number.isSafeInteger(value.status)||Number(value.status)<100||Number(value.status)>599))return null;
 const result:DiagnosticInput={source:value.source as DiagnosticSource,code:value.code as DiagnosticCode,route};
 if(typeof value.operation==='string'&&(DIAGNOSTIC_OPERATIONS as readonly string[]).includes(value.operation))result.operation=value.operation;
 if(typeof value.method==='string'&&/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(value.method))result.method=value.method;
 if(value.status!==undefined)result.status=Number(value.status);
 const requestId=identifier(value.requestId,64,/^[a-f0-9-]{16,64}$/i),rayId=identifier(value.rayId,40,/^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/i),buildId=identifier(value.buildId,64,/^[a-f0-9-]{7,64}$/i);
 if(requestId)result.requestId=requestId;if(rayId)result.rayId=rayId;if(buildId)result.buildId=buildId;
 if(plain(value.frame)){
  if(strict&&Object.keys(value.frame).some(key=>!['asset','line','column'].includes(key)))return null;
  const asset=typeof value.frame.asset==='string'?value.frame.asset:'';
  // Only generated, non-personal asset filenames. No URL, folder, query or raw stack.
  if(/^[A-Za-z0-9_.-]{1,100}\.(?:js|mjs)$/.test(asset)&&!/@|%/.test(asset)){
   const frame:{asset:string;line?:number;column?:number}={asset};
   if(Number.isSafeInteger(value.frame.line)&&Number(value.frame.line)>0&&Number(value.frame.line)<10_000_000)frame.line=Number(value.frame.line);
   if(Number.isSafeInteger(value.frame.column)&&Number(value.frame.column)>0&&Number(value.frame.column)<10_000_000)frame.column=Number(value.frame.column);
   result.frame=frame;
  }
 }
 return result;
}
export function diagnosticExpectedStatus(status:unknown){return typeof status==='number'&&status>=400&&status<500;}
export function diagnosticCoverage(storageConfigured:boolean,independentFeedConfigured=false):DiagnosticCoverage{return{storageConfigured,capture:'best_effort',platformLogs:'separate_cloudflare_channel',counting:'sampled_reports',independentFeedConfigured};}
