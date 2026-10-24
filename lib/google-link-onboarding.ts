export const GOOGLE_LINK_PROMPT_SKIPPED = "googleLinkPromptSkipped";

type Account = {
  id: string;
  groupId?: string | null;
  role: string;
  activationReason?: string | null;
  nameConfirmedAt?: string | null;
  disabledAt?: string | null;
};

/** Optional guidance never replaces mandatory password, profile or role setup. */
export function googleLinkOnboardingEligible(
  account: Account | null | undefined,
  local: { username: string; mustChangePassword?: boolean | number } | null | undefined,
  google: unknown,
  available = true,
) {
  return Boolean(available && account?.id && account.groupId && !account.disabledAt &&
    account.activationReason === "admin-created" && account.nameConfirmedAt &&
    ["admin", "teacher", "student", "parent"].includes(account.role) &&
    local?.username && !local.mustChangePassword && !google);
}
