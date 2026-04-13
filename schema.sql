-- Server configuration (single row)
CREATE TABLE IF NOT EXISTS server (
  id INTEGER PRIMARY KEY DEFAULT 1,
  registration INTEGER NOT NULL DEFAULT 1,
  readonly INTEGER NOT NULL DEFAULT 0,
  device_readonly INTEGER NOT NULL DEFAULT 0,
  limit_commands INTEGER NOT NULL DEFAULT 0,
  map TEXT DEFAULT 'osm',
  bing_key TEXT DEFAULT '',
  map_url TEXT DEFAULT '',
  poi_layer TEXT DEFAULT '',
  announcement TEXT DEFAULT '',
  latitude REAL DEFAULT 0,
  longitude REAL DEFAULT 0,
  zoom INTEGER DEFAULT 2,
  version TEXT DEFAULT '6.0-cf',
  force_settings INTEGER NOT NULL DEFAULT 0,
  coordinate_format TEXT DEFAULT '',
  open_id_enabled INTEGER NOT NULL DEFAULT 0,
  open_id_force INTEGER NOT NULL DEFAULT 0,
  overlay_url TEXT DEFAULT '',
  attributes TEXT DEFAULT '{}'
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  administrator INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  readonly INTEGER NOT NULL DEFAULT 0,
  device_readonly INTEGER NOT NULL DEFAULT 0,
  limit_commands INTEGER NOT NULL DEFAULT 0,
  disable_reports INTEGER NOT NULL DEFAULT 0,
  fixed_email INTEGER NOT NULL DEFAULT 0,
  token TEXT UNIQUE,
  map TEXT DEFAULT '',
  latitude REAL DEFAULT 0,
  longitude REAL DEFAULT 0,
  zoom INTEGER DEFAULT 0,
  twelve_hour_format INTEGER NOT NULL DEFAULT 0,
  coordinate_format TEXT DEFAULT '',
  poi_layer TEXT DEFAULT '',
  expiration_time TEXT,
  device_limit INTEGER DEFAULT -1,
  user_limit INTEGER DEFAULT 0,
  totp_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  attributes TEXT DEFAULT '{}'
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_id INTEGER,
  attributes TEXT DEFAULT '{}'
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unique_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'offline',
  last_update TEXT,
  group_id INTEGER,
  phone TEXT DEFAULT '',
  model TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  category TEXT DEFAULT '',
  disabled INTEGER NOT NULL DEFAULT 0,
  position_id INTEGER,
  expiration_time TEXT,
  calendar_id INTEGER,
  attributes TEXT DEFAULT '{}'
);

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'osmand',
  device_time TEXT NOT NULL,
  fix_time TEXT NOT NULL,
  server_time TEXT NOT NULL DEFAULT (datetime('now')),
  valid INTEGER NOT NULL DEFAULT 1,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  altitude REAL DEFAULT 0,
  speed REAL DEFAULT 0,
  course REAL DEFAULT 0,
  accuracy REAL,
  address TEXT,
  network TEXT,
  attributes TEXT DEFAULT '{}',
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Geofences table
CREATE TABLE IF NOT EXISTS geofences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  area TEXT NOT NULL,
  calendar_id INTEGER,
  attributes TEXT DEFAULT '{}'
);

-- Permissions table (polymorphic links)
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  device_id INTEGER,
  group_id INTEGER,
  geofence_id INTEGER,
  notification_id INTEGER,
  calendar_id INTEGER,
  driver_id INTEGER,
  command_id INTEGER,
  maintenance_id INTEGER,
  managed_user_id INTEGER
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  event_time TEXT NOT NULL DEFAULT (datetime('now')),
  device_id INTEGER,
  position_id INTEGER,
  geofence_id INTEGER,
  maintenance_id INTEGER,
  attributes TEXT DEFAULT '{}'
);

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unique_id TEXT NOT NULL UNIQUE,
  attributes TEXT DEFAULT '{}'
);

-- Maintenances table
CREATE TABLE IF NOT EXISTS maintenances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  start REAL DEFAULT 0,
  period REAL DEFAULT 0,
  attributes TEXT DEFAULT '{}'
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  always INTEGER NOT NULL DEFAULT 0,
  web INTEGER NOT NULL DEFAULT 0,
  mail INTEGER NOT NULL DEFAULT 0,
  sms INTEGER NOT NULL DEFAULT 0,
  calendarId INTEGER,
  attributes TEXT DEFAULT '{}'
);

-- Commands table (saved commands)
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER,
  description TEXT DEFAULT '',
  type TEXT NOT NULL,
  attributes TEXT DEFAULT '{}'
);

-- Calendars table
CREATE TABLE IF NOT EXISTS calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '',
  attributes TEXT DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_positions_device_id ON positions(device_id);
CREATE INDEX IF NOT EXISTS idx_positions_device_time ON positions(device_id, device_time);
CREATE INDEX IF NOT EXISTS idx_positions_server_time ON positions(server_time);
CREATE INDEX IF NOT EXISTS idx_devices_unique_id ON devices(unique_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_device_time ON events(device_id, event_time);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_device ON permissions(device_id);

-- Default server configuration
INSERT OR IGNORE INTO server (id, registration, version, zoom)
VALUES (1, 1, '6.0-cf', 2);

-- Default admin user (password: admin)
INSERT OR IGNORE INTO users (id, name, email, password_hash, administrator)
VALUES (1, 'Admin', 'admin@example.com', 'WuT2aIVVnT/y3TpZtfSd8w==:3F6fw5E6vCOZOUVavCLL2jKgsgBI4cBknqYPbTy17nA=', 1);
