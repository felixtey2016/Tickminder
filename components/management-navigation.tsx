'use client';

import { useEffect, useRef } from 'react';
import { t } from '@/lib/i18n';
import { managementTabs, managementTitle, type ManagementArea } from '@/lib/management-navigation';

export function ManagementNavigation({ area, activeView, onChoose }: { area: ManagementArea; activeView: string; onChoose: (view: string) => void }) {
 const row = useRef<HTMLElement>(null), selected = useRef<HTMLButtonElement>(null);
 useEffect(() => {
  const outer = row.current, current = selected.current;
  if (!outer || !current) return;
  const bounds = outer.getBoundingClientRect(), target = current.getBoundingClientRect();
  if (target.left < bounds.left) outer.scrollLeft += target.left - bounds.left - 6;
  else if (target.right > bounds.right) outer.scrollLeft += target.right - bounds.right + 6;
 }, [area, activeView]);
 return <nav ref={row} className="management-navigation" aria-label={t(managementTitle(area))} data-testid="management-navigation" data-management-area={area}>
  {managementTabs(area).map(item => <button key={item.view} type="button" ref={item.view === activeView ? selected : undefined} data-testid={'management-view-' + item.view} aria-current={item.view === activeView ? 'page' : undefined} aria-controls="management-view-content" onClick={() => onChoose(item.view)}>{t(item.label)}</button>)}
 </nav>;
}
