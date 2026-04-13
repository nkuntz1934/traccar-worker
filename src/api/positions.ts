import type { Env, User } from '../types';
import { mapPositionRow, getSessionUser } from '../auth';

export async function handlePositions(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  if (request.method === 'GET') {
    // GPX export
    if (url.pathname === '/api/positions/gpx') {
      return exportGpx(env, user, url);
    }
    // KML export
    if (url.pathname === '/api/positions/kml') {
      return exportKml(env, user, url);
    }
    return getPositions(env, user, url);
  }

  if (request.method === 'DELETE') {
    return deletePositions(env, user, url);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function getPositions(env: Env, user: User, url: URL): Promise<Response> {
  const deviceId = url.searchParams.get('deviceId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const id = url.searchParams.get('id');

  // Specific position by ID
  if (id) {
    const ids = id.split(',').map(Number);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT * FROM positions WHERE id IN (${placeholders})`,
    ).bind(...ids).all();
    return json(rows.results.map(mapPositionRow));
  }

  // Historical positions for a device
  if (deviceId && from && to) {
    const rows = await env.DB.prepare(
      `SELECT * FROM positions
       WHERE device_id = ? AND device_time >= ? AND device_time <= ?
       ORDER BY device_time`,
    ).bind(parseInt(deviceId), from, to).all();
    return json(rows.results.map(mapPositionRow));
  }

  // Latest positions for all user devices
  let rows;
  if (user.administrator) {
    rows = await env.DB.prepare(
      `SELECT p.* FROM positions p
       JOIN devices d ON p.id = d.position_id
       ORDER BY p.device_time DESC`,
    ).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT p.* FROM positions p
       JOIN devices d ON p.id = d.position_id
       JOIN permissions perm ON d.id = perm.device_id
       WHERE perm.user_id = ?
       ORDER BY p.device_time DESC`,
    ).bind(user.id).all();
  }

  return json(rows.results.map(mapPositionRow));
}

async function deletePositions(env: Env, user: User, url: URL): Promise<Response> {
  const deviceId = url.searchParams.get('deviceId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (deviceId && from && to) {
    await env.DB.prepare(
      `DELETE FROM positions
       WHERE device_id = ? AND device_time >= ? AND device_time <= ?`,
    ).bind(parseInt(deviceId), from, to).run();
  }

  return new Response(null, { status: 204 });
}

async function exportGpx(env: Env, user: User, url: URL): Promise<Response> {
  const deviceId = url.searchParams.get('deviceId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!deviceId || !from || !to) {
    return new Response('deviceId, from, and to are required', { status: 400 });
  }

  const rows = await env.DB.prepare(
    `SELECT * FROM positions
     WHERE device_id = ? AND device_time >= ? AND device_time <= ?
     ORDER BY device_time`,
  ).bind(parseInt(deviceId), from, to).all();

  const positions = rows.results.map(mapPositionRow);

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Traccar">
  <trk>
    <name>Device ${deviceId}</name>
    <trkseg>
${positions.map(p => `      <trkpt lat="${p.latitude}" lon="${p.longitude}">
        <ele>${p.altitude}</ele>
        <time>${p.fixTime}</time>
        <speed>${p.speed}</speed>
        <course>${p.course}</course>
      </trkpt>`).join('\n')}
    </trkseg>
  </trk>
</gpx>`;

  return new Response(gpx, {
    headers: {
      'Content-Type': 'application/gpx+xml',
      'Content-Disposition': `attachment; filename="track-${deviceId}.gpx"`,
    },
  });
}

async function exportKml(env: Env, user: User, url: URL): Promise<Response> {
  const deviceId = url.searchParams.get('deviceId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!deviceId || !from || !to) {
    return new Response('deviceId, from, and to are required', { status: 400 });
  }

  const rows = await env.DB.prepare(
    `SELECT * FROM positions
     WHERE device_id = ? AND device_time >= ? AND device_time <= ?
     ORDER BY device_time`,
  ).bind(parseInt(deviceId), from, to).all();

  const positions = rows.results.map(mapPositionRow);
  const coords = positions.map(p => `${p.longitude},${p.latitude},${p.altitude}`).join('\n            ');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Device ${deviceId}</name>
    <Placemark>
      <name>Track</name>
      <LineString>
        <coordinates>
            ${coords}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  return new Response(kml, {
    headers: {
      'Content-Type': 'application/vnd.google-earth.kml+xml',
      'Content-Disposition': `attachment; filename="track-${deviceId}.kml"`,
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
