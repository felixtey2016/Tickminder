'use client';

import {lazy,Suspense,useEffect, useRef, useState, type FormEvent} from 'react';
import {LogOut} from 'lucide-react';
import {TickLearnPreferences} from '@/components/ticklearn-preferences';
import {TickLearnBack,TickLearnNavigation} from '@/components/ticklearn-navigation';
import type {TickLearnDashboardData} from '@/lib/ticklearn-dashboard';
import {TickLearnDashboard} from './ticklearn-dashboard';
import {tickLearnCallingCode,tickLearnNationalPhone} from '@/lib/ticklearn-phone';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {setLanguage} from '@/lib/i18n';
import {tickLearnAccountOrigin, tickLearnAuthLink, tickLearnContinue, tickLearnEntryLink, tickLearnOrigin, tickLearnLanguages, tickLearnProductLanguage, tickLearnReturn, tickLearnStudyOrigin,
  tickMinderEntryQuery, type TickMinderEntry, type TickLearnLanguage} from '@/lib/ticklearn-routes';
import './ticklearn-portal.css';
import './ticklearn-dashboard.css';

const AccountSettings=lazy(()=>import('../account-settings').then(module=>({default:module.AccountSettings})));
const authSeparator={zh:'或',en:'or',ms:'atau'};
const googleLogin={zh:'使用 Google 登录',en:'Continue with Google',ms:'Teruskan dengan Google'};
const minderLogin={zh:'使用 TickMinder 登录',en:'Continue with TickMinder',ms:'Teruskan dengan TickMinder'};
const settingsTitle={zh:'我的账号',en:'My account',ms:'Akaun saya'};
const loadingAccount={zh:'正在加载…',en:'Loading…',ms:'Sedang dimuatkan…'};
const fontStyles='https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..900&family=Plus+Jakarta+Sans:wght@400..800&display=swap';

const words = {
  zh: {
    login: '登录 TickLearn', signup: '创建 TickLearn 账号', name: '姓名', username: '用户名',
    loginId: '用户名或已连接的 Google 邮箱', password: '密码', signIn: '登录', signUp: '免费注册', signOut: '退出登录',
    signupInfo: '用 Google 或用户名免费注册。一个账号即可进入 TickPlay、TickQuiz 和 TickGame。',
    loginInfo: '登录后继续观看视频、练习测验或玩学习游戏。', instead: '或使用用户名', terms: '服务条款',
    passwordHint: '至少 8 个字符。', usernameHint: '3 至 40 个字符，可使用英文字母、数字、点、下划线和连字符。',
    loginError: '用户名或密码有误，或账号暂时无法使用。', request: '请求无效，请刷新后重试。',
    fields: '请检查姓名、用户名和密码。', throttled: '尝试次数过多，请稍后再试。',
    usernameTaken: '这个用户名已被使用，请换一个。', google: 'Google 登录暂时无法完成，请刷新后重试。',
    existing: '请先用现有 TickMinder 登录方式登录，再从账号设置处理 Google 连接。',
    unavailable: '账号暂时无法使用，请联系管理员。', server: '服务暂时无法使用，请稍后再试。',
    phone: '请输入马来西亚手机号，例如 0123456789。', phoneLabel:'手机号码', finishSignup:'完成注册', phoneHeading:'填写手机号码',
    play: '看教学视频', quiz: '练习测验和查看解题步骤', game: '玩学习游戏',
  },
  en: {
    login: 'Sign in to TickLearn', signup: 'Create a TickLearn account', name: 'Name', username: 'Username',
    loginId: 'Username or linked Google email', password: 'Password', signIn: 'Sign in', signUp: 'Create a free account', signOut: 'Sign out',
    signupInfo: 'Sign up free with Google or a username. One account gives you access to TickPlay, TickQuiz and TickGame.',
    loginInfo: 'Sign in to continue watching, practising or playing.', instead: 'Or use a username', terms: 'Terms of service',
    passwordHint: 'At least 8 characters.', usernameHint: 'Use 3 to 40 letters, digits, periods, underscores or hyphens.',
    loginError: 'The login details are incorrect or the account is unavailable.', request: 'Invalid request. Refresh and try again.',
    fields: 'Check your name, username and password.', throttled: 'Too many attempts. Try again later.',
    usernameTaken: 'This username is taken. Choose another one.', google: 'Google sign-in could not finish. Refresh and try again.',
    existing: 'Sign in using your existing TickMinder method and manage the Google connection in account settings.',
    unavailable: 'This account is unavailable. Contact an administrator.', server: 'The service is temporarily unavailable. Try again later.',
    phone:'Enter your Malaysian mobile number, for example 0123456789.', phoneLabel:'Mobile number', finishSignup:'Finish registration', phoneHeading:'Add your mobile number',
    play: 'Watch lesson videos', quiz: 'Practise and review solution steps', game: 'Play learning games',
  },
  ms: {
    login: 'Log masuk ke TickLearn', signup: 'Cipta akaun TickLearn', name: 'Nama', username: 'Nama pengguna',
    loginId: 'Nama pengguna atau e-mel Google yang dipautkan', password: 'Kata laluan', signIn: 'Log masuk', signUp: 'Daftar percuma', signOut: 'Log keluar',
    signupInfo: 'Daftar percuma melalui Google atau nama pengguna. Satu akaun memberi akses kepada TickPlay, TickQuiz dan TickGame.',
    loginInfo: 'Log masuk untuk terus menonton, berlatih atau bermain.', instead: 'Atau guna nama pengguna', terms: 'Terma perkhidmatan',
    passwordHint: 'Sekurang-kurangnya 8 aksara.', usernameHint: 'Gunakan 3 hingga 40 huruf, angka, titik, garis bawah atau sempang.',
    loginError: 'Butiran log masuk salah atau akaun tidak tersedia.', request: 'Permintaan tidak sah. Muat semula dan cuba lagi.',
    fields: 'Semak nama, nama pengguna dan kata laluan.', throttled: 'Terlalu banyak percubaan. Cuba lagi kemudian.',
    usernameTaken: 'Nama pengguna ini telah digunakan. Pilih yang lain.', google: 'Log masuk Google gagal. Muat semula dan cuba lagi.',
    existing: 'Log masuk menggunakan cara TickMinder sedia ada dan urus pautan Google dalam tetapan akaun.',
    unavailable: 'Akaun ini tidak tersedia. Hubungi pentadbir.', server: 'Perkhidmatan tidak tersedia buat sementara. Cuba lagi kemudian.',
    phone:'Masukkan nombor telefon bimbit Malaysia, contohnya 0123456789.',phoneLabel:'Nombor telefon bimbit',finishSignup:'Selesaikan pendaftaran',phoneHeading:'Masukkan nombor telefon bimbit',
    play: 'Tonton video pengajaran', quiz: 'Buat latihan dan semak langkah penyelesaian', game: 'Main permainan pembelajaran',
  },
};

type GoogleApi = {initialize: (options: {client_id: string; nonce: string; callback: (value: {credential: string}) => void}) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void};

function TickLearnPhoneField({label,hint}:{label:string;hint:string}) {
  const [value,setValue]=useState('');
  const raw=value.trim();
  const explicitCode=/^(?:\+|00)/.test(raw) || raw.startsWith('60')&&Boolean(tickLearnNationalPhone(value));
  return <label>{label}
    <span className="ticklearn-phone-field">
      {!explicitCode&&<span className="ticklearn-phone-code" aria-hidden="true">{tickLearnCallingCode}</span>}
      <input name="phone" type="tel" autoComplete="tel-national" required maxLength={40} placeholder="0123456789"
        value={value} onChange={event=>setValue(event.target.value)}
        onBlur={()=>{const national=tickLearnNationalPhone(value);if(national)setValue(national);}}/>
    </span>
    <small>{hint}</small>
  </label>;
}

export function TickLearnPortal({language, next, screen, name, dashboard, googleBridge, googleLinking, minderEntry}: {
  language: TickLearnLanguage; next: string; screen: 'login' | 'signup' | 'study' | 'settings'; name?: string; dashboard: TickLearnDashboardData|null; googleBridge: boolean; googleLinking: boolean; minderEntry?: TickMinderEntry;
}) {
  const copy = words[language], signup = screen === 'signup', study = screen === 'study', settings = screen === 'settings';
  const privateScreen = study || settings;
  const [accountReady,setAccountReady]=useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [phoneOpen,setPhoneOpen]=useState(false);
  const googleCredential=useRef<string|null>(null);
  const googleBox = useRef<HTMLDivElement>(null), working = useRef(false);
  const googleLink = new URL('/ticklearn/'+(signup?'signup':'login'),tickLearnAccountOrigin);
  googleLink.search = new URLSearchParams({google:'1',lang:language,next}).toString();

  async function submit(action: 'signup' | 'google' | 'login', data: Record<string, unknown>) {
    if (working.current) return;
    working.current = true;
    setError('');
    setBusy(true);
    try {
      const response = await fetch(action === 'login' ? '/api/auth' : '/api/ticklearn/auth', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...data, action, ...(googleBridge?{googleBridge:true}:{})}),
      });
      const payload = await response.json() as {ok?:boolean;error?:string;needsPhone?:boolean};
      if (response.ok && payload.ok) {
        const destination = tickLearnReturn(next,language);
        window.location.assign(googleBridge ? tickLearnEntryLink(destination,language,'google') : tickLearnContinue(destination));
        return;
      }
      if (payload.needsPhone && action==='google' && typeof data.credential==='string') {
        googleCredential.current=data.credential;
        setPhoneOpen(true);
        return;
      }
      const code = action === 'login' ? 'loginError' : payload.error === 'username' ? 'usernameTaken' : payload.error;
      setError(code && Object.hasOwn(copy, code) ? copy[code as keyof typeof copy] : copy.server);
    } catch { setError(copy.server); }
    finally { working.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (!googleBridge) return;
    const controller = new AbortController();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const googleReady = new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error());
    });
    document.head.appendChild(script);
    void Promise.all([fetch('/api/ticklearn/auth', {cache: 'no-store', signal: controller.signal}).then(response => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<{clientId: string | null; nonce: string}>;
    }), googleReady]).then(([{clientId, nonce}]) => {
      const google = (window as Window & {google?: {accounts: {id: GoogleApi}}}).google?.accounts.id;
      if (controller.signal.aborted) return;
      if (!googleBox.current || !google || !clientId) { setError(copy.google); return; }
      google.initialize({client_id: clientId, nonce, callback: ({credential}) => {
        if (googleLinking) {
          window.opener?.postMessage({type:'ticklearn-google-link',credential},tickLearnStudyOrigin);
          window.close();
        } else void submit('google', {credential});
      }});
      google.renderButton(googleBox.current, {theme: 'outline', size: 'large', width: Math.min(325, googleBox.current.clientWidth),
        text: signup ? 'signup_with' : 'signin_with', locale: language === 'zh' ? 'zh_CN' : language});
    }).catch(() => { if (!controller.signal.aborted) setError(copy.google); });
    return () => {controller.abort(); script.remove();};
    // The current page fixes the destination and language for this sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleBridge, googleLinking, language, next, signup]);

  useEffect(()=>{
    const fonts=document.createElement('link');
    fonts.rel='stylesheet';
    fonts.href=fontStyles;
    document.head.appendChild(fonts);
    return ()=>{fonts.remove();};
  },[]);

  useEffect(()=>{
    if(!settings)return;
    setLanguage(tickLearnProductLanguage(language));
    setAccountReady(true);
  },[settings,language]);

  function formSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(signup ? 'signup' : 'login', Object.fromEntries(new FormData(event.currentTarget)));
  }
  const mobileField=<TickLearnPhoneField label={copy.phoneLabel} hint={copy.phone}/>;

  async function signOut() {
    if(busy)return;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth', {method: 'DELETE', cache: 'no-store'});
      if (!response.ok) throw new Error();
      document.documentElement.setAttribute('data-ticklearn-private-hidden','');
      window.location.replace('/ticklearn/login?lang='+language);
    } catch {setError(copy.server); setBusy(false);}
  }

  return <main className={'ticklearn-portal'+(privateScreen?' ticklearn-app-view':'')} lang={language}>
    {privateScreen&&<TickLearnNavigation active={settings?'settings':'home'} language={language} minderEntry={minderEntry}/>}
    <header className="ticklearn-portal-top">
      <a href={(privateScreen?'/ticklearn/study':tickLearnOrigin+'/')+'?lang='+language+tickMinderEntryQuery(minderEntry)}><img src="/branding/ticklearn-logo.png" width="44" height="40" alt=""/>TickLearn</a>
      <div className="ticklearn-header-actions">
        <TickLearnPreferences language={language} languages={tickLearnLanguages} onLanguageChange={item=>{
          const url=new URL(window.location.href);
          url.searchParams.set('lang',item);
          if(url.searchParams.has('next')){
            const destination=new URL(next);
            destination.searchParams.set('lang',destination.pathname==='/ticklearn/settings'?item:tickLearnProductLanguage(item));
            url.searchParams.set('next',destination.href);
          }
          window.location.assign(url);
        }}/>
        {privateScreen&&minderEntry&&<TickLearnBack href={'/ticklearn/study?lang='+language} language={language} minderEntry={minderEntry}/>}
      </div>
    </header>
    {study ? <TickLearnDashboard data={dashboard} language={language} name={name} minderEntry={minderEntry}/> : settings ?
      <section className="ticklearn-settings">
        <h1>{settingsTitle[language]}</h1>
        {accountReady ? <Suspense fallback={<p role="status">{loadingAccount[language]}</p>}><AccountSettings tickLearn/></Suspense> :
          <p role="status">{loadingAccount[language]}</p>}
        <div className="ticklearn-session-actions">
          <button type="button" className="ticklearn-secondary" disabled={busy} onClick={()=>void signOut()}>
            <LogOut size={18} aria-hidden="true"/>{copy.signOut}
          </button>
          {error&&<p role="alert">{error}</p>}
        </div>
      </section> : <section className="ticklearn-portal-card">
      <h1>{googleLinking ? {zh:'连接 Google 账号',en:'Link a Google account',ms:'Pautkan akaun Google'}[language] : signup ? copy.signup : copy.login}</h1>
      {!googleLinking&&<p>{signup ? copy.signupInfo : copy.loginInfo}</p>}
      {googleBridge ? <div className="ticklearn-google" ref={googleBox} inert={busy}/> : <>
      <form className="ticklearn-form" onSubmit={formSubmit}>
        {signup && <label>{copy.name}<input name="name" autoComplete="name" required maxLength={80}/></label>}
        {signup && mobileField}
        <label>{signup ? copy.username : copy.loginId}<input name="username" autoComplete="username" autoCapitalize="none" required
          maxLength={signup ? 40 : 254} pattern={signup ? '[A-Za-z0-9][A-Za-z0-9._\\-]{2,39}' : undefined}/>
          {signup && <small>{copy.usernameHint}</small>}</label>
        <label>{copy.password}<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'}
          required maxLength={128} minLength={signup ? 8 : undefined}/>
          {signup && <small>{copy.passwordHint}</small>}</label>
        <button type="submit" disabled={busy}>{signup ? copy.signUp : copy.signIn}</button>
      </form>
      <span className="ticklearn-divider">{authSeparator[language]}</span>
      <div className="ticklearn-auth-options">
        <a href={googleLink.href}>{googleLogin[language]}</a>
        {!signup&&<a href={tickLearnEntryLink(tickLearnReturn(next,language),language,'www').href}>{minderLogin[language]}</a>}
      </div>
      </>}
      {!googleLinking&&<div className="ticklearn-portal-links">
        <a href={tickLearnAuthLink(next, language, googleBridge ? (signup?'signup':'login') : signup ? 'login' : 'signup')}>{googleBridge ? copy.instead : signup ? copy.signIn : copy.signUp}</a>
        <a href={tickLearnOrigin + '/terms?lang=' + language}>{copy.terms}</a>
      </div>}
      {error && !phoneOpen && <p role="alert" className="ticklearn-portal-error">{error}</p>}
    </section>}
    <Dialog open={phoneOpen} onOpenChange={open=>{
      if(!open&&!busy){googleCredential.current=null;setPhoneOpen(false);setError('');}
    }}>
      <DialogContent className="ticklearn-language-sheet">
        <DialogHeader><DialogTitle>{copy.phoneHeading}</DialogTitle></DialogHeader>
        <form className="ticklearn-form" onSubmit={event=>{
          event.preventDefault();
          const credential=googleCredential.current;
          if(credential)void submit('google',{credential,phone:new FormData(event.currentTarget).get('phone')});
        }}>
          {mobileField}
          {error&&<p className="ticklearn-portal-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{copy.finishSignup}</button>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}
