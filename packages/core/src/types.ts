export type CategoryId = string;

export interface Category {
  id: CategoryId;
  label: string;
  /** Main categories are shown first in the UI. */
  main: boolean;
}

export const CATEGORIES: Category[] = [
  { id: 'anime', label: 'Anime', main: true },
  { id: 'movies', label: 'Movies & Series', main: true },
  { id: 'linux', label: 'Linux', main: true },
  { id: 'tech', label: 'Tech', main: false },
  { id: 'nature', label: 'Nature', main: false },
  { id: 'space', label: 'Space', main: false },
  { id: 'games', label: 'Games', main: false },
  { id: 'abstract', label: 'Abstract', main: false },
  { id: 'minimal', label: 'Minimal', main: false },
];

export type Orientation = 'any' | 'landscape' | 'portrait';
export type Sort = 'latest' | 'popular' | 'random';
export type WallpaperTarget = 'home' | 'lock' | 'both';
export type ApplyMode = 'apply' | 'folder';
export type RotationOrder = 'sequential' | 'shuffle';
/** How an image is fitted to the screen. */
export type FitMode = 'fill' | 'fit' | 'blur' | 'stretch' | 'center' | 'tile' | 'span';

export const FIT_MODES: { id: FitMode; label: string; hint: string; desktopOnly?: boolean }[] = [
  { id: 'fill', label: 'Fill', hint: 'Cover the whole screen, cropping the edges (recommended).' },
  { id: 'fit', label: 'Fit', hint: 'Show the whole image, with bars if the shape differs.' },
  { id: 'blur', label: 'Fit + blur', hint: 'Show the whole image over a blurred copy of itself, so no bars and no cropping.' },
  { id: 'stretch', label: 'Stretch', hint: 'Stretch to the screen size (may distort).' },
  { id: 'center', label: 'Center', hint: 'Original size in the middle of the screen.' },
  { id: 'tile', label: 'Tile', hint: 'Repeat the image.', desktopOnly: true },
  { id: 'span', label: 'Span', hint: 'Spread over all monitors.', desktopOnly: true },
];

export interface Wallpaper {
  /** Stable id: `${sourceId}:${itemId}` */
  id: string;
  sourceId: string;
  title?: string;
  /** Full resolution image URL (this is what gets synced between devices). */
  url: string;
  thumb: string;
  width?: number;
  height?: number;
  pageUrl?: string;
  author?: string;
}

export type SourceType = 'moebooru' | 'wallhaven' | 'tvmaze' | 'github' | 'picsum' | 'generic';

export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  builtin: boolean;
  enabled: boolean;
  /** Categories this source can serve. Empty = everything (searched by keyword). */
  categories: CategoryId[];
  /** Type specific options, see sources/provider docs. `apiKey` lives in local secrets. */
  options: Record<string, string>;
  description?: string;
}

export interface BrowseParams {
  category: CategoryId | 'all';
  query: string;
  page: number;
  sort: Sort;
  orientation: Orientation;
  /** Exact tag (underscored) for tag boards; used instead of `query` words when set. */
  tag?: string;
}

export interface Page {
  items: Wallpaper[];
  nextPage: number | null;
}

/** A JSON GET function. Desktop routes it through the main process (no CORS), mobile uses fetch. */
export type Http = (url: string, init?: { headers?: Record<string, string> }) => Promise<any>;

// ---------- sync records ----------

export type RecordKind = 'wallpaper' | 'group' | 'membership' | 'source' | 'deviceSettings' | 'variant';

export interface SyncRecord<T = any> {
  kind: RecordKind;
  id: string;
  data: T;
  deleted: boolean;
  updatedAt: number;
  /** Local only: changed since last successful push. */
  dirty?: boolean;
}

export interface Group {
  id: string;
  name: string;
  /** Sub-group of this group (e.g. "Naruto" under "Anime"). Absent = top level. */
  parentId?: string;
  /** Category used when the group is shared with the community. */
  category?: CategoryId;
}

export interface Membership {
  groupId: string;
  wallpaperId: string;
}

export interface DeviceSettings {
  name: string;
  platform: 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'unknown';
  /** 'all' or a group id. This is the "theme" the device shows. */
  activeGroupId: string;
  rotationEnabled: boolean;
  rotationMinutes: number;
  rotationOrder: RotationOrder;
  target: WallpaperTarget;
  /** 'apply' = app sets the wallpaper. 'folder' = app only downloads into the OS-watched folder. */
  mode: ApplyMode;
  /** Whether this device pulls changes from the account. */
  syncEnabled: boolean;
  /** How wallpapers are fitted to the screen. */
  fit: FitMode;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
  lastSeen: number;
}

export interface AuthState {
  serverUrl: string;
  token: string;
  email: string;
  username?: string;
}

export interface LocalState {
  deviceId: string;
  auth: AuthState | null;
  syncCursor: number;
  /** Folder used for downloads (and watched by the OS in folder mode). Device specific. */
  folderPath: string;
  /** wallpaperId -> local file path on this device */
  downloads: Record<string, string>;
  /** sourceId -> secret options such as apiKey (never synced). */
  secrets: Record<string, Record<string, string>>;
  rotation: { lastWallpaperId: string | null; lastAt: number };
  lastSyncAt: number;
  /** False until the first-run onboarding was completed. */
  onboarded: boolean;
  /** Small response cache (browse pages, community lists) so screens show data before / without the network. */
  cache: Record<string, { at: number; data: any }>;
  /** wallpaperId -> sub folders (relative to `folderPath`) it was written to in folder mode. */
  downloadDirs: Record<string, string[]>;
}

export interface State {
  records: Record<string, SyncRecord>;
  local: LocalState;
}

export const ALL_GROUP_ID = 'all';

/** Hosted sync backend used by default (users can point the apps at their own server). */
export const DEFAULT_SERVER_URL = 'https://wallpepper.pcstack.top';
