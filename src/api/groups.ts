import type { Env } from '../types';
import { mapGroupRow, getSessionUser } from '../auth';

export async function handleGroups(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/groups\/(\d+)$/);
  const groupId = pathMatch ? parseInt(pathMatch[1]) : null;

  if (request.method === 'GET') {
    let rows;
    if (user.administrator) {
      rows = await env.DB.prepare('SELECT * FROM groups ORDER BY name').all();
    } else {
      rows = await env.DB.prepare(
        `SELECT g.* FROM groups g
         JOIN permissions p ON g.id = p.group_id
         WHERE p.user_id = ? ORDER BY g.name`,
      ).bind(user.id).all();
    }
    return json(rows.results.map(mapGroupRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO groups (name, group_id, attributes) VALUES (?, ?, ?)',
    ).bind(
      body.name || '',
      body.groupId || null,
      JSON.stringify(body.attributes || {}),
    ).run();

    await env.DB.prepare(
      'INSERT INTO permissions (user_id, group_id) VALUES (?, ?)',
    ).bind(user.id, result.meta.last_row_id).run();

    const row = await env.DB.prepare('SELECT * FROM groups WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapGroupRow(row!));
  }

  if (request.method === 'PUT' && groupId) {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      'UPDATE groups SET name = ?, group_id = ?, attributes = ? WHERE id = ?',
    ).bind(
      body.name || '',
      body.groupId || null,
      JSON.stringify(body.attributes || {}),
      groupId,
    ).run();

    const row = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(mapGroupRow(row));
  }

  if (request.method === 'DELETE' && groupId) {
    await env.DB.prepare('DELETE FROM permissions WHERE group_id = ?').bind(groupId).run();
    await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
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
