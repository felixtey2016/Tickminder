export const notificationCategories = ['courses','homework','fees'] as const;
export type NotificationCategory = typeof notificationCategories[number];
/** Expressions are internal SQL aliases only; never accept them from a request. */
export function notificationPreferenceSql(account:string,category:NotificationCategory,eventAt:string){
 return `NOT EXISTS(SELECT 1 FROM notification_preferences pref WHERE pref.account_id=${account} AND (pref.${category}_enabled=0 OR pref.${category}_since>${eventAt}))`;
}
export function parentPreferenceSql(n='n'){
 return `((${n}.kind='student_absent' AND ${notificationPreferenceSql(n+'.account_id','courses',n+'.due_at')}) OR (${n}.kind<>'student_absent' AND ${notificationPreferenceSql(n+'.account_id','fees',n+'.due_at')}))`;
}
