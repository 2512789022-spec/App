/**
 * build-apk.mjs — 无 Gradle 手工构建「每日计划」APK
 * 链路：aapt2 compile/link → javac → d8 → 注入 dex → zipalign → apksigner
 * 注意：aapt2 不支持中文路径，全部构建在 ASCII 临时目录 %TEMP%\dayplan-apk-build 进行，
 *       成品拷回「每日计划App」目录。
 * 运行：node build-apk.mjs
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);                       // 每日计划App/（中文路径，仅作输入输出）
const TOOLS = HERE;                               // 工具与源工程（读入没问题，只是 aapt2 不认中文输出）
const WORK = join(tmpdir(), 'dayplan-apk-build'); // ASCII 构建工作区
const BT = join(TOOLS, 'android-14');
const PLATFORM_JAR = join(TOOLS, 'android-34-ext12', 'android.jar');
const KEYSTORE = join(TOOLS, 'dayplan.keystore'); // 密钥长期保存在工具目录（ASCII 无要求，keytool 是 java）
const OUT_APK = join(ROOT, '每日计划-v2.2.apk');
const KS_PASS = 'dayplan2026';

const log = (s) => console.log('\n== ' + s);
function run(file, args, opts = {}) {
  const r = spawnSync(file, args, { cwd: WORK, encoding: 'utf8', ...opts });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error('\n[失败] ' + file + ' ' + args.join(' '));
    process.exit(1);
  }
  return r;
}
const java = (cp, main, args) => run('java', ['-cp', cp, main, ...args]);

/* 0. 准备 ASCII 工作区 */
log('准备构建工作区 ' + WORK);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, 'build'), { recursive: true });
mkdirSync(join(WORK, 'assets'), { recursive: true });
cpSync(join(TOOLS, 'app', 'res'), join(WORK, 'res'), { recursive: true });
cpSync(join(TOOLS, 'app', 'AndroidManifest.xml'), join(WORK, 'AndroidManifest.xml'));
cpSync(join(ROOT, 'index.html'), join(WORK, 'assets', 'index.html'));
cpSync(join(TOOLS, 'app', 'src'), join(WORK, 'src'), { recursive: true });
// 工具链也拷到工作区，规避 aapt2 对中文路径的任何输入敏感
cpSync(BT, join(WORK, 'bt'), { recursive: true });
cpSync(PLATFORM_JAR, join(WORK, 'android.jar'));
const BT2 = join(WORK, 'bt');
const PLATFORM = join(WORK, 'android.jar');

/* 1. 编译资源 */
log('aapt2 compile 资源');
run(join(BT2, 'aapt2.exe'), ['compile', '--dir', join(WORK, 'res'), '-o', join(WORK, 'build', 'res.zip')]);

/* 2. 链接出基础 APK（同时生成 R.java 供 Java 编译） */
log('aapt2 link 生成 base.apk');
run(join(BT2, 'aapt2.exe'), [
  'link', '-o', join(WORK, 'build', 'base.apk'),
  '-I', PLATFORM,
  '--manifest', join(WORK, 'AndroidManifest.xml'),
  '-A', join(WORK, 'assets'),
  '--auto-add-overlay',
  '--java', join(WORK, 'gen'),
  join(WORK, 'build', 'res.zip'),
]);

/* 3. 编译 Java（标准 Android 方式：android.jar 做 bootclasspath，lambda 用 core-lambda-stubs 桩） */
log('javac 编译 Java 源码');
const CLASSES = join(WORK, 'build', 'classes');
mkdirSync(CLASSES, { recursive: true });
const SRC_DIR = join(WORK, 'src');
const srcFiles = [];
const collectJava = (d) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) collectJava(p); else if (f.name.endsWith('.java')) srcFiles.push(p);
  }
};
collectJava(SRC_DIR);
if (existsSync(join(WORK, 'gen'))) collectJava(join(WORK, 'gen')); // aapt2 生成的 R.java
const BOOTCP = [PLATFORM, join(BT2, 'core-lambda-stubs.jar')].join(';');
let jr = spawnSync('javac', ['-source', '8', '-target', '8', '-bootclasspath', BOOTCP, '-d', CLASSES, ...srcFiles], { cwd: WORK, encoding: 'utf8' });
if (jr.status !== 0) {
  if (jr.stderr) process.stderr.write(jr.stderr);
  console.log('（-source 8 失败，改用 --release 8 + classpath）');
  jr = spawnSync('javac', ['--release', '8', '-classpath', PLATFORM, '-d', CLASSES, ...srcFiles], { cwd: WORK, encoding: 'utf8' });
  if (jr.stdout) process.stdout.write(jr.stdout);
  if (jr.stderr) process.stderr.write(jr.stderr);
  if (jr.status !== 0) { console.error('javac 失败'); process.exit(1); }
} else if (jr.stderr) process.stderr.write(jr.stderr);

/* 4. 转 dex（用 build-tools r35 的稳定版 d8，34.0.0 的 8.2.2-dev 有解析崩溃 bug） */
log('d8 生成 classes.dex');
const classFiles = [];
(function walk(d) {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) walk(p); else if (f.name.endsWith('.class')) classFiles.push(p);
  }
})(CLASSES);
const R8 = join(TOOLS, 'r8.jar');
java(R8, 'com.android.tools.r8.D8',
  ['--release', '--lib', PLATFORM, '--min-api', '21', '--output', join(WORK, 'build'), ...classFiles]);
if (!existsSync(join(WORK, 'build', 'classes.dex'))) { console.error('classes.dex 未生成'); process.exit(1); }

/* 5. 注入 dex（Node 字节级追加，不动既有条目，保持 resources.arsc 的 STORED 状态） */
log('把 classes.dex 追加进 base.apk');
run('node', [join(TOOLS, 'add-dex.mjs'), join(WORK, 'build', 'base.apk'), join(WORK, 'build', 'classes.dex')]);

/* 6. 对齐 */
log('zipalign 4 字节对齐');
run(join(BT2, 'zipalign.exe'), ['-f', '4', join(WORK, 'build', 'base.apk'), join(WORK, 'build', 'aligned.apk')]);

/* 7. 密钥（不存在则生成，长期复用以便覆盖升级安装） */
const JDK_BIN = 'E:/HMCL/JAVA22/bin'; // javapath 目录里没有 keytool，用完整 JDK
const KEYTOOL = join(JDK_BIN, 'keytool.exe');
if (!existsSync(KEYSTORE)) {
  log('生成签名密钥');
  run(KEYTOOL, ['-J-Duser.language=en', '-genkeypair', '-keystore', KEYSTORE, '-alias', 'dayplan',
    '-storepass', KS_PASS, '-keypass', KS_PASS, '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10950', '-dname', 'CN=DayPlan,O=DayPlan,C=CN']);
}

/* 8. 签名（v1+v2 默认都开，兼容 Android 5~14+） */
log('apksigner 签名');
run('java', ['-jar', join(BT2, 'lib', 'apksigner.jar'), 'sign',
  '--ks', KEYSTORE, '--ks-key-alias', 'dayplan',
  '--ks-pass', 'pass:' + KS_PASS, '--key-pass', 'pass:' + KS_PASS,
  '--out', join(WORK, 'build', 'signed.apk'), join(WORK, 'build', 'aligned.apk')]);

/* 9. 验证 */
log('apksigner verify');
run('java', ['-jar', join(BT2, 'lib', 'apksigner.jar'), 'verify', '--print-certs', join(WORK, 'build', 'signed.apk')]);

/* 10. 交付：拷回中文路径 */
cpSync(join(WORK, 'build', 'signed.apk'), OUT_APK);
console.log('\n构建完成 → ' + OUT_APK);
