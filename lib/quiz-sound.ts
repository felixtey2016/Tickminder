'use client';

import {useEffect,useRef,useState} from 'react';

const clips={correct:'/quiz-audio/correct.wav',incorrect:'/quiz-audio/incorrect.wav'} as const;
type Feedback=keyof typeof clips;
type Preferences={music:boolean;effects:boolean};
const defaults:Preferences={music:true,effects:true};
type Player={
 context:AudioContext;
 abort:AbortController;
 buffers:Partial<Record<Feedback,Promise<AudioBuffer|null>>>;
 source:AudioBufferSourceNode|null;
 playbackId:number;
};

function readPreferences(key:string):Preferences{
 try{
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  return {music:saved?.music!==false,effects:saved?.effects!==false};
 }catch{return defaults;}
}

function stopPlayer(player:Player){
 player.abort.abort();
 void player.context.close().catch(()=>{});
}

function loadClip(player:Player,feedback:Feedback){
 return player.buffers[feedback]??=(async()=>{
  try{
   const response=await fetch(clips[feedback],{signal:player.abort.signal});
   if(!response.ok)throw new Error('Quiz sound could not be loaded');
   return await player.context.decodeAudioData(await response.arrayBuffer());
  }catch{
   delete player.buffers[feedback];
   return null;
  }
 })();
}

export function useQuizSound(accountId:string|undefined){
 const key=accountId?'tickminder.quiz.sound.'+accountId:null;
 const player=useRef<Player|null>(null);
 const [preferences,setPreferences]=useState(defaults);
 const current=useRef(defaults);

 function release(){
  const previous=player.current;
  player.current=null;
  if(previous)stopPlayer(previous);
 }

 useEffect(()=>{
  const saved=key?readPreferences(key):defaults;
  current.current=saved;
  setPreferences(saved);
  return release;
 },[key]);

 function change(setting:keyof Preferences,enabled:boolean){
  const next={...current.current,[setting]:enabled};
  current.current=next;
  setPreferences(next);
  if(key)try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Keep the preference for this session. */}
  if(setting==='effects'&&!enabled)release();
 }

 // Call from the answer gesture, before the asynchronous grading request.
 function prepareEffect(){
  if(!current.current.effects)return;
  try{
   const Audio=window.AudioContext??(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!Audio)return;
   const audio=player.current??={context:new Audio(),abort:new AbortController(),buffers:{},source:null,playbackId:0};
   if(audio.context.state!=='running')void audio.context.resume().catch(()=>{});
   void loadClip(audio,'correct');
   void loadClip(audio,'incorrect');
  }catch{/* Audio availability must never interrupt an answer. */}
 }

 async function playEffect(feedback:Feedback){
  const audio=player.current;
  if(!audio||!current.current.effects||document.hidden)return;
  const playbackId=++audio.playbackId;
  const buffer=await loadClip(audio,feedback);
  if(!buffer||player.current!==audio||playbackId!==audio.playbackId||audio.context.state!=='running'||document.hidden)return;
  try{
   audio.source?.stop();
   const source=audio.context.createBufferSource();
   source.buffer=buffer;
   source.connect(audio.context.destination);
   source.onended=()=>{source.disconnect();if(audio.source===source)audio.source=null;};
   source.start();
   audio.source=source;
  }catch{/* A sound can be skipped without affecting scoring. */}
 }

 return {preferences,change,prepareEffect,playEffect};
}
