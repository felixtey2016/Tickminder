import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tuitionGroups } from "@/db/schema";
import { isOwnerAccount } from "@/lib/owner";
import { DEFAULT_GROUP_ID } from "@/lib/group-data";
import type { Account } from "@/lib/auth";

export const GROUP_COOKIE = "tickminder_group";
export async function selectedGroup(account: Account) {
  const requested = (await headers()).get("x-tickminder-group");
  const groupId = isOwnerAccount(account)
    ? requested || (await cookies()).get(GROUP_COOKIE)?.value || DEFAULT_GROUP_ID
    : account.groupId;
  if (!groupId || (!isOwnerAccount(account) && requested && requested !== groupId)) return null;
  const group = await getDb().select().from(tuitionGroups).where(eq(tuitionGroups.id,groupId)).get();
  return group && (group.active || isOwnerAccount(account)) ? group : null;
}
export async function registrationGroup(code: unknown) {
  const value = typeof code === "string" ? code.trim().toLowerCase() : DEFAULT_GROUP_ID;
  if (!/^[a-z0-9-]{3,64}$/.test(value)) return null;
  const group = await getDb().select().from(tuitionGroups).where(eq(tuitionGroups.joinCode,value)).get();
  return group?.active ? group : null;
}
