'use client';
import {useSyncExternalStore} from 'react';
import {getDisplayPreferences,defaultDisplayPreferences,subscribeDisplayPreferences} from './display-preferences';
export function useDisplayPreferences(){return useSyncExternalStore(subscribeDisplayPreferences,getDisplayPreferences,()=>defaultDisplayPreferences);}
