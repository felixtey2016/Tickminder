import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/duration-format.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const {durationMillisecondsBetween, formatDurationBetween, formatDurationMilliseconds, formatDurationSeconds, formatDurationMinutes, formatDurationHours} = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

assert.equal(formatDurationHours(1.5,'zh'),'1小时30分钟');
assert.equal(formatDurationHours(1.5,'en'),'1 hour 30 minutes');
assert.equal(formatDurationHours(1.25,'zh'),'1小时15分钟');
assert.equal(formatDurationHours(2,'en'),'2 hours');
assert.equal(formatDurationHours(1,'en'),'1 hour');
assert.equal(formatDurationMinutes(61,'en'),'1 hour 1 minute');
assert.equal(formatDurationMinutes(1,'en'),'1 minute');
assert.equal(formatDurationMinutes(30,'zh'),'30分钟');
assert.equal(formatDurationMinutes(0,'en'),'0 minutes');
assert.equal(formatDurationHours(0,'zh'),'0分钟');

// Minute carry is applied once to the raw duration, rather than printing 1h60m.
assert.equal(formatDurationSeconds(7_199,'en'),'2 hours');
assert.equal(formatDurationSeconds(3_599,'zh'),'1小时');
assert.equal(formatDurationMinutes(59.5,'en'),'1 hour');
assert.equal(formatDurationMinutes(89.49,'en'),'1 hour 29 minutes');
assert.equal(formatDurationMinutes(89.5,'en'),'1 hour 30 minutes');
assert.equal(formatDurationSeconds(1,'zh'),'不足1分钟');
assert.equal(formatDurationSeconds(59,'en'),'Less than 1 minute');

const start = '2026-10-16T08:00:00.000Z';
const end = '2026-10-16T09:30:00.000Z';
assert.equal(durationMillisecondsBetween(start,end),5_400_000);
assert.equal(formatDurationBetween(start,end,'en'),'1 hour 30 minutes');
assert.equal(formatDurationBetween('2026-10-16T16:00:00+08:00',end,'zh'),'1小时30分钟');
assert.equal(formatDurationBetween(new Date(start),new Date(end),'zh'),'1小时30分钟');

// Summing short attendance intervals retains seconds until the final display.
const intervals = Array.from({length:90},(_,i)=>durationMillisecondsBetween(
  new Date(Date.parse(start)+i*20_000),new Date(Date.parse(start)+(i+1)*20_000)));
const accumulated = intervals.reduce((sum,value)=>sum+value,0);
assert.equal(accumulated,1_800_000);
assert.equal(formatDurationMilliseconds(accumulated,'en'),'30 minutes');
assert.equal(formatDurationHours(intervals.reduce((sum,value)=>sum+value/3_600_000,0),'zh'),'30分钟');

for(const value of [null,undefined,NaN,Infinity,-Infinity,-1]) {
  assert.equal(formatDurationMilliseconds(value,'en'),'—');
  assert.equal(formatDurationMinutes(value,'zh'),'—');
  assert.equal(formatDurationHours(value,'en'),'—');
}
for(const pair of [[null,end],['',end],['not-a-date',end],[end,start],[start,undefined],[new Date(NaN),new Date(end)]]) {
  assert.equal(durationMillisecondsBetween(...pair),null);
  assert.equal(formatDurationBetween(...pair,'en'),'—');
}

console.log('Lesson duration formatting: bilingual units, minute carry, exact aggregation and unknown values passed.');
