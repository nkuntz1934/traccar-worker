import type { Env, User } from './types';

// --- Password hashing (PBKDF2 via Web Crypto) ---

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return uint8ToBase64(salt) + ':' + uint8ToBase64(new Uint8Array(hash));
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const [saltB64, expectedB64] = stored.split(':');
  if (!saltB64 || !expectedB64) return false;

  const salt = base64ToUint8(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const computed = uint8ToBase64(new Uint8Array(hash));
  return computed === expectedB64;
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

// --- Session management ---

export function parseSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const match = cookie.match(/JSESSIONID=([^;]+)/);
  return match ? match[1] : null;
}

export async function getSessionUser(request: Request, env: Env): Promise<User | null> {
  // Check cookie first
  const sessionId = parseSessionCookie(request);
  if (sessionId) {
    const row = await env.DB.prepare(
      `SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`,
    ).bind(sessionId).first();
    if (row) return mapUserRow(row);
  }

  // Check token query param
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token) {
    const row = await env.DB.prepare('SELECT * FROM users WHERE token = ?').bind(token).first();
    if (row) return mapUserRow(row);
  }

  // Check Authorization header (Basic or Bearer)
  const auth = request.headers.get('Authorization');
  if (auth) {
    if (auth.startsWith('Basic ')) {
      const decoded = atob(auth.slice(6));
      const [email, password] = decoded.split(':');
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (row && await verifyPassword(password, row.password_hash as string)) {
        return mapUserRow(row);
      }
    } else if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const row = await env.DB.prepare('SELECT * FROM users WHERE token = ?').bind(token).first();
      if (row) return mapUserRow(row);
    }
  }

  return null;
}

export async function createSession(userId: number, env: Env): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
  ).bind(sessionId, userId, expiresAt).run();
  return sessionId;
}

export function sessionCookieHeader(sessionId: string): string {
  return `JSESSIONID=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookieHeader(): string {
  return 'JSESSIONID=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

// --- Row mapping ---

export function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    phone: (row.phone as string) || '',
    administrator: Boolean(row.administrator),
    disabled: Boolean(row.disabled),
    readonly: Boolean(row.readonly),
    deviceReadonly: Boolean(row.device_readonly),
    limitCommands: Boolean(row.limit_commands),
    disableReports: Boolean(row.disable_reports),
    fixedEmail: Boolean(row.fixed_email),
    token: (row.token as string) || null,
    map: (row.map as string) || '',
    latitude: (row.latitude as number) || 0,
    longitude: (row.longitude as number) || 0,
    zoom: (row.zoom as number) || 0,
    twelveHourFormat: Boolean(row.twelve_hour_format),
    coordinateFormat: (row.coordinate_format as string) || '',
    poiLayer: (row.poi_layer as string) || '',
    expirationTime: (row.expiration_time as string) || null,
    deviceLimit: (row.device_limit as number) ?? -1,
    userLimit: (row.user_limit as number) || 0,
    totpKey: (row.totp_key as string) || null,
    attributes: parseJson(row.attributes as string),
  };
}

export function mapServerRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    registration: Boolean(row.registration),
    readonly: Boolean(row.readonly),
    deviceReadonly: Boolean(row.device_readonly),
    limitCommands: Boolean(row.limit_commands),
    map: (row.map as string) || 'osm',
    bingKey: (row.bing_key as string) || '',
    mapUrl: (row.map_url as string) || '',
    poiLayer: (row.poi_layer as string) || '',
    announcement: (row.announcement as string) || '',
    latitude: (row.latitude as number) || 0,
    longitude: (row.longitude as number) || 0,
    zoom: (row.zoom as number) || 2,
    version: (row.version as string) || '6.0-cf',
    forceSettings: Boolean(row.force_settings),
    coordinateFormat: (row.coordinate_format as string) || '',
    openIdEnabled: Boolean(row.open_id_enabled),
    openIdForce: Boolean(row.open_id_force),
    overlayUrl: (row.overlay_url as string) || '',
    attributes: parseJson(row.attributes as string),
  };
}

export function mapDeviceRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    uniqueId: row.unique_id as string,
    status: (row.status as string) || 'offline',
    disabled: Boolean(row.disabled),
    lastUpdate: (row.last_update as string) || null,
    positionId: (row.position_id as number) || null,
    groupId: (row.group_id as number) || null,
    phone: (row.phone as string) || '',
    model: (row.model as string) || '',
    contact: (row.contact as string) || '',
    category: (row.category as string) || '',
    expirationTime: (row.expiration_time as string) || null,
    attributes: parseJson(row.attributes as string),
  };
}

export function mapPositionRow(row: Record<string, unknown>) {
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
    network: row.network ? parseJson(row.network as string) : null,
    attributes: parseJson(row.attributes as string),
  };
}

export function mapGeofenceRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    description: (row.description as string) || '',
    area: row.area as string,
    calendarId: (row.calendar_id as number) || null,
    attributes: parseJson(row.attributes as string),
  };
}

export function mapGroupRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    groupId: (row.group_id as number) || null,
    attributes: parseJson(row.attributes as string),
  };
}

export function mapEventRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    type: row.type as string,
    eventTime: row.event_time as string,
    deviceId: (row.device_id as number) || null,
    positionId: (row.position_id as number) || null,
    geofenceId: (row.geofence_id as number) || null,
    maintenanceId: (row.maintenance_id as number) || null,
    attributes: parseJson(row.attributes as string),
  };
}

function parseJson(val: string | null | undefined): Record<string, unknown> {
  if (!val) return {};
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}
