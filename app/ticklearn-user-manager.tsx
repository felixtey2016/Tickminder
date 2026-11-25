'use client';

import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {GraduationCap} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {groupFetch} from '@/lib/group-client';
import {getLanguage} from '@/lib/i18n';
import {PersonIdentityFields,createPersonIdentityDraft,personIdentityPayload,personIdentityReady} from './person-identity-fields';

type User={id:string;name:string;email:string|null;username:string|null;createdAt:string;studentName:string|null};

export default function TickLearnUserManager({students,canConvert,canCreateStudent,onChanged}: {
  students:string[];canConvert:boolean;canCreateStudent:boolean;onChanged?:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState(''),[search,setSearch]=useState('');
  const [users,setUsers]=useState<User[]>([]),[hasMore,setHasMore]=useState(false);
  const [target,setTarget]=useState<User|null>(null),[person,setPerson]=useState(createPersonIdentityDraft);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const zh=getLanguage()==='zh';
  const title=zh?'TickLearn 用户管理':'TickLearn users';
  const load=useCallback(async(offset=0,signal?:AbortSignal)=>{
    setBusy(true);setError('');
    try {
      const params=new URLSearchParams({q:search,offset:String(offset)});
      const response=await groupFetch('/api/ticklearn/users?'+params,{signal,cache:'no-store'});
      const data=await response.json() as {items:User[];hasMore:boolean;error?:string};
      if(!response.ok)throw new Error(zh?data.error:'Could not load TickLearn users.');
      if(signal?.aborted)return;
      setUsers(previous=>offset?[...previous,...data.items]:data.items);
      setHasMore(data.hasMore);
    } catch(error) {
      if(!signal?.aborted)setError(error instanceof Error?error.message:zh?'加载失败':'Unable to load users');
    } finally {if(!signal?.aborted)setBusy(false);}
  },[search,zh]);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    void load(0,controller.signal);
    return ()=>controller.abort();
  },[open,load]);

  async function convert(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!target||busy||!personIdentityReady('student',person))return;
    setBusy(true);setError('');setNotice('');
    try {
      const response=await groupFetch('/api/ticklearn/users',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:target.id,...personIdentityPayload('student',person)})});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(zh?data.error:'Conversion failed. Check the student profile and try again.');
      setNotice(zh?'已转换为补习学生。':'Converted to a tuition student.');
      setTarget(null);
      onChanged?.();
      await load();
    } catch(error) {setError(error instanceof Error?error.message:'');}
    finally {setBusy(false);}
  }

  return <>
    <Button type="button" variant="outline" onClick={()=>{setOpen(true);setNotice('');}}>
      <GraduationCap size={18} aria-hidden="true"/>{title}
    </Button>
    <Dialog open={open} onOpenChange={value=>{if(!value){setTarget(null);setOpen(false);}}}>
      <DialogContent className="lesson-dialog directory-dialog">
        <DialogHeader><DialogTitle>{target?(zh?'转为补习学生':'Convert to a tuition student'):title}</DialogTitle>
          <DialogDescription>{target?.name||(zh?'查看自行注册的学习账号。':'View accounts created through TickLearn.')}</DialogDescription>
        </DialogHeader>
        {target? <form className="account-provisioning-form" onSubmit={convert}>
          <PersonIdentityFields role="student" value={person} onChange={setPerson} teachers={[]} students={students}
            canCreatePerson={canCreateStudent} disabled={busy}/>
          <p className="field-hint">{zh?'转换后会沿用原登录和测验记录。':'The existing login and quiz history carry over.'}</p>
          <div className="directory-form-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>{setTarget(null);setError('');}}>{zh?'取消':'Cancel'}</Button>
            <Button type="submit" disabled={busy||!personIdentityReady('student',person)}>{zh?'确认转换':'Confirm conversion'}</Button></div>
        </form> : <>
          <form className="account-provisioning-form" onSubmit={event=>{event.preventDefault();if(query.trim()===search)void load();else setSearch(query.trim());}}>
            <label>{zh?'搜索账号':'Search accounts'}<input type="search" value={query} onChange={event=>setQuery(event.target.value)} maxLength={100}/></label>
            <Button type="submit" variant="outline" disabled={busy}>{zh?'搜索':'Search'}</Button>
          </form>
          <div aria-busy={busy}>
            {users.map(user=><article key={user.id} className="user-row directory-person-row">
              <div className="account-row-heading"><div className="directory-person-identity"><strong>{user.name}</strong>
                <small>{user.email||user.username}</small><small>{user.studentName? (zh?'补习学生 · ':'Tuition student · ')+user.studentName:(zh?'免费方案':'Free plan')}</small></div>
                {canConvert&&!user.studentName&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>{
                  setTarget(user);setError('');setPerson(createPersonIdentityDraft(user.name,canCreateStudent?'new':'existing'));
                }}>{zh?'转为补习学生':'Convert to student'}</Button>}</div>
            </article>)}
            {!busy&&!users.length&&!error&&<p>{zh?'暂无 TickLearn 用户':'No TickLearn users found'}</p>}
          </div>
          {hasMore&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void load(users.length)}>{zh?'加载更多':'Load more'}</Button>}
        </>}
        {notice&&<p role="status">{notice}</p>}
        {error&&<p className="account-person-error" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
