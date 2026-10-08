import type { TransferAccount } from './marketplaceTypes';

export type PaymentChannel = TransferAccount & { id: 'bank' | 'promptpay'; kind: 'bank' | 'promptpay'; enabled: boolean };
export type TransferSettings = Partial<TransferAccount> & { channels?: PaymentChannel[] };
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120 && !/[\x00-\x1f]/.test(v);
export const mobileNumber = (v: string) => v.replace(/[\s-]/g, '');
export const validMobile = (v: string) => /^0[689]\d{8}$/.test(mobileNumber(v));

// Only owner configuration creates alternatives. Each booking stores the enabled set.
export function parsePaymentChannels(value: unknown): PaymentChannel[] | null {
  if (!Array.isArray(value) || value.length > 2) return null;
  const result: PaymentChannel[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>;
    if (!['bank', 'promptpay'].includes(String(v.kind)) || v.id !== v.kind || typeof v.enabled !== 'boolean' || result.some(c => c.id === v.id) || !text(v.accountName) || typeof v.accountNumber !== 'string') return null;
    const number = mobileNumber(v.accountNumber), kind = v.kind as PaymentChannel['kind'];
    if (kind === 'bank' ? !/^\d{10,15}$/.test(number) || !text(v.bankName) : !validMobile(number)) return null;
    let linkedBank: TransferAccount['linkedBank'];
    if (v.linkedBank !== undefined) {
      if (kind !== 'promptpay' || !v.linkedBank || typeof v.linkedBank !== 'object') return null;
      const linked = v.linkedBank as Record<string, unknown>;
      if (!text(linked.bankName) || typeof linked.accountNumber !== 'string' || !/^\d{10,15}$/.test(mobileNumber(linked.accountNumber))) return null;
      linkedBank = { bankName: linked.bankName.trim(), accountNumber: mobileNumber(linked.accountNumber) };
    }
    result.push({ id: kind, kind, enabled: v.enabled, bankName: kind === 'promptpay' ? 'พร้อมเพย์' : String(v.bankName).trim(), accountName: v.accountName.trim(), accountNumber: number, ...(linkedBank ? { linkedBank } : {}) });
  }
  return result;
}
export function configuredChannels(settings: TransferSettings | null): PaymentChannel[] {
  if (settings?.channels !== undefined) return parsePaymentChannels(settings.channels) || [];
  if (!settings?.accountNumber || !settings.bankName || !settings.accountName) return [];
  return [{ id: 'bank', kind: 'bank', enabled: true, bankName: settings.bankName, accountName: settings.accountName, accountNumber: settings.accountNumber }];
}
export function activeTransferAccount(settings: TransferSettings | null): TransferAccount | null {
  const channels = configuredChannels(settings).filter(c => c.enabled);
  if (!channels.length) return null;
  const snapshots = channels.map(({ enabled: _enabled, ...account }) => account);
  return { ...snapshots[0], ...(snapshots.length > 1 ? { alternatives: snapshots.slice(1) } : {}) };
}
export const transferOptions = (account: TransferAccount | null | undefined): TransferAccount[] => account ? [account, ...(account.alternatives || [])].map(({ alternatives: _alternatives, ...channel }) => channel) : [];
export const channelLabel = (account: TransferAccount) => account.kind === 'promptpay' ? 'พร้อมเพย์ · เบอร์โทร' : account.bankName;
// The linked bank is verification data, not a second destination for the player.
export function publicTransferAccount(account: TransferAccount | null | undefined): TransferAccount | null {
  const channels = transferOptions(account).map(({ linkedBank: _linkedBank, ...channel }) => channel);
  return channels.length ? { ...channels[0], ...(channels.length > 1 ? { alternatives: channels.slice(1) } : {}) } : null;
}
