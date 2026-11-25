import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type Target = 'home' | 'lock' | 'both';
export type Fit = 'fill' | 'fit' | 'stretch' | 'center' | 'tile' | 'span';

/** Windows: WallpaperStyle / TileWallpaper registry values. */
const WIN_STYLE: Record<Fit, [string, string]> = { fill: ['10', '0'], fit: ['6', '0'], stretch: ['2', '0'], center: ['0', '0'], tile: ['0', '1'], span: ['22', '0'] };
/** GNOME / Cinnamon / MATE picture-options. */
const GNOME_OPT: Record<Fit, string> = { fill: 'zoom', fit: 'scaled', stretch: 'stretched', center: 'centered', tile: 'wallpaper', span: 'spanned' };
/** XFCE image-style. */
const XFCE_STYLE: Record<Fit, string> = { fill: '5', fit: '4', stretch: '3', center: '1', tile: '2', span: '6' };
const KDE_MODE: Record<Fit, string> = { fill: 'preserveAspectCrop', fit: 'preserveAspectFit', stretch: 'stretch', center: 'pad', tile: 'tile', span: 'preserveAspectCrop' };
const SWAY_MODE: Record<Fit, string> = { fill: 'fill', fit: 'fit', stretch: 'stretch', center: 'center', tile: 'tile', span: 'fill' };
const FEH_FLAG: Record<Fit, string> = { fill: '--bg-fill', fit: '--bg-max', stretch: '--bg-scale', center: '--bg-center', tile: '--bg-tile', span: '--bg-fill' };
const NITROGEN_FLAG: Record<Fit, string> = { fill: '--set-zoom-fill', fit: '--set-zoom', stretch: '--set-scaled', center: '--set-centered', tile: '--set-tiled', span: '--set-zoom-fill' };

function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: { ...process.env, ...env }, timeout: 30_000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim().slice(0, 400)));
      else resolve(stdout.toString());
    });
  });
}

// ---------- Windows ----------

const WIN_DESKTOP = `
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class WallpepperNative {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
$key = 'HKCU:\\Control Panel\\Desktop'
Set-ItemProperty -Path $key -Name WallpaperStyle -Value $env:WP_STYLE
Set-ItemProperty -Path $key -Name TileWallpaper -Value $env:WP_TILE
if (-not [WallpepperNative]::SystemParametersInfo(20, 0, $env:WP_PATH, 3)) { throw 'SystemParametersInfo failed' }
`;

// Uses the WinRT LockScreen API (works from Windows PowerShell 5.1 on Windows 10/11).
// Windows Spotlight / slideshow lock screens may need to be switched to "Picture" in Settings first.
const WIN_LOCK = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
$op = [Windows.Storage.StorageFile]::GetFileFromPathAsync($env:WP_PATH)
$task = $asTaskGeneric.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @($op))
$task.Wait(-1) | Out-Null
$file = $task.Result
$action = [Windows.System.UserProfile.LockScreen]::SetImageFileAsync($file)
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
$t2 = $asTaskAction.Invoke($null, @($action))
$t2.Wait(-1) | Out-Null
`;

export const WINDOWS_SCRIPTS = { desktop: WIN_DESKTOP, lock: WIN_LOCK };

async function winPs(script: string, file: string, fit: Fit = 'fill') {
  const [style, tile] = WIN_STYLE[fit] ?? WIN_STYLE.fill;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    WP_PATH: file, WP_STYLE: style, WP_TILE: tile,
  });
}

// ---------- macOS ----------

async function setMac(file: string, target: Target, fit: Fit): Promise<string | undefined> {
  if (target !== 'lock') {
    await run('osascript', [
      '-e',
      'tell application "System Events" to tell every desktop to set picture to (POSIX file (system attribute "WP_PATH"))',
    ], { WP_PATH: file });
  }
  if (target === 'lock') {
    throw new Error('macOS does not let apps set the lock screen separately. The lock screen mirrors your desktop wallpaper — use "Home" or "Both".');
  }
  const notes: string[] = [];
  if (target === 'both') notes.push('macOS uses your desktop wallpaper on the lock screen too.');
  if (fit !== 'fill') notes.push('macOS has its own scaling setting: change it in System Settings › Wallpaper.');
  return notes.join(' ') || undefined;
}

// ---------- Linux ----------

async function tryRun(cmd: string, args: string[]): Promise<boolean> {
  try {
    await run(cmd, args);
    return true;
  } catch {
    return false;
  }
}

async function has(cmd: string): Promise<boolean> {
  return tryRun('which', [cmd]);
}

async function setLinux(file: string, target: Target, fit: Fit): Promise<string | undefined> {
  const uri = pathToFileURL(file).toString();
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? process.env.DESKTOP_SESSION ?? '').toLowerCase();
  const notes: string[] = [];
  const wantHome = target !== 'lock';
  const wantLock = target !== 'home';

  if (/kde|plasma/.test(desktop)) {
    if (wantHome) {
      // --fill-mode needs a recent Plasma; older versions only take the image
      const ok = (await tryRun('plasma-apply-wallpaperimage', ['--fill-mode', KDE_MODE[fit], file])) || (await tryRun('plasma-apply-wallpaperimage', [file]));
      if (!ok) throw new Error('plasma-apply-wallpaperimage not found (needs Plasma 5.25+).');
    }
    if (wantLock) {
      const kw = (await has('kwriteconfig6')) ? 'kwriteconfig6' : 'kwriteconfig5';
      const ok = await tryRun(kw, ['--file', 'kscreenlockerrc', '--group', 'Greeter', '--group', 'Wallpaper', '--group', 'org.kde.image', '--group', 'General', '--key', 'Image', uri]);
      if (!ok) throw new Error('Could not set the lock screen (kwriteconfig missing).');
    }
  } else if (/xfce/.test(desktop)) {
    if (wantHome) {
      const props = (await run('xfconf-query', ['-c', 'xfce4-desktop', '-l'])).split('\n').filter((p) => p.endsWith('/last-image'));
      if (!props.length) throw new Error('No XFCE desktop properties found.');
      for (const p of props) {
        await run('xfconf-query', ['-c', 'xfce4-desktop', '-p', p, '-s', file]);
        await tryRun('xfconf-query', ['-c', 'xfce4-desktop', '-p', p.replace(/last-image$/, 'image-style'), '-n', '-t', 'int', '-s', XFCE_STYLE[fit]]);
      }
    }
    if (wantLock) notes.push('XFCE has no separate lock screen wallpaper.');
  } else if (/mate/.test(desktop)) {
    if (wantHome) {
      await run('gsettings', ['set', 'org.mate.background', 'picture-filename', file]);
      await tryRun('gsettings', ['set', 'org.mate.background', 'picture-options', GNOME_OPT[fit]]);
    }
    if (wantLock) notes.push('MATE has no separate lock screen wallpaper.');
  } else if (/gnome|unity|budgie|pantheon|cinnamon|x-cinnamon|ubuntu|zorin|pop/.test(desktop)) {
    const schema = /cinnamon/.test(desktop) ? 'org.cinnamon.desktop.background' : 'org.gnome.desktop.background';
    if (wantHome) {
      await run('gsettings', ['set', schema, 'picture-uri', uri]);
      await tryRun('gsettings', ['set', schema, 'picture-uri-dark', uri]);
      await tryRun('gsettings', ['set', schema, 'picture-options', GNOME_OPT[fit]]);
    }
    if (wantLock) {
      const lockSchema = /cinnamon/.test(desktop) ? 'org.cinnamon.desktop.screensaver' : 'org.gnome.desktop.screensaver';
      const ok = await tryRun('gsettings', ['set', lockSchema, 'picture-uri', uri]);
      if (!ok) notes.push('Lock screen wallpaper is not configurable on this GNOME version (it follows the desktop wallpaper).');
    }
  } else if (process.env.SWAYSOCK) {
    await run('swaymsg', ['output', '*', 'bg', file, SWAY_MODE[fit]]);
  } else if (await has('feh')) {
    await run('feh', [FEH_FLAG[fit], file]);
  } else if (await has('nitrogen')) {
    await run('nitrogen', [NITROGEN_FLAG[fit], '--save', file]);
  } else {
    throw new Error(`Unsupported desktop "${desktop || 'unknown'}". Install feh, or switch to "Download to folder" mode in Settings.`);
  }
  return notes.join(' ') || undefined;
}

/** Set the wallpaper from a local file. Resolves to an optional note for the user. */
export async function setWallpaperFile(file: string, target: Target, fit: Fit = 'fill'): Promise<string | undefined> {
  if (process.platform === 'win32') {
    if (target !== 'lock') await winPs(WIN_DESKTOP, file, fit);
    if (target !== 'home') {
      try {
        await winPs(WIN_LOCK, file);
      } catch (e: any) {
        if (target === 'lock') throw new Error(`Could not set the lock screen: ${e.message}`);
        return `Desktop updated, but the lock screen could not be changed (${e.message}).`;
      }
    }
    return undefined;
  }
  if (process.platform === 'darwin') return setMac(file, target, fit);
  return setLinux(file, target, fit);
}

// ---------- several displays: one wallpaper per display ----------

/** IDesktopWallpaper position values. */
const WIN_POSITION: Record<Fit, number> = { center: 0, tile: 1, stretch: 2, fit: 3, fill: 4, span: 5 };

// Windows 8+ IDesktopWallpaper COM interface: sets a wallpaper per monitor. Inactive monitors are skipped.
const WIN_MULTI = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct WpRect { public int Left, Top, Right, Bottom; }
[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IWpDesktopWallpaper {
  void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
  uint GetMonitorDevicePathCount();
  WpRect GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
  void SetBackgroundColor(uint color);
  uint GetBackgroundColor();
  void SetPosition(int position);
}
[ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")] public class WpDesktopWallpaperClass {}
public static class WpMulti {
  public static int Apply(string[] files, int position) {
    var dw = (IWpDesktopWallpaper)new WpDesktopWallpaperClass();
    dw.SetPosition(position);
    uint n = dw.GetMonitorDevicePathCount();
    int used = 0;
    for (uint i = 0; i < n; i++) {
      string id = dw.GetMonitorDevicePathAt(i);
      try { var r = dw.GetMonitorRECT(id); if (r.Right - r.Left <= 0) continue; } catch { continue; }
      dw.SetWallpaper(id, files[used % files.Length]);
      used++;
    }
    return used;
  }
}
"@
$files = $env:WP_PATHS -split '\|'
if ([WpMulti]::Apply($files, [int]$env:WP_POS) -lt 1) { throw 'No active monitor found' }
`;

const KDE_FILL: Record<Fit, number> = { stretch: 0, fit: 1, fill: 2, tile: 3, center: 6, span: 2 };

async function setLinuxMany(files: string[], fit: Fit): Promise<string | undefined> {
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? process.env.DESKTOP_SESSION ?? '').toLowerCase();
  if (/kde|plasma/.test(desktop)) {
    const script =
      `var p=${JSON.stringify(files.map((f) => pathToFileURL(f).toString()))};var ds=desktops();` +
      `for(var i=0;i<ds.length;i++){var d=ds[i];d.wallpaperPlugin="org.kde.image";` +
      `d.currentConfigGroup=["Wallpaper","org.kde.image","General"];d.writeConfig("Image",p[i%p.length]);d.writeConfig("FillMode",${KDE_FILL[fit] ?? 2});}`;
    for (const q of ['qdbus6', 'qdbus', 'qdbus-qt5']) {
      if (await tryRun(q, ['org.kde.plasmashell', '/PlasmaShell', 'org.kde.PlasmaShell.evaluateScript', script])) return undefined;
    }
    throw new Error('Could not reach Plasma (qdbus not found).');
  }
  if (/xfce/.test(desktop)) {
    const props = (await run('xfconf-query', ['-c', 'xfce4-desktop', '-l'])).split('\n').filter((p) => p.endsWith('/last-image'));
    // /backdrop/screen0/<monitor>/workspace0/last-image: one monitor may have several workspaces
    const monitors = [...new Set(props.map((p) => p.split('/').slice(0, 4).join('/')))];
    for (const p of props) {
      const file = files[monitors.indexOf(p.split('/').slice(0, 4).join('/')) % files.length];
      await run('xfconf-query', ['-c', 'xfce4-desktop', '-p', p, '-s', file]);
      await tryRun('xfconf-query', ['-c', 'xfce4-desktop', '-p', p.replace(/last-image$/, 'image-style'), '-n', '-t', 'int', '-s', XFCE_STYLE[fit]]);
    }
    return undefined;
  }
  if (process.env.SWAYSOCK) {
    const outputs = (JSON.parse(await run('swaymsg', ['-t', 'get_outputs', '-r'])) as { name: string; active: boolean }[]).filter((o) => o.active);
    for (let i = 0; i < outputs.length; i++) await run('swaymsg', ['output', outputs[i].name, 'bg', files[i % files.length], SWAY_MODE[fit]]);
    return undefined;
  }
  if (await has('feh')) {
    await run('feh', [FEH_FLAG[fit], ...files]); // one file per screen, in screen order
    return undefined;
  }
  if (await has('nitrogen')) {
    for (let i = 0; i < files.length; i++) await run('nitrogen', [`--head=${i}`, NITROGEN_FLAG[fit], '--save', files[i]]);
    return undefined;
  }
  // GNOME, Cinnamon, MATE: one picture for all displays
  await setLinux(files[0], 'home', fit);
  return 'This desktop shows one wallpaper on all displays.';
}

/**
 * A different wallpaper on each display (files are used in display order and repeat when there are fewer).
 * The lock screen gets the first one. Resolves to an optional note for the user.
 */
export async function setWallpaperFiles(files: string[], target: Target, fit: Fit = 'fill'): Promise<string | undefined> {
  if (files.length < 2) return setWallpaperFile(files[0], target, fit);
  const notes: string[] = [];
  if (target !== 'lock') {
    if (process.platform === 'win32') {
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_MULTI], {
        WP_PATHS: files.join('|'),
        WP_POS: String(WIN_POSITION[fit] ?? 4),
      });
    } else if (process.platform === 'darwin') {
      await run('osascript', [
        '-e', 'set ps to paragraphs of (system attribute "WP_PATHS")',
        '-e', 'tell application "System Events"',
        '-e', 'set n to count of desktops',
        '-e', 'repeat with i from 1 to n',
        '-e', 'set picture of desktop i to POSIX file (item ((((i - 1) mod (count of ps)) + 1)) of ps)',
        '-e', 'end repeat',
        '-e', 'end tell',
      ], { WP_PATHS: files.join('\n') });
    } else {
      const note = await setLinuxMany(files, fit);
      if (note) notes.push(note);
    }
  }
  if (target !== 'home') {
    const note = await setWallpaperFile(files[0], 'lock', fit).catch((e: Error) => `The lock screen could not be changed (${e.message}).`);
    if (note) notes.push(note);
  }
  return notes.join(' ') || undefined;
}
