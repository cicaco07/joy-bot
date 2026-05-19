import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  probe,
  createSession,
  promptSession,
  OpencodeApiUnavailableError,
} from '../../src/services/opencodeApiService.js';

interface StubRoute {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

function startStubServer(routes: StubRoute[]): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const route = routes.find(
        (r) => r.method === req.method && r.path === req.url,
      );
      if (route) {
        res.writeHead(route.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(route.body));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Could not get server address'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });

    server.on('error', reject);
  });
}

describe('opencodeApiService', () => {
  let server: http.Server;
  let baseUrl: string;

  const routes: StubRoute[] = [
    {
      method: 'GET',
      path: '/v2/global/health',
      status: 200,
      body: { ok: true },
    },
    {
      method: 'POST',
      path: '/v2/session',
      status: 200,
      body: { id: 'ses_test123' },
    },
    {
      method: 'POST',
      path: '/v2/session/ses_test123/message',
      status: 200,
      body: { messageId: 'msg_abc' },
    },
  ];

  beforeAll(async () => {
    const result = await startStubServer(routes);
    server = result.server;
    baseUrl = result.baseUrl;
  });

  afterAll(() => {
    server.close();
  });

  it('probe returns available:true with latencyMs when server is up', async () => {
    const result = await probe(baseUrl);
    expect(result.available).toBe(true);
    expect(result.baseUrl).toBe(baseUrl);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('probe returns available:false quickly when no server is running', async () => {
    const deadUrl = 'http://127.0.0.1:19999';
    const start = Date.now();
    const result = await probe(deadUrl);
    const elapsed = Date.now() - start;

    expect(result.available).toBe(false);
    expect(result.baseUrl).toBe(deadUrl);
    expect(typeof result.error).toBe('string');
    expect(elapsed).toBeLessThan(2000);
  });

  it('createSession + promptSession round-trip works against stub', async () => {
    const session = await createSession(baseUrl, { title: 'test session' });
    expect(session.id).toBe('ses_test123');

    const prompt = await promptSession(baseUrl, {
      sessionID: session.id,
      text: 'Hello world',
    });
    expect(prompt.messageId).toBe('msg_abc');
  });

  it('createSession throws OpencodeApiUnavailableError when server is offline', async () => {
    const deadUrl = 'http://127.0.0.1:19999';
    await expect(
      createSession(deadUrl, { title: 'will fail' }),
    ).rejects.toThrow(OpencodeApiUnavailableError);
  });
});
