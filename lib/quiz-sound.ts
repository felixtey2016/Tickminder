'use client';

import {useEffect,useRef,useState} from 'react';
import {useQuizMusic,type QuizMusicId} from './quiz-music';

const clips={correct:'/quiz-audio/correct.wav',incorrect:'/quiz-audio/incorrect.wav'} as const;
type Feedback=keyof typeof clips;
// Balance the two cues with each other and with the background music.
const feedbackGain:Record<Feedback,number>={correct:0.07,incorrect:0.055};
type SoundChannel='music'|'effects';
type Preferences={music:boolean;effects:boolean;repeat:boolean;musicVolume:number;effectsVolume:number};
const defaults:Preferences={music:true,effects:true,repeat:false,musicVolume:24,effectsVolume:25};
const volumePercent=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):fallback;
const effectLevel=(feedback:Feedback,volume:number)=>feedbackGain[feedback]*volume/defaults.effectsVolume;
type Player={
 context:AudioContext;
 gain:GainNode;
 feedback?:Feedback;
 abort:AbortController;
 buffers:Partial<Record<Feedback,Promise<AudioBuffer|null>>>;
 source:AudioBufferSourceNode|null;
 playbackId:number;
};

function readPreferences(key:string):Preferences{
 try{
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  return {
   music:saved?.music!==false,effects:saved?.effects!==false,repeat:saved?.repeat===true,
   musicVolume:volumePercent(saved?.musicVolume,defaults.musicVolume),
   effectsVolume:volumePercent(saved?.effectsVolume,defaults.effectsVolume),
  };
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

export function useQuizSound(accountId:string|undefined,attemptId?:string){
 const key=accountId?'tickminder.quiz.sound.'+accountId:null;
 const player=useRef<Player|null>(null);
 const [saved,setSaved]=useState<{key:string|null;preferences:Preferences}>({key:null,preferences:defaults});
 const preferences=saved.key===key?saved.preferences:defaults;
 const music=useQuizMusic(key&&key===saved.key&&attemptId?key+':'+attemptId:null,preferences.music,preferences.repeat,preferences.musicVolume);
 const current=useRef(defaults);

 function release(){
  const previous=player.current;
  player.current=null;
  if(previous)stopPlayer(previous);
 }

 useEffect(()=>{
  const saved=key?readPreferences(key):defaults;
  current.current=saved;
  setSaved({key,preferences:saved});
  return release;
 },[key]);

 function savePreferences(next:Preferences){
  current.current=next;
  setSaved({key,preferences:next});
  if(key)try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Keep the preference for this session. */}
 }

 function change(setting:SoundChannel|'repeat',enabled:boolean){
  const next={...current.current,[setting]:enabled};
  savePreferences(next);
  if(setting==='music'||setting==='repeat')music.sync({enabled:next.music,repeat:next.repeat,volume:next.musicVolume});
  if(setting==='effects'&&!enabled)release();
 }

 function changeVolume(channel:SoundChannel,value:number){
  const setting=channel==='music'?'musicVolume':'effectsVolume';
  const next={...current.current,[setting]:volumePercent(value,current.current[setting])};
  savePreferences(next);
  if(channel==='music')music.sync({enabled:next.music,repeat:next.repeat,volume:next.musicVolume});
  else if(player.current?.feedback)player.current.gain.gain.value=effectLevel(player.current.feedback,next.effectsVolume);
 }

 function selectTrack(id:QuizMusicId){
  if(!current.current.music)savePreferences({...current.current,music:true});
  music.select(id);
 }

 // Call from the answer gesture, before the asynchronous grading request.
 function prepareEffect(){
  if(!current.current.effects||!current.current.effectsVolume)return;
  try{
   const Audio=window.AudioContext??(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!Audio)return;
   if(!player.current){
    const context=new Audio();
    const gain=context.createGain();
    gain.connect(context.destination);
    player.current={context,gain,abort:new AbortController(),buffers:{},source:null,playbackId:0};
   }
   const audio=player.current;
   if(audio.context.state!=='running')void audio.context.resume().catch(()=>{});
   void loadClip(audio,'correct');
   void loadClip(audio,'incorrect');
  }catch{/* Audio availability must never interrupt an answer. */}
 }

 async function playEffect(feedback:Feedback){
  const audio=player.current;
  if(!audio||!current.current.effects||!current.current.effectsVolume||document.hidden)return;
  const playbackId=++audio.playbackId;
  const buffer=await loadClip(audio,feedback);
  if(!buffer||player.current!==audio||playbackId!==audio.playbackId||audio.context.state!=='running'||!current.current.effectsVolume||document.hidden)return;
  try{
   audio.source?.stop();
   const source=audio.context.createBufferSource();
   source.buffer=buffer;
   audio.feedback=feedback;
   audio.gain.gain.value=effectLevel(feedback,current.current.effectsVolume);
   source.connect(audio.gain);
   source.onended=()=>{source.disconnect();if(audio.source===source)audio.source=null;};
   source.start();
   audio.source=source;
  }catch{/* A sound can be skipped without affecting scoring. */}
 }

 return {preferences,change,changeVolume,prepareEffect,playEffect,music,selectTrack};
}
