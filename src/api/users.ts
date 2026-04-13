import type { Env, User } from '../types';
import { mapUserRow, getSessionUser, hashPassword } from '../auth';

export async function handleUsers(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
  const userId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    if (userId) {
      // Non-admins can only get themselves
      if (!user.administrator && userId !== user.id) {
        return new Response('Forbidden', { status: 403 });
      }
      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
      if (!row) return new Response('Not Found', { status: 404 });
      return json(mapUserRow(row));
    }

    if (!user.administrator) {
      // Non-admins only see themselves
      return json([user]);
    }
    const rows = await env.DB.prepare('SELECT * FROM users ORDER BY name').all();
    return json(rows.results.map(mapUserRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const email = body.email as string;
    const password = body.password as string;
    const name = body.name as string;

    if (!email || !name) {
      return json({ error: 'Name and email are required' }, 400);
    }

    // Check if registration is allowed (for non-admins)
    if (!user.administrator) {
      const server = await env.DB.prepare('SELECT registration FROM server WHERE id = 1').first();
      if (!server?.registration) {
        return new Response('Registration disabled', { status: 403 });
      }
    }

    const passwordHash = password ? await hashPassword(password) : '';

    const result = await env.DB.prepare(
      `INSERT INTO users (name, email, password_hash, phone, administrator, disabled, readonly,
       device_readonly, limit_commands, disable_reports, fixed_email, map,
       latitude, longitude, zoom, twelve_hour_format, coordinate_format, poi_layer,
       device_limit, user_limit, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      name, email, passwordHash,
      (body.phone as string) || '',
      user.administrator && body.administrator ? 1 : 0,
      body.disabled ? 1 : 0,
      body.readonly ? 1 : 0,
      body.deviceReadonly ? 1 : 0,
      body.limitCommands ? 1 : 0,
      body.disableReports ? 1 : 0,
      body.fixedEmail ? 1 : 0,
      (body.map as string) || '',
      (body.latitude as number) || 0,
      (body.longitude as number) || 0,
      (body.zoom as number) || 0,
      body.twelveHourFormat ? 1 : 0,
      (body.coordinateFormat as string) || '',
      (body.poiLayer as string) || '',
      (body.deviceLimit as number) ?? -1,
      (body.userLimit as number) || 0,
      JSON.stringify(body.attributes || {}),
    ).run();

    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapUserRow(row!));
  }

  if (request.method === 'PUT' && userId) {
    // Non-admins can only update themselves
    if (!user.administrator && userId !== user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;

    // Handle password change
    let passwordClause = '';
    const params: unknown[] = [];

    if (body.password) {
      passwordClause = 'password_hash = ?, ';
      params.push(await hashPassword(body.password as string));
    }

    params.push(
      (body.name as string) || '',
      (body.email as string) || '',
      (body.phone as string) || '',
      user.administrator && body.administrator ? 1 : 0,
      body.disabled ? 1 : 0,
      body.readonly ? 1 : 0,
      body.deviceReadonly ? 1 : 0,
      body.limitCommands ? 1 : 0,
      body.disableReports ? 1 : 0,
      body.fixedEmail ? 1 : 0,
      (body.map as string) || '',
      (body.latitude as number) || 0,
      (body.longitude as number) || 0,
      (body.zoom as number) || 0,
      body.twelveHourFormat ? 1 : 0,
      (body.coordinateFormat as string) || '',
      (body.poiLayer as string) || '',
      (body.deviceLimit as number) ?? -1,
      (body.userLimit as number) || 0,
      JSON.stringify(body.attributes || {}),
      userId,
    );

    await env.DB.prepare(
      `UPDATE users SET ${passwordClause}
        name = ?, email = ?, phone = ?, administrator = ?, disabled = ?,
        readonly = ?, device_readonly = ?, limit_commands = ?, disable_reports = ?,
        fixed_email = ?, map = ?, latitude = ?, longitude = ?, zoom = ?,
        twelve_hour_format = ?, coordinate_format = ?, poi_layer = ?,
        device_limit = ?, user_limit = ?, attributes = ?
      WHERE id = ?`,
    ).bind(...params).run();

    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return json(mapUserRow(row!));
  }

  if (request.method === 'DELETE' && userId) {
    if (!user.administrator) return new Response('Forbidden', { status: 403 });
    await env.DB.prepare('DELETE FROM permissions WHERE user_id = ?').bind(userId).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
