import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/owner.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { isOwnerAccount } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
assert.equal(isOwnerAccount({ id: "google:owner", email: "felixtey2016@gmail.com", role: "admin" }), true);
assert.equal(isOwnerAccount({ id: "google:other", email: "someone@example.com", role: "admin" }), false);
assert.equal(isOwnerAccount({ id: "local:fake", email: "felixtey2016@gmail.com", role: "admin" }), false);
assert.equal(isOwnerAccount({ id: "google:owner", email: "felixtey2016@gmail.com", role: "teacher" }), false);
console.log("owner account privilege rules passed");
