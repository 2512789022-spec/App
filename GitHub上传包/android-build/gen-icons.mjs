// 生成 APK 各密度启动图标：克莱因蓝圆角方块 + 白色对勾（纯 Node PNG 编码，4x 超采样抗锯齿）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, 'app', 'res');
for (const d of ['mipmap-mdpi','mipmap-hdpi','mipmap-xhdpi','mipmap-xxhdpi','mipmap-xxxhdpi'])
  mkdirSync(join(RES, d), { recursive: true });

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngRGBA(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 绘制 ---------- */
const BLUE = [47, 91, 255];       // 克莱因蓝 #2F5BFF
const SS = 4;                     // 超采样倍数
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
// 归一化坐标：圆角矩形 [0.06,0.06]-[0.94,0.94]，角半径 0.22；对勾两段
function drawIcon(size) {
  const S = size * SS;
  const buf = Buffer.alloc(size * size * 4);
  const half = 0.0, r = 0.22, lo = 0.06, hi = 0.94;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x * SS + sx + 0.5) / S, v = (y * SS + sy + 0.5) / S;
        // 圆角矩形覆盖测试
        const cx = Math.max(lo + r, Math.min(hi - r, u));
        const cy = Math.max(lo + r, Math.min(hi - r, v));
        const inside = u >= lo && u <= hi && v >= lo && v <= hi &&
          ((u < lo + r || u > hi - r) && (v < lo + r || v > hi - r) ? Math.hypot(u - cx, v - cy) <= r : true);
        if (!inside) continue;
        // 对勾：线宽 0.105
        const w = 0.105;
        const d1 = distToSeg(u, v, 0.235, 0.525, 0.425, 0.715);
        const d2 = distToSeg(u, v, 0.425, 0.715, 0.775, 0.285);
        if (Math.min(d1, d2) <= w / 2) hit++;
        else hit += 0; // 蓝底
        if (Math.min(d1, d2) > w / 2) { /* 底色样本 */ }
      }
      const total = SS * SS;
      const checkFrac = hit / total;
      // 每个样本要么对勾白、要么蓝底 → 计算白与蓝的占比即可（覆盖区域外为透明）
      // 重新精确统计：先算覆盖样本数
      let cover = 0, white = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x * SS + sx + 0.5) / S, v = (y * SS + sy + 0.5) / S;
        const cx = Math.max(lo + r, Math.min(hi - r, u));
        const cy = Math.max(lo + r, Math.min(hi - r, v));
        const inside = u >= lo && u <= hi && v >= lo && v <= hi &&
          ((u < lo + r || u > hi - r) && (v < lo + r || v > hi - r) ? Math.hypot(u - cx, v - cy) <= r : true);
        if (!inside) continue;
        cover++;
        const w2 = 0.105 / 2;
        const d = Math.min(
          distToSeg(u, v, 0.235, 0.525, 0.425, 0.715),
          distToSeg(u, v, 0.425, 0.715, 0.775, 0.285)
        );
        if (d <= w2) white++;
      }
      const a = cover / total;
      const wf = cover ? white / cover : 0;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(BLUE[0] * (1 - wf) + 255 * wf);
      buf[i + 1] = Math.round(BLUE[1] * (1 - wf) + 255 * wf);
      buf[i + 2] = Math.round(BLUE[2] * (1 - wf) + 255 * wf);
      buf[i + 3] = Math.round(a * 255);
      void half;
    }
  }
  return pngRGBA(size, size, buf);
}

const SIZES = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
for (const [dir, size] of Object.entries(SIZES)) {
  const png = drawIcon(size);
  writeFileSync(join(RES, dir, 'ic_launcher.png'), png);
  console.log(dir, size + 'x' + size, png.length + 'B');
}
console.log('图标生成完成');
