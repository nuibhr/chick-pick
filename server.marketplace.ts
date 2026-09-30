import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { coaches, coachingRouter } from './server/coaching';
import { publicCoachCatalogRouter } from './server/coachCalendar';
import { createFinance } from './server/finance';
import { duprRouter } from './server/dupr';
import { initialMarketplaceData, marketplaceRouter } from './server/marketplace';
import { playerRouter, verifyLineIdToken } from './server/player';
import { marketplaceStore } from './server/marketplaceStore';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const dataDirectory = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : path.resolve('data');
const coreStore = marketplaceStore(path.join(dataDirectory, 'marketplace.json'), initialMarketplaceData);
const lineReady = Boolean(process.env.LINE_CHANNEL_ID && process.env.VITE_LIFF_ID);
const writesEnabled = !isProduction || (process.env.APP_LIVE_MODE === 'true' && coreStore.kind === 'tidb' && lineReady);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
const finance = createFinance(dataDirectory, writesEnabled, coreStore);
app.use('/api/finance', finance.router);
app.use('/api/player', playerRouter(coreStore, process.env.LINE_CHANNEL_ID || '', verifyLineIdToken, writesEnabled));
app.use('/api/coach-catalog', publicCoachCatalogRouter(path.join(dataDirectory, 'coaching.slots.json'), path.join(dataDirectory, 'coaching.json'), coaches));
app.use('/api/coaching', finance.requireAdmin, coachingRouter(path.join(dataDirectory, 'coaching.json')));
app.use('/api/dupr', finance.requireAdmin, duprRouter());
app.use('/api/marketplace', finance.requireAdmin, marketplaceRouter(coreStore, writesEnabled));

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  mode: writesEnabled && isProduction ? 'live' : isProduction ? 'safe-preview' : 'local-preview',
  database: coreStore.kind,
  lineConfigured: lineReady,
  ocrConfigured: Boolean(process.env.HF_OCR_ENDPOINT_URL && process.env.HF_OCR_TOKEN),
}));
app.use('/api', (_req, res) => res.status(404).json({ message: 'ไม่พบ API นี้' }));

async function start() {
  await coreStore.ready();
  if (!isProduction) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, isProduction ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`Chick&Pick marketplace listening on http://localhost:${PORT}`);
  });
}

start();
