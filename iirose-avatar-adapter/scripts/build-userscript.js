const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const packagePath = path.join(rootDir, 'package.json');
const sourcePath = path.join(rootDir, 'src', 'iaa.user.js');
const distDir = path.join(rootDir, 'dist');
const outputPath = path.join(distDir, 'IAA.js');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const pkg = readJson(packagePath);
  const version = String(pkg.version || '0.1.0');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file missing: ${sourcePath}`);
  }

  let userscriptCode = fs.readFileSync(sourcePath, 'utf8');
  userscriptCode = userscriptCode.replace(/__IAA_VERSION__/g, version);

  ensureDir(distDir);
  fs.writeFileSync(outputPath, userscriptCode, 'utf8');

  const sizeKb = (Buffer.byteLength(userscriptCode, 'utf8') / 1024).toFixed(1);
  console.log(`Built ${path.relative(rootDir, outputPath)} (${sizeKb} KB)`);
}

try {
  main();
} catch (error) {
  console.error('BUILD_USER_SCRIPT_FAILED', error && error.stack ? error.stack : error);
  process.exit(1);
}
