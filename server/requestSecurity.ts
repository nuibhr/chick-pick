import type { RequestHandler } from 'express';

export const sameOriginWrites: RequestHandler = (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    (req.get('Sec-Fetch-Site') === 'cross-site' ||
      (req.get('Origin') && ![`http://${req.get('Host')}`, `https://${req.get('Host')}`].includes(req.get('Origin')!)))) {
    return res.status(403).json({ message: 'ไม่อนุญาตคำขอข้ามเว็บไซต์' });
  }
  next();
};
