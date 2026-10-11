const base = (process.env.UAT_PUBLIC_APP_URL || '').replace(/\/$/, '');
const expectedLiffId = process.env.UAT_LIFF_ID || '';
if (!base.startsWith('https://chick-pick-uat-isolated.') || !base.endsWith('.workers.dev')) {
  throw new Error('UAT smoke test only accepts the isolated UAT Worker URL');
}
const healthResponse = await fetch(base + '/api/health', { signal: AbortSignal.timeout(15000) });
if (!healthResponse.ok) throw new Error('UAT health check HTTP ' + healthResponse.status);
const health = await healthResponse.json();
if (health.status !== 'ok' || health.database !== 'tidb' || health.mode !== 'tidb-pilot-prepared') {
  throw new Error('UAT Worker is not connected to an initialized TiDB schema');
}
const playerResponse = await fetch(base + '/api/player/config', { signal: AbortSignal.timeout(15000) });
if (!playerResponse.ok) throw new Error('UAT player config HTTP ' + playerResponse.status);
const config = await playerResponse.json();
if (!config.pilot || config.liffId !== expectedLiffId) {
  throw new Error('UAT LINE application identifier mismatch');
}
console.log('Isolated UAT health and player configuration passed. Booking enabled: ' + Boolean(config.bookingEnabled));
