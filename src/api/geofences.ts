import type { Env } from '../types';
import { mapGeofenceRow, getSessionUser } from '../auth';

export async function handleGeofences(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/geofences\/(\d+)$/);
  const geofenceId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    let rows;
    if (user.administrator) {
      rows = await env.DB.prepare('SELECT * FROM geofences ORDER BY name').all();
    } else {
      rows = await env.DB.prepare(
        `SELECT g.* FROM geofences g
         JOIN permissions p ON g.id = p.geofence_id
         WHERE p.user_id = ? ORDER BY g.name`,
      ).bind(user.id).all();
    }
    return json(rows.results.map(mapGeofenceRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO geofences (name, description, area, calendar_id, attributes) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      body.name || '',
      body.description || '',
      body.area || '',
      body.calendarId || null,
      JSON.stringify(body.attributes || {}),
    ).run();

    // Auto-link to user
    await env.DB.prepare(
      'INSERT INTO permissions (user_id, geofence_id) VALUES (?, ?)',
    ).bind(user.id, result.meta.last_row_id).run();

    const row = await env.DB.prepare('SELECT * FROM geofences WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapGeofenceRow(row!));
  }

  if (request.method === 'PUT' && geofenceId) {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      'UPDATE geofences SET name = ?, description = ?, area = ?, calendar_id = ?, attributes = ? WHERE id = ?',
    ).bind(
      body.name || '',
      body.description || '',
      body.area || '',
      body.calendarId || null,
      JSON.stringify(body.attributes || {}),
      geofenceId,
    ).run();

    const row = await env.DB.prepare('SELECT * FROM geofences WHERE id = ?').bind(geofenceId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(mapGeofenceRow(row));
  }

  if (request.method === 'DELETE' && geofenceId) {
    await env.DB.prepare('DELETE FROM permissions WHERE geofence_id = ?').bind(geofenceId).run();
    await env.DB.prepare('DELETE FROM geofences WHERE id = ?').bind(geofenceId).run();
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
