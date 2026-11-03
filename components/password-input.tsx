'use client';

import {Eye, EyeOff} from 'lucide-react';
import {useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentProps} from 'react';
import {getLanguage} from '@/lib/i18n';
import './password-input.css';

type Props = Omit<ComponentProps<'input'>, 'type'> & {type?: 'password'};
type Selection = {start: number | null; end: number | null; direction: 'forward' | 'backward' | 'none' | null; focused: boolean};

/** One native input keeps its value, validation, autocomplete and form/ref behavior. */
export function PasswordInput({ref, id, type = 'password', className = '', disabled, value, ...props}: Props) {
  const generatedId = useId(), input = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const selection = useRef<Selection | null>(null), previousValue = useRef(value);
  const controlId = id ?? generatedId, language = getLanguage();
  const label = language === 'zh' ? (visible ? '隐藏密码' : '显示密码') : (visible ? 'Hide password' : 'Show password');
  useImperativeHandle(ref, () => input.current!, []);
  useLayoutEffect(() => {
    const element = input.current, saved = selection.current;
    selection.current = null;
    if (!element || !saved) return;
    if (saved.focused) element.focus({preventScroll: true});
    if (saved.start !== null && saved.end !== null) element.setSelectionRange(saved.start, saved.end, saved.direction ?? undefined);
  }, [visible]);
  useEffect(() => {
    if (previousValue.current && value === '') setVisible(false);
    previousValue.current = value;
  }, [value]);
  useEffect(() => {
    const form = input.current?.form; let frame = 0;
    const reset = (event: Event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {if (!event.defaultPrevented) setVisible(false);});
    };
    form?.addEventListener('reset', reset);
    return () => {form?.removeEventListener('reset', reset); cancelAnimationFrame(frame);};
  }, [props.form]);
  function toggle() {
    const element = input.current;
    if (!element || element.matches(':disabled')) return;
    selection.current = {start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection, focused: document.activeElement === element};
    setVisible(current => !current);
  }
  return <span className="password-field">
    <input autoCapitalize="none" autoCorrect="off" spellCheck={false} {...props} ref={input} id={controlId} className={'password-input-control ' + className} disabled={disabled} value={value} type={visible ? 'text' : type}/>
    <button type="button" className="password-visibility-toggle" data-testid="password-visibility-toggle" disabled={disabled}
      aria-label={label} title={label} aria-pressed={visible} aria-controls={controlId || undefined}
      onPointerDown={event => event.preventDefault()} onClick={toggle}>
      {visible ? <EyeOff size={20} strokeWidth={2} aria-hidden="true"/> : <Eye size={20} strokeWidth={2} aria-hidden="true"/>}
    </button>
  </span>;
}
