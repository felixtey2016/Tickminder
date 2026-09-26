import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/password.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { hashPassword, verifyPassword, normalizeUsername, validUsername, validPassword } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

assert.equal(normalizeUsername("  Ms.Sydney  "), "ms.sydney");
assert.equal(validUsername("ms.sydney"), true);
assert.equal(validUsername("x"), false);
assert.equal(validPassword("twelve chars"), true);
assert.equal(validPassword("12345678"), true);
assert.equal(validPassword("1234567"), false);
assert.equal(validPassword("short"), false);
const first = await hashPassword("a longer initial password");
const second = await hashPassword("a longer initial password");
assert.equal(first.split("$")[1], "100000", "password hashes must fit the production PBKDF2 limit");
assert.notEqual(first, second, "each password needs a unique salt");
assert.equal(await verifyPassword("a longer initial password", first), true);
assert.equal(await verifyPassword("incorrect password", first), false);
assert.equal(await verifyPassword("a longer initial password", first.replace("$100000$", "$600000$")), false, "unsupported hashes do not crash login");
console.log("password rules and salted verification passed");
