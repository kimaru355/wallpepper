import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, shell, Tray } from 'electron';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { hostname } from 'node:os';
import { extname, join } from 'node:path';
import { setWallpaperFile, type Target } from './wallpaper.ts';
import * as updater from './updater.ts';

const UA = 'Wallpepper/0.1 (+desktop)';
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const userFile = (name: string) => join(app.getPath('userData'), name);

// ---------- prefs (main-process-only switches) ----------
interface Prefs { closeToTray: boolean }
let prefs: Prefs = { closeToTray: true };
async function loadPrefs() {
  try {
    prefs = { ...prefs, ...JSON.parse(await fs.readFile(userFile('prefs.json'), 'utf8')) };
  } catch { /* defaults */ }
}
const savePrefs = () => fs.writeFile(userFile('prefs.json'), JSON.stringify(prefs));

// ---------- helpers ----------
function assertHttp(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) URLs are allowed');
  return u;
}

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

async function fetchToFile(url: string, dir: string, baseName: string): Promise<string> {
  assertHttp(url);
  await fs.mkdir(dir, { recursive: true });
  const res = await net.fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (type && !type.startsWith('image/')) throw new Error('The link did not return an image.');
  const urlExt = extname(new URL(url).pathname).toLowerCase();
  const ext = EXT_BY_TYPE[type] ?? (/^\.(jpe?g|png|webp|gif|avif)$/.test(urlExt) ? urlExt : '.jpg');
  const target = join(dir, baseName + ext);
  try {
    await fs.access(target);
    return target; // already downloaded
  } catch { /* not there yet */ }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = target + '.part';
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, target);
  return target;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'wallpaper';
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 10);

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('state:load', async () => {
    try {
      return await fs.readFile(userFile('state.json'), 'utf8');
    } catch {
      return null;
    }
  });
  ipcMain.handle('state:save', async (_e, json: string) => {
    const tmp = userFile('state.json.tmp');
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, userFile('state.json'));
  });

  ipcMain.handle('http:json', async (_e, url: string, headers?: Record<string, string>) => {
    assertHttp(url);
    const res = await net.fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers ?? {}) } });
    if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`);
    return res.json();
  });

  ipcMain.handle('wallpaper:set', async (_e, w: { id: string; url: string }, target: Target) => {
    // The current wallpaper cache keeps the last few files around.
    const dir = join(app.getPath('userData'), 'cache');
    const file = await fetchToFile(w.url, dir, hash(w.id));
    const note = await setWallpaperFile(file, target);
    void pruneCache(dir, file);
    return { note };
  });

  ipcMain.handle('wallpaper:download', async (_e, w: { id: string; url: string; title?: string }, folder: string) => {
    return fetchToFile(w.url, folder, `${slug(w.title ?? 'wallpaper')}-${hash(w.id)}`);
  });

  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('app:info', () => ({
    hostname: hostname(),
    platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux',
    defaultFolder: join(app.getPath('pictures'), 'Wallpepper'),
    version: app.getVersion(),
    autostart: app.getLoginItemSettings().openAtLogin,
    closeToTray: prefs.closeToTray,
  }));
  ipcMain.handle('app:autostart', (_e, on: boolean) => {
    app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
  });
  ipcMain.handle('app:closeToTray', async (_e, on: boolean) => {
    prefs.closeToTray = !!on;
    await savePrefs();
  });
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install(win, () => { quitting = true; }));
  ipcMain.handle('shell:showItem', (_e, path: string) => shell.showItemInFolder(path));
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    assertHttp(url);
    return shell.openExternal(url);
  });
}

async function pruneCache(dir: string, keep: string) {
  try {
    const files = await Promise.all((await fs.readdir(dir)).map(async (f) => ({ f: join(dir, f), t: (await fs.stat(join(dir, f))).mtimeMs })));
    files.sort((a, b) => b.t - a.t);
    for (const old of files.slice(8)) if (old.f !== keep) await fs.unlink(old.f).catch(() => {});
  } catch { /* ignore */ }
}

// ---------- window / tray ----------
function createWindow(hidden: boolean) {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: !hidden,
    backgroundColor: '#0e0f13',
    title: 'Wallpepper',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The playlist timer lives in the renderer; keep it running while hidden in the tray.
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file:')) e.preventDefault();
  });
  win.on('close', (e) => {
    if (!quitting && prefs.closeToTray && tray) {
      e.preventDefault();
      win?.hide();
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

function createTray() {
  // Generated 32x32 icon (rounded gradient square) so no binary asset is needed.
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = Math.max(0, Math.abs(x - 15.5) - 10.5);
      const dy = Math.max(0, Math.abs(y - 15.5) - 10.5);
      const inside = dx * dx + dy * dy <= 25;
      // BGRA order
      buf[i] = inside ? 255 - y * 4 : 0; // B
      buf[i + 1] = inside ? 90 + x * 2 : 0; // G
      buf[i + 2] = inside ? 120 + y * 3 : 0; // R
      buf[i + 3] = inside ? 255 : 0;
    }
  }
  tray = new Tray(nativeImage.createFromBitmap(buf, { width: size, height: size }));
  tray.setToolTip('Wallpepper');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Wallpepper', click: () => { win?.show(); win?.focus(); } },
      { label: 'Next wallpaper', click: () => win?.webContents.send('tray:next') },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', () => { win?.show(); win?.focus(); });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(async () => {
    await loadPrefs();
    registerIpc();
    createTray();
    createWindow(process.argv.includes('--hidden'));
    // Look for a new release shortly after start and then every 6 hours (packaged builds only).
    if (app.isPackaged) {
      const poll = () => updater.check().then((u) => { if (u) win?.webContents.send('update:available', u); }).catch(() => {});
      setTimeout(poll, 15_000);
      setInterval(poll, 6 * 3600_000);
    }
    app.on('activate', () => { if (!win) createWindow(false); else win.show(); });
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !tray) app.quit();
  });
}
