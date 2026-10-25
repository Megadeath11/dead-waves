// Draws the app icon (a blocky zombie head, like the in-game models) into icon.png. Pure Node, no packages.
// node tools/make-icon.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const N = 256;
const px = new Uint8Array(N * N * 4);
const set = (x, y, c) => {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3] === undefined ? 255 : c[3];
};
const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };

// background: dark red radial
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const d = Math.hypot(x - 90, y - 70) / 260;
  const k = Math.max(0, 1 - d);
  set(x, y, [Math.round(8 + 60 * k * k), Math.round(3 + 10 * k * k), Math.round(3 + 6 * k * k)]);
}
// rounded corners (transparent)
const R = 36;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const cx = x < R ? R : x >= N - R ? N - R - 1 : x, cy = y < R ? R : y >= N - R ? N - R - 1 : y;
  if (Math.hypot(x - cx, y - cy) > R) set(x, y, [0, 0, 0, 0]);
}
const skin = [106, 122, 92], dark = [70, 82, 60], hair = [40, 32, 24], eye = [255, 90, 30], mouth = [40, 6, 6], blood = [120, 10, 8];
rect(58, 50, 140, 150, dark);        // head shadow side
rect(58, 50, 128, 144, skin);        // head
rect(54, 40, 136, 26, hair);         // hair block
rect(80, 66, 30, 8, hair);
rect(78, 104, 30, 18, eye);          // eyes
rect(140, 104, 30, 18, eye);
rect(84, 108, 14, 8, [255, 200, 120]);
rect(146, 108, 14, 8, [255, 200, 120]);
rect(86, 150, 86, 24, mouth);        // jaw / mouth
for (let k = 0; k < 5; k++) rect(92 + k * 16, 150, 8, 10, [220, 210, 180]); // teeth
rect(150, 70, 22, 16, blood);        // wound
rect(156, 86, 8, 22, blood);
rect(70, 176, 10, 30, blood);        // drip
rect(70, 206, 6, 10, blood);
rect(58, 194, 140, 12, [52, 60, 44]); // neck shadow

// PNG encode
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * N * 4, N * 4).copy(raw, y * (N * 4 + 1) + 1);
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote', out);
