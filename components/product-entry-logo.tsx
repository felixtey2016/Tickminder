import {watchPreviewBranding} from '@/lib/watch-preview-config';

export function ProductEntryLogo({product}:{product:'play'|'quiz'}) {
  return <span className={product==='play'?'product-entry-brand product-entry-brand-play':'product-entry-brand'}>{product==='play'
    ? <><img src={watchPreviewBranding.favicon} alt="" width={48} height={48}/><strong>TickPlay</strong></>
    : <img src="/tickquiz-logo.webp" alt="TickQuiz" width={740} height={261}/>}</span>;
}
