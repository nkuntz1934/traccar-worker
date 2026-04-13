import type { Env } from '../types';
import { getSessionUser } from '../auth';

export async function handleDrivers(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/drivers\/(\d+)$/);
  const driverId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    let rows;
    if (user.administrator) {
      rows = await env.DB.prepare('SELECT * FROM drivers ORDER BY name').all();
    } else {
      rows = await env.DB.prepare(
        `SELECT d.* FROM drivers d
         JOIN permissions p ON d.id = p.driver_id
         WHERE p.user_id = ? ORDER BY d.name`,
      ).bind(user.id).all();
    }
    return json(rows.results.map(mapDriverRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO drivers (name, unique_id, attributes) VALUES (?, ?, ?)',
    ).bind(body.name || '', body.uniqueId || '', JSON.stringify(body.attributes || {})).run();

    await env.DB.prepare(
      'INSERT INTO permissions (user_id, driver_id) VALUES (?, ?)',
    ).bind(user.id, result.meta.last_row_id).run();

    const row = await env.DB.prepare('SELECT * FROM drivers WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapDriverRow(row!));
  }

  if (request.method === 'PUT' && driverId) {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      'UPDATE drivers SET name = ?, unique_id = ?, attributes = ? WHERE id = ?',
    ).bind(body.name || '', body.uniqueId || '', JSON.stringify(body.attributes || {}), driverId).run();

    const row = await env.DB.prepare('SELECT * FROM drivers WHERE id = ?').bind(driverId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(mapDriverRow(row));
  }

  if (request.method === 'DELETE' && driverId) {
    await env.DB.prepare('DELETE FROM permissions WHERE driver_id = ?').bind(driverId).run();
    await env.DB.prepare('DELETE FROM drivers WHERE id = ?').bind(driverId).run();
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function mapDriverRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    uniqueId: row.unique_id as string,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
