/** In-memory stand-in for the sync backend (same contract as wallpepper-backend), used as SyncManager's fetchImpl. */
export function createFakeServer(): typeof fetch {
  const users = new Map<string, { username?: string; password: string; rev: number; records: Map<string, any>; devices: Map<string, any> }>();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  return (async (input: any, init?: any) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : {};
    const token = String(init?.headers?.Authorization ?? '').replace('Bearer ', '');
    const user = users.get(token.replace('tok-', ''));

    if (url.pathname === '/auth/register' || url.pathname === '/auth/login') {
      const existing = users.get(body.email);
      if (url.pathname === '/auth/register') {
        if (existing) return json(409, { error: 'An account with this email already exists.' });
        users.set(body.email, { username: body.username, password: body.password, rev: 0, records: new Map(), devices: new Map() });
      } else if (!existing || existing.password !== body.password) {
        return json(401, { error: 'Wrong email or password.' });
      }
      users.get(body.email)!.devices.set(body.deviceId, { id: body.deviceId, name: body.deviceName, platform: body.platform, lastSeen: Date.now() });
      return json(200, { token: `tok-${body.email}`, email: body.email, username: users.get(body.email)!.username });
    }
    if (!user) return json(401, { error: 'Not signed in' });
    if (url.pathname === '/devices' && method === 'GET') return json(200, { devices: [...user.devices.values()] });
    if (url.pathname.startsWith('/devices/') && method === 'DELETE') {
      user.devices.delete(decodeURIComponent(url.pathname.slice(9)));
      return json(200, { ok: true });
    }
    if (url.pathname === '/sync') {
      for (const c of body.changes ?? []) {
        const key = `${c.kind}/${c.id}`;
        const cur = user.records.get(key);
        if (cur && cur.updatedAt >= c.updatedAt) continue; // last write wins
        user.records.set(key, { ...c, rev: ++user.rev });
      }
      const changes = [...user.records.values()].filter((r) => r.rev > (body.cursor ?? 0)).map(({ rev: _rev, ...r }) => r);
      return json(200, { cursor: user.rev, more: false, changes });
    }
    return json(404, { error: 'Not found' });
  }) as typeof fetch;
}
