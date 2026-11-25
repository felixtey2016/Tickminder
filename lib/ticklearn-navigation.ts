import {tickMinderEntryQuery,tickLearnAccountOrigin,tickMinderApexOrigin,tickLearnContinue,tickLearnStudyOrigin,tickLearnGameOrigin,tickLearnPlayOrigin,tickLearnProductLanguage,type TickLearnLanguage,type TickMinderEntry} from './ticklearn-routes';

export const tickLearnNavStyles = '/branding/ticklearn-navigation.css?v=history-guard';
export const tickLearnSessionScript = '/branding/ticklearn-session.js';
export type TickLearnProduct = 'quiz'|'play'|'game';
export const tickLearnProducts = [
  {key:'quiz',name:'TickQuiz',path:tickLearnStudyOrigin+'/quizzes',logo:'/tickquiz-logo.webp'},
  {key:'play',name:'TickPlay',path:tickLearnPlayOrigin+'/',logo:'/branding/tickplay-logo.webp'},
  {key:'game',name:'TickGame',path:tickLearnGameOrigin+'/',logo:'/branding/tickgame-logo.webp'},
] as const;

export const tickLearnHomeLogo = '/branding/ticklearn-logo.png';
export function tickLearnHomeItem(language:TickLearnLanguage, entry?:TickMinderEntry) {
  return {key:'home' as const,name:{zh:'首页',en:'Home',ms:'Laman Utama'}[language],
    href:tickLearnStudyOrigin+'/ticklearn/study?lang='+language+tickMinderEntryQuery(entry),logo:tickLearnHomeLogo};
}
export function tickMinderReturnItem(language:TickLearnLanguage, entry?:TickMinderEntry) {
  if (!entry) return null;
  return {href: (entry==='apex'?tickMinderApexOrigin:tickLearnAccountOrigin)+'/',
    name:{zh:'返回 TickMinder',en:'Back to TickMinder',ms:'Kembali ke TickMinder'}[language]};
}

export function tickLearnNavItems(language:TickLearnLanguage, entry?:TickMinderEntry) {
  return [tickLearnHomeItem(language,entry),...tickLearnProducts.map(product=>({
    ...product,href:tickLearnProductHref(product.path,language,entry),
  })),{
    key:'settings' as const,name:{zh:'我的账号',en:'Account',ms:'Akaun saya'}[language],
    href:tickLearnStudyOrigin+'/ticklearn/settings?lang='+language+tickMinderEntryQuery(entry),logo:null,
  }];
}

export function tickLearnProductHref(path:string,language:TickLearnLanguage,entry?:TickMinderEntry) {
  const url = new URL(path);
  url.searchParams.set('lang',tickLearnProductLanguage(language));
  url.searchParams.set('learn','1');
  if(entry)url.searchParams.set('minderFrom',entry);
  if(url.origin===tickLearnPlayOrigin){
    url.searchParams.set('enter','1');
    url.searchParams.set('from',tickLearnStudyOrigin);
  }
  return tickLearnContinue(url).href;
}
