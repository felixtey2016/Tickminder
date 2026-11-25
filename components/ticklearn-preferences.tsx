'use client';

import {useId,useRef} from 'react';
import {SlidersHorizontal,X} from 'lucide-react';
import {useAppearance} from './appearance-toggle';
import {tickLearnNavStyles} from '@/lib/ticklearn-navigation';
import {preferencesCopy,preferencesLanguageNames} from '@/lib/ticklearn-preferences';
import type {TickLearnLanguage} from '@/lib/ticklearn-routes';

export function TickLearnPreferences<T extends TickLearnLanguage>({language,languages,onLanguageChange}:{
  language:T;
  languages:readonly T[];
  onLanguageChange?:(language:T)=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const title=useId();
  const {dark,changeAppearance}=useAppearance();
  const copy=preferencesCopy[language];

  function changeLanguage(next:T) {
    dialog.current?.close();
    if(next===language)return;
    if(onLanguageChange){onLanguageChange(next);return;}
    const url=new URL(window.location.href);
    url.searchParams.set('lang',next);
    window.location.assign(url);
  }

  return <>
    <link rel="stylesheet" href={tickLearnNavStyles} precedence="default"/>
    <button className="ticklearn-preferences-trigger" type="button" aria-haspopup="dialog" aria-label={copy.title} title={copy.title}
      onClick={()=>dialog.current?.showModal()}>
      <SlidersHorizontal size={19} aria-hidden="true"/>
    </button>
    <dialog ref={dialog} className="ticklearn-preferences-dialog" aria-labelledby={title}
      onClick={event=>{if(event.target===event.currentTarget)event.currentTarget.close();}}>
      <div className="ticklearn-preferences-panel">
        <div className="ticklearn-preferences-heading">
          <h2 id={title}>{copy.title}</h2>
          <button className="ticklearn-preferences-close" type="button" aria-label={copy.close} onClick={()=>dialog.current?.close()}>
            <X size={18} aria-hidden="true"/>
          </button>
        </div>
        <fieldset className="ticklearn-preferences-options">
          <legend>{copy.language}</legend>
          {languages.map(item=><button key={item} type="button" aria-pressed={language===item}
            onClick={()=>changeLanguage(item)}>{preferencesLanguageNames[item]}</button>)}
        </fieldset>
        <fieldset className="ticklearn-preferences-options">
          <legend>{copy.appearance}</legend>
          <button type="button" aria-pressed={!dark} onClick={()=>changeAppearance('light')}>{copy.light}</button>
          <button type="button" aria-pressed={dark} onClick={()=>changeAppearance('dark')}>{copy.dark}</button>
        </fieldset>
      </div>
    </dialog>
  </>;
}
