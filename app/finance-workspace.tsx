"use client";
import {usePageHistoryState} from '@/lib/page-history';

import {lazy,Suspense,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {canAdminAction,type AdminPermissionAccount} from '@/lib/admin-permission-client';
import {t,registerTranslations} from '@/lib/i18n';
import {invoiceEn,invoiceZh} from '@/lib/invoice-i18n';
const BillingWorkspace=lazy(()=>import('./billing-workspace'));
const InvoiceWorkspace=lazy(()=>import('./invoice-workspace'));
registerTranslations(invoiceZh,invoiceEn);
function changeAllowed(){return window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true}));}
type FinanceAccount=AdminPermissionAccount&{isGroupChief?:boolean};
export default function FinanceWorkspace({account,students,onCourses}:{account:FinanceAccount;students:string[];onCourses:()=>void}){
 const canFees=canAdminAction(account,'fees.view'),canInvoices=canAdminAction(account,'invoices.view'),canManage=Boolean(account.isOwner||account.isGroupChief);
 const [view,setView]=usePageHistoryState<'tuition'|'invoices'|'settings'>('finance.view',canFees?'tuition':'invoices');
 const [context,setContext]=useState<{studentId:string;month:string;studentName?:string}|null>(null);
 useEffect(()=>{if(view==='tuition'&&!canFees)setView('invoices');if(view==='invoices'&&!canInvoices&&canFees)setView('tuition');if(view==='settings'&&!canManage)setView(canFees?'tuition':'invoices');},[view,canFees,canInvoices,canManage]);
 const openInvoice=(studentId:string,month:string,studentName?:string)=>{if(!changeAllowed())return;setContext({studentId,month,studentName});setView('invoices');};
 return <div className="finance-workspace"><nav className="finance-navigation" aria-label={t('invoice.nav.finance')}>
  {canFees&&<Button type="button" variant={view==='tuition'?'default':'outline'} aria-current={view==='tuition'?'page':undefined} onClick={()=>{if(changeAllowed())setView('tuition');}}>{t('invoice.nav.tuition')}</Button>}
  {canInvoices&&<Button type="button" variant={view==='invoices'?'default':'outline'} aria-current={view==='invoices'?'page':undefined} onClick={()=>{if(changeAllowed()){setContext(null);setView('invoices');}}}>{t('invoice.nav.invoices')}</Button>}
  {canManage&&<Button type="button" variant={view==='settings'?'default':'outline'} aria-current={view==='settings'?'page':undefined} onClick={()=>{if(changeAllowed())setView('settings');}}>{t('invoice.nav.settings')}</Button>}
 </nav><Suspense fallback={<p role="status">{t('invoice.loading')}</p>}>
  {view==='tuition'&&canFees?<BillingWorkspace students={students} onCourses={onCourses} canManageFees={canManage} onInvoice={canInvoices&&canAdminAction(account,'invoices.create')?openInvoice:undefined}/>:<InvoiceWorkspace canViewBilling={canFees} view={view==='settings'?'settings':'invoices'} canView={canInvoices} canCreate={canAdminAction(account,'invoices.create')} canEdit={canAdminAction(account,'invoices.edit')} canIssue={canAdminAction(account,'invoices.issue')} canManageSettings={canManage} onBilling={()=>{if(changeAllowed())setView(canFees?'tuition':'invoices');}} initialStudentName={context?.studentName} initialStudentId={context?.studentId} initialMonth={context?.month}/>}
 </Suspense></div>;
}
