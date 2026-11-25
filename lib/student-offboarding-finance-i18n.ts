import {registerTranslations} from './i18n';
const labels:Record<string,string>={
 '请选择有效学生与最后上课日期':'Choose a valid student and last lesson date.',
 '有草稿账单待处理':'Draft invoices need attention.',
 '正式账单仍有欠款':'Issued invoices still have unpaid balances.',
 '账单仍有多收款或退款待处理':'Invoice credit balances or refunds need attention.',
 '财务记录需要核对':'Financial records need review.',
 '仍有预收余额或预收差额待处理':'A prepayment balance or discrepancy needs attention.',
 '有预收草稿或未完成的预收费单':'Draft or unpaid prepayment requests need attention.',
 '已上或需收费的课程尚未完成开单核对':'Taught or chargeable lessons still need invoice review.',
 '仍有未完成或考勤收费状态待核对的课程':'Some lessons are unfinished or need attendance and billing review.',
 '固定月费历史范围需要管理员核对':'The monthly fee history needs administrator review.',
 '固定月费仍有月份未完成开单或减免核对':'Some monthly fee periods still need invoicing or waiver review.',
 '关联老师薪资仍有草稿待处理':'Related teacher payroll drafts need attention.',
 '关联老师薪资尚未结清':'Related teacher payroll has not been fully paid.',
 '关联薪资记录需要核对':'Related payroll records need review.',
 '已授课课次尚未纳入已结清薪资':'Some taught sessions are not included in fully settled payroll.',
};
registerTranslations(Object.fromEntries(Object.keys(labels).map(label=>[label,label])),labels);
