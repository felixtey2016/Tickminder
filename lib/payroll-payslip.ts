import type {PayrollDocument} from './payroll';
import {formatDurationSeconds} from './duration-format';
import {malaysiaBanks, type TeacherBank} from './teacher-bank';
import {payslipFileName} from './payroll-pdf';

const payslipTemplates = ['standard', 'centered', 'brand'] as const;
export function isPayslipTemplate(value: unknown) {
  return payslipTemplates.some(template => template === value);
}

type PayslipOptions = {
  bank: TeacherBank | null;
  bankVersion: string | null;
  revision: number;
  canArchive: boolean;
};

export type PayslipData = {
  institutionName: string;
  payroll: PayrollDocument;
  bonusCents: number;
  deductionCents: number;
};

type Language = 'zh' | 'en';
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, char =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]!)
);

const styles = `
  * { box-sizing: border-box; }
  :root { font-family: Arial, "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color: #24212d; background: #f2eff7; line-height: 1.5; }
  body { margin: 0 auto; max-width: 920px; padding: 24px; }
  h1,h2,p,dl,dd { margin: 0; } h1 { line-height: 1.2; } h2 { font-size: 1.05em; }
  .tools,.paper { background: white; border: 1px solid #e3deeb; border-radius: 12px; padding: 24px; }
  .tools { margin-bottom: 20px; }
  .tools form { display: grid; gap: 12px; }
  .fields,.metadata,.bank { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
  label,input,select { display: block; width: 100%; }
  label { font-size: .9em; }
  input,select,button,.tool-actions a { font: inherit; min-height: 44px; border-radius: 8px; padding: 8px 12px; }
  input,select { margin-top: 4px; border: 1px solid #c9c2d4; color: inherit; background: white; }
  button { justify-self: start; border: 1px solid transparent; background: #5942a9; color: white; font-weight: bold; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible { outline: 2px solid #5942a9; outline-offset: 2px; }
  .tool-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .tool-actions a { border: 1px solid #c9c2d4; color: #5942a9; text-decoration: none; }
  .tool-actions .secondary { background: white; color: #5942a9; border-color: #c9c2d4; }
  [hidden] { display: none !important; }
  #save-status:empty { display: none; }
  .paper { border-top: 4px solid #5942a9; padding: 28px; }
  .heading { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .institution { font-weight: 700; color: #4b387f; overflow-wrap: anywhere; }
  .reference { color: #545060; font-size: .85em; overflow-wrap: anywhere; }
  .layout-picker { max-width: 24rem; }
  body[data-template="centered"] .heading { display: grid; justify-content: center; text-align: center; }
  body[data-template="brand"] .heading { background: #5942a9; color: white; padding: 18px; border-radius: 8px; }
  body[data-template="brand"] .heading :is(.institution,.reference) { color: white; }
  .metadata,.bank { padding: 12px; border-radius: 8px; background: #f4f1fa; }
  .metadata dd,.bank dd { font-weight: 600; overflow-wrap: anywhere; }
  dt { color: #545060; font-size: .85em; }
  .section { margin-top: 20px; }
  .section h2 { margin-bottom: 8px; }
  .totals { margin-left: auto; max-width: 360px; }
  .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 10px; }
  .totals dt { font-size: inherit; }
  .totals .net { background: #ede7f8; color: #33265e; border-radius: 6px; font-weight: bold; }
  .totals .net dt { color: inherit; }
  .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .88em; }
  td,th { padding: 7px 8px; border-bottom: 1px solid #e2deea; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
  th { background: #f4f1fa; }
  .detail { display: block; font-size: .9em; color: #545060; }
  .detail[hidden] { display: none; }
  .print-error { display: none; }
  @media screen and (max-width: 580px) {
    body { padding: 12px; }
    .paper,.tools { padding: 16px; }
    .fields,.metadata,.bank { grid-template-columns: 1fr; }
    .lesson-table,.lesson-table tbody,.lesson-table tbody tr,.lesson-table td { display: block; }
    .lesson-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .lesson-table tr { padding: 10px 0; border-bottom: 1px solid #e2deea; }
    .lesson-table td { padding: 2px 0; border: 0; }
    .lesson-table td:first-child { font-weight: 600; }
    .lesson-table td[data-label] { display: flex; justify-content: space-between; gap: 10px; text-align: right; white-space: normal; }
    .lesson-table td[data-label]::before { content: attr(data-label); color: #545060; text-align: left; }
  }
  @page { size: A4; margin: 12mm; }
  @media print {
    html,body { background: white; margin: 0; padding: 0; max-width: none; font-size: 11pt; }
    .tools { display: none; }
    .paper { border: 0; border-radius: 0; padding: 0; }
    .fields,.metadata,.bank { grid-template-columns: repeat(3,minmax(0,1fr)); }
    .table-wrap { overflow: visible; }
    .table-wrap table { min-width: 0; }
    .heading,.metadata,.bank,.totals,tr { break-inside: avoid; }
    h2 { break-after: avoid; }
    thead { display: table-header-group; }
    body:not([data-bank-ready]) .paper { display: none; }
    body:not([data-bank-ready]) .print-error { display: block; }
  }
`;

export function renderPayrollPayslip({institutionName, payroll, bonusCents, deductionCents}: PayslipData, language: Language, nonce: string, options: PayslipOptions) {
  const label = (zh: string, en: string) => language === 'zh' ? zh : en;
  const title = label('老师薪资单', 'Teacher payslip');
  const fileName = payslipFileName(payroll.teacherName, payroll.month);
  const moneyFormatter = new Intl.NumberFormat('en-MY', {style:'currency', currency:'MYR'});
  const money = (cents: number) => escape(moneyFormatter.format(cents / 100));
  const dateFormatter = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
    timeZone:'Asia/Kuala_Lumpur', year:'numeric', month:'short', day:'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Kuala_Lumpur', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  });
  const lines = payroll.sourceLines.filter(line => line.status === 'ready' || line.status === 'excluded');
  const monthly = (payroll.monthlyLines ?? []).filter(line => line.status === 'ready' && line.amountCents !== null);
  const netCents = payroll.baseTotalCents + bonusCents - deductionCents;
  const reference = 'PAY-' + payroll.month.replace('-', '') + '-' + payroll.id.replaceAll('-', '').slice(0, 12).toUpperCase();
  const monthlyLabel = label('含在月薪内', 'Included in monthly pay');
  const excludedLabel = label('未授课', 'Not taught');
  const durationLabel = label('授课时长', 'Teaching time');
  const rateLabel = label('费率', 'Rate');
  const amountLabel = label('金额', 'Amount');
  const duration = (seconds: number) => escape(formatDurationSeconds(seconds, language));
  const lineRows = lines.map(line => {
    const taught = line.status === 'ready';
    const start = new Date((taught && line.actualStart) || line.plannedStart);
    const end = new Date((taught && line.actualEnd) || line.plannedEnd);
    const startDay = dateFormatter.format(start), endDay = dateFormatter.format(end);
    const time = timeFormatter.format(start) + '–' + (endDay === startDay ? '' : endDay + ' ') + timeFormatter.format(end);
    const rateCents = line.unitAmountCents ?? line.hourlyRateCents;
    const byMonth = line.rateMode === 'month';
    const rate = !taught || byMonth || rateCents == null
      ? '—'
      : money(rateCents) + (line.rateMode === 'lesson' ? label(' / 堂', ' / lesson') : label(' / 小时', ' / hour'));
    const amount = !taught ? '—' : byMonth ? monthlyLabel : money(line.amountCents ?? 0);
    return `<tr><td>${escape(startDay)}<span class="detail">${escape(time)}</span></td>
      <td>${escape(line.classroomTitle || line.subject)}${line.classroomTitle && line.classroomTitle !== line.subject ? '<span class="detail">' + escape(line.subject) + '</span>' : ''}</td>
      <td data-label="${durationLabel}">${taught ? duration(line.durationSeconds) : excludedLabel}</td>
      <td data-label="${rateLabel}">${rate}</td><td class="number" data-label="${amountLabel}">${amount}</td></tr>`;
  }).join('');
  const term = (name: string, value: string) => `<div><dt>${name}</dt><dd>${value}</dd></div>`;

  return `<!doctype html>
<html lang="${language === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(fileName.replace(/\.pdf$/, ''))}</title><style>${styles}</style></head>
<body data-template="standard"${options.bank ? ' data-bank-ready' : ''}>
<section class="tools" aria-label="${label('打印设置', 'Print settings')}">
  <form id="bank-form" autocomplete="off" data-revision="${escape(options.revision)}" data-bank-version="${escape(options.bankVersion ?? '')}">
    <label class="layout-picker" for="payslip-template">${label('薪资单排版', 'Payslip layout')}
      <select id="payslip-template">
        <option value="standard">${label('标准商务款', 'Standard business')}</option>
        <option value="centered">${label('简洁居中款', 'Simple centred')}</option>
        <option value="brand">${label('机构品牌款', 'Institution brand')}</option>
      </select>
    </label>
    ${options.bank
      ? `<p class="detail">${label('已带入老师资料中的收款户口。', 'Bank details loaded from the teacher profile.')}</p>`
      : `<div><h2>${label('填写收款银行资料', 'Enter bank details')}</h2>
      <p class="detail">${label('也可以在老师资料保存收款户口，下次自动带出。','You can save bank details on the teacher profile to use them next time.')}</p>
    </div><div class="fields">
      <label for="teacher-bank">${label('银行名称', 'Bank name')}
        <select id="teacher-bank" required>
          <option value="">${label('请选择', 'Select')}</option>
          ${malaysiaBanks.map(bank => `<option value="${escape(bank)}">${escape(bank)}</option>`).join('')}
          <option value="__other_bank__">${label('其他银行', 'Other bank')}</option>
        </select>
      </label>
      <label for="account-holder">${label('户名', 'Account holder')}<input id="account-holder" required maxlength="160"></label>
      <div>
        <label for="account-number">${label('银行户口号码', 'Bank account number')}<input id="account-number" required inputmode="numeric" maxlength="42" aria-describedby="bank-number-hint"></label>
        <span class="detail" id="bank-number-hint" hidden>${label('请输入 5 至 34 位数字。', 'Enter 5 to 34 digits.')}</span>
      </div>
      <label id="other-bank-field" for="other-bank-name" hidden>${label('填写银行名称', 'Enter bank name')}
        <input id="other-bank-name" maxlength="100" disabled>
      </label>
    </div>`}
    <div class="tool-actions">
      ${options.canArchive
        ? `<button id="save-slip" type="submit" disabled>${label('存档并下载 PDF', 'Save and download PDF')}</button>`
        : `<button id="print-slip" type="submit" disabled>${label('打印 / 保存 PDF', 'Print / Save PDF')}</button>`}
      <a id="open-saved-slip" hidden>${label('查看已存档薪资单', 'Open saved payslip')}</a>
      <a id="download-saved-slip" hidden>${label('下载 PDF', 'Download PDF')}</a>
    </div>
    <p class="detail" id="save-status" role="status"></p>
  </form>
</section>
<p class="print-error">${label('请先填写收款银行资料，再打印薪资单。', 'Fill in the bank details before printing the payslip.')}</p>
<main class="paper">
  <header class="heading">
    <div><p class="institution">${escape(institutionName)}</p><h1>${title}</h1></div>
    <p class="reference">${escape(reference)}</p>
  </header>
  <dl class="metadata">
    ${term(label('老师', 'Teacher'), escape(payroll.teacherName))}
    ${term(label('薪资月份', 'Pay period'), escape(payroll.month))}
    ${term(label('核算日期', 'Payroll date'), payroll.confirmedAt ? escape(dateFormatter.format(new Date(payroll.confirmedAt))) : '—')}
  </dl>
  <section class="section">
    <h2>${label('薪资合计', 'Earnings summary')}</h2>
    <dl class="totals">
      ${term(label('授课报酬', 'Teaching pay'), money(payroll.baseTotalCents))}
      ${bonusCents ? term(label('加项', 'Additions'), '+ ' + money(bonusCents)) : ''}
      ${deductionCents ? term(label('扣项', 'Deductions'), '− ' + money(deductionCents)) : ''}
      <div class="net"><dt>${label('应发薪资', 'Net pay')}</dt><dd class="number">${money(netCents)}</dd></div>
    </dl>
  </section>
  <section class="section">
    <h2>${label('收款银行资料', 'Bank details')}</h2>
    <dl class="bank">
      ${term(label('银行名称', 'Bank name'), `<span id="slip-bank">${escape(options.bank?.bankName || '—')}</span>`)}
      ${term(label('户名', 'Account holder'), `<span id="slip-holder">${escape(options.bank?.accountHolder || '—')}</span>`)}
      ${term(label('银行户口号码', 'Bank account number'), `<span id="slip-number">${escape(options.bank?.accountNumber || '—')}</span>`)}
    </dl>
  </section>
  ${monthly.length ? `<section class="section"><h2>${label('班级月薪明细', 'Fixed monthly pay')}</h2><div class="table-wrap">
    <table><thead><tr><th scope="col">${label('班级', 'Class')}</th><th scope="col" class="number">${label('金额', 'Amount')}</th></tr></thead>
    <tbody>${monthly.map(line => `<tr><td>${escape(line.classroomTitle)}</td><td class="number">${money(line.amountCents!)}</td></tr>`).join('')}</tbody></table>
  </div></section>` : ''}
  <section class="section">
    <h2>${label('授课记录', 'Teaching record')} · ${payroll.lessonCount} ${label('堂', payroll.lessonCount === 1 ? 'session' : 'sessions')} · ${duration(payroll.durationSeconds)}</h2>
    <div class="table-wrap"><table class="lesson-table"><thead><tr>
      <th scope="col">${label('日期 / 时间（GMT+8）', 'Date / time (GMT+8)')}</th>
      <th scope="col">${label('班级 / 科目', 'Class / subject')}</th>
      <th scope="col">${durationLabel}</th>
      <th scope="col">${rateLabel}</th>
      <th scope="col" class="number">${amountLabel}</th>
    </tr></thead><tbody>${lineRows}</tbody></table></div>
  </section>
</main>
<script nonce="${escape(nonce)}" src="/payroll-payslip.js?v=2" defer></script></body></html>`;
}
