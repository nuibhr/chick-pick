# Cloudflare HTTPS preview

The Chick&Pick frontend is available at:

- App: https://chick-pick-preview.nuibhr1.workers.dev/
- Player view: https://chick-pick-preview.nuibhr1.workers.dev/miniapp
- Health: https://chick-pick-preview.nuibhr1.workers.dev/api/health

This is a **static preview**, not the real-user pilot. The Worker returns HTTP 503
for every application API other than `/api/health`. It does not contain TiDB
credentials, slip images, admin access, or a LINE channel. Never use this URL to
collect payments while it reports `mode: static-preview`.

To update the preview after frontend changes:

```bash
npm run build:cloudflare
npx wrangler deploy
```

The Cloudflare build goes to `dist-client` so `dist/server.cjs` and its source map
cannot be uploaded as static assets. The full Express + TiDB app still requires
an HTTPS backend deployment or a deliberate migration to a compatible Cloudflare
backend. Follow `TIDB-LAUNCH.md` before registering the final LIFF endpoint and
opening real bookings.
