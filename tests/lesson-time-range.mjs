import assert from 'node:assert/strict';
import {lessonDateAfter,lessonRangeMinutes,lessonRangeParts,validLessonRange} from '../lib/lesson-time-range.ts';
let count=0;const check=(v,m)=>{assert(v,m);count++};
for(const [a,b,m]of [['2026-11-04T23:00','2026-11-05T00:00',60],['2026-12-31T23:30','2027-01-01T00:30',60],['2028-02-28T23:00','2028-02-29T00:00',60],['2026-11-04T08:00','2026-11-04T20:00',720]]){check(lessonRangeMinutes(a,b)===m,'GMT+8 duration');check(validLessonRange(a,b),'valid bounded range')}
for(const [a,b]of [['2026-11-04T23:00','2026-11-04T00:00'],['2026-11-04T08:00','2026-11-04T08:00'],['2026-11-04T08:00','2026-11-04T20:01'],['2026-11-04T08:00','2026-11-06T08:00'],['2026-02-29T08:00','2026-03-01T09:00'],['2026-11-04T24:00','2026-11-05T01:00'],['2026-11-04T','2026-11-04T09:00'],['T23:00','T00:00']])check(!validLessonRange(a,b),'reject invalid or incomplete range');
check(lessonDateAfter('2026-12-31',1)==='2027-01-01','year rollover');
check(lessonRangeParts('2026-11-04T23:00','2026-11-05T00:00').nextDay,'explicit next day');
check(!lessonRangeParts('2026-11-04T23:00','2026-11-04T00:00').nextDay,'same-day end is not silently reinterpreted');
console.log('PASS lesson time range: '+count+' checks');
