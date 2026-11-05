export type FinanceView='overview'|'tuition'|'invoices'|'payroll'|'expenses'|'prepayments'|'accounts'|'settings';
export type FinanceArea='students'|'teachers'|'organisation';
export const financeAreas:readonly FinanceArea[]=['students','teachers','organisation'];
export const financeAreaViews:Record<FinanceArea,readonly FinanceView[]>={
 students:['accounts','tuition','invoices','prepayments','settings'],
 teachers:['payroll'],
 organisation:['overview','expenses'],
};
/** Leaf names stay unchanged so saved finance histories keep their meaning. */
export function financeArea(view:FinanceView):FinanceArea{
 return view==='payroll'?'teachers':view==='overview'||view==='expenses'?'organisation':'students';
}
export function allowedFinanceAreas(allowed:readonly FinanceView[]):FinanceArea[]{
 return financeAreas.filter(area=>financeAreaViews[area].some(view=>allowed.includes(view)));
}
export function financeAreaLanding(area:FinanceArea,allowed:readonly FinanceView[]):FinanceView|undefined{
 return financeAreaViews[area].find(view=>allowed.includes(view));
}
