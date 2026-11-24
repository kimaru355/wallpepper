import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type Target = 'home' | 'lock' | 'both';

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

async function winPs(script: string, file: string) {
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { WP_PATH: file });
}

// ---------- macOS ----------

async function setMac(file: string, target: Target): Promise<string | undefined> {
  if (target !== 'lock') {
    await run('osascript', [
      '-e',
      'tell application "System Events" to tell every desktop to set picture to (POSIX file (system attribute "WP_PATH"))',
    ], { WP_PATH: file });
  }
  if (target === 'lock') {
    throw new Error('macOS does not let apps set the lock screen separately. The lock screen mirrors your desktop wallpaper — use "Home" or "Both".');
  }
  if (target === 'both') return 'macOS uses your desktop wallpaper on the lock screen too.';
  return undefined;
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

async function setLinux(file: string, target: Target): Promise<string | undefined> {
  const uri = pathToFileURL(file).toString();
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? process.env.DESKTOP_SESSION ?? '').toLowerCase();
  const notes: string[] = [];
  const wantHome = target !== 'lock';
  const wantLock = target !== 'home';

  if (/kde|plasma/.test(desktop)) {
    if (wantHome) {
      if (!(await tryRun('plasma-apply-wallpaperimage', [file]))) throw new Error('plasma-apply-wallpaperimage not found (needs Plasma 5.25+).');
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
      for (const p of props) await run('xfconf-query', ['-c', 'xfce4-desktop', '-p', p, '-s', file]);
    }
    if (wantLock) notes.push('XFCE has no separate lock screen wallpaper.');
  } else if (/mate/.test(desktop)) {
    if (wantHome) await run('gsettings', ['set', 'org.mate.background', 'picture-filename', file]);
    if (wantLock) notes.push('MATE has no separate lock screen wallpaper.');
  } else if (/gnome|unity|budgie|pantheon|cinnamon|x-cinnamon|ubuntu|zorin|pop/.test(desktop)) {
    const schema = /cinnamon/.test(desktop) ? 'org.cinnamon.desktop.background' : 'org.gnome.desktop.background';
    if (wantHome) {
      await run('gsettings', ['set', schema, 'picture-uri', uri]);
      await tryRun('gsettings', ['set', schema, 'picture-uri-dark', uri]);
      await tryRun('gsettings', ['set', schema, 'picture-options', 'zoom']);
    }
    if (wantLock) {
      const lockSchema = /cinnamon/.test(desktop) ? 'org.cinnamon.desktop.screensaver' : 'org.gnome.desktop.screensaver';
      const ok = await tryRun('gsettings', ['set', lockSchema, 'picture-uri', uri]);
      if (!ok) notes.push('Lock screen wallpaper is not configurable on this GNOME version (it follows the desktop wallpaper).');
    }
  } else if (process.env.SWAYSOCK) {
    await run('swaymsg', ['output', '*', 'bg', file, 'fill']);
  } else if (await has('feh')) {
    await run('feh', ['--bg-fill', file]);
  } else if (await has('nitrogen')) {
    await run('nitrogen', ['--set-zoom-fill', '--save', file]);
  } else {
    throw new Error(`Unsupported desktop "${desktop || 'unknown'}". Install feh, or switch to "Download to folder" mode in Settings.`);
  }
  return notes.join(' ') || undefined;
}

/** Set the wallpaper from a local file. Resolves to an optional note for the user. */
export async function setWallpaperFile(file: string, target: Target): Promise<string | undefined> {
  if (process.platform === 'win32') {
    if (target !== 'lock') await winPs(WIN_DESKTOP, file);
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
  if (process.platform === 'darwin') return setMac(file, target);
  return setLinux(file, target);
}
