import {normalizeStudentContactPhone,StudentContactError} from './student-contact';

export const tickLearnCallingCode = '+60';

export function tickLearnNationalPhone(value:string) {
 if(value.length>40||!/^[+0-9 ()\-]+$/.test(value))return null;
 const digits=value.trim().replace(/[ ()\-]/g,'');
 return /^(?:(?:\+|00)?60|0)?(1\d{8,9})$/.exec(digits)?.[1]??null;
}

export function normalizeTickLearnPhone(value:unknown) {
 if(typeof value==='string'){
  const national=tickLearnNationalPhone(value);
  if(national)return tickLearnCallingCode+national;
  if(/^(?:\+|00)/.test(value.trim()))return normalizeStudentContactPhone(value);
 }
 throw new StudentContactError('Invalid mobile number');
}
