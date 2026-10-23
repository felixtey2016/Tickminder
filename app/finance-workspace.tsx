"use client";
import {usePageHistoryState} from '@/lib/page-history';

import {lazy,Suspense,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {canAdminAction,type AdminPermissionAccount} from '@/lib/admin-permission-client';
import {t,registerTranslations} from '@/lib/i18n';
import {invoiceEn,invoiceZh} from '@/lib/invoice-i18n';
import {F2} from '@/lib/finance-round2-i18n';
import './finance-round2.css';
const BillingWorkspace=lazy(()=>import('./billing-workspace'));
const InvoiceWorkspace=lazy(()=>import('./invoice-workspace'));
const FinanceOverview=lazy(()=>import('./finance-overview'));
const PayrollWorkspace=lazy(()=>import('./payroll-workspace'));
const ExpenseWorkspace=lazy(()=>import('./expense-workspace'));
registerTranslations(invoiceZh,invoiceEn);
function changeAllowed(){return window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true}));}
type FinanceAccount=AdminPermissionAccount&{isGroupChief?:boolean};
type FinanceView='overview'|'tuition'|'invoices'|'payroll'|'expenses'|'settings';
export default function FinanceWorkspace({account,students,onCourses}:{account:FinanceAccount;students:string[];onCourses:()=>void}){
 const canFees=canAdminAction(account,'fees.view'),canInvoices=canAdminAction(account,'invoices.view'),canManage=Boolean(account.isOwner||account.isGroupChief),canOverview=canAdminAction(account,'finance.view'),canPayroll=canAdminAction(account,'payroll.view'),canExpenses=canAdminAction(account,'expenses.view'),canExport=canAdminAction(account,'exports.finance');
 const allowed=([['overview',canOverview],['tuition',canFees],['invoices',canInvoices],['payroll',canPayroll],['expenses',canExpenses],['settings',canManage]] as [FinanceView,boolean][]).filter(([,value])=>value).map(([key])=>key),fallback=allowed[0]||'overview';
 const [view,setView]=usePageHistoryState<FinanceView>('finance.view',fallback);
 const [context,setContext]=useState<{studentId?:string;month?:string;studentName?:string;invoiceId?:string}|null>(null),[payrollId,setPayrollId]=useState<string|undefined>();
 useEffect(()=>{if(!allowed.includes(view))setView(fallback);},[view,fallback,allowed.join('|')]);
 const financePermissions={view:canAdminAction(account,'payments.view'),record:canAdminAction(account,'payments.record'),reverse:canAdminAction(account,'payments.reverse'),refund:canAdminAction(account,'payments.refund'),adjust:canAdminAction(account,'invoices.adjust'),void:canAdminAction(account,'invoices.void'),correctAttendance:canAdminAction(account,'attendance.edit')&&canAdminAction(account,'invoices.adjust')};
 const openInvoice=(studentId:string,month:string,studentName?:string)=>{if(!changeAllowed())return;setContext({studentId,month,studentName});setView('invoices');};
 const navigate=(next:FinanceView)=>{if(!changeAllowed())return;if(next==='invoices')setContext(null);if(next==='payroll')setPayrollId(undefined);setView(next);};
 if(account.role!=='admin'||!allowed.length)return <p>{F2('forbidden')}</p>;
 return <div className="finance-workspace"><nav className="finance-navigation" aria-label={t('invoice.nav.finance')}>
  {allowed.map(key=><Button key={key} type="button" variant={view===key?'default':'outline'} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{['overview','payroll','expenses'].includes(key)?F2(key):t('invoice.nav.'+key)}</Button>)}
 </nav><Suspense fallback={<p role="status">{t('invoice.loading')}</p>}>
  {view==='overview'&&canOverview&&<FinanceOverview permissions={{payroll:canPayroll,expenses:canExpenses,export:canExport}} onInvoice={id=>{if(changeAllowed()){setContext({invoiceId:id});setView('invoices');}}} onPayroll={id=>{if(changeAllowed()){setPayrollId(id);setView('payroll');}}}/>}
  {view==='tuition'&&canFees&&<BillingWorkspace students={students} onCourses={onCourses} canManageFees={canManage} onInvoice={canInvoices&&canAdminAction(account,'invoices.create')?openInvoice:undefined}/>}
  {view==='payroll'&&canPayroll&&<PayrollWorkspace initialPayrollId={payrollId} permissions={{rates:canAdminAction(account,'payroll.rates'),edit:canAdminAction(account,'payroll.edit'),confirm:canAdminAction(account,'payroll.confirm'),pay:canAdminAction(account,'payroll.pay'),reverse:canAdminAction(account,'payroll.reverse'),delete:canAdminAction(account,'payroll.delete'),export:canExport}}/>}
  {view==='expenses'&&canExpenses&&<ExpenseWorkspace permissions={{record:canAdminAction(account,'expenses.record'),reverse:canAdminAction(account,'expenses.reverse'),export:canExport}}/>}
  {(view==='invoices'&&canInvoices||view==='settings'&&canManage)&&<InvoiceWorkspace financePermissions={financePermissions} canViewBilling={canFees} view={view==='settings'?'settings':'invoices'} canView={canInvoices} canCreate={canAdminAction(account,'invoices.create')} canEdit={canAdminAction(account,'invoices.edit')} canIssue={canAdminAction(account,'invoices.issue')} canManageSettings={canManage} onBilling={()=>{if(changeAllowed())setView(canFees?'tuition':'invoices');}} initialInvoiceId={context?.invoiceId} initialStudentName={context?.studentName} initialStudentId={context?.studentId} initialMonth={context?.month}/>}
 </Suspense></div>;
}
