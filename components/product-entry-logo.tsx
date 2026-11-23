import {watchPreviewBranding} from '@/lib/watch-preview-config';

export function ProductEntryLogo({product}:{product:'play'|'quiz'}) {
  return <span className="product-entry-brand">{product==='play'
    ? <img src={watchPreviewBranding.logo} alt="TickPlay" width={1370} height={552}/>
    : <img src="/tickquiz-logo.webp" alt="TickQuiz" width={740} height={261}/>}</span>;
}
