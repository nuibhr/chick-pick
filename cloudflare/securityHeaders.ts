// Leave LINE's SDK, login redirect and camera upload usable; stricter receipt/QR CSPs win.
export function secureResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  const baseline = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    'Strict-Transport-Security': 'max-age=31536000',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  };
  for (const [name, value] of Object.entries(baseline)) if (!headers.has(name)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function privateAssetPath(path: string): boolean {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { return true; }
  return /^\/(?:\.env(?:[./]|$)|\.git(?:\/|$)|(?:data|artifacts|server|cloudflare|scripts|src|node_modules)(?:\/|$)|(?:package(?:-lock)?\.json|tsconfig[^/]*|wrangler[^/]*)(?:\/|$))/i.test(decoded)
    || decoded === '/brand/messageImage_1790922360771.jpg';
}
