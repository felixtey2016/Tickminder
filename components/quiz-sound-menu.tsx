'use client';

import {useEffect, useId, useRef, useState, type CSSProperties} from 'react';
import {Check, ChevronDown, Play, Volume2, VolumeX} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Switch} from '@/components/ui/switch';
import type {Language} from '@/lib/i18n';
import {QUIZ_MUSIC_TRACKS} from '@/lib/quiz-music';
import type {useQuizSound} from '@/lib/quiz-sound';

function TrackTitle({text, playing}: {text: string; playing: boolean}) {
  const frame = useRef<HTMLSpanElement>(null);
  const title = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const viewport = frame.current, label = title.current;
    if (!viewport || !label) return;
    const measure = () => setOverflow(Math.max(0, label.scrollWidth - viewport.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(label);
    return () => observer.disconnect();
  }, [text]);

  return <span className="quiz-music-track-window" ref={frame} aria-hidden="true" data-scroll={playing && overflow > 1}
    style={{'--quiz-music-title-shift': -overflow + 'px'} as CSSProperties}>
    <span ref={title}>{text}</span>
  </span>;
}

function VolumeSlider({label, value, onChange}: {
  label: string; value: number; onChange: (value: number) => void;
}) {
  return <div className="quiz-sound-volume">
    <input type="range" min={0} max={100} value={value} aria-label={label} aria-valuetext={value + '%'}
      onChange={event => onChange(event.currentTarget.valueAsNumber)}/>
    <span aria-hidden="true">{value}%</span>
  </div>;
}

export function QuizSoundMenu({language, audio, showTrack = false}: {
  language: Language; audio: ReturnType<typeof useQuizSound>; showTrack?: boolean;
}) {
  const {preferences, change, changeVolume, music, selectTrack} = audio;
  const label = (zh: string, en: string) => language === 'zh' ? zh : en;
  const title = label('声音设置', 'Sound settings');
  const musicLabel = label('背景音乐', 'Background music');
  const effectsLabel = label('答题提示音', 'Answer sounds');
  const audible = (preferences.music && preferences.musicVolume > 0) || (preferences.effects && preferences.effectsVolume > 0);
  const status = music.status === 'playing' ? (preferences.repeat ? label('单曲循环中', 'Repeating track') : label('随机播放', 'Shuffle play'))
    : music.status === 'loading' ? label('正在载入歌曲…', 'Loading track…')
    : music.status === 'error' ? label('歌曲暂时无法播放', 'Track could not be played')
    : music.status === 'blocked' || music.status === 'paused' ? label('轻点播放按钮继续', 'Tap Play to continue')
    : '';
  const canResume = preferences.music && preferences.musicVolume > 0 && ['blocked', 'paused', 'error'].includes(music.status);
  const controls = useId();

  return <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size={showTrack ? 'default' : 'icon'}
        className={'quiz-sound-trigger' + (showTrack ? ' quiz-sound-trigger-with-title' : '')}
        aria-label={title} title={music.track && preferences.music ? music.track.title : title}>
        {audible ? <Volume2 size={18} aria-hidden="true"/> : <VolumeX size={18} aria-hidden="true"/>}
        {showTrack && <>
          <TrackTitle text={preferences.music ? music.track?.title || musicLabel : musicLabel} playing={music.status === 'playing'}/>
          <ChevronDown size={15} aria-hidden="true"/>
        </>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="quiz-sound-menu" aria-label={title}>
      <div className="quiz-sound-channel">
        <label className="quiz-sound-setting" htmlFor={controls + '-music'}>
          <span>{musicLabel}{preferences.music && status && <small id={controls + '-status'}>{status}</small>}</span>
          <Switch id={controls + '-music'} aria-label={musicLabel} aria-describedby={preferences.music && status ? controls + '-status' : undefined}
            checked={preferences.music} onCheckedChange={enabled => change('music', enabled)}/>
        </label>
        <VolumeSlider label={label('背景音乐音量', 'Background music volume')} value={preferences.musicVolume}
          onChange={value => changeVolume('music', value)}/>
      </div>
      <div className="quiz-sound-channel">
        <label className="quiz-sound-setting" htmlFor={controls + '-effects'}>
          <span>{effectsLabel}</span>
          <Switch id={controls + '-effects'} checked={preferences.effects} onCheckedChange={enabled => change('effects', enabled)}/>
        </label>
        <VolumeSlider label={label('答题音效音量', 'Answer sounds volume')} value={preferences.effectsVolume}
          onChange={value => changeVolume('effects', value)}/>
      </div>
      {canResume && <Button type="button" variant="outline" size="sm" className="quiz-music-resume" onClick={music.resume}>
        <Play size={15} aria-hidden="true"/>{music.status === 'error' ? label('重试播放', 'Retry playback') : label('播放', 'Play')}
      </Button>}
      <section className="quiz-music-playlist" aria-labelledby={controls + '-playlist'}>
        <h3 id={controls + '-playlist'}>{label('播放列表', 'Playlist')}</h3>
        <ul>{QUIZ_MUSIC_TRACKS.map(track => {
          const active = preferences.music && music.track?.id === track.id;
          return <li key={track.id}><button type="button" aria-pressed={active} onClick={() => selectTrack(track.id)}>
            <span>{track.title}</span>{active ? <Check size={16} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}
          </button></li>;
        })}</ul>
      </section>
      <label className="quiz-sound-setting quiz-music-repeat" htmlFor={controls + '-repeat'}>
        <span>{label('单曲循环', 'Repeat one')}</span>
        <Switch id={controls + '-repeat'} checked={preferences.repeat} onCheckedChange={enabled => change('repeat', enabled)}/>
      </label>
    </PopoverContent>
  </Popover>;
}
