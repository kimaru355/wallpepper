import { app, net, shell, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checkForUpdate, SITE_URL, type ReleaseFile, type UpdateInfo } from '../../../../packages/core/src/update.ts';

const UA = `Wallpepper/${app.getVersion()} (+desktop-updater)`;
const APPIMAGE = process.platform === 'linux' ? process.env.APPIMAGE : undefined;

export interface UpdateStatus extends Pick<UpdateInfo, 'version' | 'current'> {
  /** install: downloaded and applied in-app. open: opens the download page (e.g. .deb needs root). */
  how: 'install' | 'open';
  size: number;
}

let pending: UpdateInfo | null = null;
let busy = false;

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';

function pick(files: ReleaseFile[]): ReleaseFile | undefined {
  if (platform === 'windows') return files.find((f) => f.file.endsWith('.exe'));
  if (platform === 'linux') {
    return (APPIMAGE ? files.find((f) => f.file.endsWith('.AppImage')) : undefined) ?? files.find((f) => f.file.endsWith('.deb'));
  }
  return files[0];
}

const howFor = (u: UpdateInfo): UpdateStatus['how'] =>
  platform === 'windows' || (platform === 'linux' && APPIMAGE && u.file.file.endsWith('.AppImage')) ? 'install' : 'open';

const status = (u: UpdateInfo): UpdateStatus => ({ version: u.version, current: u.current, how: howFor(u), size: u.file.size });

export async function check(): Promise<UpdateStatus | null> {
  const fetchJson = async (url: string) => {
    const res = await net.fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`Update server responded ${res.status}`);
    return res.json();
  };
  pending = await checkForUpdate(fetchJson, app.getVersion(), platform, pick);
  return pending ? status(pending) : null;
}

async function download(u: UpdateInfo, dest: string, onProgress: (done: number, total: number) => void) {
  const res = await net.fetch(u.url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || u.file.size;
  const hash = createHash('sha256');
  let done = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    done += chunk.length;
    onProgress(done, total);
  });
  await pipeline(body, createWriteStream(dest));
  if (hash.digest('hex') !== u.file.sha256.toLowerCase()) {
    await fs.unlink(dest).catch(() => {});
    throw new Error('The downloaded update failed its integrity check and was discarded.');
  }
}

/** Downloads (checksum-verified) and applies the update found by check(). Quits/relaunches the app when it installs. */
export async function install(win: BrowserWindow | null, markQuitting: () => void): Promise<void> {
  const u = pending;
  if (!u) throw new Error('No update to install. Check for updates first.');
  if (busy) return;
  if (howFor(u) === 'open') {
    await shell.openExternal(SITE_URL);
    return;
  }
  busy = true;
  try {
    const dir = join(app.getPath('temp'), 'wallpepper-update');
    await fs.mkdir(dir, { recursive: true });
    const dest = APPIMAGE && platform === 'linux' ? `${APPIMAGE}.new` : join(dir, u.file.file);
    let last = 0;
    await download(u, dest, (done, total) => {
      const now = Date.now();
      if (now - last > 200 || done === total) {
        last = now;
        win?.webContents.send('update:progress', { done, total });
      }
    });

    markQuitting();
    if (platform === 'windows') {
      // Interactive NSIS installer: it replaces the running app, then the user can start it again.
      spawn(dest, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    } else {
      // AppImage: swap the file in place (renaming over a running AppImage is fine on Linux) and restart.
      await fs.chmod(dest, 0o755);
      await fs.rename(dest, APPIMAGE!);
      app.relaunch({ execPath: APPIMAGE!, args: process.argv.slice(1).filter((a) => a === '--hidden') });
      app.exit(0);
    }
  } finally {
    busy = false;
  }
}
