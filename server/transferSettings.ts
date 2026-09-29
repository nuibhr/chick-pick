import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TransferAccount } from '../src/marketplaceTypes';

export function parseTransferAccount(value: unknown): TransferAccount | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const validText = (input: unknown) => typeof input === 'string' && input.trim().length >= 2 && input.trim().length <= 120 && !/[\r\n\x00-\x1f]/.test(input);
  if (!validText(candidate.bankName) || !validText(candidate.accountName) || typeof candidate.accountNumber !== 'string') return null;
  const accountNumber = candidate.accountNumber.replace(/[ -]/g, '');
  if (!/^\d{10,15}$/.test(accountNumber)) return null;
  return { bankName: (candidate.bankName as string).trim(), accountName: (candidate.accountName as string).trim(), accountNumber };
}

export function readTransferAccount(marketplaceFile: string): TransferAccount | null {
  const file = path.join(path.dirname(marketplaceFile), 'transfer-settings.json');
  if (!existsSync(file)) return null;
  return parseTransferAccount(JSON.parse(readFileSync(file, 'utf8')));
}

export function saveTransferAccount(marketplaceFile: string, account: TransferAccount) {
  const file = path.join(path.dirname(marketplaceFile), 'transfer-settings.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', JSON.stringify({ ...account, updatedAt: new Date().toISOString() }), { mode: 0o600 });
  renameSync(file + '.tmp', file);
}
