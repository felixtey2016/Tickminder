'use client';

import {useEffect, useRef, useState} from 'react';

export const QUIZ_MUSIC_TRACKS = [
  {id: 'focus-flow', title: 'Focus Flow', src: '/api/quiz-music/focus-flow.mp3'},
  {id: 'felt-piano-warmth', title: 'Felt Piano Warmth', src: '/api/quiz-music/felt-piano-warmth.mp3'},
  {id: 'morning-light', title: 'Morning Light', src: '/api/quiz-music/morning-light.mp3'},
  {id: 'morning-light-alt', title: 'Morning Light (Alt.)', src: '/api/quiz-music/morning-light-alt.mp3'},
  {id: 'deep-focus', title: 'Deep Focus', src: '/api/quiz-music/deep-focus.mp3'},
  {id: 'a-quiet-room', title: 'A Quiet Room', src: '/api/quiz-music/a-quiet-room.mp3'},
  {id: 'morning-arpeggios', title: 'Morning Arpeggios', src: '/api/quiz-music/morning-arpeggios.mp3'},
] as const;

type Track = typeof QUIZ_MUSIC_TRACKS[number];
export type QuizMusicId = Track['id'];
type Status = 'off' | 'paused' | 'loading' | 'playing' | 'blocked' | 'error';
type Settings = {enabled: boolean; repeat: boolean};
type Controls = {
  sync: (settings: Settings) => void;
  select: (id: QuizMusicId) => void;
  resume: () => void;
};
const idle = {track: null, status: 'off'} as const;

export function useQuizMusic(session: string | null, enabled: boolean, repeat: boolean) {
  const [view, setView] = useState<{track: Track | null; status: Status}>(idle);
  const controls = useRef<Controls | null>(null);
  const settings = useRef<Settings>({enabled, repeat});
  settings.current = {enabled, repeat};

  useEffect(() => {
    if (!session) {
      setView(idle);
      return;
    }

    const audio = document.createElement('audio');
    audio.preload = 'none';
    audio.volume = 0.24;
    const played = new Set<QuizMusicId>();
    let track: Track | null = null;
    let status: Status = 'off';
    let isEnabled = false;
    let disposed = false;
    let generation = 0;

    function publish(next: Status) {
      status = next;
      if (!disposed) setView({track, status});
    }

    function load(next: Track) {
      generation++;
      status = 'paused';
      audio.pause();
      track = next;
      played.add(next.id);
      audio.src = next.src;
    }

    function shuffle() {
      let remaining = QUIZ_MUSIC_TRACKS.filter(item => !played.has(item.id));
      if (!remaining.length) {
        played.clear();
        if (track) played.add(track.id);
        remaining = QUIZ_MUSIC_TRACKS.filter(item => !played.has(item.id));
      }
      load(remaining[Math.floor(Math.random() * remaining.length)] || QUIZ_MUSIC_TRACKS[0]);
    }

    function start() {
      if (!isEnabled || disposed || document.hidden || status === 'loading' || status === 'playing') return;
      if (!track) shuffle();
      const requested = ++generation;
      publish('loading');
      void audio.play().then(() => {
        if (requested === generation && isEnabled && !document.hidden) publish('playing');
      }).catch((error: unknown) => {
        if (requested !== generation) return;
        publish(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'error');
      });
    }

    function pause(next: Status) {
      generation++;
      publish(next);
      audio.pause();
    }

    function sync(next: Settings) {
      const enabledChanged = isEnabled !== next.enabled;
      isEnabled = next.enabled;
      audio.loop = next.repeat;
      if (!enabledChanged) return;
      if (isEnabled) start();
      else pause('off');
    }

    function select(id: QuizMusicId) {
      const next = QUIZ_MUSIC_TRACKS.find(item => item.id === id);
      if (!next) return;
      isEnabled = true;
      if (track?.id !== id || status === 'error' || audio.ended) load(next);
      start();
    }

    function resume() {
      if (status === 'error' && track) load(track);
      start();
    }

    function advance() {
      if (!isEnabled) return;
      shuffle();
      start();
    }
    function interrupted() {
      if (status === 'playing' && audio.paused && !audio.ended) publish('paused');
    }
    function onError() {
      if (isEnabled && audio.error) pause('error');
    }
    function onPageHide() {
      if (isEnabled && (status === 'playing' || status === 'loading')) pause('paused');
    }
    function onPageShow() {
      if (status === 'paused' || status === 'off') start();
    }
    function onVisibility() {
      if (document.hidden) onPageHide();
      else onPageShow();
    }
    function onGesture(event: MouseEvent) {
      if (event.isTrusted && status === 'blocked') start();
    }

    audio.addEventListener('ended', advance);
    audio.addEventListener('pause', interrupted);
    audio.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('click', onGesture);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    controls.current = {sync, select, resume};
    setView(idle);
    sync(settings.current);

    return () => {
      disposed = true;
      generation++;
      controls.current = null;
      audio.removeEventListener('ended', advance);
      audio.removeEventListener('pause', interrupted);
      audio.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('click', onGesture);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [session]);

  useEffect(() => {
    controls.current?.sync({enabled, repeat});
  }, [enabled, repeat]);

  return {
    ...view,
    sync: (next: Settings) => controls.current?.sync(next),
    select: (id: QuizMusicId) => controls.current?.select(id),
    resume: () => controls.current?.resume(),
  };
}
