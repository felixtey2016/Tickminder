import {prepaymentPrintResponse} from '@/lib/prepayment-print';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return prepaymentPrintResponse(request,(await context.params).id,'request');}
