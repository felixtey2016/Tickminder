import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { setLanguage, t } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

assert.equal(t("排课"), "排课");
setLanguage("en");
assert.equal(t("排课"), "Schedule");
assert.equal(t(" 排课 "), " Schedule ");
assert.equal(t("Ms Sydney"), "Ms Sydney", "user-entered names stay unchanged");

const files = ["account-directory.tsx", "account-settings.tsx", "directory-tools.tsx", "classrooms-page.tsx", "home-dashboard.tsx", "learning-portal.tsx", "scheduler.tsx", "portals.tsx", "conflict-preview.tsx", "lesson-history.tsx", "student-calendar.tsx", "week-calendar.tsx", "activity-log.tsx", "timetables.tsx", "roster-forms.tsx", "sheet-sync-panel.tsx"];
const missing = [];
for (const file of files) {
  const path = new URL(`../app/${file}`, import.meta.url);
  const ast = ts.createSourceFile(file, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function inspect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const value = node.arguments[0].text;
      if (/[\u3400-\u9fff]/.test(value) && t(value) === value) missing.push(`${file}: ${value}`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
}
assert.deepEqual(missing, [], "every translated UI label needs an English entry");
console.log("language switching and UI label coverage passed");
