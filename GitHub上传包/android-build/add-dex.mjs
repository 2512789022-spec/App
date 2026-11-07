/**
 * add-dex.mjs — 把 classes.dex 追加进 APK，不改动任何既有条目（字节级保留，
 * 维持 aapt2 产出的 resources.arsc STORED + 对齐状态）。纯 Node 实现：
 * 复制原数据区 → 追加新 local entry → 复制原 central directory → 追加新 CD entry → 重写 EOCD。
 * 用法：node add-dex.mjs <base.apk> <classes.dex>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';

const [apkPath, dexPath] = process.argv.slice(2);
if (!apkPath || !dexPath) { console.error('用法: node add-dex.mjs <apk> <dex>'); process.exit(1); }

const apk = readFileSync(apkPath);
const dex = readFileSync(dexPath);

/* 定位 EOCD（从文件尾向前扫，注释最长 64KB） */
let eocd = -1;
for (let i = apk.length - 22; i >= Math.max(0, apk.length - 22 - 65536); i--) {
  if (apk.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) { console.error('未找到 EOCD'); process.exit(1); }
const cdCount = apk.readUInt16LE(eocd + 10);
const cdSize = apk.readUInt32LE(eocd + 12);
const cdOffset = apk.readUInt32LE(eocd + 16);
console.log(`EOCD@${eocd} 条目数=${cdCount} CD大小=${cdSize} CD偏移=${cdOffset}`);

/* 新条目：classes.dex，deflate 压缩 */
const NAME = Buffer.from('classes.dex', 'utf8');
const compressed = deflateRawSync(dex, { level: 9 });
const crc = crc32(dex) >>> 0;

// MS-DOS 时间
const now = new Date();
const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() / 2) & 0x1f);
const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);
const FLAGS = 0x0800; // UTF-8 文件名

// local file header (30B) + name + data
const lfh = Buffer.alloc(30);
lfh.writeUInt32LE(0x04034b50, 0);
lfh.writeUInt16LE(20, 4);        // version needed
lfh.writeUInt16LE(FLAGS, 6);
lfh.writeUInt16LE(8, 8);         // method = deflate
lfh.writeUInt16LE(dosTime, 10);
lfh.writeUInt16LE(dosDate, 12);
lfh.writeUInt32LE(crc, 14);
lfh.writeUInt32LE(compressed.length, 18);
lfh.writeUInt32LE(dex.length, 22);
lfh.writeUInt16LE(NAME.length, 26);
lfh.writeUInt16LE(0, 28);        // extra len

// central directory entry (46B) + name
const cd = Buffer.alloc(46);
cd.writeUInt32LE(0x02014b50, 0);
cd.writeUInt16LE(20, 4);         // version made by
cd.writeUInt16LE(20, 6);         // version needed
cd.writeUInt16LE(FLAGS, 8);
cd.writeUInt16LE(8, 10);         // method
cd.writeUInt16LE(dosTime, 12);
cd.writeUInt16LE(dosDate, 14);
cd.writeUInt32LE(crc, 16);
cd.writeUInt32LE(compressed.length, 20);
cd.writeUInt32LE(dex.length, 24);
cd.writeUInt16LE(NAME.length, 28);
cd.writeUInt16LE(0, 30);         // extra len
cd.writeUInt16LE(0, 32);         // comment len
cd.writeUInt16LE(0, 34);         // disk start
cd.writeUInt16LE(0, 36);         // internal attrs
cd.writeUInt32LE(0, 38);         // external attrs
cd.writeUInt32LE(cdOffset, 42);  // local header offset（新数据正好从原 CD 起点开始写）

/* 组装 */
const newCdOffset = cdOffset + 30 + NAME.length + compressed.length;
const newCdSize = cdSize + 46 + NAME.length;
const eocdNew = Buffer.alloc(22);
eocdNew.writeUInt32LE(0x06054b50, 0);
eocdNew.writeUInt16LE(0, 4);
eocdNew.writeUInt16LE(0, 6);
eocdNew.writeUInt16LE(cdCount + 1, 8);
eocdNew.writeUInt16LE(cdCount + 1, 10);
eocdNew.writeUInt32LE(newCdSize, 12);
eocdNew.writeUInt32LE(newCdOffset, 16);
eocdNew.writeUInt16LE(0, 20);

const out = Buffer.concat([
  apk.subarray(0, cdOffset),      // 原数据区（字节级保留）
  lfh, NAME, compressed,          // 新条目
  apk.subarray(cdOffset, cdOffset + cdSize), // 原 central directory
  cd, NAME,                       // 新 CD 条目（46B 头 + 文件名）
  eocdNew,
]);
writeFileSync(apkPath, out);
console.log(`classes.dex 注入完成（原始 ${dex.length}B → 压缩 ${compressed.length}B，总条目 ${cdCount + 1}）`);
