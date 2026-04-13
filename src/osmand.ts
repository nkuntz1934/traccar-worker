import type { Env } from './types';
import { mapDeviceRow, mapPositionRow } from './auth';

export async function handleOsmand(request: Request, env: Env, url: URL): Promise<Response> {
  const id = url.searchParams.get('id') || url.searchParams.get('deviceid');
  if (!id) return new Response('Device ID required', { status: 400 });

  let lat: number | null = null;
  let lon: number | null = null;

  // Support "location" param (lat,lon combined)
  const location = url.searchParams.get('location');
  if (location) {
    const parts = location.split(',');
    lat = parseFloat(parts[0]);
    lon = parseFloat(parts[1]);
  } else {
    lat = parseFloat(url.searchParams.get('lat') || '');
    lon = parseFloat(url.searchParams.get('lon') || '');
  }

  if (isNaN(lat!) || isNaN(lon!)) {
    return new Response('Invalid coordinates', { status: 400 });
  }

  const timestamp = parseTimestamp(
    url.searchParams.get('timestamp') || url.searchParams.get('time'),
  );
  const speed = parseFloat(url.searchParams.get('speed') || '0') || 0;
  const bearing = parseFloat(
    url.searchParams.get('bearing') || url.searchParams.get('heading') || '0',
  ) || 0;
  const altitude = parseFloat(url.searchParams.get('altitude') || '0') || 0;
  const accuracy = parseFloat(url.searchParams.get('accuracy') || '0') || null;
  const batt = url.searchParams.get('batt');
  const charge = url.searchParams.get('charge');
  const valid = url.searchParams.get('valid');

  // Collect extra attributes from unrecognized params
  const knownParams = new Set([
    'id', 'deviceid', 'lat', 'lon', 'location', 'timestamp', 'time',
    'speed', 'bearing', 'heading', 'altitude', 'accuracy', 'batt',
    'charge', 'valid', 'hdop', 'cell', 'wifi', 'driverUniqueId',
  ]);
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    if (!knownParams.has(key)) {
      attributes[key] = value;
    }
  }
  if (batt) attributes.batteryLevel = parseFloat(batt);
  if (charge) attributes.charge = charge === 'true' || charge === '1';
  if (url.searchParams.get('hdop')) attributes.hdop = parseFloat(url.searchParams.get('hdop')!);

  return storePosition(env, id, {
    latitude: lat!,
    longitude: lon!,
    timestamp,
    speed,
    course: bearing,
    altitude,
    accuracy,
    valid: valid !== 'false' && valid !== '0',
    attributes,
  });
}

export async function handleOsmandJson(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // Traccar Client v9+ JSON format
  const deviceId = body.device_id as string;
  const location = body.location as Record<string, unknown>;
  if (!deviceId || !location) {
    return new Response('Invalid JSON format', { status: 400 });
  }

  const coords = location.coords as Record<string, number>;
  const battery = location.battery as Record<string, unknown> | undefined;
  const activity = location.activity as Record<string, unknown> | undefined;

  const attributes: Record<string, unknown> = {};
  if (battery) {
    attributes.batteryLevel = (battery.level as number) * 100;
    attributes.charge = battery.is_charging;
  }
  if (activity) {
    attributes.motion = activity.type !== 'still';
    attributes.activityType = activity.type;
  }
  if (location.odometer !== undefined) attributes.odometer = location.odometer;
  if (location.is_moving !== undefined) attributes.motion = location.is_moving;
  if (location.event) attributes.event = location.event;
  if (location.extras) Object.assign(attributes, location.extras as Record<string, unknown>);

  return storePosition(env, deviceId, {
    latitude: coords.latitude,
    longitude: coords.longitude,
    timestamp: location.timestamp
      ? new Date(location.timestamp as string).toISOString()
      : new Date().toISOString(),
    speed: (coords.speed || 0) * 1.94384, // m/s to knots
    course: coords.heading || 0,
    altitude: coords.altitude || 0,
    accuracy: coords.accuracy || null,
    valid: true,
    attributes,
  });
}

interface PositionData {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number;
  course: number;
  altitude: number;
  accuracy: number | null;
  valid: boolean;
  attributes: Record<string, unknown>;
}

async function storePosition(env: Env, uniqueId: string, data: PositionData): Promise<Response> {
  // Look up device
  let device = await env.DB.prepare('SELECT * FROM devices WHERE unique_id = ?')
    .bind(uniqueId).first();

  // Auto-create device if not found
  if (!device) {
    const result = await env.DB.prepare(
      'INSERT INTO devices (name, unique_id) VALUES (?, ?)',
    ).bind(uniqueId, uniqueId).run();

    device = await env.DB.prepare('SELECT * FROM devices WHERE id = ?')
      .bind(result.meta.last_row_id).first();

    // Auto-link to admin user (id=1)
    await env.DB.prepare(
      'INSERT INTO permissions (user_id, device_id) VALUES (1, ?)',
    ).bind(result.meta.last_row_id).run();
  }

  const deviceIdNum = device!.id as number;
  const now = new Date().toISOString();

  // Insert position
  const posResult = await env.DB.prepare(
    `INSERT INTO positions (device_id, protocol, device_time, fix_time, server_time, valid,
     latitude, longitude, altitude, speed, course, accuracy, attributes)
     VALUES (?, 'osmand', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    deviceIdNum,
    data.timestamp,
    data.timestamp,
    now,
    data.valid ? 1 : 0,
    data.latitude,
    data.longitude,
    data.altitude,
    data.speed,
    data.course,
    data.accuracy,
    JSON.stringify(data.attributes),
  ).run();

  const positionId = posResult.meta.last_row_id;

  // Update device status and latest position
  await env.DB.prepare(
    `UPDATE devices SET status = 'online', last_update = ?, position_id = ? WHERE id = ?`,
  ).bind(now, positionId, deviceIdNum).run();

  // Broadcast to WebSocket clients
  try {
    const updatedDevice = await env.DB.prepare('SELECT * FROM devices WHERE id = ?')
      .bind(deviceIdNum).first();
    const position = await env.DB.prepare('SELECT * FROM positions WHERE id = ?')
      .bind(positionId).first();

    if (updatedDevice && position) {
      const hubId = env.TRACKER_HUB.idFromName('global');
      const hub = env.TRACKER_HUB.get(hubId);
      await hub.fetch(new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          devices: [mapDeviceRow(updatedDevice)],
          positions: [mapPositionRow(position)],
        }),
      }));
    }
  } catch {
    // Don't fail the ingestion if broadcast fails
  }

  return new Response(null, { status: 200 });
}

function parseTimestamp(value: string | null): string {
  if (!value) return new Date().toISOString();

  // Try epoch seconds or milliseconds
  const num = Number(value);
  if (!isNaN(num)) {
    // If > 1e12, it's milliseconds
    const ms = num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString();
  }

  // Try ISO 8601 or other date string
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  return new Date().toISOString();
}
