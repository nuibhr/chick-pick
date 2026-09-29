import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { coachingRouter } from './server/coaching';
import { createFinance } from './server/finance';
import { duprRouter } from './server/dupr';
import { marketplaceRouter } from './server/marketplace';
import { playerRouter } from './server/player';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const dataDirectory = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : path.resolve('data');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
const finance = createFinance(dataDirectory);
app.use('/api/finance', finance.router);
app.use('/api/player', playerRouter(path.join(dataDirectory, 'marketplace.json')));
app.use('/api/coaching', finance.requireAdmin, coachingRouter());
app.use('/api/dupr', finance.requireAdmin, duprRouter());
app.use('/api/marketplace', finance.requireAdmin, marketplaceRouter(path.join(dataDirectory, 'marketplace.json')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', paymentMode: isProduction ? 'disabled' : 'preview' }));
app.use('/api', (_req, res) => res.status(404).json({ message: 'ไม่พบ API นี้' }));

async function start() {
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
