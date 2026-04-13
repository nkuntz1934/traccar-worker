import type { Env } from '../types';
import { getSessionUser } from '../auth';

export async function handleNotifications(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const pathMatch = url.pathname.match(/^\/api\/notifications\/(\d+)$/);
  const notifId = pathMatch ? parseInt(pathMatch[1]) : null;

  // GET /api/notifications/types
  if (request.method === 'GET' && url.pathname === '/api/notifications/types') {
    return json([
      { type: 'commandResult' },
      { type: 'deviceOnline' },
      { type: 'deviceUnknown' },
      { type: 'deviceOffline' },
      { type: 'deviceInactive' },
      { type: 'deviceMoving' },
      { type: 'deviceStopped' },
      { type: 'deviceOverspeed' },
      { type: 'deviceFuelDrop' },
      { type: 'deviceFuelIncrease' },
      { type: 'geofenceEnter' },
      { type: 'geofenceExit' },
      { type: 'alarm' },
      { type: 'ignitionOn' },
      { type: 'ignitionOff' },
      { type: 'maintenance' },
      { type: 'textMessage' },
      { type: 'driverChanged' },
      { type: 'media' },
    ]);
  }

  if (request.method === 'GET') {
    let rows;
    if (user.administrator) {
      rows = await env.DB.prepare('SELECT * FROM notifications').all();
    } else {
      rows = await env.DB.prepare(
        `SELECT n.* FROM notifications n
         JOIN permissions p ON n.id = p.notification_id
         WHERE p.user_id = ?`,
      ).bind(user.id).all();
    }
    return json(rows.results.map(mapNotificationRow));
  }

  if (request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const result = await env.DB.prepare(
      'INSERT INTO notifications (type, always, web, mail, sms, attributes) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      body.type || '',
      body.always ? 1 : 0,
      body.web ? 1 : 0,
      body.mail ? 1 : 0,
      body.sms ? 1 : 0,
      JSON.stringify(body.attributes || {}),
    ).run();

    await env.DB.prepare(
      'INSERT INTO permissions (user_id, notification_id) VALUES (?, ?)',
    ).bind(user.id, result.meta.last_row_id).run();

    const row = await env.DB.prepare('SELECT * FROM notifications WHERE id = ?')
      .bind(result.meta.last_row_id).first();
    return json(mapNotificationRow(row!));
  }

  if (request.method === 'PUT' && notifId) {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      'UPDATE notifications SET type = ?, always = ?, web = ?, mail = ?, sms = ?, attributes = ? WHERE id = ?',
    ).bind(
      body.type || '',
      body.always ? 1 : 0,
      body.web ? 1 : 0,
      body.mail ? 1 : 0,
      body.sms ? 1 : 0,
      JSON.stringify(body.attributes || {}),
      notifId,
    ).run();

    const row = await env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(notifId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(mapNotificationRow(row));
  }

  if (request.method === 'DELETE' && notifId) {
    await env.DB.prepare('DELETE FROM permissions WHERE notification_id = ?').bind(notifId).run();
    await env.DB.prepare('DELETE FROM notifications WHERE id = ?').bind(notifId).run();
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function mapNotificationRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    type: row.type as string,
    always: Boolean(row.always),
    web: Boolean(row.web),
    mail: Boolean(row.mail),
    sms: Boolean(row.sms),
    calendarId: (row.calendarId as number) || null,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
