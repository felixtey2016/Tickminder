import {env} from 'cloudflare:workers';

async function media(request: Request, context: {params: Promise<{file: string}>}) {
  const {file} = await context.params;
  if (!/^[a-z0-9-]{1,80}\.mp3$/.test(file)) return new Response(null, {status: 404});
  if (!env.ASSETS) return new Response(null, {status: 503});

  const assetUrl = new URL(request.url);
  assetUrl.pathname = '/quiz-audio/music/' + file;
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const match = request.headers.get('Range')?.match(/^bytes=(\d*)-(\d*)$/i);
  if (request.method === 'HEAD' || response.status !== 200 || !match || (!match[1] && !match[2])) return response;
  const ifRange = request.headers.get('If-Range');
  if (ifRange && ifRange !== response.headers.get('ETag')) return response;

  // The static asset service can return the full file to a range request.
  // Mobile media clients may need the requested bytes to start playback.
  const data = await response.arrayBuffer();
  const size = data.byteLength;
  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1);
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');

  if (start >= size || end < start) {
    headers.set('Content-Range', 'bytes */' + size);
    headers.delete('Content-Length');
    return new Response(null, {status: 416, headers});
  }

  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(data.slice(start, end + 1), {status: 206, headers});
}

export {media as GET, media as HEAD};
