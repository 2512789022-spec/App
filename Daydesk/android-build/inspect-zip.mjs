// 诊断 APK ZIP 结构：解析 EOCD → CD → 校验每个 local header
import { readFileSync } from 'node:fs';
const b = readFileSync(process.argv[2]);
console.log('size', b.length);
let e = -1;
for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { e = i; break; }
if (e < 0) { console.log('无 EOCD'); process.exit(1); }
console.log('EOCD@', e, 'count', b.readUInt16LE(e + 8), '/', b.readUInt16LE(e + 10),
  'cdSize', b.readUInt32LE(e + 12), 'cdOff', b.readUInt32LE(e + 16), 'commentLen', b.readUInt16LE(e + 20));
let p = b.readUInt32LE(e + 16);
const end = p + b.readUInt32LE(e + 12);
let n = 0;
while (p < end) {
  const sig = b.readUInt32LE(p);
  if (sig !== 0x02014b50) { console.log('CD坏@', p, 'sig0x' + sig.toString(16)); break; }
  const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), cLen = b.readUInt16LE(p + 32);
  const name = b.toString('utf8', p + 46, p + 46 + nameLen);
  const lo = b.readUInt32LE(p + 42);
  const lsig = b.readUInt32LE(lo);
  console.log((n++) + '', name,
    '| cdMethod', b.readUInt16LE(p + 10), 'cdCsize', b.readUInt32LE(p + 20), 'cdUsize', b.readUInt32LE(p + 24),
    '| localOff', lo, 'localSig 0x' + lsig.toString(16),
    'lMethod', b.readUInt16LE(lo + 8), 'lCsize', b.readUInt32LE(lo + 18), 'lUsize', b.readUInt32LE(lo + 22));
  p += 46 + nameLen + extraLen + cLen;
}
