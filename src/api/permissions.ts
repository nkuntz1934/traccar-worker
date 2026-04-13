import type { Env } from '../types';
import { getSessionUser } from '../auth';

// Map from camelCase API field names to snake_case DB column names
const fieldMap: Record<string, string> = {
  userId: 'user_id',
  deviceId: 'device_id',
  groupId: 'group_id',
  geofenceId: 'geofence_id',
  notificationId: 'notification_id',
  calendarId: 'calendar_id',
  driverId: 'driver_id',
  commandId: 'command_id',
  maintenanceId: 'maintenance_id',
  managedUserId: 'managed_user_id',
};

export async function handlePermissions(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as Record<string, number>;

  // Extract the two non-null fields from the body
  const entries = Object.entries(body).filter(
    ([key]) => fieldMap[key] !== undefined,
  );

  if (entries.length !== 2) {
    return json({ error: 'Exactly two permission fields required' }, 400);
  }

  const [field1, value1] = entries[0];
  const [field2, value2] = entries[1];
  const col1 = fieldMap[field1];
  const col2 = fieldMap[field2];

  if (request.method === 'POST') {
    // Check if already exists
    const existing = await env.DB.prepare(
      `SELECT id FROM permissions WHERE ${col1} = ? AND ${col2} = ?`,
    ).bind(value1, value2).first();

    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO permissions (${col1}, ${col2}) VALUES (?, ?)`,
      ).bind(value1, value2).run();
    }

    return new Response(null, { status: 204 });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare(
      `DELETE FROM permissions WHERE ${col1} = ? AND ${col2} = ?`,
    ).bind(value1, value2).run();
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
