import {WhatsAppBinding} from '../whatsapp-binding';
import {currentIdentity} from '@/lib/auth';
export default async function WhatsAppPage(){
 const identity=await currentIdentity();
 return <main className="main-container whatsapp-page" style={{maxWidth:700,margin:'32px auto',padding:16}}>{identity?<WhatsAppBinding/>:<section className="panel"><h1>连接 WhatsApp</h1><p>请先登录 Tickminder，再验证本人 WhatsApp 号码。已有账号继续使用原来的 Google 或密码登录。</p><a href="/">登录课程网站</a></section>}<p><a href="/">返回登录与课程网站</a></p></main>;
}
