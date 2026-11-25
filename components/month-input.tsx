'use client';

import {CalendarDays, Check, ChevronLeft, ChevronRight, X} from 'lucide-react';
import {Dialog} from 'radix-ui';
import {useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentProps} from 'react';
import {getLanguage} from '@/lib/i18n';

type Props = Omit<ComponentProps<'input'>, 'type'> & {type?: 'month'};

function monthIndex(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4,}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return year >= 1 ? year * 12 + month - 1 : null;
}
function displayMonth(value: unknown, language: string) {
  if (monthIndex(value) === null) return language === 'zh' ? '选择月份' : 'Choose month';
  const [year, month] = String(value).split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, 1);
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {year: 'numeric', month: 'long', timeZone: 'UTC'}).format(date);
}
function fieldName(input: HTMLInputElement) {
  const explicit = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
  if (explicit?.trim()) return explicit.trim();
  const label = (input.labels?.[0] || input.closest('label'))?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll('.month-field,input,button,svg,[aria-hidden=true]').forEach(node => node.remove());
  return (label?.textContent || input.title || '').replace(/\s+/g, ' ').trim();
}

/** The real month input retains refs, validity, React change handlers and FormData. */
export function MonthInput({value, defaultValue, onChange, onClick, onKeyDown, onFocus, onBlur, onInvalid, className = '', disabled, readOnly, ref, ...props}: Props) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const [session, setSession] = useState<{input: HTMLInputElement; trigger: HTMLButtonElement | null; title: string} | null>(null);
  const [name, setName] = useState(''), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), redirectingFocus = useRef(false);
  const id = useId(), language = getLanguage(), text = displayMonth(value === undefined ? localValue : value, language);
  const ariaLabel = props['aria-label'], ariaLabelledBy = props['aria-labelledby'];
  const attachInput = useCallback((element: HTMLInputElement | null) => {
    input.current = element;
    if (element) setName(fieldName(element));
  }, []);
  useImperativeHandle(ref, () => input.current!, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {if (input.current) setName(fieldName(input.current));});
    return () => cancelAnimationFrame(frame);
  }, [language, ariaLabel, ariaLabelledBy, props.title]);
  useEffect(() => {
    const form = input.current?.form; let frame = 0;
    const reset = (event: Event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (event.defaultPrevented) return;
        if (value === undefined) setLocalValue(input.current?.value || '');
        setError(''); setSession(null);
      });
    };
    form?.addEventListener('reset', reset);
    return () => {form?.removeEventListener('reset', reset); cancelAnimationFrame(frame);};
  }, [value]);
  useEffect(() => {
    if (!disabled && !readOnly) return;
    const frame = requestAnimationFrame(() => setSession(null));
    return () => cancelAnimationFrame(frame);
  }, [disabled, readOnly]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {if (input.current?.validity.valid) setError('');});
    return () => cancelAnimationFrame(frame);
  }, [value, props.min, props.max, props.step, props.required]);
  const show = () => {
    if (!input.current || input.current.matches(':disabled') || input.current.readOnly) return;
    setSession({input: input.current, trigger: trigger.current, title: fieldName(input.current)});
  };
  const commit = (next: string) => {
    const element = input.current;
    if (!element || element.matches(':disabled') || element.readOnly) {setSession(null); return;}
    if (next === '' ? element.required : !allowedMonth(element, next)) return;
    if (element.value !== next) {
      // Bypass React's value tracker, then emit the native event it normally observes.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, next);
      element.dispatchEvent(new Event('input', {bubbles: true}));
      element.dispatchEvent(new Event('change', {bubbles: true}));
    }
    setError(''); setSession(null);
  };
  return <span className="month-field">
    <button ref={trigger} type="button" className="native-month-input" disabled={disabled} aria-disabled={readOnly || undefined}
      tabIndex={props.tabIndex} aria-label={(name ? name + ': ' : '') + text} aria-haspopup="dialog" aria-expanded={Boolean(session)}
      aria-controls={session ? id : undefined}
      aria-describedby={[props['aria-describedby'], error ? id + '-error' : ''].filter(Boolean).join(' ') || undefined}
      onClick={() => input.current?.click()}
      onFocus={event => {if (!redirectingFocus.current) input.current?.dispatchEvent(new FocusEvent('focusin', {bubbles: true, relatedTarget: event.relatedTarget}));}}
      onBlur={event => input.current?.dispatchEvent(new FocusEvent('focusout', {bubbles: true, relatedTarget: event.relatedTarget}))}
      onKeyDown={event => {
        const element = input.current; if (!element) return;
        event.stopPropagation();
        const forwarded = new KeyboardEvent('keydown', {key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey, bubbles: true, cancelable: true});
        element.dispatchEvent(forwarded);
        if (forwarded.defaultPrevented) event.preventDefault();
      }}>
      <span className="native-month-value">{text}</span><CalendarDays size={20} aria-hidden="true"/>
    </button>
    <input {...props} ref={attachInput} type="month" className={'native-month-control ' + className} value={value} defaultValue={defaultValue}
      disabled={disabled} readOnly={readOnly} tabIndex={-1} aria-hidden="true"
      aria-invalid={error ? true : props['aria-invalid']}
      onChange={event => {if (value === undefined) setLocalValue(event.target.value); setError(''); onChange?.(event);}}
      onClick={event => {onClick?.(event); const cancelled = event.defaultPrevented; event.preventDefault(); if (!cancelled) show();}}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && !event.nativeEvent.isComposing && ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4'].includes(event.key)) {event.preventDefault(); show();}
      }}
      onFocus={event => {onFocus?.(event); redirectingFocus.current = true; trigger.current?.focus({preventScroll: true}); redirectingFocus.current = false;}}
      onBlur={event => {if (!redirectingFocus.current) onBlur?.(event);}}
      onInvalid={event => {onInvalid?.(event); if (!event.defaultPrevented) {event.preventDefault(); setError(event.currentTarget.validationMessage); trigger.current?.focus({preventScroll: true});}}}/>
    {error && <span className="month-field-error" id={id + '-error'} role="alert">{error}</span>}
    {session && !disabled && !readOnly && <MonthPanel id={id} input={session.input} trigger={session.trigger} language={language} title={session.title} onClose={() => setSession(null)} onChoose={commit}/>}
  </span>;
}

function allowedMonth(input: HTMLInputElement, value: string) {
  const index = monthIndex(value); if (index === null) return false;
  const min = monthIndex(input.min), max = monthIndex(input.max);
  if ((min !== null && index < min) || (max !== null && index > max)) return false;
  if (input.step === 'any') return true;
  const raw = Number(input.step), step = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const base = min ?? monthIndex(input.defaultValue) ?? 1970 * 12;
  const delta = (index - base) / step;
  return Math.abs(delta - Math.round(delta)) < 1e-7;
}

function MonthPanel({id, input, trigger, language, title, onClose, onChoose}: {
  id: string; input: HTMLInputElement; trigger: HTMLButtonElement | null; language: string; title: string; onClose: () => void; onChoose: (value: string) => void;
}) {
  const zh = language === 'zh', panel = useRef<HTMLDivElement>(null);
  const minYear = Math.floor((monthIndex(input.min) ?? 12) / 12), maxYear = Math.floor((monthIndex(input.max) ?? (9999 * 12 + 11)) / 12);
  const initialYear = Math.floor((monthIndex(input.value) ?? (new Date().getFullYear() * 12)) / 12);
  const [year, setYear] = useState(Math.max(minYear, Math.min(maxYear, initialYear))), [yearText, setYearText] = useState(String(year));
  const [placement, setPlacement] = useState({mobile: window.innerWidth <= 700, bottom: 0, height: window.innerHeight - 24});
  const changeYear = (next: number) => {const valid = Math.max(minYear, Math.min(maxYear, next)); setYear(valid); setYearText(String(valid));};
  const normalizeYear = () => changeYear(/^\d+$/.test(yearText) ? Number(yearText) : year);
  useLayoutEffect(() => {
    const place = () => {
      const viewport = window.visualViewport, height = viewport?.height || window.innerHeight;
      setPlacement({mobile: (viewport?.width || window.innerWidth) <= 700, bottom: Math.max(0, window.innerHeight - (viewport?.offsetTop || 0) - height), height: Math.max(180, height - 24)});
    };
    place(); window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place);
    return () => {window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);};
  }, []);
  useEffect(() => {
    // Close this layer before an enclosing native dialog receives Escape.
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {event.preventDefault(); event.stopImmediatePropagation(); onClose();}
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [onClose]);
  const choices = Array.from({length: 12}, (_, month) => {
    const value = String(year).padStart(4, '0') + '-' + String(month + 1).padStart(2, '0');
    const short = zh ? (month + 1) + '月' : new Intl.DateTimeFormat('en-GB', {month: 'short', timeZone: 'UTC'}).format(new Date(Date.UTC(2000, month, 1)));
    return {value, short, enabled: allowedMonth(input, value), selected: input.value === value};
  });
  return <Dialog.Root open onOpenChange={open => {if (!open) onClose();}}><Dialog.Portal container={input.closest<HTMLDialogElement>('dialog[open]') || undefined}>
    <Dialog.Overlay className="month-picker-overlay"/>
    <Dialog.Content id={id} ref={panel} data-testid="month-picker-panel" className={'month-picker-panel' + (placement.mobile ? ' is-mobile' : '')} style={{maxHeight: placement.height, ...(placement.mobile ? {bottom: placement.bottom} : {})}} aria-describedby={undefined}
      onOpenAutoFocus={event => {event.preventDefault(); (panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed=true]:not(:disabled)') || panel.current?.querySelector<HTMLButtonElement>('.month-picker-grid button:not(:disabled)') || panel.current?.querySelector<HTMLButtonElement>('.month-picker-close'))?.focus({preventScroll: true});}}
      onCloseAutoFocus={event => {event.preventDefault(); if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus({preventScroll: true});}}
      onEscapeKeyDown={event => {event.stopPropagation(); if (event.isComposing || event.keyCode === 229) event.preventDefault();}}>
      <div className="month-picker-handle" aria-hidden="true"/>
      <div className="month-picker-heading"><Dialog.Title>{title || (zh ? '选择月份' : 'Choose month')}</Dialog.Title><Dialog.Close type="button" className="month-picker-close" aria-label={zh ? '关闭' : 'Close'}><X size={21}/></Dialog.Close></div>
      <div className="month-picker-year">
        <button type="button" onClick={() => changeYear(year - 1)} disabled={year <= minYear} aria-label={zh ? '上一年' : 'Previous year'}><ChevronLeft size={21}/></button>
        <label><span>{zh ? '年份' : 'Year'}</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={yearText} aria-label={zh ? '年份' : 'Year'} onChange={event => {const next = event.target.value; if (!/^\d{0,6}$/.test(next)) return; setYearText(next); const number = Number(next); if (next && number >= minYear && number <= maxYear) setYear(number);}} onBlur={normalizeYear} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); normalizeYear(); event.currentTarget.blur();}}}/></label>
        <button type="button" onClick={() => changeYear(year + 1)} disabled={year >= maxYear} aria-label={zh ? '下一年' : 'Next year'}><ChevronRight size={21}/></button>
      </div>
      <div className="month-picker-grid" role="group" aria-label={zh ? '月份' : 'Months'} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const current = buttons.indexOf(event.target as HTMLButtonElement); if (current < 0) return;
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -3 : 3;
        let next = event.key === 'Home' ? 0 : event.key === 'End' ? 11 : current + direction;
        const increment = event.key === 'End' || direction < 0 ? -1 : 1;
        while (next >= 0 && next < 12 && buttons[next].disabled) next += increment;
        buttons[next]?.focus();
      }}>
        {choices.map(choice => <button key={choice.value} type="button" data-month={choice.value} disabled={!choice.enabled} aria-pressed={choice.selected} aria-label={displayMonth(choice.value, language)} onClick={() => onChoose(choice.value)}><span>{choice.short}</span>{choice.selected && <Check size={16} aria-hidden="true"/>}</button>)}
      </div>
      <div className="month-picker-footer">{!input.required && <button type="button" className="month-picker-clear" onClick={() => onChoose('')}>{zh ? '清除' : 'Clear'}</button>}<Dialog.Close type="button">{zh ? '取消' : 'Cancel'}</Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
