import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeServer } from './fakeServer.ts';
import {
  addCustomSource, addToGroup, BrowseController, createGroup, deleteGroup, getGroupCounts, getGroupWallpapers,
  getLibrary, getSources, removeCustomSource, SyncManager, Store, updateDeviceSettings, setSourceEnabled,
  pickNext, removeFromGroup, buildCollection, importCollection, cachedFetch, folderDirs, getGroupTree, getGroupPath, renameGroup,
  type PlatformActions, type StorageAdapter, type Wallpaper,
} from '../src/index.ts';

const mem = (): StorageAdapter => {
  let s: string | null = null;
  return { load: async () => s, save: async (j) => void (s = j) };
};
const mk = async (name: string, platform: 'linux' | 'android') => {
  const s = new Store(mem(), { deviceName: name, platform, folderPath: '/tmp' });
  await s.init();
  return s;
};
const wp = (n: number): Wallpaper => ({ id: `konachan:${n}`, sourceId: 'konachan', url: `https://x/${n}.jpg`, thumb: `https://x/t${n}.jpg` });

test('six built-in sources (no TMDB, none needs a key); builtins cannot be removed, customs can', async () => {
  const s = await mk('pc', 'linux');
  assert.equal(getSources(s.state).filter((x) => x.builtin).length, 6);
  assert.ok(!getSources(s.state).some((x) => x.id === 'tmdb'));
  removeCustomSource(s, 'konachan');
  assert.equal(getSources(s.state).length, 6);
  const c = addCustomSource(s, { name: 'Mine', type: 'github', categories: ['linux'], options: { repo: 'a/b' } });
  assert.equal(getSources(s.state).length, 7);
  removeCustomSource(s, c.id);
  assert.equal(getSources(s.state).length, 6);
  setSourceEnabled(s, 'konachan', false);
  assert.equal(getSources(s.state).find((x) => x.id === 'konachan')!.enabled, false);
});

test('groups: download adds to All, add to group, delete group', async () => {
  const s = await mk('pc', 'linux');
  const g = createGroup(s, 'anime');
  addToGroup(s, wp(1), g.id);
  addToGroup(s, wp(2), 'all');
  assert.equal(getLibrary(s.state).length, 2);
  assert.deepEqual(getGroupWallpapers(s.state, g.id).map((w) => w.id), ['konachan:1']);
  assert.equal(getGroupCounts(s.state)[g.id], 1);
  updateDeviceSettings(s, s.state.local.deviceId, { activeGroupId: g.id, rotationOrder: 'sequential' });
  assert.equal(pickNext(s)!.id, 'konachan:1');
  deleteGroup(s, g.id);
  assert.equal(getGroupWallpapers(s.state, g.id).length, 2); // falls back to All
});

test('sync: library, groups and per-device settings flow between devices', async () => {
  const fake = createFakeServer();
  const url = 'http://fake.test';
  let pcSync: SyncManager | undefined;
  let phoneSync: SyncManager | undefined;
  try {
    const pc = await mk('PC', 'linux');
    const phone = await mk('Phone', 'android');
    pcSync = new SyncManager(pc, { fetchImpl: fake });
    phoneSync = new SyncManager(phone, { fetchImpl: fake });
    const g = createGroup(pc, 'anime');
    addToGroup(pc, wp(1), g.id);
    await pcSync.authenticate('register', 'u@x.io', 'password123', { username: 'ana', serverUrl: url });
    await phoneSync.authenticate('login', 'u@x.io', 'password123', { serverUrl: url });
    assert.equal(getLibrary(phone.state).length, 1);
    assert.equal(getGroupWallpapers(phone.state, g.id).length, 1);

    // phone shows 'anime', pc shows 'All' - and the PC can edit the phone's setting remotely
    updateDeviceSettings(phone, phone.state.local.deviceId, { activeGroupId: g.id });
    updateDeviceSettings(pc, pc.state.local.deviceId, { activeGroupId: 'all' });
    await phoneSync.sync();
    await pcSync.sync();
    const phoneRec = pc.state.records[`deviceSettings/${phone.state.local.deviceId}`].data as any;
    assert.equal(phoneRec.activeGroupId, g.id);
    updateDeviceSettings(pc, phone.state.local.deviceId, { rotationMinutes: 5 });
    await pcSync.sync();
    await phoneSync.sync();
    assert.equal((phone.state.records[`deviceSettings/${phone.state.local.deviceId}`].data as any).rotationMinutes, 5);
    assert.equal((pc.state.records[`deviceSettings/${pc.state.local.deviceId}`].data as any).activeGroupId, 'all');
    assert.equal((await pcSync.listDevices()).length, 2);
  } finally {
    pcSync?.stopAuto();
    phoneSync?.stopAuto();
  }
});

test('browse controller mixes sources and tolerates failures', async () => {
  const s = await mk('pc', 'linux');
  const http = async (url: string) => {
    if (url.includes('konachan')) return [{ id: 1, file_url: 'https://k/1.jpg', sample_url: 'https://k/s1.jpg', width: 3000, height: 1700, tags: 'a b' }];
    if (url.includes('yande.re')) throw new Error('boom');
    return [];
  };
  const b = new BrowseController(() => getSources(s.state), http, 'any', { category: 'anime', sourceId: 'all' });
  await b.reload();
  assert.equal(b.state.items.length, 1);
  assert.ok(b.state.errors.some((e) => e.sourceId === 'yandere'));
});

test('update check: version compare, platform pick, own-origin only', async () => {
  const { compareVersions, checkForUpdate } = await import('../src/index.ts');
  assert.ok(compareVersions('0.10.0', '0.9.2') > 0);
  assert.equal(compareVersions('v1.0', '1.0.0'), 0);
  assert.ok(compareVersions('0.1.0', '0.1.1') < 0);
  const file = (platform: string, name: string, url = `/downloads/0.2.0/${name}`) => ({ id: name, file: name, url, platform, label: name, size: 1, sha256: 'x' });
  const manifest = { version: '0.2.0', files: [file('android', 'a.apk'), file('linux', 'l.deb'), file('linux', 'l.AppImage')] };
  const get = async () => manifest;
  assert.equal(await checkForUpdate(get, '0.2.0', 'android'), null);
  assert.equal(await checkForUpdate(get, '0.1.0', 'windows'), null);
  const u = await checkForUpdate(get, '0.1.0', 'android');
  assert.equal(u?.url, 'https://wallpepper.pcstack.top/downloads/0.2.0/a.apk');
  const app = await checkForUpdate(get, '0.1.0', 'linux', (f) => f.find((x) => x.file.endsWith('.AppImage')));
  assert.equal(app?.file.file, 'l.AppImage');
  manifest.files = [file('android', 'a.apk', 'https://evil.example/a.apk')];
  await assert.rejects(checkForUpdate(get, '0.1.0', 'android'));
});

test('sub-groups: parent shows children, delete cascades, names unique per level', async () => {
  const s = await mk('pc', 'linux');
  const anime = createGroup(s, 'Anime');
  const naruto = createGroup(s, 'Naruto', { parentId: anime.id });
  const bleach = createGroup(s, 'Bleach', { parentId: anime.id });
  assert.equal(createGroup(s, 'naruto', { parentId: anime.id }).id, naruto.id);
  assert.notEqual(createGroup(s, 'Naruto').id, naruto.id); // same name at another level is fine
  addToGroup(s, wp(1), naruto.id);
  addToGroup(s, wp(2), bleach.id);
  addToGroup(s, wp(3), anime.id);
  addToGroup(s, wp(4), 'all');
  assert.deepEqual(getGroupWallpapers(s.state, naruto.id).map((w) => w.id), ['konachan:1']);
  assert.equal(getGroupWallpapers(s.state, anime.id).length, 3);
  assert.equal(getGroupWallpapers(s.state, 'all').length, 4);
  assert.equal(getGroupCounts(s.state)[anime.id], 3);
  assert.deepEqual(getGroupPath(s.state, naruto.id), ['Anime', 'Naruto']);
  assert.equal(getGroupTree(s.state).find((n) => n.group.id === naruto.id)!.depth, 1);
  assert.throws(() => renameGroup(s, bleach.id, 'Naruto'));
  removeFromGroup(s, 'konachan:1', anime.id); // also leaves its sub-group
  assert.equal(getGroupWallpapers(s.state, naruto.id).length, 0);
  addToGroup(s, wp(1), naruto.id);
  updateDeviceSettings(s, s.state.local.deviceId, { activeGroupId: naruto.id });
  deleteGroup(s, anime.id);
  assert.equal(getLibrary(s.state).length, 4);
  assert.ok(!getGroupTree(s.state).some((n) => n.group.id === naruto.id || n.group.id === anime.id));
  assert.equal((s.state.records[`deviceSettings/${s.state.local.deviceId}`].data as any).activeGroupId, 'all');
});

test('folder layout: tree uses sub folders, albums add root + every parent album', async () => {
  const s = await mk('pc', 'linux');
  const anime = createGroup(s, 'Anime');
  const naruto = createGroup(s, 'Naruto', { parentId: anime.id });
  addToGroup(s, wp(1), naruto.id);
  const mkp = (folderLayout: PlatformActions['folderLayout']): PlatformActions => ({ folderLayout, download: async () => '', setWallpaper: async () => {} });
  assert.deepEqual(folderDirs(s.state, mkp('tree'), 'konachan:1'), [['Anime', 'Naruto']]);
  assert.deepEqual(folderDirs(s.state, mkp('albums'), 'konachan:1'), [[], ['Anime'], ['Anime', 'Naruto']]);
  assert.deepEqual(folderDirs(s.state, mkp('tree'), 'konachan:99'), [[]]);
});

test('community: export a group tree and import it as a sub-group', async () => {
  const a = await mk('a', 'linux');
  const anime = createGroup(a, 'Anime', { category: 'anime' });
  const naruto = createGroup(a, 'Naruto', { parentId: anime.id });
  addToGroup(a, wp(1), naruto.id);
  addToGroup(a, wp(2), anime.id);
  const payload = buildCollection(a, anime.id);
  assert.equal(payload.groups.length, 2);
  assert.equal(payload.wallpapers.length, 2);
  const b = await mk('b', 'android');
  const mine = createGroup(b, 'Favs');
  const rootId = importCollection(b, { name: 'Anime pack', category: 'anime', payload }, mine.id);
  assert.deepEqual(getGroupPath(b.state, rootId), ['Favs', 'Anime pack']);
  assert.equal(getGroupWallpapers(b.state, rootId).length, 2);
  assert.equal(getGroupWallpapers(b.state, mine.id).length, 2);
});

test('cache: stale data is shown first and used when offline', async () => {
  const s = await mk('pc', 'linux');
  assert.deepEqual((await cachedFetch(s, 'k', async () => [1])).data, [1]);
  const seen: number[][] = [];
  const r = await cachedFetch(s, 'k', async () => { throw new Error('offline'); }, (d: number[]) => seen.push(d));
  assert.deepEqual(r, { data: [1], offline: true });
  assert.deepEqual(seen, [[1]]);
  await assert.rejects(cachedFetch(s, 'other', async () => { throw new Error('offline'); }));
  const b = new BrowseController(() => getSources(s.state), async () => { throw new Error('offline'); }, 'any', { category: 'anime' }, { get: () => [wp(7)], set: () => {} });
  await b.reload();
  assert.equal(b.state.items.length, 1); // remembered results stay visible offline
  assert.ok(b.state.fromCache);
});

test('compat: orientation, variants, resolving for each device', async () => {
  const { shapeOf, setVariant, getVariant, resolveForDevice, compatStatus, ensureDimensions, maxCrop, placeCrop, clearVariant } = await import('../src/index.ts');
  const land = { ...wp(1), width: 1920, height: 1080 };
  const port = { ...wp(2), width: 1080, height: 2340 };
  assert.equal(shapeOf(land), 'landscape');
  assert.equal(shapeOf(port), 'portrait');
  assert.equal(shapeOf({ width: 1000, height: 1050 }), 'square');
  assert.equal(shapeOf(wp(3)), 'unknown');

  const s = await mk('pc', 'linux');
  addToGroup(s, land, 'all');
  // native orientation is always used as is
  assert.equal(resolveForDevice(s.state, land, 'landscape', 'fill').fit, 'fill');
  // mismatched and undecided: blurred background instead of a harsh crop (only when the user asked for fill)
  assert.equal(resolveForDevice(s.state, land, 'portrait', 'fill').fit, 'blur');
  assert.equal(resolveForDevice(s.state, land, 'portrait', 'fit').fit, 'fit');
  assert.equal(compatStatus(s.state, land).state, 'none');

  setVariant(s, land, { kind: 'crop', crop: { x: 0.3, y: 0, w: 0.3, h: 1 } });
  assert.equal(getVariant(s.state, land.id)!.for, 'portrait');
  const c = resolveForDevice(s.state, land, 'portrait', 'fill');
  assert.deepEqual([c.fit, c.wallpaper.id, !!c.crop], ['fill', land.id, true]);
  assert.equal(resolveForDevice(s.state, land, 'landscape', 'fill').crop, undefined); // PC keeps the original

  setVariant(s, land, { kind: 'image', wallpaper: port });
  assert.equal(resolveForDevice(s.state, land, 'portrait', 'fill').wallpaper.id, port.id);
  assert.equal(compatStatus(s.state, land).state, 'image');
  clearVariant(s, land.id);
  assert.equal(compatStatus(s.state, land).state, 'none');

  // step 1: measure unknown sizes once and keep them
  addToGroup(s, wp(3), 'all');
  const probed = await ensureDimensions(s, 'konachan:3', async () => ({ width: 800, height: 1600 }));
  assert.deepEqual([probed!.width, probed!.height], [800, 1600]);
  assert.equal(getLibrary(s.state).find((w) => w.id === 'konachan:3')!.height, 1600);

  // crops: biggest crop has the target shape and stays inside the image
  const m = maxCrop(1920, 1080, 'portrait');
  assert.ok(Math.abs((m.w * 1920) / (m.h * 1080) - 9 / 19.5) < 0.001 && m.h === 1);
  const p = placeCrop(1920, 1080, 'portrait', 0.99, 0.5, 0.5);
  assert.ok(p.x + p.w <= 1 + 1e-9 && p.x >= 0);

  // removing from the library also drops the choice
  setVariant(s, land, { kind: 'blur' });
  const { removeFromLibrary } = await import('../src/index.ts');
  removeFromLibrary(s, land.id);
  assert.equal(getVariant(s.state, land.id), undefined);
});

test('compat: Search similar starts from the title words and the likely category', async () => {
  const { searchSeed } = await import('../src/index.ts');
  const s = await mk('pc', 'android');
  const kn = { id: 'konachan:5', sourceId: 'konachan', title: 'naruto uzumaki sky', url: 'https://k/5.jpg', thumb: 'https://k/s5.jpg', width: 3000, height: 1700 };
  assert.deepEqual(searchSeed(s.state, kn), { query: 'naruto uzumaki sky', category: 'anime' });
  // a sub-group takes the category of its parent group
  const games = createGroup(s, 'Games', { category: 'games' });
  const zelda = createGroup(s, 'Zelda', { parentId: games.id });
  const wh = { id: 'wallhaven:x1', sourceId: 'wallhaven', title: 'link', url: 'https://w/x.jpg', thumb: 'https://w/t.jpg' };
  addToGroup(s, wh, zelda.id);
  assert.equal(searchSeed(s.state, wh).category, 'games');
});

test('rotation: a different wallpaper on each display, unless turned off', async () => {
  const { rotateNow, pickNextMany } = await import('../src/index.ts');
  const s = await mk('pc', 'linux');
  for (let i = 1; i <= 5; i++) addToGroup(s, { ...wp(i), width: 1920, height: 1080 }, 'all');
  updateDeviceSettings(s, s.state.local.deviceId, { rotationOrder: 'sequential' });
  const many: string[][] = [];
  const single: string[] = [];
  const platform: PlatformActions = {
    folderLayout: 'tree',
    download: async () => '',
    setWallpaper: async (w) => void single.push(w.id),
    displays: async () => 3,
    setWallpapers: async (items) => void many.push(items.map((i) => i.w.id)),
  };
  await rotateNow(s, platform);
  assert.equal(many.length, 1);
  assert.equal(new Set(many[0]).size, 3, 'three different wallpapers');
  await rotateNow(s, platform);
  assert.ok(!many[1].includes(many[0][2]) || many[1][0] !== many[0][2], 'carries on after the last one shown');
  updateDeviceSettings(s, s.state.local.deviceId, { perDisplay: false });
  await rotateNow(s, platform);
  assert.equal(single.length, 1);
  // more displays than wallpapers: they repeat
  assert.equal(pickNextMany(s, 7).length, 7);
});

test('compat: variants travel with shared collections; recommendations come from the server', async () => {
  const { setVariant, getVariant, loadRecommendations, cachedRecommendations } = await import('../src/index.ts');
  const a = await mk('a', 'linux');
  const g = createGroup(a, 'Anime');
  const w1 = { ...wp(1), width: 1920, height: 1080 };
  addToGroup(a, w1, g.id);
  setVariant(a, w1, { kind: 'blur' });
  const payload = buildCollection(a, g.id);
  assert.deepEqual(payload.wallpapers[0].other, { kind: 'blur' });
  const b = await mk('b', 'android');
  importCollection(b, { name: 'Pack', category: 'anime', payload });
  assert.deepEqual(getVariant(b.state, w1.id)!.choice, { kind: 'blur' });

  const doc = { updatedAt: 1, items: [{ id: 'anime-naruto', title: 'Naruto', category: 'anime', query: 'naruto', tag: 'naruto' }] };
  const ok = (async () => new Response(JSON.stringify(doc))) as unknown as typeof fetch;
  const seen: number[] = [];
  const r1 = await loadRecommendations(b, (i) => seen.push(i.length), ok);
  assert.deepEqual([r1.items.length, r1.offline], [1, false]);
  const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const r2 = await loadRecommendations(b, (i) => seen.push(i.length), down);
  assert.deepEqual([r2.items[0].title, r2.offline], ['Naruto', true]);
  assert.equal(cachedRecommendations(b).length, 1);
  const fresh = await mk('c', 'linux');
  await assert.rejects(loadRecommendations(fresh, undefined, down));
});

test('signed-in installs move to the new backend domain', async () => {
  let saved: string | null = null;
  const adapter = { load: async () => saved, save: async (j: string) => void (saved = j) };
  const a = new Store(adapter, { deviceName: 'pc', platform: 'linux', folderPath: '/tmp' });
  await a.init();
  a.setLocal({ auth: { serverUrl: 'https://wallpepper.pcstack.top/', token: 't', email: 'e@x.io' } });
  await a.flush();
  const b = new Store(adapter, { deviceName: 'pc', platform: 'linux', folderPath: '/tmp' });
  await b.init();
  assert.equal(b.state.local.auth!.serverUrl, 'https://wallpepper-backend.pcstack.top');
  assert.equal(b.state.local.auth!.token, 't');
});
