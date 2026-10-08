export function qrImageFile(image: string, filename: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 2 * 1024 * 1024) throw Error('ภาพ QR ไม่ถูกต้อง');
  const bytes = Uint8Array.from(atob(image.slice(image.indexOf(',') + 1)), c => c.charCodeAt(0));
  return new File([bytes], filename, { type: 'image/png' });
}
type ExportDevice = { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void>; download: (file: File) => void };
export async function saveQrImage(image: string, filename: string, device: ExportDevice): Promise<'shared' | 'download-started' | 'cancelled' | 'unavailable'> {
  const file = qrImageFile(image, filename);
  if (device.canShare?.({ files: [file] }) && device.share) {
    try { await device.share({ files: [file] }); return 'shared'; }
    catch (cause) { return (cause as Error).name === 'AbortError' ? 'cancelled' : 'unavailable'; }
  }
  try { device.download(file); return 'download-started'; } catch { return 'unavailable'; }
}
export function downloadQr(file: File) {
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
