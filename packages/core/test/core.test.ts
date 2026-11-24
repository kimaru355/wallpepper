import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeServer } from './fakeServer.ts';
import {
  addCustomSource, addToGroup, BrowseController, createGroup, deleteGroup, getGroupCounts, getGroupWallpapers,
  getLibrary, getSources, removeCustomSource, SyncManager, Store, updateDeviceSettings, setSourceEnabled,
  pickNext, type StorageAdapter, type Wallpaper,
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

test('six built-in sources; builtins cannot be removed, customs can', async () => {
  const s = await mk('pc', 'linux');
  assert.equal(getSources(s.state).filter((x) => x.builtin).length, 6);
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
    await pcSync.authenticate('register', url, 'u@x.io', 'password123');
    await phoneSync.authenticate('login', url, 'u@x.io', 'password123');
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
