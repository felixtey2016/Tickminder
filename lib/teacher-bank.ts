// Malaysian bank names used on the teacher's profile and on unfilled payslips.
export const malaysiaBanks = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'BSN', 'Bank Rakyat', 'Affin Bank', 'Alliance Bank',
  'Bank Muamalat', 'Agrobank', 'MBSB Bank', 'UOB Malaysia', 'OCBC Malaysia',
  'HSBC Malaysia', 'Standard Chartered Malaysia', 'GXBank', 'AEON Bank',
  'Boost Bank', 'Ryt Bank',
] as const;

export type TeacherBank = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

export const emptyTeacherBank: TeacherBank = {bankName: '', accountHolder: '', accountNumber: ''};

export function parseTeacherBank(value: unknown): TeacherBank | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const {bankName, accountHolder, accountNumber} = value as Partial<TeacherBank>;
  const cleanName = (input: unknown, max: number) =>
    typeof input === 'string' && input.length <= max && !/[\u0000-\u001f\u007f]/.test(input) && input.trim();
  const bank = cleanName(bankName, 100);
  const holder = cleanName(accountHolder, 160);
  const number = typeof accountNumber === 'string' && accountNumber.length <= 42
    ? accountNumber.trim().replace(/[ -]/g, '') : '';
  return bank && holder && /^[0-9]{5,34}$/.test(number)
    ? {bankName: bank, accountHolder: holder, accountNumber: number}
    : null;
}
