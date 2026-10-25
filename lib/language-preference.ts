import {LANGUAGE_KEY,type Language} from './i18n';

export function resolveLanguagePreference(saved:unknown,languages:readonly unknown[]|null|undefined,fallback?:unknown):Language {
 if(saved==='zh'||saved==='en')return saved;
 const preferences=[...(Array.isArray(languages)?languages:[]),fallback];
 for(const candidate of preferences){
  if(typeof candidate!=='string')continue;
  const matched=/^(zh|en)(?:-[a-z0-9]{1,8})*$/i.exec(candidate.trim());
  if(matched)return matched[1].toLowerCase() as Language;
 }
 return 'en';
}

// Read browser-only preferences at mount, never in a shared server module.
export function readBrowserLanguagePreference():Language {
 if(typeof window==='undefined')return 'en';
 let saved:unknown;
 try{saved=window.localStorage.getItem(LANGUAGE_KEY);}catch{/* Storage may be disabled. */}
 if(saved==='zh'||saved==='en')return saved;
 let languages:readonly unknown[]|undefined,fallback:unknown;
 try{languages=window.navigator.languages;}catch{/* Try the primary language next. */}
 try{fallback=window.navigator.language;}catch{/* Use the supported fallback. */}
 return resolveLanguagePreference(saved,languages,fallback);
}

export function rememberLanguagePreference(language:Language):void {
 if(typeof window==='undefined'||(language!=='zh'&&language!=='en'))return;
 try{window.localStorage.setItem(LANGUAGE_KEY,language);}catch{/* The current UI choice still works without storage. */}
}
