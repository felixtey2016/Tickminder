import {ArrowLeft,UserRound} from 'lucide-react';
import {tickLearnNavStyles,tickLearnSessionScript,tickLearnNavItems,tickMinderReturnItem,type TickLearnProduct} from '@/lib/ticklearn-navigation';
import type {TickLearnLanguage,TickMinderEntry} from '@/lib/ticklearn-routes';

export function TickLearnNavigation({active,language,minderEntry}:{active?:TickLearnProduct|'home'|'settings';language:TickLearnLanguage;minderEntry?:TickMinderEntry}) {
  return <>
    <link rel="stylesheet" href={tickLearnNavStyles} precedence="default"/>
    <script src={tickLearnSessionScript} async/>
    <nav className="ticklearn-product-nav" aria-label="TickLearn">
      {tickLearnNavItems(language,minderEntry).map(({key,name,href,logo}) =>
        <a key={key} href={href} aria-current={active===key?'page':undefined}>
          {logo ? <img className={key==='home'?'ticklearn-nav-home':undefined} src={logo} width={100} height={38} alt=""/> :
            <UserRound className="ticklearn-nav-settings" size={24} aria-hidden="true"/>}<span>{name}</span>
        </a>)}
    </nav>
  </>;
}

export function TickLearnBack({href,language,minderEntry}:{href:string;language:TickLearnLanguage;minderEntry?:TickMinderEntry}) {
  const target=tickMinderReturnItem(language,minderEntry);
  const label=target?.name??(language==='zh'?'返回':language==='ms'?'Kembali':'Back');
  return <span className="ticklearn-back-slot"><a className={'ticklearn-back-button'+(target?' ticklearn-back-button--minder':'')} href={target?.href??href} aria-label={label} title={label}>
    <ArrowLeft size={19} aria-hidden="true"/>
    {target&&<span>{target.name}</span>}
  </a></span>;
}
