declare module 'qrcode/lib/core/qrcode.js' {
  import type { QRCode, QRCodeOptions } from 'qrcode';
  const core: { create(text: string, options?: QRCodeOptions): QRCode };
  export default core;
}
