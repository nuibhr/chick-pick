import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ReceiptSubmission } from '../src/marketplaceTypes';

const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export const maxReceiptBytes = 5 * 1024 * 1024;

export function validReceiptImage(bytes: Buffer, contentType: string): contentType is keyof typeof formats {
  if (!bytes.length || bytes.length > maxReceiptBytes || !(contentType in formats)) return false;
  if (contentType === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

const directory = (marketplaceFile: string) => path.join(path.dirname(marketplaceFile), 'receipts');

export function storeReceiptImage(marketplaceFile: string, bytes: Buffer, mimeType: ReceiptSubmission['mimeType'], receiptId: string = randomUUID()) {
  const id = receiptId;
  const fileName = `${id}.${formats[mimeType]}`;
  mkdirSync(directory(marketplaceFile), { recursive: true, mode: 0o700 });
  writeFileSync(path.join(directory(marketplaceFile), fileName), bytes, { flag: 'wx', mode: 0o600 });
  return { id, fileName };
}

export function removeReceiptImage(marketplaceFile: string, receipt: ReceiptSubmission) {
  const extension = formats[receipt.mimeType];
  if (!extension || receipt.fileName !== `${receipt.id}.${extension}` || !/^[0-9a-f-]{36}$/.test(receipt.id)) return;
  const file = path.join(directory(marketplaceFile), receipt.fileName);
  if (existsSync(file)) unlinkSync(file);
}

export function loadReceiptImage(marketplaceFile: string, receipt: ReceiptSubmission) {
  const extension = formats[receipt.mimeType];
  if (!extension || receipt.fileName !== `${receipt.id}.${extension}` || !/^[0-9a-f-]{36}$/.test(receipt.id)) return null;
  const file = path.join(directory(marketplaceFile), receipt.fileName);
  return existsSync(file) ? readFileSync(file) : null;
}
