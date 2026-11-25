export type DisplayPreferences={hourCycle:'h12'|'h23';weekStart:0|1};
export const DISPLAY_KEY='tickminder.display-preferences';
export const defaultDisplayPreferences:DisplayPreferences={hourCycle:'h23',weekStart:1};
let cached=defaultDisplayPreferences,stored:string|null|undefined;
export function getDisplayPreferences():DisplayPreferences{
 if(typeof window==='undefined')return defaultDisplayPreferences;
 try{const raw=window.localStorage.getItem(DISPLAY_KEY);if(raw!==stored){stored=raw;const v=JSON.parse(raw||'null');cached={hourCycle:v?.hourCycle==='h12'?'h12':'h23',weekStart:v?.weekStart===0?0:1};}}catch{cached=defaultDisplayPreferences;}
 return cached;
}
export function saveDisplayPreferences(value:DisplayPreferences){
 const next={hourCycle:value.hourCycle==='h12'?'h12':'h23',weekStart:value.weekStart===0?0:1};
 window.localStorage.setItem(DISPLAY_KEY,JSON.stringify(next));getDisplayPreferences();window.dispatchEvent(new Event('tickminder:display-preferences'));
}
export function subscribeDisplayPreferences(callback:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key===DISPLAY_KEY||event.key===null)callback();};
 window.addEventListener('storage',storage);window.addEventListener('tickminder:display-preferences',callback);
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener('tickminder:display-preferences',callback);};
}
/** Presentation only. Never use this formatter to build an input value or API timestamp. */
export function displayFormatter(locales?:Intl.LocalesArgument,options:Intl.DateTimeFormatOptions={}):Intl.DateTimeFormat{
 const variants=new Map<string,Intl.DateTimeFormat>();
 const current=()=>{const cycle=options.hour?getDisplayPreferences().hourCycle:'date';let formatter=variants.get(cycle);if(!formatter){const opts={...options};if(options.hour){delete opts.hour12;opts.hourCycle=cycle as 'h12'|'h23';}formatter=new Intl.DateTimeFormat(locales,opts);variants.set(cycle,formatter);}return formatter;};
 return new Proxy(new Intl.DateTimeFormat(locales,options),{get(_target,key){const formatter=current(),value=Reflect.get(formatter,key,formatter);return typeof value==='function'?value.bind(formatter):value;}});
}
export function orderedWeekdays<T>(mondayFirst:readonly T[],weekStart:0|1){return weekStart===0?[mondayFirst[6],...mondayFirst.slice(0,6)]:[...mondayFirst];}
export function startOfDisplayWeek(day:string,weekStart:0|1){const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()-weekStart+7)%7);return date.toISOString().slice(0,10);}
