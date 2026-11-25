import {env} from 'cloudflare:workers';
import {boundAccountSessionHash, transferAccountSession} from './account-session';
import {currentIdentity, type Account} from './auth';
import {DEFAULT_GROUP_ID} from './group-data';
import {tickLearnSignupReason} from './ticklearn-routes';

export function isTickLearnAccount(account: Account) {
  return account.role === 'learner' && account.groupId === null ||
    account.role === 'student' && account.groupId === DEFAULT_GROUP_ID && account.activationReason === tickLearnSignupReason;
}

export async function currentTickLearnAccount() {
  const identity = await currentIdentity();
  if (!identity || identity.local?.mustChangePassword || !isTickLearnAccount(identity.account)) return null;
  if (identity.account.role === 'student') {
    const eligible = await env.DB?.prepare(`SELECT 1 FROM students s JOIN tuition_groups g ON g.id=s.group_id AND g.active=1
      WHERE s.group_id=? AND s.name=? AND s.active=1`).bind(DEFAULT_GROUP_ID, identity.account.studentName).first();
    return eligible ? identity.account : null;
  }
  return transferAccountSession(identity.account, {...identity.account, groupId: DEFAULT_GROUP_ID});
}

export async function currentTickLearnWatchViewer() {
  const account = await currentTickLearnAccount();
  const sourceHash = account && boundAccountSessionHash(account);
  return account && sourceHash ? {groupId: DEFAULT_GROUP_ID, accountId: account.id, name: account.name,
    role: account.role === 'student' ? 'student' as const : 'learner' as const, tickLearn:1, sourceHash} : null;
}
