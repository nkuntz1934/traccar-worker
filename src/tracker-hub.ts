import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

export class TrackerHub extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Auto-respond to '{}' keep-alive pings without waking from hibernation
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{}', '{}'),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      // WebSocket upgrade for client connections
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const userId = url.searchParams.get('userId') || '0';
      this.ctx.acceptWebSocket(server, [`user:${userId}`]);
      server.serializeAttachment({ userId: parseInt(userId) });

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/broadcast') {
      // Internal endpoint: broadcast position updates to all connected clients
      const data = await request.text();
      const sockets = this.ctx.getWebSockets();
      for (const ws of sockets) {
        try {
          ws.send(data);
        } catch {
          // Client disconnected, ignore
        }
      }
      return new Response('ok');
    }

    return new Response('Not Found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // The auto-response handles '{}' pings.
    // Other messages (e.g. {logs: true}) are handled here.
    if (typeof message === 'string') {
      try {
        const data = JSON.parse(message);
        if ('logs' in data) {
          const attachment = (ws.deserializeAttachment() as Record<string, unknown>) || {};
          attachment.logs = data.logs;
          ws.serializeAttachment(attachment);
        }
      } catch {
        // Ignore malformed messages
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    try {
      ws.close(1011, 'Internal error');
    } catch {
      // Already closed
    }
  }
}
