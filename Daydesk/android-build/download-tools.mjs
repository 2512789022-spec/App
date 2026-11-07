// 下载 Android 构建所需工具包（build-tools r34 + platform android-34）
import { createWriteStream, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const DL = join(HERE, 'downloads');
mkdirSync(DL, { recursive: true });

// 先查官方仓库清单，确认 android-34 平台包的真实文件名
const repoXml = await (await fetch('https://dl.google.com/android/repository/repository2-3.xml')).text();
const m = repoXml.match(/<url>(platform-34[^<]*\.zip)<\/url>/);
console.log('repository2-3.xml 中 platform-34 文件名:', m ? m[1] : '未找到（用候选）');

const FILES = [
  ['build-tools_r34-windows.zip', 'https://dl.google.com/android/repository/build-tools_r34-windows.zip'],
  [m ? m[1] : 'platform-34_r02.zip', 'https://dl.google.com/android/repository/' + (m ? m[1] : 'platform-34_r02.zip')],
];

for (const [name, url] of FILES) {
  const out = join(DL, name);
  if (existsSync(out) && statSync(out).size > 1000) { console.log('已存在，跳过:', name); continue; }
  process.stdout.write('下载 ' + name + ' ... ');
  const tmp = out + '.part';
  const res = await fetch(url);
  if (!res.ok) { console.log('失败 HTTP ' + res.status); process.exit(1); }
  const total = +(res.headers.get('content-length') || 0);
  let got = 0;
  const rs = Readable.fromWeb(res.body);
  rs.on('data', (c) => {
    got += c.length;
    if (total) process.stdout.write('\r下载 ' + name + ' ... ' + (got / 1048576).toFixed(1) + '/' + (total / 1048576).toFixed(0) + ' MB');
  });
  await pipeline(rs, createWriteStream(tmp));
  renameSync(tmp, out);
  console.log('\r下载完成: ' + name + ' (' + (got / 1048576).toFixed(1) + ' MB)          ');
}
console.log('全部就绪');
