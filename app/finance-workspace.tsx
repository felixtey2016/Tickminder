"use client";
import {HorizontalMenu} from '@/components/horizontal-menu';
import {usePageHistoryState} from '@/lib/page-history';

import {lazy,Suspense,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {canAdminAction,type AdminPermissionAccount} from '@/lib/admin-permission-client';
import {t,registerTranslations} from '@/lib/i18n';
import {invoiceEn,invoiceZh} from '@/lib/invoice-i18n';
import {F2} from '@/lib/finance-round2-i18n';
import './finance-round2.css';
import './finance-compact.css';
import {financeLabel} from './finance-layout-tools';
import {allowedFinanceAreas,financeArea,financeAreaLanding,financeAreaViews,type FinanceArea,type FinanceView} from '@/lib/finance-navigation';
import './finance-student-flow.css';
const BillingWorkspace=lazy(()=>import('./billing-workspace'));
const InvoiceWorkspace=lazy(()=>import('./invoice-workspace'));
const FinanceOverview=lazy(()=>import('./finance-overview'));
const PayrollWorkspace=lazy(()=>import('./payroll-workspace'));
const ExpenseWorkspace=lazy(()=>import('./expense-workspace'));
const PrepaymentsWorkspace=lazy(()=>import('./prepayments-workspace'));
const StudentStatementsWorkspace=lazy(()=>import('./student-statements-workspace'));
registerTranslations(invoiceZh,invoiceEn);
function changeAllowed(){return window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true}));}
type FinanceAccount=AdminPermissionAccount&{isGroupChief?:boolean;id?:string;groupId?:string|null};
export default function FinanceWorkspace({account,onCourses,openInvoiceList=false,onInvoiceListOpened}:{openInvoiceList?:boolean;onInvoiceListOpened?:()=>void;account:FinanceAccount;onCourses:()=>void}){
 const canFees=canAdminAction(account,'fees.view'),canInvoices=canAdminAction(account,'invoices.view'),canManage=Boolean(account.isOwner||account.isGroupChief),canOverview=canAdminAction(account,'finance.view'),canPayroll=canAdminAction(account,'payroll.view'),canExpenses=canAdminAction(account,'expenses.view'),canExport=canAdminAction(account,'exports.finance'),canPrepayments=canAdminAction(account,'prepayments.view');
 const canAccounts=canFees&&canInvoices&&canPrepayments&&canAdminAction(account,'payments.view'),scopeKey=JSON.stringify([account.id,account.groupId,account.role,account.adminPermissions,account.isOwner,account.isGroupChief]);
 const allowed=([['accounts',canAccounts],['tuition',canFees],['invoices',canInvoices],['prepayments',canPrepayments],['settings',canManage],['payroll',canPayroll],['overview',canOverview],['expenses',canExpenses]] as [FinanceView,boolean][]).filter(([,value])=>value).map(([key])=>key),fallback=allowed[0]||'overview';
 const [view,setView]=usePageHistoryState<FinanceView>('finance.view',fallback);
 const [context,setContext]=useState<{studentId?:string;month?:string;studentName?:string;invoiceId?:string;action?:'create'|'list';billingScope?:'monthly'|'hourly'}|null>(null),[payrollId,setPayrollId]=useState<string|undefined>(),[payrollMonth,setPayrollMonth]=useState<string|undefined>();
 const [prepaymentStudentId,setPrepaymentStudentId]=useState<string|undefined>();
 useEffect(()=>{if(!allowed.includes(view))setView(fallback);},[view,fallback,allowed.join('|')]);
 useEffect(()=>{if(openInvoiceList&&canInvoices){setContext(null);setView('invoices');onInvoiceListOpened?.();}},[openInvoiceList,canInvoices,onInvoiceListOpened,setView]);
 const financePermissions={view:canAdminAction(account,'payments.view'),record:canAdminAction(account,'payments.record'),reverse:canAdminAction(account,'payments.reverse'),refund:canAdminAction(account,'payments.refund'),adjust:canAdminAction(account,'invoices.adjust'),void:canAdminAction(account,'invoices.void'),correctAttendance:canAdminAction(account,'attendance.edit')&&canAdminAction(account,'invoices.adjust'),prepayments:{view:canPrepayments,apply:canAdminAction(account,'prepayments.apply'),reverse:canAdminAction(account,'prepayments.reverse')}};
 const openInvoice=(studentId:string,month:string,studentName?:string,action:'create'|'list'='create',billingScope?:'monthly'|'hourly')=>{if(!changeAllowed())return;setContext({studentId,month,studentName,action,billingScope});setView('invoices');};
 const viewLabel=(key:FinanceView)=>key==='accounts'?financeLabel('学生总览','Students'):key==='tuition'?financeLabel('课程费用与费率','Lesson charges & rates'):key==='invoices'?financeLabel('账单与收据','Invoices & receipts'):key==='prepayments'?financeLabel('预收历史与余额流水','Prepayment history & activity'):key==='settings'?financeLabel('普通单据设置','Invoice settings'):['overview','payroll','expenses'].includes(key)?F2(key):t('invoice.nav.'+key);
 const areaLabel=(key:FinanceArea)=>key==='students'?financeLabel('学生学费','Student tuition'):key==='teachers'?financeLabel('老师薪资','Teacher pay'):financeLabel('机构收支','Income & expenses');
 const areas=allowedFinanceAreas(allowed),area=financeArea(view),children=financeAreaViews[area].filter(key=>allowed.includes(key));
 const navigate=(next:FinanceView)=>{if(!changeAllowed())return;if(next==='invoices')setContext(null);if(next==='prepayments')setPrepaymentStudentId(undefined);if(next==='payroll'){setPayrollId(undefined);setPayrollMonth(undefined);}setView(next);};
 if(account.role!=='admin'||!allowed.length)return <p>{F2('forbidden')}</p>;
 return <div className="finance-workspace finance-compact finance-wave4 finance-three-areas finance-operations-wave4"><nav className="finance-area-navigation" aria-label={t('invoice.nav.finance')}>
  {areas.map(key=><Button key={key} type="button" variant="ghost" aria-current={area===key?'page':undefined} onClick={()=>{const next=financeAreaLanding(key,allowed);if(next)navigate(next);}}>{areaLabel(key)}</Button>)}
 </nav>{children.length>1&&<HorizontalMenu><nav className="finance-secondary-navigation" aria-label={areaLabel(area)}>{children.map(key=><Button key={key} type="button" variant="ghost" aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{viewLabel(key)}</Button>)}</nav></HorizontalMenu>}
 {area==='students'&&!canAccounts&&<p className="finance-access-notice" role="status">{financeLabel('你目前只能查看已获授权的学费功能。学生余额、待缴与核对总览需要相应财务查看权限。','You can use the tuition tools permitted for your account. The combined student balance, amount due and review overview requires the related finance view permissions.')}</p>}
 <Suspense fallback={<p role="status">{t('invoice.loading')}</p>}>
  {view==='overview'&&canOverview&&<FinanceOverview permissions={{payroll:canPayroll,expenses:canExpenses,export:canExport,invoices:canInvoices,prepayments:canPrepayments}} onInvoice={id=>{if(canInvoices&&changeAllowed()){setContext({invoiceId:id});setView('invoices');}}} onPayroll={id=>{if(canPayroll&&changeAllowed()){setPayrollMonth(undefined);setPayrollId(id);setView('payroll');}}} onPayrollMonth={month=>{if(canPayroll&&changeAllowed()){setPayrollId(undefined);setPayrollMonth(month);setView('payroll');}}}/>}
  {view==='tuition'&&canFees&&<BillingWorkspace key={scopeKey} scopeKey={scopeKey} onCourses={onCourses} canManageFees={canManage} onInvoice={canInvoices&&canAdminAction(account,'invoices.create')?openInvoice:undefined}/>}
  {view==='accounts'&&canAccounts&&<StudentStatementsWorkspace key={scopeKey} scopeKey={scopeKey} onInvoice={openInvoice} canCreateInvoice={canAdminAction(account,'invoices.create')} canRecordInvoice={canAdminAction(account,'payments.record')} prepaymentPermissions={{view:canPrepayments,manage:canAdminAction(account,'prepayments.manage'),record:canAdminAction(account,'prepayments.record')}} onTuition={()=>{if(changeAllowed())setView('tuition');}}/>}
  {view==='payroll'&&canPayroll&&<PayrollWorkspace key={payrollId?'record:'+payrollId:payrollMonth?'month:'+payrollMonth:'default'} initialPayrollId={payrollId} initialMonth={payrollMonth} permissions={{rates:canAdminAction(account,'payroll.rates'),edit:canAdminAction(account,'payroll.edit'),confirm:canAdminAction(account,'payroll.confirm'),pay:canAdminAction(account,'payroll.pay'),reverse:canAdminAction(account,'payroll.reverse'),delete:canAdminAction(account,'payroll.delete'),export:canExport}}/>}
  {view==='prepayments'&&canPrepayments&&<PrepaymentsWorkspace key={scopeKey+':'+(prepaymentStudentId||'default')} initialStudentId={prepaymentStudentId} permissions={{view:canPrepayments,record:canAdminAction(account,'prepayments.record'),apply:canAdminAction(account,'prepayments.apply'),refund:canAdminAction(account,'prepayments.refund'),reverse:canAdminAction(account,'prepayments.reverse'),manage:canAdminAction(account,'prepayments.manage')}}/>}
  {view==='expenses'&&canExpenses&&<ExpenseWorkspace permissions={{record:canAdminAction(account,'expenses.record'),reverse:canAdminAction(account,'expenses.reverse'),export:canExport}}/>}
  {(view==='invoices'&&canInvoices||view==='settings'&&canManage)&&<InvoiceWorkspace prepaymentCollectionPermissions={{view:canPrepayments,manage:canAdminAction(account,'prepayments.manage'),record:canAdminAction(account,'prepayments.record')}} canManageFees={canManage} financePermissions={financePermissions} canViewBilling={canFees} view={view==='settings'?'settings':'invoices'} canView={canInvoices} canCreate={canAdminAction(account,'invoices.create')} canEdit={canAdminAction(account,'invoices.edit')} canIssue={canAdminAction(account,'invoices.issue')} canManageSettings={canManage} onBilling={()=>{if(changeAllowed())setView(canFees?'tuition':'invoices');}} initialInvoiceId={context?.invoiceId} initialStudentName={context?.studentName} initialStudentId={context?.studentId} initialMonth={context?.month} initialAction={context?.action} initialBillingScope={context?.billingScope}/>}
 </Suspense></div>;
}
