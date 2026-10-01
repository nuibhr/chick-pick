const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/api/health') {
      return json({
        status: 'preview',
        mode: 'static-preview',
        database: 'not-connected',
        lineConfigured: false,
        ocrConfigured: false,
      });
    }

    if (pathname.startsWith('/api/')) {
      return json({ message: 'พรีวิวหน้าเว็บเท่านั้น ระบบจองและรับสลิปยังไม่เปิดใช้งานบน URL นี้' }, 503);
    }

    return env.ASSETS.fetch(request);
  },
};
