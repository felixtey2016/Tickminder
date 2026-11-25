import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const output = await build({entryPoints:[fileURLToPath(new URL('../lib/date-time-picker.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const p = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
let checks = 0;
const equal = (actual, expected, name) => {assert.deepEqual(actual, expected, name);checks++;};
const constraints = (type, extra = {}) => ({type,min:'',max:'',step:'',defaultValue:'',required:false,...extra});
for (const value of ['2023-02-29','1900-02-29','2024-04-31','2024-00-10','2024-13-01','0000-01-01','2024-1-01','2024-01-01T12:00']) equal(p.parseDate(value),null,'reject invalid date ' + value);
for (const value of ['0001-01-01','0099-12-31','1600-02-29','1970-01-01','2000-02-29','2024-02-29','2024-12-31','9999-12-31']) {
  const parts = p.parseDate(value);
  equal(p.fromDayNumber(p.dayNumber(parts.year,parts.month,parts.day)),value,'civil day roundtrip ' + value);
  equal(p.localValue('date',p.localNumber('date',value)),value,'local date roundtrip ' + value);
}
equal(p.dayNumber(1970,1,1),0,'epoch day');
equal(p.fromDayNumber(p.dayNumber(2024,2,28)+1),'2024-02-29','leap next day');
equal(p.fromDayNumber(p.dayNumber(2024,2,29)+1),'2024-03-01','leap month boundary');
equal(p.fromDayNumber(p.dayNumber(2024,12,31)+1),'2025-01-01','year boundary');
for (const timezone of ['UTC','Asia/Singapore','America/Los_Angeles','Pacific/Kiritimati']) {
  process.env.TZ = timezone;
  for (const value of ['0099-01-02T00:00','2024-03-10T02:30','2024-11-03T01:30','2024-02-29T23:59:59.123','2025-01-01T00:00']) equal(p.localValue('datetime-local',p.localNumber('datetime-local',value)),value,'timezone-independent local value ' + timezone + ' ' + value);
}
for (const value of ['2024-02-29T24:00','2024-02-29T12:60','2024-02-29T12:00:60','2024-02-29T12:00Z','2024-02-29T12:00+08:00','2024-02-29T12:00:00.1234','2024-02-29T12:00T09:00']) equal(p.localNumber('datetime-local',value),null,'reject invalid datetime ' + value);
const date = constraints('date',{min:'2024-02-28',max:'2024-03-02',step:'2'});
for(const [value, expected] of [['2024-02-27',false],['2024-02-28',true],['2024-02-29',false],['2024-03-01',true],['2024-03-02',false],['2024-03-03',false]]) equal(p.dateAllowed(date,value),expected,'date min/max/step ' + value);
const defaultBase = constraints('date',{defaultValue:'2024-02-29',step:'2'});
equal(p.dateAllowed(defaultBase,'2024-03-01'),false,'defaultValue step base excludes next day');
equal(p.dateAllowed(defaultBase,'2024-03-02'),true,'defaultValue step base includes second day');
equal(p.dateAllowed(constraints('date',{min:'2024-01-01',step:'0.3'}),'2024-01-02'),false,'fractional day step rejects nonaligned date');
equal(p.dateAllowed(constraints('date',{min:'2024-01-01',step:'0.3'}),'2024-01-04'),true,'fractional day step accepts aligned date');
const dt = constraints('datetime-local',{min:'2024-02-29T23:45',max:'2024-03-01T00:30',step:'900'});
for(const [value, expected] of [['2024-02-28',false],['2024-02-29',true],['2024-03-01',true],['2024-03-02',false]]) equal(p.dateAllowed(dt,value),expected,'datetime date availability ' + value);
for(const [wanted,expected] of [['2024-02-28T12:00','2024-02-29T23:45'],['2024-02-29T23:58','2024-03-01T00:00'],['2024-03-01T10:00','2024-03-01T00:30']]) equal(p.localValue('datetime-local',p.nearestAllowed(dt,p.localNumber('datetime-local',wanted))),expected,'clamp complete local datetime ' + wanted);
const minute = p.localNumber('datetime-local','2024-03-01T00:15');
equal(p.nearestAllowed(dt,minute,minute,minute+59999),minute,'valid minute interval');
equal(p.nearestAllowed(dt,minute+60000,minute+60000,minute+119999),null,'invalid minute interval');
const seconds = constraints('datetime-local',{min:'2024-03-01T09:00:17.125',max:'2024-03-01T09:00:18',step:'0.25'});
equal(p.localValue('datetime-local',p.nearestAllowed(seconds,p.localNumber('datetime-local','2024-03-01T09:00:17.8'))),'2024-03-01T09:00:17.875','fractional second step aligned to full min');
equal(p.nearestAllowed(constraints('date',{min:'2024-03-01',max:'2024-02-01'}),0),null,'reversed bounds have no value');
equal(p.dateAllowed(constraints('datetime-local',{min:'2024-03-02T00:00'}),'2024-03-01'),false,'whole datetime minimum excludes previous date');
equal(p.localValue('datetime-local',p.nearestAllowed(constraints('datetime-local',{step:'any'}),p.localNumber('datetime-local','2024-03-01T09:00:17.123'))),'2024-03-01T09:00:17.123','step any preserves milliseconds');
console.log(`date-time-picker-values: ${checks} checks passed`);
