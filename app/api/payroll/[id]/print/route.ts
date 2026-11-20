import {currentBusinessAccount} from '@/lib/auth';
import {PayrollError} from '@/lib/payroll';
import {payrollPayslip} from '@/lib/payroll-server';
import {renderPayrollPayslip} from '@/lib/payroll-payslip';

const headers = {
 'Cache-Control': 'private, no-store',
 'Vary': 'Cookie, x-tickminder-group',
 'X-Content-Type-Options': 'nosniff',
 'Referrer-Policy': 'no-referrer',
 'X-Robots-Tag': 'noindex',
 'Cross-Origin-Resource-Policy': 'same-origin',
};

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
 const actor = await currentBusinessAccount();
 if (!actor) return Response.json({error:'请先登录'}, {status:401, headers});
 try {
  const {id} = await context.params;
  const language = new URL(request.url).searchParams.get('lang') === 'zh' ? 'zh' : 'en';
  const document = await payrollPayslip(actor, id);
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(renderPayrollPayslip(document, language, nonce), {headers:{
   ...headers,
   'Content-Type': 'text/html; charset=utf-8',
   'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  }});
 } catch (error) {
  if (error instanceof PayrollError) return Response.json({error:error.message}, {status:error.status, headers});
  return Response.json({error:'薪资单暂时无法生成，请稍后重试'}, {status:503, headers});
 }
}
