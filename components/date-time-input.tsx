'use client';

import {CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X} from 'lucide-react';
import {Dialog} from 'radix-ui';
import {useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentProps} from 'react';
import {getLanguage} from '@/lib/i18n';
import {currentLocalDate, dateAllowed, dateValue, DAY, daysInMonth, dayNumber, fromDayNumber, localNumber, localValue, nearestAllowed, pad, parseDate, pickerLimits, type PickerConstraints, type PickerType} from '@/lib/date-time-picker';
import {TimeWheel, type WheelHandle} from './time-input';
import './date-time-input.css';

type Props = Omit<ComponentProps<'input'>, 'type'> & {type?: PickerType};
type Session = {input: HTMLInputElement; trigger: HTMLButtonElement | null; title: string};
function fieldName(input: HTMLInputElement) {
  const explicit = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
  if (explicit?.trim()) return explicit.trim();
  const label = (input.labels?.[0] || input.closest('label'))?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll('.date-time-field,input,button,svg,small,[aria-hidden=true]').forEach(node => node.remove());
  return (label?.textContent || input.title || '').replace(/\s+/g, ' ').trim();
}
function readConstraints(input: HTMLInputElement): PickerConstraints {
  return {type: input.type as PickerType, min: input.min, max: input.max, step: input.step, defaultValue: input.defaultValue, required: input.required};
}
function validValue(input: HTMLInputElement, value: string) {
  const probe = document.createElement('input');
  probe.type = input.type; probe.min = input.min; probe.max = input.max; probe.step = input.step; probe.defaultValue = input.defaultValue; probe.required = input.required; probe.value = value;
  return (value === '' || probe.value !== '') && probe.validity.valid;
}
function displayValue(type: PickerType, value: string, zh: boolean) {
  if (localNumber(type, value) === null) return zh ? (type === 'date' ? '选择日期' : '选择日期和时间') : (type === 'date' ? 'Choose date' : 'Choose date and time');
  return value.replace('T', ' ');
}

export function DateInput(props: Omit<Props, 'type'> & {type?: 'date'}) {return <DateTimeField {...props} type="date"/>;}
export function DateTimeInput(props: Omit<Props, 'type'> & {type?: 'datetime-local'}) {return <DateTimeField {...props} type="datetime-local"/>;}

/** A native form control provides value/ref/validity, while only the custom UI is interactive. */
function DateTimeField({type = 'date', value, defaultValue, onChange, onClick, onKeyDown, onFocus, onBlur, onInvalid, className = '', style, disabled, readOnly, ref, ...props}: Props) {
  const [local, setLocal] = useState(defaultValue), [session, setSession] = useState<Session | null>(null), [name, setName] = useState(''), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), redirectingFocus = useRef(false);
  const controlled = useRef(value !== undefined); controlled.current = value !== undefined;
  const id = useId(), language = getLanguage(), text = displayValue(type, String((value === undefined ? local : value) ?? ''), language === 'zh');
  const attach = useCallback((element: HTMLInputElement | null) => {input.current = element; if (element) setName(fieldName(element));}, []);
  const close = useCallback(() => setSession(null), []);
  useImperativeHandle(ref, () => input.current!, []);
  useEffect(() => {const frame = requestAnimationFrame(() => {if (input.current) setName(fieldName(input.current));}); return () => cancelAnimationFrame(frame);}, [language, props['aria-label'], props['aria-labelledby'], props.title]);
  useEffect(() => {
    const form = input.current?.form; let frame = 0;
    const reset = (event: Event) => {cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {if (event.defaultPrevented) return; if (!controlled.current) setLocal(input.current?.value || ''); setSession(null); setError('');});};
    form?.addEventListener('reset', reset);
    return () => {form?.removeEventListener('reset', reset); cancelAnimationFrame(frame);};
  }, [props.form]);
  useEffect(() => {if (disabled || readOnly) setSession(null);}, [disabled, readOnly]);
  useEffect(() => {if (input.current?.validity.valid) setError('');}, [value, props.min, props.max, props.step, props.required]);
  const show = () => {const element = input.current; if (element && !element.matches(':disabled') && !element.readOnly) setSession({input: element, trigger: trigger.current, title: fieldName(element)});};
  const commit = (next: string) => {
    const element = input.current;
    if (!element || element.matches(':disabled') || element.readOnly) {setSession(null); return;}
    if (!validValue(element, next)) return;
    if (element.value !== next) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, next);
      element.dispatchEvent(new Event('input', {bubbles: true})); element.dispatchEvent(new Event('change', {bubbles: true}));
    }
    setError(''); setSession(null);
  };
  return <span className="date-time-field">
    <button ref={trigger} type="button" className={'date-time-input-trigger ' + className} style={style} disabled={disabled} aria-disabled={readOnly || undefined}
      data-testid={type === 'date' ? 'date-input-trigger' : 'datetime-input-trigger'} tabIndex={props.tabIndex} aria-label={(name ? name + ': ' : '') + text}
      aria-haspopup="dialog" aria-expanded={Boolean(session)} aria-controls={session ? id : undefined} aria-invalid={error ? true : props['aria-invalid']}
      aria-describedby={[props['aria-describedby'], error ? id + '-error' : ''].filter(Boolean).join(' ') || undefined}
      onClick={() => input.current?.click()}
      onFocus={event => {if (!redirectingFocus.current) input.current?.dispatchEvent(new FocusEvent('focusin', {bubbles: true, relatedTarget: event.relatedTarget}));}}
      onBlur={event => input.current?.dispatchEvent(new FocusEvent('focusout', {bubbles: true, relatedTarget: event.relatedTarget}))}
      onKeyDown={event => {
        if (!input.current) return; event.stopPropagation();
        const forwarded = new KeyboardEvent('keydown', {key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey, isComposing: event.nativeEvent.isComposing, bubbles: true, cancelable: true});
        input.current.dispatchEvent(forwarded); if (forwarded.defaultPrevented) event.preventDefault();
      }}><span>{text}</span><CalendarDays size={20} aria-hidden="true"/></button>
    <input {...props} ref={attach} type={type} value={value} defaultValue={defaultValue} disabled={disabled} readOnly={readOnly} tabIndex={-1} aria-hidden="true" className={'date-time-native-control ' + className}
      onChange={event => {if (value === undefined) setLocal(event.target.value); setError(''); onChange?.(event);}}
      onClick={event => {onClick?.(event); const cancelled = event.defaultPrevented; event.preventDefault(); if (!cancelled) show();}}
      onKeyDown={event => {onKeyDown?.(event); if (!event.defaultPrevented && !event.nativeEvent.isComposing && ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4'].includes(event.key)) {event.preventDefault(); show();}}}
      onFocus={event => {onFocus?.(event); redirectingFocus.current = true; trigger.current?.focus({preventScroll: true}); redirectingFocus.current = false;}}
      onBlur={event => {if (!redirectingFocus.current) onBlur?.(event);}}
      onInvalid={event => {onInvalid?.(event); if (!event.defaultPrevented) {event.preventDefault(); setError(event.currentTarget.validationMessage); trigger.current?.focus({preventScroll: true});}}}/>
    {error && <span className="date-time-field-error" id={id + '-error'} role="alert">{error}</span>}
    {session && !disabled && !readOnly && <DateTimePanel id={id} {...session} language={language} onClose={close} onChoose={commit}/>}
  </span>;
}

function usePlacement() {
  const [placement, setPlacement] = useState({left: 16, top: 16, width: 320, height: 600, mobile: false});
  useLayoutEffect(() => {
    const measure = () => {
      const viewport = window.visualViewport, width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const mobile = width <= 700, panelWidth = mobile ? width : Math.min(440, width - 32);
      setPlacement({left: left + (width - panelWidth) / 2, top, width: panelWidth, height, mobile});
    };
    measure(); const viewport = window.visualViewport;
    window.addEventListener('resize', measure); viewport?.addEventListener('resize', measure); viewport?.addEventListener('scroll', measure);
    return () => {window.removeEventListener('resize', measure); viewport?.removeEventListener('resize', measure); viewport?.removeEventListener('scroll', measure);};
  }, []);
  return placement;
}

function DateTimePanel({id, input, trigger, title, language, onClose, onChoose}: Session & {id: string; language: string; onClose: () => void; onChoose: (value: string) => void}) {
  const zh = language === 'zh', panel = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), placement = usePlacement();
  const [constraints, setConstraints] = useState(() => readConstraints(input));
  const [draft, setDraft] = useState(() => {
    const now = new Date(), preferred = localNumber(input.type as PickerType, input.value) ?? (localNumber('date', currentLocalDate())! + (input.type === 'date' ? 0 : now.getHours() * 3600000 + now.getMinutes() * 60000));
    const valid = nearestAllowed(readConstraints(input), preferred); return valid === null ? '' : localValue(input.type as PickerType, valid);
  });
  const initialDate = parseDate(draft.split('T')[0]) || parseDate(currentLocalDate())!;
  const [month, setMonth] = useState({year: initialDate.year, month: initialDate.month}), [yearText, setYearText] = useState(String(initialDate.year));
  const [quick, setQuick] = useState(false), [stage, setStage] = useState<'date' | 'time'>('date'), [error, setError] = useState('');
  const hour = useRef<WheelHandle>(null), minute = useRef<WheelHandle>(null), second = useRef<WheelHandle>(null), fraction = useRef<HTMLInputElement>(null);
  const [clock, setClock] = useState({hour: 0, minute: 0, second: 0, millisecond: 0});
  const selectedDate = draft.split('T')[0], selectedNumber = localNumber(constraints.type, draft), day = localNumber('date', selectedDate);
  const datetime = constraints.type === 'datetime-local', limits = pickerLimits(constraints);
  const showSeconds = datetime && (limits.step % 60000 !== 0 || (selectedNumber ?? 0) % 60000 !== 0);
  const showFraction = datetime && (limits.step % 1000 !== 0 || (selectedNumber ?? 0) % 1000 !== 0);
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && scroll.current?.contains(focused)) focused.scrollIntoView({block: 'nearest'});
  }, [placement.height]);
  useEffect(() => {
    const changed = () => {
      if (input.matches(':disabled') || input.readOnly) {onClose(); return;}
      const next = readConstraints(input); setConstraints(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new MutationObserver(changed); observer.observe(input, {attributes: true});
    for (let parent = input.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'FIELDSET') observer.observe(parent, {attributes: true, attributeFilter: ['disabled']});
    changed();
    return () => observer.disconnect();
  }, [input, onClose]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {event.preventDefault(); event.stopImmediatePropagation(); onClose();}};
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  }, [onClose]);
  const moveMonth = (year: number, nextMonth: number) => {
    const index = year * 12 + nextMonth - 1, nextYear = Math.floor(index / 12), actualMonth = index % 12 + 1;
    if (nextYear < 1 || nextYear > 275760) return;
    setMonth({year: nextYear, month: actualMonth}); setYearText(String(nextYear));
  };
  function chooseDate(value: string) {
    const nextDay = localNumber('date', value); if (nextDay === null) return;
    const preferred = nextDay + (datetime && selectedNumber !== null ? ((selectedNumber % DAY) + DAY) % DAY : 0);
    const next = nearestAllowed(constraints, preferred, nextDay, nextDay + (datetime ? DAY - 1 : 0));
    if (next !== null) {setDraft(localValue(constraints.type, next)); setError('');}
  }
  function enterTime() {
    if (selectedNumber === null || !dateAllowed(constraints, selectedDate)) return;
    const next = nearestAllowed(constraints, selectedNumber, day!, day! + DAY - 1); if (next === null) return;
    const rest = ((next % DAY) + DAY) % DAY;
    setDraft(localValue(constraints.type, next)); setClock({hour: Math.floor(rest / 3600000), minute: Math.floor(rest % 3600000 / 60000), second: Math.floor(rest % 60000 / 1000), millisecond: rest % 1000});
    setStage('time'); setError(''); scroll.current?.scrollTo({top: 0});
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role=listbox]')?.focus({preventScroll: true}));
  }
  function readTime() {
    if (draft !== '' && day !== null) {
      const h = hour.current?.read() ?? clock.hour, m = minute.current?.read() ?? clock.minute, s = showSeconds ? second.current?.read() ?? clock.second : 0, ms = showFraction ? Number(fraction.current?.value || 0) : 0;
      if (!Number.isInteger(ms) || ms < 0 || ms > 999) return null;
      return localValue('datetime-local', day + h * 3600000 + m * 60000 + s * 1000 + ms);
    }
    return draft;
  }
  function confirm() {
    if (input.matches(':disabled') || input.readOnly) {onClose(); return;}
    const next = datetime && stage === 'time' ? readTime() : draft;
    if (next === null) {setError(zh ? '请输入 0–999 毫秒。' : 'Enter milliseconds from 0 to 999.'); return;}
    if (!validValue(input, next)) {setError(zh ? '请选择符合日期、时间范围和间隔的值。' : 'Choose a value within the allowed date, time and interval.'); return;}
    onChoose(next);
  }
  const rangeAvailable = (low: number, high: number) => day !== null && nearestAllowed(constraints, day + low, day + low, day + high) !== null;
  const hours = Array.from({length: 24}, (_, h) => rangeAvailable(h * 3600000, h * 3600000 + 3599999));
  const minutes = Array.from({length: 60}, (_, m) => rangeAvailable(clock.hour * 3600000 + m * 60000, clock.hour * 3600000 + m * 60000 + 59999));
  const seconds = Array.from({length: 60}, (_, s) => rangeAvailable(clock.hour * 3600000 + clock.minute * 60000 + s * 1000, clock.hour * 3600000 + clock.minute * 60000 + s * 1000 + 999));
  const firstWeekday = ((dayNumber(month.year, month.month, 1) + 4) % 7 + 7) % 7;
  const calendarDays = Array.from({length: daysInMonth(month.year, month.month)}, (_, index) => dateValue(month.year, month.month, index + 1));
  const focusDate = calendarDays.includes(selectedDate) && dateAllowed(constraints, selectedDate) ? selectedDate : calendarDays.find(value => dateAllowed(constraints, value));
  const monthNames = zh ? Array.from({length: 12}, (_, index) => `${index + 1}月`) : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const selectedIsAllowed = draft === '' ? !constraints.required : datetime ? dateAllowed(constraints, selectedDate) : validValue(input, draft);
  const invalidText = zh ? '当前值不符合允许范围，请重新选择。' : 'This value is outside the allowed range. Choose another value.';
  return <Dialog.Root open onOpenChange={open => {if (!open) onClose();}}><Dialog.Portal container={input.closest<HTMLDialogElement>('dialog[open]') || undefined}>
    <Dialog.Overlay className="date-time-picker-overlay"/>
    <Dialog.Content id={id} ref={panel} className={'date-time-picker-panel' + (placement.mobile ? ' is-mobile' : '')} data-testid="date-time-picker-panel" data-picker-stage={stage} aria-describedby={id + '-description'}
      style={{left: placement.left, top: placement.mobile ? 'auto' : placement.top + placement.height / 2, bottom: placement.mobile ? Math.max(0, window.innerHeight - placement.top - placement.height) : 'auto', width: placement.width, maxHeight: Math.max(120, placement.height - (placement.mobile ? 8 : 32)), transform: placement.mobile ? 'none' : 'translateY(-50%)', translate: 'none'}}
      onOpenAutoFocus={event => {event.preventDefault(); (panel.current?.querySelector<HTMLButtonElement>('button[data-date][aria-pressed=true]:not(:disabled)') || panel.current?.querySelector<HTMLButtonElement>('button[data-date]:not(:disabled)') || panel.current?.querySelector<HTMLButtonElement>('.date-time-picker-close'))?.focus({preventScroll: true});}}
      onCloseAutoFocus={event => {event.preventDefault(); if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus({preventScroll: true});}}
      onEscapeKeyDown={event => {event.stopPropagation(); if (event.isComposing || event.keyCode === 229) event.preventDefault();}}>
      <div className="date-time-picker-handle" aria-hidden="true"/>
      <header className="date-time-picker-heading"><Dialog.Title>{title || (zh ? datetime ? '选择日期和时间' : '选择日期' : datetime ? 'Choose date and time' : 'Choose date')}</Dialog.Title><Dialog.Close type="button" className="date-time-picker-close" aria-label={zh ? '关闭' : 'Close'}><X size={21}/></Dialog.Close></header>
      <Dialog.Description id={id + '-description'} className="date-time-picker-description">{zh ? datetime ? (stage === 'date' ? '先选择日期，再选择时间。' : '滚动选择时间，确定后保存。') : '选择日期，确定后保存。' : datetime ? (stage === 'date' ? 'Choose a date, then a time.' : 'Scroll to choose a time, then confirm.') : 'Choose a date, then confirm.'}</Dialog.Description>
      <div className="date-time-picker-body" ref={scroll}>
        {stage === 'date' ? <>
          <div className="date-picker-month-nav"><button type="button" data-testid="date-picker-previous-month" aria-label={zh ? '上一月' : 'Previous month'} disabled={month.year === 1 && month.month === 1} onClick={() => moveMonth(month.year, month.month - 1)}><ChevronLeft size={21}/></button>
            <button type="button" data-testid="date-picker-month-heading" aria-expanded={quick} onClick={() => setQuick(!quick)}>{zh ? `${month.year}年 ${monthNames[month.month - 1]}` : `${monthNames[month.month - 1]} ${month.year}`}<ChevronDown size={17}/></button>
            <button type="button" data-testid="date-picker-next-month" aria-label={zh ? '下一月' : 'Next month'} disabled={month.year === 275760 && month.month === 12} onClick={() => moveMonth(month.year, month.month + 1)}><ChevronRight size={21}/></button></div>
          {quick ? <div className="date-picker-quick">
            <label>{zh ? '年份' : 'Year'}<input data-testid="date-picker-year" type="text" inputMode="numeric" pattern="[0-9]*" aria-label={zh ? '年份' : 'Year'} value={yearText} onChange={event => {if (/^\d{0,6}$/.test(event.target.value)) {setYearText(event.target.value); const year = Number(event.target.value); if (year >= 1 && year <= 275760) setMonth(previous => ({...previous, year}));}}} onBlur={() => setYearText(String(month.year))} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); setYearText(String(month.year)); event.currentTarget.blur();}}}/></label>
            <div className="date-picker-month-grid">{monthNames.map((name, index) => <button key={name} type="button" data-month={index + 1} aria-pressed={month.month === index + 1} onClick={() => {moveMonth(month.year, index + 1); setQuick(false);}}>{zh ? name : name.slice(0, 3)}</button>)}</div>
          </div> : <div className="date-picker-calendar" role="group" aria-label={zh ? '日期' : 'Dates'} onKeyDown={event => {
            const target = event.target as HTMLElement, value = target.dataset.date, parsed = value ? parseDate(value) : null;
            if (!parsed || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const number = dayNumber(parsed.year, parsed.month, parsed.day), weekday = ((number + 4) % 7 + 7) % 7;
            let next = number + ({ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday}[event.key] ?? 0);
            if (event.key.startsWith('Page')) {const index = parsed.year * 12 + parsed.month - 1 + (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), year = Math.floor(index / 12), m = index % 12 + 1; next = dayNumber(year, m, Math.min(parsed.day, daysInMonth(year, m)));}
            const direction = next < number ? -1 : 1;
            for (let tries = 0; tries < 3660; tries++, next += direction) {
              const nextValue = fromDayNumber(next), date = parseDate(nextValue); if (!date) break;
              if (dateAllowed(constraints, nextValue)) {chooseDate(nextValue); moveMonth(date.year, date.month); requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`button[data-date="${nextValue}"]`)?.focus({preventScroll: true})); break;}
            }
          }}>
            {(zh ? ['日', '一', '二', '三', '四', '五', '六'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']).map((name, index) => <span className="date-picker-weekday" key={index} aria-hidden="true">{name}</span>)}
            {Array.from({length: firstWeekday}, (_, index) => <span key={'blank' + index}/>)}
            {calendarDays.map((value, index) => <button key={value} type="button" data-testid="date-picker-day" data-date={value} tabIndex={value === focusDate ? 0 : -1} aria-label={value} aria-pressed={selectedDate === value} aria-current={value === currentLocalDate() ? 'date' : undefined} disabled={!dateAllowed(constraints, value)} onClick={() => chooseDate(value)}>{index + 1}</button>)}
          </div>}
          <button type="button" className="date-picker-today" disabled={!dateAllowed(constraints, currentLocalDate())} onClick={() => {const today = parseDate(currentLocalDate())!; chooseDate(currentLocalDate()); moveMonth(today.year, today.month); setQuick(false);}}>{zh ? '今天' : 'Today'}</button>
        </> : <>
          <button type="button" className="date-time-change-date" data-testid="date-time-picker-back" onClick={() => {const next = readTime(); if (next !== null) setDraft(next); setStage('date'); setError(''); requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button[data-date][aria-pressed=true]')?.focus({preventScroll: true}));}}><ChevronLeft size={18}/>{selectedDate}<span>{zh ? '更改日期' : 'Change date'}</span></button>
          <div className={'time-picker-wheels date-time-wheels' + (showSeconds ? ' has-seconds' : '')} key={selectedDate + ':' + stage}>
            <div className="time-picker-selection" aria-hidden="true"/>
            <TimeWheel ref={hour} id={id + '-hour'} kind="hour" label={zh ? '小时' : 'Hour'} count={24} value={clock.hour} available={hours} onChange={value => {setClock(previous => ({...previous, hour: value})); setError('');}}/>
            <span className="time-picker-colon" aria-hidden="true">:</span>
            <TimeWheel ref={minute} id={id + '-minute'} kind="minute" label={zh ? '分钟' : 'Minute'} count={60} value={clock.minute} available={minutes} onChange={value => {setClock(previous => ({...previous, minute: value})); setError('');}}/>
            {showSeconds && <><span className="time-picker-colon" aria-hidden="true">:</span><TimeWheel ref={second} id={id + '-second'} kind="second" label={zh ? '秒' : 'Second'} count={60} value={clock.second} available={seconds} onChange={value => {setClock(previous => ({...previous, second: value})); setError('');}}/></>}
          </div>
          {showFraction && <label className="date-picker-fraction">{zh ? '毫秒 (0–999)' : 'Milliseconds (0–999)'}<input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} ref={fraction} defaultValue={pad(clock.millisecond, 3)} aria-label={zh ? '毫秒' : 'Milliseconds'}/></label>}
        </>}
        <p className="date-time-picker-summary" aria-live="polite">{draft === '' ? (zh ? '未选择日期' : 'No date selected') : displayValue(constraints.type, stage === 'time' && day !== null ? localValue('datetime-local', day + clock.hour * 3600000 + clock.minute * 60000 + clock.second * 1000 + clock.millisecond) : draft, zh)}</p>
        {(error || !selectedIsAllowed) && <p className="date-time-picker-error" role="status">{error || invalidText}</p>}
      </div>
      <footer className="date-time-picker-footer">
        {!constraints.required && <button type="button" className="date-time-picker-clear" data-testid="date-time-picker-clear" onClick={() => {setDraft(''); setStage('date'); setError('');}}>{zh ? '清除' : 'Clear'}</button>}
        <Dialog.Close type="button" data-testid="date-time-picker-cancel">{zh ? '取消' : 'Cancel'}</Dialog.Close>
        {datetime && stage === 'date' && draft !== '' ? <button type="button" className="date-time-picker-primary" data-testid="date-time-picker-next" disabled={!selectedIsAllowed} onClick={enterTime}>{zh ? '下一步' : 'Next'}</button> : <button type="button" className="date-time-picker-primary" data-testid="date-time-picker-confirm" disabled={!selectedIsAllowed} onClick={confirm}>{zh ? '确定' : 'Confirm'}</button>}
      </footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
