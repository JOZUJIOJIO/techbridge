import QRCode from 'qrcode';

await QRCode.toFile('internal/sample-partner-qr.svg', 'https://qiaobit.com/s/future-tech', {
  type: 'svg',
  width: 320,
  margin: 2,
  color: { dark: '#111111', light: '#ffffff' }
});
