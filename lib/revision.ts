import {groupWhere} from "@/lib/group-data";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { audit } from "@/db/schema";

export async function readRevision(groupId:string|null) {
  const row = await getDb().select({ value: sql<number>`coalesce(max(rowid), 0)` }).from(audit).where(groupWhere(audit,groupId)).get();
  return Number(row?.value || 0);
}
