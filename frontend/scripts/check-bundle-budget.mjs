import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const limits = {
  initialJavaScriptBytes: 625_000,
  individualJavaScriptBytes: 450_000,
  // Landing styles are intentionally loaded by the app entry so a missing lazy
  // CSS chunk cannot prevent the public homepage from rendering.
  individualCssBytes: 110_000,
};

const distDir = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(distDir, '.vite/manifest.json'), 'utf8'));
const entries = Object.values(manifest);
const entry = entries.find((item) => item.isEntry);

if (!entry) throw new Error('Bundle budget: Vite manifest has no application entry.');

const importedFiles = new Set();
const visit = (item) => {
  if (importedFiles.has(item.file)) return;
  importedFiles.add(item.file);
  for (const key of item.imports ?? []) {
    const imported = manifest[key];
    if (imported) visit(imported);
  }
};
visit(entry);

const sizes = new Map();
for (const item of entries) {
  if (!sizes.has(item.file)) sizes.set(item.file, (await stat(resolve(distDir, item.file))).size);
  for (const cssFile of item.css ?? []) {
    if (!sizes.has(cssFile)) sizes.set(cssFile, (await stat(resolve(distDir, cssFile))).size);
  }
}

const initialJavaScriptBytes = [...importedFiles]
  .filter((file) => file.endsWith('.js'))
  .reduce((total, file) => total + (sizes.get(file) ?? 0), 0);
const largestJavaScript = [...sizes].filter(([file]) => file.endsWith('.js')).sort((a, b) => b[1] - a[1])[0];
const largestCss = [...sizes].filter(([file]) => file.endsWith('.css')).sort((a, b) => b[1] - a[1])[0];

const failures = [];
if (initialJavaScriptBytes > limits.initialJavaScriptBytes) failures.push(`initial JavaScript ${initialJavaScriptBytes} > ${limits.initialJavaScriptBytes}`);
if (largestJavaScript?.[1] > limits.individualJavaScriptBytes) failures.push(`${largestJavaScript[0]} ${largestJavaScript[1]} > ${limits.individualJavaScriptBytes}`);
if (largestCss?.[1] > limits.individualCssBytes) failures.push(`${largestCss[0]} ${largestCss[1]} > ${limits.individualCssBytes}`);

console.log(`Bundle budget: initial JS ${initialJavaScriptBytes}/${limits.initialJavaScriptBytes} bytes; largest JS ${largestJavaScript?.[1] ?? 0}/${limits.individualJavaScriptBytes}; largest CSS ${largestCss?.[1] ?? 0}/${limits.individualCssBytes}.`);
if (failures.length) {
  console.error(`Bundle budget exceeded:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
}
