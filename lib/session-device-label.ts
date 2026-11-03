/** Keep only broad, bounded labels. Do not store raw UA, IP or location. */
export function sessionDeviceLabel(userAgent:string){
 const ua=userAgent.slice(0,1024);
 const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/CriOS|Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'unknown';
 const os=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'unknown';
 return {browser,os};
}
