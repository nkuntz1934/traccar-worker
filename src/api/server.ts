import type { Env } from '../types';
import { mapServerRow } from '../auth';

export async function handleServer(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM server WHERE id = 1').first();
    if (!row) {
      // Return default server config if no row exists
      return json({
        id: 1,
        registration: true,
        readonly: false,
        deviceReadonly: false,
        limitCommands: false,
        map: 'osm',
        bingKey: '',
        mapUrl: '',
        poiLayer: '',
        announcement: '',
        latitude: 0,
        longitude: 0,
        zoom: 2,
        version: '6.0-cf',
        forceSettings: false,
        coordinateFormat: '',
        openIdEnabled: false,
        openIdForce: false,
        overlayUrl: '',
        attributes: {},
      });
    }
    return json(mapServerRow(row));
  }

  if (request.method === 'PUT') {
    const body = await request.json() as Record<string, unknown>;
    await env.DB.prepare(
      `UPDATE server SET
        registration = ?, readonly = ?, device_readonly = ?, limit_commands = ?,
        map = ?, bing_key = ?, map_url = ?, poi_layer = ?, announcement = ?,
        latitude = ?, longitude = ?, zoom = ?, force_settings = ?,
        coordinate_format = ?, overlay_url = ?, attributes = ?
      WHERE id = 1`,
    ).bind(
      body.registration ? 1 : 0,
      body.readonly ? 1 : 0,
      body.deviceReadonly ? 1 : 0,
      body.limitCommands ? 1 : 0,
      body.map || 'osm',
      body.bingKey || '',
      body.mapUrl || '',
      body.poiLayer || '',
      body.announcement || '',
      body.latitude || 0,
      body.longitude || 0,
      body.zoom || 2,
      body.forceSettings ? 1 : 0,
      body.coordinateFormat || '',
      body.overlayUrl || '',
      JSON.stringify(body.attributes || {}),
    ).run();

    const updated = await env.DB.prepare('SELECT * FROM server WHERE id = 1').first();
    return json(mapServerRow(updated!));
  }

  return new Response('Method Not Allowed', { status: 405 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
