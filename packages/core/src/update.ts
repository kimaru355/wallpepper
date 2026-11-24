// Self-update support shared by the desktop and Android apps.
// Both read the release manifest that site/scripts/publish.sh writes to /downloads/latest.json.

export const SITE_URL = 'https://wallpepper.pcstack.top';
export const MANIFEST_URL = `${SITE_URL}/downloads/latest.json`;

export interface ReleaseFile {
  id: string;
  file: string;
  /** Path on the site, e.g. /downloads/0.1.0/Wallpepper-0.1.0.apk */
  url: string;
  platform: 'android' | 'windows' | 'linux' | 'mac';
  label: string;
  size: number;
  sha256: string;
}

export interface ReleaseManifest {
  version: string;
  date?: string;
  files: ReleaseFile[];
}

export interface UpdateInfo {
  version: string;
  current: string;
  file: ReleaseFile;
  /** Absolute download url */
  url: string;
}

/** Numeric dotted-version compare ("0.10.0" > "0.9.2"); a pre-release suffix is ignored. Returns <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function isManifest(m: unknown): m is ReleaseManifest {
  const x = m as ReleaseManifest;
  return !!x && typeof x.version === 'string' && Array.isArray(x.files);
}

/**
 * Looks for a newer release for this platform.
 * @param pick chooses which file of the platform to install (e.g. AppImage vs .deb); defaults to the first.
 * Returns null when up to date or when the manifest has no file for the platform.
 */
export async function checkForUpdate(
  fetchJson: (url: string) => Promise<unknown>,
  current: string,
  platform: ReleaseFile['platform'],
  pick: (files: ReleaseFile[]) => ReleaseFile | undefined = (f) => f[0],
): Promise<UpdateInfo | null> {
  const manifest = await fetchJson(`${MANIFEST_URL}?t=${Date.now()}`);
  if (!isManifest(manifest)) throw new Error('Unexpected update manifest');
  if (compareVersions(manifest.version, current) <= 0) return null;
  const file = pick(manifest.files.filter((f) => f.platform === platform));
  if (!file) return null;
  // Only ever download from our own site, whatever the manifest says.
  const url = new URL(file.url, SITE_URL);
  if (url.origin !== SITE_URL) throw new Error('Update url is not on the Wallpepper site');
  return { version: manifest.version, current, file, url: url.toString() };
}
