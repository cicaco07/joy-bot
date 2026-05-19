export class OpencodeApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'OpencodeApiError';
  }
}

export class OpencodeApiUnavailableError extends OpencodeApiError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'OpencodeApiUnavailableError';
  }
}

export interface ProbeResult {
  available: boolean;
  baseUrl: string;
  latencyMs?: number;
  error?: string;
}

export interface CreateSessionInput {
  title: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
  mode?: string;
}

export interface PromptInput {
  sessionID: string;
  text: string;
  async?: boolean;
}

export interface CommandInput {
  sessionID: string;
  command: string;
  arguments?: Record<string, unknown> | string;
}

function isConnectionRefused(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('econnrefused') ||
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('connect')
    );
  }
  return false;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const attempt = async (): Promise<Response> => {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (isConnectionRefused(err)) {
        throw new OpencodeApiUnavailableError(
          `opencode server unavailable at ${url}`,
          err,
        );
      }
      throw new OpencodeApiError(`Network error fetching ${url}`, err);
    }
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof OpencodeApiUnavailableError) throw err;
    await new Promise((r) => setTimeout(r, 500));
    return attempt();
  }
}

async function apiFetch<T>(
  serverUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${serverUrl.replace(/\/$/, '')}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetchWithRetry(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OpencodeApiError(
      `opencode API error ${res.status} ${res.statusText}: ${body}`,
    );
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export async function probe(serverUrl: string): Promise<ProbeResult> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v2/global/health`, {
      signal: AbortSignal.timeout(1500),
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { available: true, baseUrl, latencyMs };
    }
    return {
      available: false,
      baseUrl,
      latencyMs,
      error: `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    return { available: false, baseUrl, latencyMs, error };
  }
}

export async function createSession(
  serverUrl: string,
  input: CreateSessionInput,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(serverUrl, '/v2/session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function promptSession(
  serverUrl: string,
  input: PromptInput,
): Promise<{ messageId?: string }> {
  const { sessionID, text, async: isAsync } = input;
  return apiFetch<{ messageId?: string }>(
    serverUrl,
    `/v2/session/${encodeURIComponent(sessionID)}/message`,
    {
      method: 'POST',
      body: JSON.stringify({ text, async: isAsync }),
    },
  );
}

export async function commandSession(
  serverUrl: string,
  input: CommandInput,
): Promise<unknown> {
  const { sessionID, command, arguments: args } = input;
  return apiFetch<unknown>(
    serverUrl,
    `/v2/session/${encodeURIComponent(sessionID)}/command`,
    {
      method: 'POST',
      body: JSON.stringify({ command, arguments: args }),
    },
  );
}

export async function abortSession(
  serverUrl: string,
  sessionID: string,
): Promise<void> {
  await apiFetch<unknown>(
    serverUrl,
    `/v2/session/${encodeURIComponent(sessionID)}/abort`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function listSessions(
  serverUrl: string,
): Promise<{ id: string; title: string; createdAt: string }[]> {
  return apiFetch<{ id: string; title: string; createdAt: string }[]>(
    serverUrl,
    '/v2/session',
    { method: 'GET' },
  );
}
