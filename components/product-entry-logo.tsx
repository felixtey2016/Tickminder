import {watchPreviewBranding} from '@/lib/watch-preview-config';

const shortcutBrands = {
  play: {logo: watchPreviewBranding.favicon, name: 'TickPlay'},
  game: {logo: '/branding/tickgame-logo.webp', name: 'TickGame'},
};

export function ProductEntryLogo({product}:{product:'play'|'quiz'|'game'}) {
  if (product === 'quiz') {
    return <span className="product-entry-brand"><img src="/tickquiz-logo.webp" alt="TickQuiz" width={740} height={261}/></span>;
  }

  const {logo, name} = shortcutBrands[product];
  return <span className="product-entry-brand product-entry-brand-compact">
    <img src={logo} alt="" width={48} height={48}/><strong>{name}</strong>
  </span>;
}
