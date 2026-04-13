export interface Env {
  DB: D1Database;
  TRACKER_HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export interface Server {
  id: number;
  registration: boolean;
  readonly: boolean;
  deviceReadonly: boolean;
  limitCommands: boolean;
  map: string;
  bingKey: string;
  mapUrl: string;
  poiLayer: string;
  announcement: string;
  latitude: number;
  longitude: number;
  zoom: number;
  version: string;
  forceSettings: boolean;
  coordinateFormat: string;
  openIdEnabled: boolean;
  openIdForce: boolean;
  overlayUrl: string;
  attributes: Record<string, unknown>;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  administrator: boolean;
  disabled: boolean;
  readonly: boolean;
  deviceReadonly: boolean;
  limitCommands: boolean;
  disableReports: boolean;
  fixedEmail: boolean;
  token: string | null;
  map: string;
  latitude: number;
  longitude: number;
  zoom: number;
  twelveHourFormat: boolean;
  coordinateFormat: string;
  poiLayer: string;
  expirationTime: string | null;
  deviceLimit: number;
  userLimit: number;
  totpKey: string | null;
  attributes: Record<string, unknown>;
}

export interface Device {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  disabled: boolean;
  lastUpdate: string | null;
  positionId: number | null;
  groupId: number | null;
  phone: string;
  model: string;
  contact: string;
  category: string;
  expirationTime: string | null;
  attributes: Record<string, unknown>;
}

export interface Position {
  id: number;
  deviceId: number;
  protocol: string;
  deviceTime: string;
  fixTime: string;
  serverTime: string;
  outdated: boolean;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  accuracy: number | null;
  address: string | null;
  network: Record<string, unknown> | null;
  attributes: Record<string, unknown>;
}

export interface Geofence {
  id: number;
  name: string;
  description: string;
  area: string;
  calendarId: number | null;
  attributes: Record<string, unknown>;
}

export interface Group {
  id: number;
  name: string;
  groupId: number | null;
  attributes: Record<string, unknown>;
}

export interface Event {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number | null;
  positionId: number | null;
  geofenceId: number | null;
  maintenanceId: number | null;
  attributes: Record<string, unknown>;
}

export interface Driver {
  id: number;
  name: string;
  uniqueId: string;
  attributes: Record<string, unknown>;
}

export interface Notification {
  id: number;
  type: string;
  always: boolean;
  web: boolean;
  mail: boolean;
  sms: boolean;
  calendarId: number | null;
  attributes: Record<string, unknown>;
}

export interface Command {
  id: number;
  deviceId: number | null;
  description: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface SessionInfo {
  id: string;
  userId: number;
  createdAt: string;
  expiresAt: string;
}
