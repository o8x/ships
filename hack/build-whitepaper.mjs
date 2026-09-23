// Builds the whitepaper PDF from a Markdown file using the system Chrome/Chromium.
//
// Usage:
//   node hack/build-whitepaper.mjs                 # picks the highest-version whitepaper in docs/
//   node hack/build-whitepaper.mjs "docs/xxx.md"   # explicit file
//   CHROME_PATH=/path/to/chrome node hack/build-whitepaper.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');

function versionOf(file) {
  const match = /-v(\d+)\.(\d+)\.(\d+)\.md$/.exec(file);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function pickWhitepaper() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const candidates = fs
    .readdirSync(DOCS_DIR)
    .filter((file) => file.startsWith('功能使用白皮书-v') && file.endsWith('.md'))
    .map((file) => ({ file, version: versionOf(file) }))
    .filter((entry) => entry.version);
  if (!candidates.length) {
    throw new Error('docs/ 中未找到 功能使用白皮书-v*.md');
  }
  candidates.sort((a, b) => compareVersion(a.version, b.version));
  return path.join(DOCS_DIR, candidates[candidates.length - 1].file);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('未找到 Chrome/Chromium，请用 CHROME_PATH 指定可执行文件');
}

function buildHtml(markdown, title) {
  const body = marked.parse(markdown);
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    color: #1d1d1f;
    font-size: 12px;
    line-height: 1.7;
  }
  h1 { font-size: 24px; border-bottom: 2px solid #2e6bfc; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 24px; border-bottom: 1px solid #e5e5e7; padding-bottom: 4px; }
  h3 { font-size: 14px; margin-top: 18px; }
  code {
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    background: #f2f2f4; padding: 1px 4px; border-radius: 4px; font-size: 11px;
  }
  pre { background: #f6f6f8; padding: 10px 12px; border-radius: 8px; overflow: auto; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #e2e2e6; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f6f8; }
  blockquote { margin: 10px 0; padding: 4px 12px; border-left: 3px solid #2e6bfc; color: #555; }
  a { color: #2e6bfc; text-decoration: none; }
  hr { border: none; border-top: 1px solid #e5e5e7; margin: 20px 0; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function main() {
  const mdPath = pickWhitepaper();
  if (!fs.existsSync(mdPath)) throw new Error(`文件不存在：${mdPath}`);

  const markdown = fs.readFileSync(mdPath, 'utf8');
  const baseName = path.basename(mdPath, '.md');
  const firstLine = markdown.split('\n').find((line) => line.trim().startsWith('# '));
  const title = firstLine ? firstLine.replace(/^#\s+/, '').trim() : baseName;

  const htmlPath = path.join(os.tmpdir(), `ships-whitepaper-${Date.now()}.html`);
  const pdfPath = path.join(path.dirname(mdPath), `${baseName}.pdf`);
  fs.writeFileSync(htmlPath, buildHtml(markdown, title), 'utf8');

  const chrome = findChrome();
  try {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-pdf-header-footer',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=3000',
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(htmlPath, { force: true });
  }

  console.log(`whitepaper: ${path.relative(ROOT, mdPath)} -> ${path.relative(ROOT, pdfPath)}`);
}

main();
