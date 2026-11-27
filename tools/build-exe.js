'use strict';
/**
 * 构建单文件 exe：Node SEA（Single Executable Application）
 *
 * 产物：dist/靶场.exe
 *   - 内含 Node 运行时 + 全部业务代码 + public/ 与 certs/ 静态资源
 *   - 运行时不依赖本机 Node，数据目录 data/ 会在 exe 旁边自动创建
 *
 * 依赖：postject（仅构建时需要，放在 ../.tools 里，不污染交付目录）
 * 用法：node tools/build-exe.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { bundle, ROOT } = require('./bundle');

const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
const EXE_NAME = process.env.EXE_NAME || '靶场.exe';

function walk(dir, list) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, list);
    else list.push(full);
  }
  return list;
}

function main() {
  console.log('== 1/5 打包 JS ==');
  fs.mkdirSync(BUILD, { recursive: true });
  const code = bundle();
  const bundlePath = path.join(BUILD, 'bundle.js');
  fs.writeFileSync(bundlePath, code, 'utf8');
  console.log('   ' + path.relative(ROOT, bundlePath) + '  ' + (code.length / 1024).toFixed(1) + ' KB');

  console.log('== 2/5 收集静态资源 ==');
  const assets = {};
  for (const dir of ['public', 'certs']) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const file of walk(base, [])) {
      const key = path.relative(ROOT, file).split(path.sep).join('/');
      assets[key] = key;
    }
  }
  console.log('   ' + Object.keys(assets).length + ' 个资源文件');

  const seaConfig = {
    main: path.relative(ROOT, bundlePath).split(path.sep).join('/'),
    output: 'build/sea-prep.blob',
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets
  };
  const cfgPath = path.join(BUILD, 'sea-config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(seaConfig, null, 2), 'utf8');

  console.log('== 3/5 生成 SEA blob ==');
  execFileSync(process.execPath, ['--experimental-sea-config', cfgPath], { cwd: ROOT, stdio: 'inherit' });
  const blobPath = path.join(BUILD, 'sea-prep.blob');
  if (!fs.existsSync(blobPath)) throw new Error('SEA blob 未生成');
  console.log('   ' + (fs.statSync(blobPath).size / 1024).toFixed(0) + ' KB');

  console.log('== 4/5 复制 Node 运行时并注入 ==');
  fs.mkdirSync(DIST, { recursive: true });
  const exePath = path.join(DIST, EXE_NAME);
  fs.copyFileSync(process.execPath, exePath);
  console.log('   运行时: ' + process.execPath);

  const postject = [
    path.join(ROOT, '..', '.tools', 'node_modules', 'postject', 'dist', 'cli.js'),
    path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js')
  ].find(p => fs.existsSync(p));
  if (!postject) {
    throw new Error('找不到 postject，请先执行：npm i postject --prefix ../.tools');
  }
  execFileSync(
    process.execPath,
    [postject, exePath, 'NODE_SEA_BLOB', blobPath, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'],
    { stdio: 'inherit' }
  );

  console.log('== 5/5 完成 ==');

  // 附带启动脚本与说明（bat 已按 GBK + CRLF 存好，直接拷贝）
  const batDir = path.join(ROOT, 'tools', 'bat');
  const pairs = [
    ['dist-启动靶场.bat', '启动靶场.bat'],
    ['dist-服务管理.bat', '服务管理.bat']
  ];
  for (const [src, dst] of pairs) {
    const s = path.join(batDir, src);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(DIST, dst));
  }
  const readme = path.join(ROOT, 'tools', 'bat-src', '使用说明.txt');
  if (fs.existsSync(readme)) fs.copyFileSync(readme, path.join(DIST, '使用说明.txt'));

  const size = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
  console.log('   ' + path.relative(ROOT, exePath) + '  ' + size + ' MB');
  console.log('   dist/ 已附带：启动靶场.bat、服务管理.bat、使用说明.txt');
  console.log('   直接双击即可运行，data/ 会创建在 exe 同目录');
}

main();
