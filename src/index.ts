import type { Env } from './types';
import { getSessionUser } from './auth';
import { handleOsmand, handleOsmandJson } from './osmand';
import { handleServer } from './api/server';
import { handleSession } from './api/session';
import { handleDevices } from './api/devices';
import { handlePositions } from './api/positions';
import { handleUsers } from './api/users';
import { handleGeofences } from './api/geofences';
import { handleGroups } from './api/groups';
import { handlePermissions } from './api/permissions';
import { handleReports } from './api/reports';
import { handleCommands } from './api/commands';
import { handleNotifications } from './api/notifications';
import { handleDrivers } from './api/drivers';
import { handleMaintenances } from './api/maintenances';
import { handleCalendars } from './api/calendars';

export { TrackerHub } from './tracker-hub';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      const response = await route(request, env, url);
      // Add CORS headers to all responses
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders())) {
        headers.set(key, value);
      }
      headers.set('X-Traccar-Worker', '1');
      // Prevent CDN caching of dynamic responses
      if (!url.pathname.startsWith('/assets/')) {
        headers.set('Cache-Control', 'no-store');
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      console.error('Unhandled error:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  },
};

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  // OsmAnd protocol ingestion on dedicated path (assets layer can't intercept this)
  // Traccar Client should be configured with: https://traccar.easydemo.org/ingest
  if (url.pathname === '/ingest' || url.pathname === '/ingest/') {
    if (request.method === 'POST' && request.headers.get('content-type')?.includes('json')) {
      return handleOsmandJson(request, env);
    }
    return handleOsmand(request, env, url);
  }

  // Also support root path with OsmAnd params (when Worker runs for /)
  if (url.searchParams.has('id') && (url.searchParams.has('lat') || url.searchParams.has('location'))) {
    return handleOsmand(request, env, url);
  }

  // JSON body OsmAnd on root (Traccar Client v9+)
  if (request.method === 'POST' && url.pathname === '/' &&
      request.headers.get('content-type')?.includes('json')) {
    return handleOsmandJson(request, env);
  }

  // WebSocket upgrade for /api/socket
  if (url.pathname === '/api/socket') {
    return handleWebSocket(request, env);
  }

  // Health check
  if (url.pathname === '/api/health') {
    return new Response('ok', { status: 200 });
  }

  // API routes
  if (url.pathname.startsWith('/api/')) {
    return handleApi(request, env, url);
  }

  // Serve static assets — SPA fallback to index.html for non-file paths
  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }
  // SPA fallback: serve index.html for client-side routes
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  // Public endpoints (no auth required)
  if (path === '/api/server') {
    return handleServer(request, env);
  }

  // Session endpoints (auth handled internally)
  if (path === '/api/session' || path.startsWith('/api/session/')) {
    return handleSession(request, env, url);
  }

  // All other endpoints require authentication
  if (path.startsWith('/api/devices')) return handleDevices(request, env, url);
  if (path.startsWith('/api/positions')) return handlePositions(request, env, url);
  if (path.startsWith('/api/users')) return handleUsers(request, env, url);
  if (path.startsWith('/api/geofences')) return handleGeofences(request, env, url);
  if (path.startsWith('/api/groups')) return handleGroups(request, env, url);
  if (path === '/api/permissions') return handlePermissions(request, env, url);
  if (path.startsWith('/api/reports/')) return handleReports(request, env, url);
  if (path.startsWith('/api/commands')) return handleCommands(request, env, url);
  if (path.startsWith('/api/notifications')) return handleNotifications(request, env, url);
  if (path.startsWith('/api/drivers')) return handleDrivers(request, env, url);
  if (path.startsWith('/api/maintenance')) return handleMaintenances(request, env, url);
  if (path.startsWith('/api/calendars')) return handleCalendars(request, env, url);

  // Statistics endpoint
  if (path === '/api/statistics') {
    const user = await getSessionUser(request, env);
    if (!user) return new Response('Unauthorized', { status: 401 });
    return json([]);
  }

  // Catch-all for unimplemented API endpoints
  return json([], 200);
}

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const user = await getSessionUser(request, env);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const hubId = env.TRACKER_HUB.idFromName('global');
  const hub = env.TRACKER_HUB.get(hubId);
  return hub.fetch(new Request(`http://internal/websocket?userId=${user.id}`, {
    headers: request.headers,
  }));
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
