// 从 dl.google.com 下载 build-tools r35，取其中稳定的 lib/d8.jar（替换 34.0.0 的 8.2.2-dev 崩溃版）
import { createWriteStream, renameSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const DL = join(HERE, 'downloads');
mkdirSync(DL, { recursive: true });
const ZIP = join(DL, 'build-tools_r35_windows.zip');
const URL = 'https://dl.google.com/android/repository/build-tools_r35_windows.zip';

if (!existsSync(ZIP) || statSync(ZIP).size < 1e6) {
  console.log('下载', URL);
  const res = await fetch(URL);
  if (!res.ok) { console.error('HTTP ' + res.status); process.exit(1); }
  const total = +(res.headers.get('content-length') || 0);
  let got = 0;
  const rs = Readable.fromWeb(res.body);
  rs.on('data', (c) => {
    got += c.length;
    process.stdout.write('\r' + (got / 1048576).toFixed(1) + (total ? '/' + (total / 1048576).toFixed(0) : '') + ' MB');
  });
  await pipeline(rs, createWriteStream(ZIP + '.part'));
  renameSync(ZIP + '.part', ZIP);
  console.log('\n下载完成');
} else console.log('zip 已存在');

// 解压 d8.jar（目录名因版本而异，先列出再匹配）
console.log('查找 zip 内的 d8.jar ...');
const list = execFileSync('tar', ['-tf', ZIP]).toString();
const entry = list.split(/\r?\n/).find((l) => /^android-[^/]+\/lib\/d8\.jar$/.test(l.trim()));
if (!entry) { console.error('未找到 d8.jar，zip 内容头部:\n' + list.split(/\r?\n/).slice(0, 5).join('\n')); process.exit(1); }
console.log('解压 ' + entry.trim());
execFileSync('tar', ['-xf', ZIP, '-C', HERE, '--strip-components=2', entry.trim()], { stdio: 'inherit' });
const dst = join(HERE, 'r8.jar');
renameSync(join(HERE, 'd8.jar'), dst);
console.log('完成 → ' + dst + ' (' + (statSync(dst).size / 1048576).toFixed(1) + ' MB)');
