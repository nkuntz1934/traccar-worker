import type { Env } from '../types';
import { getSessionUser } from '../auth';

export async function handleCommands(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  // GET /api/commands — list saved commands
  if (request.method === 'GET' && url.pathname === '/api/commands') {
    const deviceId = url.searchParams.get('deviceId');
    let rows;
    if (deviceId) {
      rows = await env.DB.prepare(
        'SELECT * FROM commands WHERE device_id = ?',
      ).bind(parseInt(deviceId)).all();
    } else {
      rows = await env.DB.prepare('SELECT * FROM commands').all();
    }
    return json(rows.results.map(mapCommandRow));
  }

  // GET /api/commands/types — list supported command types
  if (request.method === 'GET' && url.pathname === '/api/commands/types') {
    return json([
      { type: 'custom', description: 'Custom Command' },
      { type: 'positionPeriodic', description: 'Position Periodic' },
      { type: 'engineStop', description: 'Engine Stop' },
      { type: 'engineResume', description: 'Engine Resume' },
    ]);
  }

  // POST /api/commands/send — send a command to device
  if (request.method === 'POST' && url.pathname === '/api/commands/send') {
    // Accept the command but since we're OsmAnd-only (HTTP pull),
    // commands can't be pushed to devices. Store as event.
    const body = await request.json() as Record<string, unknown>;

    await env.DB.prepare(
      `INSERT INTO events (type, device_id, attributes)
       VALUES ('commandSent', ?, ?)`,
    ).bind(
      body.deviceId || null,
      JSON.stringify({ commandType: body.type, ...((body.attributes || {}) as Record<string, unknown>) }),
    ).run();

    return json({ ...body, id: 0 });
  }

  // POST /api/commands — save a command
  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO commands (device_id, description, type, attributes) VALUES (?, ?, ?, ?)',
    ).bind(
      body.deviceId || null,
      body.description || '',
      body.type || 'custom',
      JSON.stringify(body.attributes || {}),
    ).run();

    const row = await env.DB.prepare('SELECT * FROM commands WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapCommandRow(row!));
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function mapCommandRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    deviceId: (row.device_id as number) || null,
    description: (row.description as string) || '',
    type: row.type as string,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
