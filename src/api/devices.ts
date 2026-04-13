import type { Env, User } from '../types';
import { mapDeviceRow, getSessionUser } from '../auth';

export async function handleDevices(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Extract device ID from path: /api/devices/123
  const pathMatch = url.pathname.match(/^\/api\/devices\/(\d+)$/);
  const deviceId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    if (deviceId) {
      return getDevice(env, user, deviceId);
    }
    return listDevices(env, user, url);
  }

  if (request.method === 'POST') {
    return createDevice(request, env, user);
  }

  if (request.method === 'PUT' && deviceId) {
    return updateDevice(request, env, user, deviceId);
  }

  if (request.method === 'DELETE' && deviceId) {
    return deleteDevice(env, user, deviceId);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function listDevices(env: Env, user: User, url: URL): Promise<Response> {
  const all = url.searchParams.get('all') === 'true';
  const userId = url.searchParams.get('userId');
  const uniqueId = url.searchParams.get('uniqueId');
  const id = url.searchParams.get('id');

  let rows;

  if (uniqueId) {
    rows = await env.DB.prepare('SELECT * FROM devices WHERE unique_id = ?')
      .bind(uniqueId).all();
  } else if (id) {
    const ids = id.split(',').map(Number);
    const placeholders = ids.map(() => '?').join(',');
    rows = await env.DB.prepare(`SELECT * FROM devices WHERE id IN (${placeholders})`)
      .bind(...ids).all();
  } else if (user.administrator && (all || !userId)) {
    rows = await env.DB.prepare('SELECT * FROM devices ORDER BY name').all();
  } else {
    const targetUserId = userId ? parseInt(userId) : user.id;
    rows = await env.DB.prepare(
      `SELECT d.* FROM devices d
       JOIN permissions p ON d.id = p.device_id
       WHERE p.user_id = ? ORDER BY d.name`,
    ).bind(targetUserId).all();
  }

  return json(rows.results.map(mapDeviceRow));
}

async function getDevice(env: Env, user: User, deviceId: number): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(deviceId).first();
  if (!row) return new Response('Not Found', { status: 404 });
  return json(mapDeviceRow(row));
}

async function createDevice(request: Request, env: Env, user: User): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const name = body.name as string;
  const uniqueId = body.uniqueId as string;

  if (!name || !uniqueId) {
    return json({ error: 'Name and uniqueId are required' }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO devices (name, unique_id, group_id, phone, model, contact, category, disabled, attributes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    name,
    uniqueId,
    body.groupId || null,
    body.phone || '',
    body.model || '',
    body.contact || '',
    body.category || '',
    body.disabled ? 1 : 0,
    JSON.stringify(body.attributes || {}),
  ).run();

  const newId = result.meta.last_row_id;

  // Auto-link device to current user
  await env.DB.prepare(
    'INSERT INTO permissions (user_id, device_id) VALUES (?, ?)',
  ).bind(user.id, newId).run();

  const row = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(newId).first();
  return json(mapDeviceRow(row!), 200);
}

async function updateDevice(request: Request, env: Env, user: User, deviceId: number): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  await env.DB.prepare(
    `UPDATE devices SET
      name = ?, unique_id = ?, group_id = ?, phone = ?, model = ?,
      contact = ?, category = ?, disabled = ?, attributes = ?
    WHERE id = ?`,
  ).bind(
    body.name || '',
    body.uniqueId || '',
    body.groupId || null,
    body.phone || '',
    body.model || '',
    body.contact || '',
    body.category || '',
    body.disabled ? 1 : 0,
    JSON.stringify(body.attributes || {}),
    deviceId,
  ).run();

  const row = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(deviceId).first();
  if (!row) return new Response('Not Found', { status: 404 });
  return json(mapDeviceRow(row));
}

async function deleteDevice(env: Env, user: User, deviceId: number): Promise<Response> {
  await env.DB.prepare('DELETE FROM permissions WHERE device_id = ?').bind(deviceId).run();
  await env.DB.prepare('DELETE FROM positions WHERE device_id = ?').bind(deviceId).run();
  await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(deviceId).run();
  return new Response(null, { status: 204 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
