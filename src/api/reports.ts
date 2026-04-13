import type { Env } from '../types';
import { mapPositionRow, mapEventRow, getSessionUser } from '../auth';

export async function handleReports(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const deviceId = url.searchParams.get('deviceId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!deviceId || !from || !to) {
    return json({ error: 'deviceId, from, and to are required' }, 400);
  }

  const devId = parseInt(deviceId);

  if (url.pathname === '/api/reports/route') {
    const rows = await env.DB.prepare(
      `SELECT * FROM positions WHERE device_id = ? AND device_time >= ? AND device_time <= ? ORDER BY device_time`,
    ).bind(devId, from, to).all();
    return json(rows.results.map(mapPositionRow));
  }

  if (url.pathname === '/api/reports/events') {
    const rows = await env.DB.prepare(
      `SELECT * FROM events WHERE device_id = ? AND event_time >= ? AND event_time <= ? ORDER BY event_time`,
    ).bind(devId, from, to).all();
    return json(rows.results.map(mapEventRow));
  }

  if (url.pathname === '/api/reports/trips') {
    // Compute trips from position data
    const rows = await env.DB.prepare(
      `SELECT * FROM positions WHERE device_id = ? AND device_time >= ? AND device_time <= ? ORDER BY device_time`,
    ).bind(devId, from, to).all();

    const positions = rows.results.map(mapPositionRow);
    const trips = computeTrips(positions, devId);
    return json(trips);
  }

  if (url.pathname === '/api/reports/stops') {
    const rows = await env.DB.prepare(
      `SELECT * FROM positions WHERE device_id = ? AND device_time >= ? AND device_time <= ? ORDER BY device_time`,
    ).bind(devId, from, to).all();

    const positions = rows.results.map(mapPositionRow);
    const stops = computeStops(positions, devId);
    return json(stops);
  }

  if (url.pathname === '/api/reports/summary') {
    const rows = await env.DB.prepare(
      `SELECT * FROM positions WHERE device_id = ? AND device_time >= ? AND device_time <= ? ORDER BY device_time`,
    ).bind(devId, from, to).all();

    const positions = rows.results.map(mapPositionRow);
    return json([computeSummary(positions, devId)]);
  }

  return json([]);
}

interface Trip {
  deviceId: number;
  deviceName: string;
  startTime: string;
  endTime: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distance: number;
  duration: number;
  maxSpeed: number;
  averageSpeed: number;
  spentFuel: number;
  startAddress: string;
  endAddress: string;
  driverUniqueId: string;
  driverName: string;
}

function computeTrips(positions: ReturnType<typeof mapPositionRow>[], deviceId: number): Trip[] {
  if (positions.length < 2) return [];

  const trips: Trip[] = [];
  const SPEED_THRESHOLD = 1; // knots
  let tripStart: number | null = null;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.speed > SPEED_THRESHOLD && tripStart === null) {
      tripStart = i;
    } else if ((p.speed <= SPEED_THRESHOLD || i === positions.length - 1) && tripStart !== null) {
      const start = positions[tripStart];
      const end = positions[i];
      let maxSpeed = 0;
      let totalSpeed = 0;
      let count = 0;
      let distance = 0;

      for (let j = tripStart; j <= i; j++) {
        maxSpeed = Math.max(maxSpeed, positions[j].speed);
        totalSpeed += positions[j].speed;
        count++;
        if (j > tripStart) {
          distance += haversine(
            positions[j - 1].latitude, positions[j - 1].longitude,
            positions[j].latitude, positions[j].longitude,
          );
        }
      }

      const startTime = new Date(start.deviceTime).getTime();
      const endTime = new Date(end.deviceTime).getTime();

      trips.push({
        deviceId,
        deviceName: '',
        startTime: start.deviceTime,
        endTime: end.deviceTime,
        startLat: start.latitude,
        startLon: start.longitude,
        endLat: end.latitude,
        endLon: end.longitude,
        distance: Math.round(distance),
        duration: endTime - startTime,
        maxSpeed,
        averageSpeed: count > 0 ? totalSpeed / count : 0,
        spentFuel: 0,
        startAddress: start.address || '',
        endAddress: end.address || '',
        driverUniqueId: '',
        driverName: '',
      });

      tripStart = null;
    }
  }
  return trips;
}

function computeStops(positions: ReturnType<typeof mapPositionRow>[], deviceId: number) {
  if (positions.length < 2) return [];

  const stops: Record<string, unknown>[] = [];
  const SPEED_THRESHOLD = 1;
  let stopStart: number | null = null;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.speed <= SPEED_THRESHOLD && stopStart === null) {
      stopStart = i;
    } else if ((p.speed > SPEED_THRESHOLD || i === positions.length - 1) && stopStart !== null) {
      const start = positions[stopStart];
      const end = positions[i];
      const startTime = new Date(start.deviceTime).getTime();
      const endTime = new Date(end.deviceTime).getTime();

      if (endTime - startTime > 60000) { // > 1 minute
        stops.push({
          deviceId,
          deviceName: '',
          startTime: start.deviceTime,
          endTime: end.deviceTime,
          latitude: start.latitude,
          longitude: start.longitude,
          duration: endTime - startTime,
          address: start.address || '',
          spentFuel: 0,
          engineHours: 0,
        });
      }
      stopStart = null;
    }
  }
  return stops;
}

function computeSummary(positions: ReturnType<typeof mapPositionRow>[], deviceId: number) {
  let distance = 0;
  let maxSpeed = 0;
  let totalSpeed = 0;

  for (let i = 0; i < positions.length; i++) {
    maxSpeed = Math.max(maxSpeed, positions[i].speed);
    totalSpeed += positions[i].speed;
    if (i > 0) {
      distance += haversine(
        positions[i - 1].latitude, positions[i - 1].longitude,
        positions[i].latitude, positions[i].longitude,
      );
    }
  }

  return {
    deviceId,
    deviceName: '',
    distance: Math.round(distance),
    maxSpeed,
    averageSpeed: positions.length > 0 ? totalSpeed / positions.length : 0,
    spentFuel: 0,
    engineHours: 0,
    startTime: positions.length > 0 ? positions[0].deviceTime : null,
    endTime: positions.length > 0 ? positions[positions.length - 1].deviceTime : null,
  };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mapPositionRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    deviceId: row.device_id as number,
    protocol: (row.protocol as string) || 'osmand',
    deviceTime: row.device_time as string,
    fixTime: row.fix_time as string,
    serverTime: row.server_time as string,
    outdated: false,
    valid: Boolean(row.valid),
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    altitude: (row.altitude as number) || 0,
    speed: (row.speed as number) || 0,
    course: (row.course as number) || 0,
    accuracy: (row.accuracy as number) || null,
    address: (row.address as string) || null,
    network: null,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}

function mapEventRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    type: row.type as string,
    eventTime: row.event_time as string,
    deviceId: (row.device_id as number) || null,
    positionId: (row.position_id as number) || null,
    geofenceId: (row.geofence_id as number) || null,
    maintenanceId: (row.maintenance_id as number) || null,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes as string) : row.attributes) : {},
  };
}
