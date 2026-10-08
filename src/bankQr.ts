// Accept only static Thai payment QR data. A slip verification QR is not a receiving QR.
export function staticBankQr(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1024 || !/^[\x20-\x7e]+$/.test(value) || !/6304[0-9A-Fa-f]{4}$/.test(value)) return null;
  const tags = new Map<string, string>();
  for (let i = 0; i < value.length;) {
    const tag = value.slice(i, i + 2), len = value.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len) || tags.has(tag) || i + 4 + Number(len) > value.length) return null;
    tags.set(tag, value.slice(i + 4, i + 4 + Number(len))); i += 4 + Number(len);
  }
  if (tags.get('00') !== '01' || tags.get('01') !== '11' || tags.get('53') !== '764' || tags.get('58') !== 'TH' || tags.has('54') && Number(tags.get('54')) !== 0) return null;
  if (![tags.get('29'), tags.get('30')].some(v => v?.startsWith('0016A00000067701011') && ['1', '2'].includes(v[19]))) return null;
  let crc = 0xffff;
  for (const char of value.slice(0, -4)) { crc ^= char.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? crc << 1 ^ 0x1021 : crc << 1) & 0xffff; }
  return crc === parseInt(value.slice(-4), 16) ? value : null;
}
