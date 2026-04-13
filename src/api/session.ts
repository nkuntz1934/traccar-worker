import type { Env, User } from '../types';
import {
  verifyPassword,
  hashPassword,
  getSessionUser,
  createSession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  mapUserRow,
  parseSessionCookie,
} from '../auth';

export async function handleSession(request: Request, env: Env, url: URL): Promise<Response> {
  // POST /api/session — login
  if (request.method === 'POST') {
    // Check for token generation endpoint
    if (url.pathname === '/api/session/token') {
      return handleTokenGeneration(request, env);
    }

    const contentType = request.headers.get('Content-Type') || '';
    let email: string;
    let password: string;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = new URLSearchParams(await request.text());
      email = body.get('email') || '';
      password = body.get('password') || '';
    } else if (contentType.includes('application/json')) {
      const body = await request.json() as Record<string, string>;
      email = body.email || '';
      password = body.password || '';
    } else {
      return json({ error: 'Invalid content type' }, 400);
    }

    if (!email || !password) {
      return json({ error: 'Email and password required' }, 400);
    }

    const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!row) {
      return new Response('Unauthorized', { status: 401 });
    }

    const valid = await verifyPassword(password, row.password_hash as string);
    if (!valid) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (row.disabled) {
      return json({ error: 'Account is disabled' }, 403);
    }

    const sessionId = await createSession(row.id as number, env);
    const user = mapUserRow(row);

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookieHeader(sessionId),
      },
    });
  }

  // GET /api/session — check current session
  if (request.method === 'GET') {
    // Check for token query param (creates session from token)
    const token = url.searchParams.get('token');
    if (token) {
      const row = await env.DB.prepare('SELECT * FROM users WHERE token = ?').bind(token).first();
      if (row) {
        const sessionId = await createSession(row.id as number, env);
        const user = mapUserRow(row);
        return new Response(JSON.stringify(user), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': sessionCookieHeader(sessionId),
          },
        });
      }
    }

    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response('Unauthorized', { status: 404 });
    }
    return json(user);
  }

  // DELETE /api/session — logout
  if (request.method === 'DELETE') {
    const sessionId = parseSessionCookie(request);
    if (sessionId) {
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    }
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': clearSessionCookieHeader() },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function handleTokenGeneration(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { expiration?: string };
  const token = crypto.randomUUID();

  await env.DB.prepare('UPDATE users SET token = ? WHERE id = ?').bind(token, user.id).run();

  return json({ token });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
