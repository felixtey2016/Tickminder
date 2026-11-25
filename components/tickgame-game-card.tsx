import {tickMinderEntryQuery,type TickMinderEntry} from '@/lib/ticklearn-routes';
import type {StudioGame} from '@/lib/tickgame-studio-schema';

export const sejGame = {
  name: "Warisan Negara Bangsa",
  detail: "Sejarah Tingkatan 4 · Bab 1 · Demo",
  path: "/sejarah/bab-1",
  cover: "/covers/sej-f4-bab-1",
};

export function GameCards({language,games=[],includeSejarah=false,minderEntry}:{
  language:"zh"|"en";games?:StudioGame[];includeSejarah?:boolean;minderEntry?:TickMinderEntry;
}) {
  const cards=games.map(game=>({name:game.title,detail:game.subject,path:'/games/'+game.id,
    cover:'/covers/'+game.id+'?version='+game.version}));
  if(includeSejarah)cards.push(sejGame);
  return <ul className="tickgame-grid">
    {cards.map(game=><li key={game.path}>
      <a className="tickgame-card" href={game.path+'?lang='+language+tickMinderEntryQuery(minderEntry)}>
        <img src={game.cover} alt="" width={640} height={360} loading="lazy" decoding="async"/>
        <span>
          <strong>{game.name}</strong>
          <small>{game.detail}</small>
        </span>
      </a>
    </li>)}
  </ul>;
}

export function gamePageSize(amount?:string){
  const requested=Number(amount);
  return Number.isSafeInteger(requested)&&requested>=24?requested:24;
}
