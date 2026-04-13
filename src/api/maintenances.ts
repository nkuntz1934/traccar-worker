import type { Env } from '../types';
import { getSessionUser } from '../auth';

export async function handleMaintenances(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/maintenance\/(\d+)$/);
  const maintId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    let rows;
    if (user.administrator) {
      rows = await env.DB.prepare('SELECT * FROM maintenances ORDER BY name').all();
    } else {
      rows = await env.DB.prepare(
        `SELECT m.* FROM maintenances m
         JOIN permissions p ON m.id = p.maintenance_id
         WHERE p.user_id = ? ORDER BY m.name`,
      ).bind(user.id).all();
    }
    return json(rows.results.map(mapMaintenanceRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO maintenances (name, type, start, period, attributes) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      body.name || '', body.type || '', body.start || 0, body.period || 0,
      JSON.stringify(body.attributes || {}),
    ).run();

    await env.DB.prepare(
      'INSERT INTO permissions (user_id, maintenance_id) VALUES (?, ?)',
    ).bind(user.id, result.meta.last_row_id).run();

    const row = await env.DB.prepare('SELECT * FROM maintenances WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapMaintenanceRow(row!));
  }

  if (request.method === 'PUT' && maintId) {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      'UPDATE maintenances SET name = ?, type = ?, start = ?, period = ?, attributes = ? WHERE id = ?',
    ).bind(
      body.name || '', body.type || '', body.start || 0, body.period || 0,
      JSON.stringify(body.attributes || {}), maintId,
    ).run();

    const row = await env.DB.prepare('SELECT * FROM maintenances WHERE id = ?').bind(maintId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(mapMaintenanceRow(row));
  }

  if (request.method === 'DELETE' && maintId) {
    await env.DB.prepare('DELETE FROM permissions WHERE maintenance_id = ?').bind(maintId).run();
    await env.DB.prepare('DELETE FROM maintenances WHERE id = ?').bind(maintId).run();
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function mapMaintenanceRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as string,
    start: (row.start as number) || 0,
    period: (row.period as number) || 0,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
