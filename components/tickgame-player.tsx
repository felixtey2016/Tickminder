"use client";

import {useEffect,useRef,useState} from 'react';
import type {MouseEvent} from 'react';
import {Maximize,Minimize} from 'lucide-react';

export function TickGamePlayer({title,language}:{title:string;language:'zh'|'en'}) {
  const [playing,setPlaying]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const player=useRef<HTMLDivElement>(null);
  const label=expanded ? (language==='zh'?'退出全屏':'Exit full screen') : (language==='zh'?'全屏':'Full screen');

  useEffect(()=>{
    const onChange=()=>setExpanded(document.fullscreenElement===player.current);
    const onKey=(event: KeyboardEvent)=>{if(event.key==='Escape'&&!document.fullscreenElement)setExpanded(false);};
    document.addEventListener('fullscreenchange',onChange);
    document.addEventListener('keydown',onKey);
    return ()=>{
      document.removeEventListener('fullscreenchange',onChange);
      document.removeEventListener('keydown',onKey);
    };
  },[]);

  function start(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
    event.preventDefault();
    setPlaying(true);
  }

  function toggleFullScreen() {
    const element=player.current;
    if (expanded) {
      if (document.fullscreenElement===element) void document.exitFullscreen().catch(()=>setExpanded(false));
      else setExpanded(false);
      return;
    }
    // Installed mobile browsers can use the edge-to-edge layout even without a fullscreen API.
    setExpanded(true);
    if(element?.requestFullscreen) void element.requestFullscreen().catch(()=>{});
  }

  return <section className="tickgame-demo">
    <h2>{title}</h2>
    {playing
      ? <div ref={player} className={expanded?'tickgame-player tickgame-player-expanded':'tickgame-player'}>
          <div className="tickgame-player-controls">
            <button className="tickgame-fullscreen-button" type="button" onClick={toggleFullScreen} aria-pressed={expanded}>
              {expanded?<Minimize size={18} aria-hidden="true"/>:<Maximize size={18} aria-hidden="true"/>}{label}
            </button>
          </div>
          <iframe title={title} src="/play" sandbox="allow-scripts allow-same-origin allow-downloads" allowFullScreen referrerPolicy="no-referrer"/>
        </div>
      : <a className="legal-back" href="/play" onClick={start}>{language==='zh'?'开始试玩':'Play the demo'}</a>}
  </section>;
}
