import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { normalizeOnlineLink } from "../lib/online-link.ts";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE accounts (id text PRIMARY KEY, name text NOT NULL, created_at text NOT NULL); CREATE TABLE plans (key text PRIMARY KEY);");
db.exec("INSERT INTO accounts VALUES ('existing', 'Existing Teacher', '2026-09-01T00:00:00.000Z'); INSERT INTO plans VALUES ('Student|Science');");
const migration = readFileSync(new URL("../drizzle/0009_fixed_scream.sql", import.meta.url), "utf8");
for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
assert.equal(db.prepare("SELECT name_confirmed_at FROM accounts WHERE id = 'existing'").get().name_confirmed_at, "2026-09-01T00:00:00.000Z");
db.exec("INSERT INTO accounts (id, name, created_at) VALUES ('new', 'New Student', '2026-09-28T00:00:00.000Z')");
assert.equal(db.prepare("SELECT name_confirmed_at FROM accounts WHERE id = 'new'").get().name_confirmed_at, null);
db.exec("UPDATE plans SET online_link = 'https://meet.google.com/abc-defg-hij' WHERE key = 'Student|Science'");
assert.equal(db.prepare("SELECT online_link FROM plans").get().online_link, "https://meet.google.com/abc-defg-hij");
assert.equal(normalizeOnlineLink(" https://meet.google.com/abc-defg-hij "), "https://meet.google.com/abc-defg-hij");
assert.equal(normalizeOnlineLink(""), null);
for (const link of ["javascript:alert(1)", "http://example.com/room", "https://user:pass@example.com", "not a link"])
  assert.throws(() => normalizeOnlineLink(link));
console.log("first-login name migration and online link validation passed");
