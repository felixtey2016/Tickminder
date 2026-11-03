import './service-brand-icon.css';

export type BrandService = 'google-drive' | 'google-sheets' | 'whatsapp';
const assets: Record<BrandService, string> = {
  'google-drive': '/brands/google-drive.png',
  'google-sheets': '/brands/google-sheets.png',
  whatsapp: '/brands/whatsapp.svg',
};

/** Decorative beside the service/action label; keep the supplied brand artwork intact. */
export function ServiceBrandIcon({service,size=20,className=''}:{service:BrandService;size?:18|20|22|24;className?:string}) {
  return <img className={`service-brand-icon ${className}`.trim()} src={assets[service]} width={size} height={size} style={{width:size,height:size}} alt="" aria-hidden="true" draggable={false}/>;
}
