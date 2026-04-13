import type { Env } from '../types';
import { getSessionUser } from '../auth';

export async function handleCalendars(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/calendars\/(\d+)$/);
  const calId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    let rows;
    if (user.administrator) {
      rows = await env.DB.prepare('SELECT * FROM calendars ORDER BY name').all();
    } else {
      rows = await env.DB.prepare(
        `SELECT c.* FROM calendars c
         JOIN permissions p ON c.id = p.calendar_id
         WHERE p.user_id = ? ORDER BY c.name`,
      ).bind(user.id).all();
    }
    return json(rows.results.map(mapCalendarRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO calendars (name, data, attributes) VALUES (?, ?, ?)',
    ).bind(body.name || '', body.data || '', JSON.stringify(body.attributes || {})).run();

    await env.DB.prepare(
      'INSERT INTO permissions (user_id, calendar_id) VALUES (?, ?)',
    ).bind(user.id, result.meta.last_row_id).run();

    const row = await env.DB.prepare('SELECT * FROM calendars WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapCalendarRow(row!));
  }

  if (request.method === 'PUT' && calId) {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      'UPDATE calendars SET name = ?, data = ?, attributes = ? WHERE id = ?',
    ).bind(body.name || '', body.data || '', JSON.stringify(body.attributes || {}), calId).run();

    const row = await env.DB.prepare('SELECT * FROM calendars WHERE id = ?').bind(calId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(mapCalendarRow(row));
  }

  if (request.method === 'DELETE' && calId) {
    await env.DB.prepare('DELETE FROM permissions WHERE calendar_id = ?').bind(calId).run();
    await env.DB.prepare('DELETE FROM calendars WHERE id = ?').bind(calId).run();
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function mapCalendarRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    data: (row.data as string) || '',
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
