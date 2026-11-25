export const OWNER_EMAIL = "staging-owner@example.invalid";

export function isOwnerAccount(account: { id: string; email: string; role: string }) {
  return account.role === "admin" && !account.id.startsWith("local:") && account.email.trim().toLowerCase() === OWNER_EMAIL;
}
