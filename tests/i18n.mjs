import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const modules=new Map();
async function translationModule(path){
  if(modules.has(path.href))return modules.get(path.href);
  let javascript=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  // Translation maps now live in subject-specific files. Resolve relative
  // imports from that source file before importing the compiled data URL.
  for(const specifier of new Set([...javascript.matchAll(/from ["']([^"']+)["']/g)].map(item=>item[1]))){
    const dependency=specifier.startsWith('.')?await translationModule(new URL(specifier.endsWith('.ts')?specifier:specifier+'.ts',path)):import.meta.resolve(specifier);
    javascript=javascript.replaceAll(`"${specifier}"`,`"${dependency}"`).replaceAll(`'${specifier}'`,`'${dependency}'`);
  }
  const url=`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;modules.set(path.href,url);return url;
}
const { setLanguage, t, translate } = await import(await translationModule(new URL("../lib/i18n.ts",import.meta.url)));

assert.equal(t("排课"), "排课");
setLanguage("en");
assert.equal(t("排课"), "Schedule");
assert.equal(t(" 排课 "), " Schedule ");
assert.equal(t("Ms Sydney"), "Ms Sydney", "user-entered names stay unchanged");

// Request-specific translations must not change the next user's UI language.
assert.match(translate("截止时间不能早于开始时间", "en"), /cannot be earlier/);
assert.equal(translate("账号或班级权限已改变，请刷新后重试", "en"), "Your account or classroom access has changed. Refresh and try again.");
assert.equal(translate("Original schedule changed; submit a new reschedule request", "zh"), "原定课程时间已变动，请重新提交改期申请");
assert.equal(translate("李同学 · 自定义课程", "en"), "李同学 · 自定义课程");
assert.equal(t("排课"), "Schedule");

const files = fs.readdirSync(new URL("../app/", import.meta.url)).filter(name => name.endsWith(".tsx"));
const missing = [];
for (const file of files) {
  const path = new URL(`../app/${file}`, import.meta.url);
  const ast = ts.createSourceFile(file, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function inspect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "t" && node.arguments[0]) {
      function labels(value) {
        if (ts.isStringLiteralLike(value) && /[\u3400-\u9fff]/.test(value.text) && t(value.text) === value.text) missing.push(`${file}: ${value.text}`);
        ts.forEachChild(value, labels);
      }
      labels(node.arguments[0]);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
}
assert.deepEqual(missing, [], "every translated UI label needs an English entry");
console.log("language switching and UI label coverage passed");
