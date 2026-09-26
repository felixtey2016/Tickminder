import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE audit (id text PRIMARY KEY NOT NULL, at text NOT NULL)");
const revision = () => db.prepare("SELECT coalesce(max(rowid), 0) AS value FROM audit").get().value;
assert.equal(revision(), 0);
db.exec("INSERT INTO audit VALUES ('one', '2026-09-26T00:00:00.000Z')");
const first = revision();
db.exec("INSERT INTO audit VALUES ('two', '2026-09-26T00:00:00.000Z')");
assert.ok(revision() > first, "a second update must have a new revision even within the same millisecond");
console.log("live sync revision advances for every audited update");
