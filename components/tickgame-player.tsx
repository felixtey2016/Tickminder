"use client";

import {useState} from 'react';
import type {MouseEvent} from 'react';

export function TickGamePlayer({title,language}:{title:string;language:'zh'|'en'}) {
  const [playing,setPlaying]=useState(false);
  function start(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
    event.preventDefault();
    setPlaying(true);
  }
  return <section className="tickgame-demo">
    <h2>{title}</h2>
    {playing
      ? <iframe title={title} src="/api/tickgame/launch" sandbox="allow-scripts allow-same-origin allow-downloads" allowFullScreen referrerPolicy="no-referrer"/>
      : <a className="legal-back" href="/api/tickgame/launch" onClick={start}>{language==='zh'?'开始试玩':'Play the demo'}</a>}
  </section>;
}
