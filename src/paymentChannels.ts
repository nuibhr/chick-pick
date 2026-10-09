import type { TransferAccount } from './marketplaceTypes';
import { staticBankQr } from './bankQr';

export type PaymentChannelId = 'bank' | 'bank-promptpay' | 'promptpay';
export type PaymentChannel = TransferAccount & { id: PaymentChannelId; kind: 'bank' | 'promptpay'; enabled: boolean };
export const validPaymentChannelId = (value: unknown): value is PaymentChannelId => ['bank', 'bank-promptpay', 'promptpay'].includes(String(value));
export const paymentChannelId = (account: TransferAccount): PaymentChannelId => validPaymentChannelId(account.id) ? account.id : account.kind === 'promptpay' ? 'promptpay' : 'bank';
export type TransferSettings = Partial<TransferAccount> & { channels?: PaymentChannel[] };
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120 && !/[\x00-\x1f]/.test(v);
export const mobileNumber = (v: string) => v.replace(/[\s-]/g, '');
export const validMobile = (v: string) => /^0[689]\d{8}$/.test(mobileNumber(v));

// Only owner configuration creates alternatives. Each booking stores the enabled set.
export function parsePaymentChannels(value: unknown): PaymentChannel[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const result: PaymentChannel[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>;
    if (!validPaymentChannelId(v.id) || v.kind !== (v.id === 'bank' ? 'bank' : 'promptpay') || typeof v.enabled !== 'boolean' || result.some(c => c.id === v.id) || !text(v.accountName) || typeof v.accountNumber !== 'string') return null;
    const number = mobileNumber(v.accountNumber), kind = v.kind as PaymentChannel['kind'];
    if (kind === 'bank' ? !/^\d{10,15}$/.test(number) || !text(v.bankName) : !validMobile(number)) return null;
    const qr = v.bankQrPayload === undefined ? undefined : kind === 'bank' ? staticBankQr(v.bankQrPayload) : null;
    if (qr === null) return null;
    let bankPromptPayPhone: string | undefined;
    if (v.bankPromptPayPhone !== undefined) {
      if (kind !== 'bank' || typeof v.bankPromptPayPhone !== 'string' || !validMobile(v.bankPromptPayPhone)) return null;
      bankPromptPayPhone = mobileNumber(v.bankPromptPayPhone);
    }
    let linkedBank: TransferAccount['linkedBank'];
    if (v.linkedBank !== undefined) {
      if (kind !== 'promptpay' || !v.linkedBank || typeof v.linkedBank !== 'object') return null;
      const linked = v.linkedBank as Record<string, unknown>;
      if (!text(linked.bankName) || typeof linked.accountNumber !== 'string' || !/^\d{10,15}$/.test(mobileNumber(linked.accountNumber))) return null;
      linkedBank = { bankName: linked.bankName.trim(), accountNumber: mobileNumber(linked.accountNumber) };
    }
    if (v.id === 'bank-promptpay' && !linkedBank) return null;
    result.push({ id: v.id, kind, enabled: v.enabled, bankName: v.id === 'bank-promptpay' ? linkedBank!.bankName : kind === 'promptpay' ? 'พร้อมเพย์' : String(v.bankName).trim(), accountName: v.accountName.trim(), accountNumber: number, ...(qr ? { bankQrPayload: qr } : {}), ...(bankPromptPayPhone ? { bankPromptPayPhone } : {}), ...(linkedBank ? { linkedBank } : {}) });
  }
  // Two destinations must not silently point at the same registered mobile.
  const bank = result.find(c => c.kind === 'bank'), phones = result.filter(c => c.kind === 'promptpay');
  if (new Set(phones.map(c => c.accountNumber)).size !== phones.length) return null;
  if (bank?.bankPromptPayPhone && (result.some(c => c.id === 'bank-promptpay') || phones.some(c => c.accountNumber === bank.bankPromptPayPhone))) return null;
  return result;
}
export const paymentQrPhone = (account: TransferAccount) => account.kind === 'promptpay' ? account.accountNumber : account.bankPromptPayPhone;
export const paymentStaticQr = (account: TransferAccount) => paymentQrPhone(account) ? undefined : account.bankQrPayload;
export function configuredChannels(settings: TransferSettings | null): PaymentChannel[] {
  if (settings?.channels !== undefined) {
    const parsed = parsePaymentChannels(settings.channels);
    if (!parsed) return [];
    // Split only current settings. Existing bookings keep their original snapshot.
    return parsed.flatMap(channel => {
      if (channel.id !== 'bank' || !channel.bankPromptPayPhone) return [channel];
      const { bankPromptPayPhone, ...bank } = channel;
      return [bank, { id: 'bank-promptpay' as const, kind: 'promptpay' as const, enabled: bank.enabled, bankName: bank.bankName, accountName: bank.accountName, accountNumber: bankPromptPayPhone, linkedBank: { bankName: bank.bankName, accountNumber: bank.accountNumber } }];
    });
  }
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
export const channelLabel = (account: TransferAccount) => account.id === 'bank-promptpay' ? 'พร้อมเพย์ · ' + account.bankName : account.kind === 'promptpay' ? 'พร้อมเพย์ · เบอร์โทร' : account.bankName;
// The linked bank is verification data, not a second destination for the player.
export function publicTransferAccount(account: TransferAccount | null | undefined): TransferAccount | null {
  const channels = transferOptions(account).map(({ linkedBank: _linkedBank, ...channel }) => channel);
  return channels.length ? { ...channels[0], ...(channels.length > 1 ? { alternatives: channels.slice(1) } : {}) } : null;
}
