import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE plans (student text); CREATE TABLE lessons (student text); CREATE TABLE accounts (student_name text);");
db.exec("INSERT INTO plans VALUES ('Sample Student'), ('Sample Student'); INSERT INTO lessons VALUES ('Another Student'), ('Sample Student'); INSERT INTO accounts VALUES ('New Student'), (NULL);");
const migration = fs.readFileSync(new URL("../drizzle/0005_students.sql", import.meta.url), "utf8");
for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
assert.deepEqual(db.prepare("SELECT name FROM students ORDER BY name").all().map(row => row.name), ["Another Student", "New Student", "Sample Student"]);
console.log("student migration preserves existing names");
