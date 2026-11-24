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

export type SourceType = 'moebooru' | 'wallhaven' | 'tmdb' | 'github' | 'picsum' | 'generic';

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
}

export interface Page {
  items: Wallpaper[];
  nextPage: number | null;
}

/** A JSON GET function. Desktop routes it through the main process (no CORS), mobile uses fetch. */
export type Http = (url: string, init?: { headers?: Record<string, string> }) => Promise<any>;

// ---------- sync records ----------

export type RecordKind = 'wallpaper' | 'group' | 'membership' | 'source' | 'deviceSettings';

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
}

export interface State {
  records: Record<string, SyncRecord>;
  local: LocalState;
}

export const ALL_GROUP_ID = 'all';

/** Hosted sync backend used by default (users can point the apps at their own server). */
export const DEFAULT_SERVER_URL = 'https://wallpepper.pcstack.top';
