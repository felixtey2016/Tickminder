"use client";

import {useEffect,useRef,useState} from 'react';
import {Maximize,Minimize} from 'lucide-react';

type GameOrientation = ScreenOrientation & {lock?: (orientation: "landscape") => Promise<void>};

export function TickGamePlayer({title,language,src='/play'}:{title:string;language:'zh'|'en';src?:string}) {
  const [expanded,setExpanded]=useState(false);
  const player=useRef<HTMLDivElement>(null);
  const orientationLocked=useRef(false);
  const label=expanded ? (language==='zh'?'退出全屏':'Exit full screen') : (language==='zh'?'全屏':'Full screen');

  useEffect(()=>{
    const onChange=()=>{
      const fullScreen=document.fullscreenElement===player.current;
      if (!fullScreen && orientationLocked.current) {
        screen.orientation?.unlock?.();
        orientationLocked.current=false;
      }
      setExpanded(fullScreen);
    };
    const onKey=(event: KeyboardEvent)=>{if(event.key==='Escape'&&!document.fullscreenElement)setExpanded(false);};
    document.addEventListener('fullscreenchange',onChange);
    document.addEventListener('keydown',onKey);
    return ()=>{
      document.removeEventListener('fullscreenchange',onChange);
      document.removeEventListener('keydown',onKey);
      if (orientationLocked.current) screen.orientation?.unlock?.();
    };
  },[]);

  async function toggleFullScreen() {
    const element=player.current;
    if (expanded) {
      if (document.fullscreenElement===element) void document.exitFullscreen().catch(()=>setExpanded(false));
      else setExpanded(false);
      return;
    }
    // Installed mobile browsers can use the edge-to-edge layout even without a fullscreen API.
    setExpanded(true);
    if (!element?.requestFullscreen) return;
    try {
      await element.requestFullscreen();
    } catch {
      return;
    }
    if (!window.matchMedia('(pointer: coarse)').matches || document.fullscreenElement!==element) return;
    const orientation=screen.orientation as GameOrientation | undefined;
    if (!orientation?.lock) return;
    try {
      await orientation.lock('landscape');
      if (document.fullscreenElement===element) orientationLocked.current=true;
      else orientation.unlock?.();
    } catch {
      // The CSS layout still rotates the player when the browser disallows a native lock.
    }
  }

  return <section className="tickgame-demo">
    <h2>{title}</h2>
    <div ref={player} className={expanded?'tickgame-player tickgame-player-expanded':'tickgame-player'}>
      <div className="tickgame-player-screen">
        <div className="tickgame-player-controls">
          <button className="tickgame-fullscreen-button" type="button" onClick={toggleFullScreen} aria-pressed={expanded}>
            {expanded?<Minimize size={18} aria-hidden="true"/>:<Maximize size={18} aria-hidden="true"/>}{label}
          </button>
        </div>
        <iframe title={title} src={src} sandbox="allow-scripts allow-same-origin allow-downloads" allowFullScreen referrerPolicy="no-referrer"/>
      </div>
    </div>
  </section>;
}
