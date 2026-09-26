export const OWNER_EMAIL = "felixtey2016@gmail.com";

export function isOwnerAccount(account: { id: string; email: string; role: string }) {
  return account.role === "admin" && !account.id.startsWith("local:") && account.email.trim().toLowerCase() === OWNER_EMAIL;
}
