import type {TickLearnLanguage} from './ticklearn-routes';

export const preferencesLanguageNames = {zh:'中文',en:'English',ms:'Bahasa Melayu'} as const;

export const preferencesCopy = {
  zh:{title:'语言和外观',language:'语言',appearance:'外观',light:'浅色模式',dark:'深色模式',close:'关闭'},
  en:{title:'Language and appearance',language:'Language',appearance:'Appearance',light:'Light mode',dark:'Dark mode',close:'Close'},
  ms:{title:'Bahasa dan paparan',language:'Bahasa',appearance:'Paparan',light:'Mod cerah',dark:'Mod gelap',close:'Tutup'},
} satisfies Record<TickLearnLanguage,Record<string,string>>;
