'use client';

import {ChevronDown, X} from 'lucide-react';
import {Dialog} from 'radix-ui';
import {useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type Ref} from 'react';
import {getLanguage} from '@/lib/i18n';
import './time-input.css';

type Props = Omit<ComponentProps<'input'>, 'type'> & {type?: 'time';validationError?:string};
const ROW_HEIGHT = 44;
const pad = (value: number) => String(value).padStart(2, '0');
const timeValue = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;
function minutes(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
}
function fieldName(input: HTMLInputElement) {
  const explicit = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
  if (explicit?.trim()) return explicit.trim();
  const label = (input.labels?.[0] || input.closest('label'))?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll('.time-field,input,button,svg,[aria-hidden=true]').forEach(node => node.remove());
  return (label?.textContent || input.title || '').replace(/\s+/g, ' ').trim();
}
function validityProbe(input: HTMLInputElement) {
  // Browser validity retains periodic min/max and the native time step base.
  const probe = document.createElement('input');
  probe.type = 'time'; probe.min = input.min; probe.max = input.max; probe.step = input.step;
  probe.defaultValue = input.defaultValue; probe.required = input.required;
  return probe;
}
function allowedTime(input: HTMLInputElement, value: string) {
  const probe = validityProbe(input); probe.value = value;
  return probe.value === value && probe.validity.valid;
}

/** Preserve the real form control while displaying a themed, minute-precision wheel. */
export function TimeInput({value, defaultValue, onChange, onClick, onKeyDown, onFocus, onBlur, onInvalid, validationError, className = '', disabled, readOnly, ref, ...props}: Props) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const [session, setSession] = useState<{input: HTMLInputElement; trigger: HTMLButtonElement | null; title: string} | null>(null);
  const [name, setName] = useState(''), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), redirectingFocus = useRef(false);
  const id = useId(), language = getLanguage(), current = String((value === undefined ? localValue : value) ?? '');
  const text = minutes(current) === null ? (language === 'zh' ? '选择时间' : 'Choose time') : current;
  const ariaLabel = props['aria-label'], ariaLabelledBy = props['aria-labelledby'];
  const attachInput = useCallback((element: HTMLInputElement | null) => {input.current = element; if (element) setName(fieldName(element));}, []);
  useImperativeHandle(ref, () => input.current!, []);
  // Cross-field constraints can change without changing this clock's value.
  // Only explicit callers own custom validity; standalone time inputs retain their native behavior.
  useLayoutEffect(()=>{
    if(validationError===undefined)return;
    input.current?.setCustomValidity(validationError);
    setError(previous=>validationError&&previous?validationError:'');
  },[validationError]);
  useEffect(() => {const frame = requestAnimationFrame(() => {if (input.current) setName(fieldName(input.current));}); return () => cancelAnimationFrame(frame);}, [language, ariaLabel, ariaLabelledBy, props.title]);
  useEffect(() => {
    const form = input.current?.form; let frame = 0;
    const reset = (event: Event) => {cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {if (event.defaultPrevented) return; if (value === undefined) setLocalValue(input.current?.value || ''); setError(''); setSession(null);});};
    form?.addEventListener('reset', reset);
    return () => {form?.removeEventListener('reset', reset); cancelAnimationFrame(frame);};
  }, [value]);
  useEffect(() => {if (!disabled && !readOnly) return; const frame = requestAnimationFrame(() => setSession(null)); return () => cancelAnimationFrame(frame);}, [disabled, readOnly]);
  useEffect(() => {const frame = requestAnimationFrame(() => {if (input.current?.validity.valid) setError('');}); return () => cancelAnimationFrame(frame);}, [value, props.min, props.max, props.step, props.required]);
  const show = () => {
    if (!input.current || input.current.matches(':disabled') || input.current.readOnly) return;
    setSession({input: input.current, trigger: trigger.current, title: fieldName(input.current)});
  };
  const commit = (next: string) => {
    const element = input.current;
    if (!element || element.matches(':disabled') || element.readOnly) {setSession(null); return;}
    if (!allowedTime(element, next)) return;
    if (element.value !== next) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, next);
      element.dispatchEvent(new Event('input', {bubbles: true}));
      element.dispatchEvent(new Event('change', {bubbles: true}));
    }
    setError(''); setSession(null);
  };
  return <span className="time-field">
    <button ref={trigger} type="button" className="native-time-input" data-testid="time-input-trigger" disabled={disabled} aria-disabled={readOnly || undefined}
      tabIndex={props.tabIndex} aria-label={(name ? name + ': ' : '') + text} aria-haspopup="dialog" aria-expanded={Boolean(session)} aria-controls={session ? id : undefined}
      aria-describedby={[props['aria-describedby'], error ? id + '-error' : ''].filter(Boolean).join(' ') || undefined}
      onClick={() => input.current?.click()}
      onFocus={event => {if (!redirectingFocus.current) input.current?.dispatchEvent(new FocusEvent('focusin', {bubbles: true, relatedTarget: event.relatedTarget}));}}
      onBlur={event => input.current?.dispatchEvent(new FocusEvent('focusout', {bubbles: true, relatedTarget: event.relatedTarget}))}
      onKeyDown={event => {
        const element = input.current; if (!element) return;
        event.stopPropagation();
        const forwarded = new KeyboardEvent('keydown', {key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey, bubbles: true, cancelable: true});
        element.dispatchEvent(forwarded); if (forwarded.defaultPrevented) event.preventDefault();
      }}><span className="native-time-value">{text}</span><ChevronDown className="time-field-chevron" size={20} strokeWidth={2.4} aria-hidden="true"/></button>
    <input {...props} ref={attachInput} type="time" className={'native-time-control ' + className} value={value} defaultValue={defaultValue} disabled={disabled} readOnly={readOnly} tabIndex={-1} aria-hidden="true"
      aria-invalid={error ? true : props['aria-invalid']}
      onChange={event => {if (value === undefined) setLocalValue(event.target.value); setError(''); onChange?.(event);}}
      onClick={event => {onClick?.(event); const cancelled = event.defaultPrevented; event.preventDefault(); if (!cancelled) show();}}
      onKeyDown={event => {onKeyDown?.(event); if (!event.defaultPrevented && !event.nativeEvent.isComposing && ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4'].includes(event.key)) {event.preventDefault(); show();}}}
      onFocus={event => {onFocus?.(event); redirectingFocus.current = true; trigger.current?.focus({preventScroll: true}); redirectingFocus.current = false;}}
      onBlur={event => {if (!redirectingFocus.current) onBlur?.(event);}}
      onInvalid={event => {onInvalid?.(event); if (!event.defaultPrevented) {event.preventDefault(); setError(event.currentTarget.validationMessage); trigger.current?.focus({preventScroll: true});}}}/>
    {error && <span className="time-field-error" id={id + '-error'} role="alert">{error}</span>}
    {session && !disabled && !readOnly && <TimePanel id={id} input={session.input} trigger={session.trigger} language={language} title={session.title} onClose={() => setSession(null)} onChoose={commit}/>}
  </span>;
}

export type WheelHandle = {read: () => number};
export function TimeWheel({id, kind, label, count, value, available, onChange, ref}: {id: string; kind: 'hour' | 'minute' | 'second'; label: string; count: number; value: number; available: boolean[]; onChange: (value: number) => void; ref: Ref<WheelHandle>}) {
  const wheel = useRef<HTMLDivElement>(null), settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const read = () => Math.max(0, Math.min(count - 1, Math.round((wheel.current?.scrollTop || 0) / ROW_HEIGHT)));
  useImperativeHandle(ref, () => ({read}));
  useLayoutEffect(() => {if (wheel.current) wheel.current.scrollTop = value * ROW_HEIGHT; return () => clearTimeout(settle.current);}, []);
  function select(next: number) {clearTimeout(settle.current); if (!available[next] || !wheel.current) return; wheel.current.scrollTo({top: next * ROW_HEIGHT, behavior: 'instant'}); onChange(next);}
  return <div className="time-wheel-column"><span id={id + '-label'} className="time-wheel-label">{label}</span><div ref={wheel} role="listbox" aria-labelledby={id + '-label'} aria-orientation="vertical" aria-activedescendant={id + '-' + value} tabIndex={0} className="time-wheel" data-testid={'time-wheel-' + kind}
    onScroll={() => {clearTimeout(settle.current); onChange(read()); settle.current = setTimeout(() => {const next = read(); if (wheel.current) wheel.current.scrollTo({top: next * ROW_HEIGHT, behavior: 'instant'}); onChange(next);}, 140);}}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const direction = event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'End' ? -1 : 1;
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : Math.max(0, Math.min(count - 1, read() + direction * (event.key.startsWith('Page') ? 5 : 1)));
      while (next >= 0 && next < count && !available[next]) next += direction;
      if (next >= 0 && next < count) select(next);
    }}>
    {Array.from({length: count}, (_, index) => <div key={index} id={id + '-' + index} role="option" aria-selected={index === value} aria-disabled={!available[index]} className="time-wheel-option" data-value={pad(index)} onClick={() => {wheel.current?.focus({preventScroll: true}); select(index);}}>{pad(index)}</div>)}
  </div></div>;
}

function TimePanel({id, input, trigger, language, title, onClose, onChoose}: {id: string; input: HTMLInputElement; trigger: HTMLButtonElement | null; language: string; title: string; onClose: () => void; onChoose: (value: string) => void}) {
  const zh = language === 'zh', panel = useRef<HTMLDivElement>(null), hourWheel = useRef<WheelHandle>(null), minuteWheel = useRef<WheelHandle>(null);
  const available = useMemo(() => {const probe = validityProbe(input); return Array.from({length: 1440}, (_, minute) => {probe.value = timeValue(Math.floor(minute / 60), minute % 60); return probe.validity.valid;});}, [input, input.min, input.max, input.step, input.defaultValue]);
  const initial = useMemo(() => {const now = new Date(), preferred = minutes(input.value) ?? now.getHours() * 60 + now.getMinutes(); if (available[preferred]) return preferred; const valid = available.flatMap((allowed, minute) => allowed ? [minute] : []); return valid.reduce((best, minute) => Math.abs(minute - preferred) < Math.abs(best - preferred) ? minute : best, valid[0] ?? preferred);}, []);
  const [hour, setHour] = useState(Math.floor(initial / 60)), [minute, setMinute] = useState(initial % 60), [error, setError] = useState('');
  const [placement, setPlacement] = useState({mobile: window.innerWidth <= 700, bottom: 0, height: window.innerHeight - 24});
  const allowedHours = Array.from({length: 24}, (_, index) => available.slice(index * 60, index * 60 + 60).some(Boolean));
  const valid = available[hour * 60 + minute];
  useLayoutEffect(() => {
    const place = () => {const viewport = window.visualViewport, height = viewport?.height || window.innerHeight; setPlacement({mobile: (viewport?.width || window.innerWidth) <= 700, bottom: Math.max(0, window.innerHeight - (viewport?.offsetTop || 0) - height), height: Math.max(180, height - 24)});};
    place(); window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place);
    return () => {window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);};
  }, []);
  useEffect(() => {const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {event.preventDefault(); event.stopImmediatePropagation(); onClose();}}; window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);}, [onClose]);
  function confirm() {
    // Read the wheel positions now, including a touch scroll just before Confirm.
    const currentHour = hourWheel.current?.read() ?? hour, currentMinute = minuteWheel.current?.read() ?? minute, next = timeValue(currentHour, currentMinute);
    if (!allowedTime(input, next)) {setHour(currentHour); setMinute(currentMinute); setError(zh ? '请选择有效的时间。' : 'Choose a time within the allowed range.'); return;}
    onChoose(next);
  }
  return <Dialog.Root open onOpenChange={open => {if (!open) onClose();}}><Dialog.Portal container={input.closest<HTMLDialogElement>('dialog[open]') || undefined}>
    <Dialog.Overlay className="time-picker-overlay"/>
    <Dialog.Content id={id} ref={panel} data-testid="time-picker-panel" className={'time-picker-panel' + (placement.mobile ? ' is-mobile' : '')} style={{maxHeight: placement.height, ...(placement.mobile ? {bottom: placement.bottom} : {})}} aria-describedby={undefined}
      onOpenAutoFocus={event => {event.preventDefault(); panel.current?.querySelector<HTMLElement>('[role=listbox]')?.focus({preventScroll: true});}}
      onCloseAutoFocus={event => {event.preventDefault(); if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus({preventScroll: true});}}
      onEscapeKeyDown={event => {event.stopPropagation(); if (event.isComposing || event.keyCode === 229) event.preventDefault();}}>
      <div className="time-picker-handle" aria-hidden="true"/>
      <div className="time-picker-heading"><Dialog.Title>{title || (zh ? '选择时间' : 'Choose time')}</Dialog.Title><Dialog.Close type="button" className="time-picker-close" aria-label={zh ? '关闭' : 'Close'}><X size={21}/></Dialog.Close></div>
      <div className="time-picker-wheels"><div className="time-picker-selection" aria-hidden="true"/><TimeWheel ref={hourWheel} id={id + '-hour'} kind="hour" label={zh ? '小时' : 'Hour'} count={24} value={hour} available={allowedHours} onChange={next => {setHour(next); setError('');}}/><span className="time-picker-colon" aria-hidden="true">:</span><TimeWheel ref={minuteWheel} id={id + '-minute'} kind="minute" label={zh ? '分钟' : 'Minute'} count={60} value={minute} available={available.slice(hour * 60, hour * 60 + 60)} onChange={next => {setMinute(next); setError('');}}/></div>
      {(error || !valid) && <p className="time-picker-error" role="status">{error || (zh ? '请选择有效的时间。' : 'Choose a time within the allowed range.')}</p>}
      <div className="time-picker-footer">{!input.required && <button type="button" className="time-picker-clear" data-testid="time-picker-clear" onClick={() => onChoose('')}>{zh ? '清除' : 'Clear'}</button>}<Dialog.Close type="button" data-testid="time-picker-cancel">{zh ? '取消' : 'Cancel'}</Dialog.Close><button type="button" className="time-picker-confirm" data-testid="time-picker-confirm" disabled={!valid} onClick={confirm}>{zh ? '确定' : 'Confirm'}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
