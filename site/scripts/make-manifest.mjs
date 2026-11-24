// Usage: node site/scripts/make-manifest.mjs <version>
// Reads releases/<version>/*, writes releases/<version>/latest.json (sizes + SHA-256 + platform info).
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2];
if (!version) throw new Error('usage: make-manifest.mjs <version>');
const dir = join(import.meta.dirname, '..', '..', 'releases', version);

const KINDS = [
  { re: /\.apk$/i, platform: 'android', platformName: 'Android', label: 'Android (APK)', note: 'Android 7.0+ · all CPU types' },
  { re: /Setup.*\.exe$/i, platform: 'windows', platformName: 'Windows', label: 'Windows installer', note: 'Windows 10/11 · 64-bit' },
  { re: /\.AppImage$/i, platform: 'linux', platformName: 'Linux', label: 'Linux (AppImage)', note: 'any distro · x86-64' },
  { re: /\.deb$/i, platform: 'linux', platformName: 'Linux', label: 'Linux (.deb)', note: 'Debian / Ubuntu · x86-64' },
];
// order shown on the site
const ORDER = ['android', 'windows', 'linux'];

const sha256 = (file) => new Promise((resolve, reject) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

const files = [];
for (const name of readdirSync(dir)) {
  const kind = KINDS.find((k) => k.re.test(name));
  if (!kind) continue;
  files.push({
    id: name, file: name, url: `/downloads/${version}/${name}`,
    platform: kind.platform, platformName: kind.platformName, label: kind.label, note: kind.note,
    size: statSync(join(dir, name)).size, sha256: await sha256(join(dir, name)),
  });
}
files.sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform) || a.file.localeCompare(b.file));
const manifest = { version, date: new Date().toISOString().slice(0, 10), files };
writeFileSync(join(dir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`latest.json: ${files.length} files`);
files.forEach((f) => console.log(' ', f.platform.padEnd(8), f.file, (f.size / 1e6).toFixed(1) + ' MB'));
