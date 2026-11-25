import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Scan actual JSX, including expression/conditional string types. This prevents
// a new business form from silently reintroducing a browser date/time picker.
// Native controls inside the adapters remain necessary for FormData/validity.
const root = path.resolve(import.meta.dirname, '..');
const expected = new Map([['date', 'DateInput'], ['datetime-local', 'DateTimeInput'], ['time', 'TimeInput'], ['month', 'MonthInput']]);
const backingFiles = new Set(['components/date-time-input.tsx', 'components/time-input.tsx', 'components/month-input.tsx']);
const counts = {}, dynamicNativeControls = [], violations = [], rangeUses = [], rangeAdapters = [];
const defaultTypes = new Map([...expected].map(([type, component]) => [component, type]));
const importFile = (from, file) => path.resolve(from.startsWith('@/') ? root : path.dirname(file), from.startsWith('@/') ? from.slice(2) : from).replace(/\.[jt]sx?$/, '');
let scanned = 0;
function values(node) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isJsxExpression(node)) return values(node.expression);
  if (ts.isConditionalExpression(node)) return [...values(node.whenTrue), ...values(node.whenFalse)];
  return [];
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.[jt]sx$/.test(file)) continue;
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    scanned++;
    const imports = new Map();
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) continue;
      for (const specifier of node.importClause.namedBindings.elements) imports.set(specifier.name.text, {name: specifier.propertyName?.text || specifier.name.text, from: node.moduleSpecifier.text});
    }
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source), attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const type = attrs.find(attribute => attribute.name.getText(source) === 'type')?.initializer;
        const imported = imports.get(tag), declared = values(type), temporal = declared.filter(value => expected.has(value));
        if (!type && defaultTypes.has(imported?.name)) temporal.push(defaultTypes.get(imported.name));
        const location = relative + ':' + (source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
        if (imported?.name === 'LessonTimeRange') {
          if (importFile(imported.from, file) !== path.join(root, 'components', 'lesson-time-range')) violations.push(location + ' must use the shared LessonTimeRange');
          else rangeUses.push(relative);
        }
        const backingControl = tag === 'input' && backingFiles.has(relative) && (temporal.length > 0 || Boolean(type && !declared.length));
        if (backingControl) {
          const hidden = attrs.find(attribute => attribute.name.getText(source) === 'aria-hidden')?.initializer;
          if (!values(hidden).includes('true') && !(hidden && ts.isJsxExpression(hidden) && hidden.expression?.kind === ts.SyntaxKind.TrueKeyword)) violations.push(location + ' backing control must be hidden from assistive navigation');
        } else if (tag === 'input' && type && !declared.length) dynamicNativeControls.push(location);
        for (const value of temporal) {
          if (backingControl) continue;
          // The public adapters delegate to their shared implementation only here.
          if (relative === 'components/date-time-input.tsx' && tag === 'DateTimeField' && ['date', 'datetime-local'].includes(value)) continue;
          const component = expected.get(value);
          const module = value === 'date' || value === 'datetime-local' ? '@/components/date-time-input' : '@/components/' + value + '-input';
          if (imported?.name !== component || importFile(imported.from, file) !== importFile(module, file)) violations.push(location + ' uses ' + tag + ' for ' + value + ', expected ' + component);
          else { counts[component] = (counts[component] || 0) + 1; if (relative === 'components/lesson-time-range.tsx') rangeAdapters.push(component); }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
walk(path.join(root, 'app')); walk(path.join(root, 'components'));
assert.deepEqual(violations, [], 'Temporal form fields must use the shared site adapters');
assert.ok(counts.DateInput > 0 && counts.DateTimeInput > 0, 'Both date adapters must be used by real app forms');
assert.deepEqual(rangeAdapters, ['DateInput', 'TimeInput', 'TimeInput'], 'Shared lesson range must retain custom date/start/end controls, including implicit input types');
for (const file of ['app/scheduler-course-pages.tsx', 'app/class-session-schedule.tsx', 'app/scheduler-lesson-dialog.tsx', 'app/reschedule-panel.tsx']) assert(rangeUses.includes(file), file + ' must use the shared lesson date/time range');
console.log(JSON.stringify({passed: true, scanned, counts, rangeUses, nativeBusinessPickers: 0, dynamicNativeControls, note: 'Generic dynamic input types need call-site review; this scan does not execute UI.'}));
