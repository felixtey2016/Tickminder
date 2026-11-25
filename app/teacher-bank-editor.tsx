"use client";

import {useEffect, useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {groupFetch} from '@/lib/group-client';
import {getLanguage, t} from '@/lib/i18n';
import {emptyTeacherBank, malaysiaBanks, parseTeacherBank, type TeacherBank} from '@/lib/teacher-bank';

type Profile = {bank: TeacherBank | null; version: string | null};
const other = '__other_bank__';
const knownBanks: readonly string[] = malaysiaBanks;
export const bankLabel = (zh: string, en: string) => getLanguage() === 'zh' ? zh : en;

async function requestBank<T>(teacherName: string, data: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await groupFetch('/api/payroll/teacher-bank', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({teacherName, ...data}),
    cache: 'no-store',
    signal,
  });
  if (response.status === 409) throw Error(bankLabel('收款户口已更新，请重新读取后再修改。', 'The bank details changed. Reload before editing again.'));
  if (!response.ok) throw Error(bankLabel('暂时无法读取或保存户口，请重试。', 'Bank details could not be loaded or saved. Try again.'));
  return response.json();
}

export function TeacherBankEditor({teacherName, onClose}: {teacherName: string; onClose: () => void}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<TeacherBank>(emptyTeacherBank);
  const [selection, setSelection] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    requestBank<Profile>(teacherName, {action: 'read'}, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setProfile(value);
      const bank = value.bank ?? emptyTeacherBank;
      setDraft(bank);
      setSelection(!bank.bankName || knownBanks.includes(bank.bankName) ? bank.bankName : other);
    }).catch(caught => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : bankLabel('读取失败，请重试。', 'Could not load. Try again.'));
    });
    return () => controller.abort();
  }, [teacherName, attempt]);

  function reload() {
    setError('');
    setProfile(null);
    setAttempt(value => value + 1);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const bank = parseTeacherBank(draft);
    if (!bank || !profile || saving) return;
    setSaving(true);
    setError('');
    try {
      await requestBank(teacherName, {action: 'save', bank, version: profile.version});
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : bankLabel('保存失败，请重试。', 'Could not save. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={open => {if (!open && !saving) onClose();}}>
    <DialogContent className="lesson-dialog directory-dialog" closeDisabled={saving}>
      <DialogHeader>
        <DialogTitle>{bankLabel('收款户口', 'Bank details')}</DialogTitle>
        <DialogDescription>{teacherName} · {bankLabel('新生成的薪资单会使用这组资料。', 'New payslips use these bank details.')}</DialogDescription>
      </DialogHeader>
      {!profile && !error && <p role="status">{t('正在加载…')}</p>}
      {error && <div className="directory-notice-actions" role="alert">
        <span>{error}</span><Button type="button" variant="outline" onClick={reload}>{bankLabel('重新读取', 'Reload')}</Button>
      </div>}
      {profile && <form className="teacher-bank-form" onSubmit={save} autoComplete="off">
        <label>{bankLabel('银行名称', 'Bank name')}
          <select aria-label={bankLabel('银行名称', 'Bank name')} value={selection} required disabled={saving} onChange={event => {
            const value = event.target.value;
            setSelection(value);
            setDraft(current => ({...current, bankName: value === other ? '' : value}));
          }}>
            <option value="">{t('请选择')}</option>
            {malaysiaBanks.map(bank => <option key={bank} value={bank}>{bank}</option>)}
            <option value={other}>{bankLabel('其他银行', 'Other bank')}</option>
          </select>
        </label>
        {selection === other && <label>{bankLabel('填写银行名称', 'Enter bank name')}
          <input value={draft.bankName} maxLength={100} required disabled={saving} onChange={event => setDraft({...draft, bankName: event.target.value})}/>
        </label>}
        <label>{bankLabel('户名', 'Account holder')}
          <input value={draft.accountHolder} maxLength={160} required disabled={saving} onChange={event => setDraft({...draft, accountHolder: event.target.value})}/>
        </label>
        <label>{bankLabel('户口号码', 'Account number')}
          <input value={draft.accountNumber} inputMode="numeric" maxLength={42} required disabled={saving}
            aria-describedby="teacher-bank-number-hint" onChange={event => setDraft({...draft, accountNumber: event.target.value})}/>
          <small id="teacher-bank-number-hint">{bankLabel('5 至 34 位数字。', '5 to 34 digits.')}</small>
        </label>
        <div className="directory-form-actions"><Button type="submit" disabled={saving || !parseTeacherBank(draft)}>
          {saving ? bankLabel('正在保存…', 'Saving…') : t('保存修改')}
        </Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
