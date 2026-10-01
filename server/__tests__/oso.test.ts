import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

vi.mock('../firebaseAdmin', () => ({ getAdminApp: () => ({}) }));
vi.mock('../billing', () => ({ getBillingState: vi.fn(async () => ({ plan: 'byom_monthly' })) }));
vi.mock('../ai/resolveModelForPrompt', () => ({ resolveModelForPrompt: vi.fn(async () => ({ provider: 'oso', model: 'oso/general', source: 'globalDefault' })) }));

import { OsoClient, OsoRouterError, OsoInvalidJsonError, osoRoutingFields, withOsoRetry, extractJson } from '../ai/osoClient';
import { platformProvider } from '../ai/platformProvider';
import { buildProviderClient, getAIClientForRequest, MissingByomKeyError } from '../ai/getAIClient';
import { createLegacyGenAI } from '../ai/legacyGenAIShim';
import { validateAiDefaultsUpdate } from '../aiDefaults';
import { validatePromptAiConfigUpdate } from '../promptAiConfig';

const ENV_KEYS = ['OSO_AI_API_KEY', 'OSO_ROUTER_URL', 'OSO_DATA_CLASSIFICATION', 'AI_PLATFORM_PROVIDER'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.OSO_AI_API_KEY = 'oso_test_key';
  process.env.OSO_ROUTER_URL = 'https://router.test';
  delete process.env.OSO_DATA_CLASSIFICATION;
  delete process.env.AI_PLATFORM_PROVIDER;
});
afterEach(() => {
  for (const k of ENV_KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const okBody = {
  id: 'x', object: 'chat.completion', created: 1, model: 'oso/general',
  choices: [{ index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe('OsoClient', () => {
  it('posts to the router with the bearer key, alias, json_schema and confidential routing', async () => {
    const fetchMock = mockFetch(200, okBody, { 'x-request-id': 'req-1', 'x-oso-actual-model': 'gpt-oss-120b' });
    const result = await new OsoClient('oso/general').generateStructured({
      systemPrompt: 'sys', prompt: 'user', schema: z.object({ ok: z.boolean() }),
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://router.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization ?? (init.headers as any).get?.('authorization')).toBe('Bearer oso_test_key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('oso/general');
    // No capability-triggering fields: JSON is requested in the prompt, not via response_format/tools/task_type.
    expect(body).not.toHaveProperty('response_format');
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('routing');
    expect(body.messages[0].content).toContain('JSON Schema');

    expect(result.data).toEqual({ ok: true });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(result.actualModel).toBe('gpt-oss-120b');
    expect(result.requestId).toBe('req-1');
  });

  it('accepts fenced or prose-wrapped JSON replies', async () => {
    const fenced = { ...okBody, choices: [{ index: 0, message: { role: 'assistant', content: 'Sure!\n```json\n{"ok":true}\n```' }, finish_reason: 'stop' }] };
    mockFetch(200, fenced);
    const r = await new OsoClient('oso/general').generateStructured({ systemPrompt: 's', prompt: 'p', schema: z.object({ ok: z.boolean() }) });
    expect(r.data).toEqual({ ok: true });
  });

  it('sends routing only when OSO_DATA_CLASSIFICATION is set', () => {
    expect(osoRoutingFields()).toEqual({});
    process.env.OSO_DATA_CLASSIFICATION = 'internal';
    expect(osoRoutingFields()).toEqual({ routing: { data_classification: 'internal' } });
  });

  it('turns the router error envelope into an OsoRouterError', async () => {
    mockFetch(403, { error: { message: 'nope', type: 'classification_not_permitted', code: 'classification_not_permitted', request_id: 'req-9' } });
    const p = new OsoClient('oso/general').generateStructured({ systemPrompt: 's', prompt: 'p', schema: z.object({}) });
    await expect(p).rejects.toBeInstanceOf(OsoRouterError);
    await expect(p).rejects.toMatchObject({ status: 403, code: 'classification_not_permitted', requestId: 'req-9' });
  });

  it('fails clearly when OSO_AI_API_KEY is missing', () => {
    delete process.env.OSO_AI_API_KEY;
    expect(() => new OsoClient('oso/general')).toThrow(/OSO_AI_API_KEY is not configured/);
  });
});

describe('retry policy', () => {
  const noSleep = async () => {};

  it('retries once on a 5xx router error and returns the second result', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new OsoRouterError('x', 503, 'routing_failed')).mockResolvedValueOnce('ok');
    await expect(withOsoRetry(fn, noSleep)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries once on invalid JSON or a Zod mismatch, but gives up after the second failure', async () => {
    const fn = vi.fn().mockRejectedValue(new OsoInvalidJsonError());
    await expect(withOsoRetry(fn, noSleep)).rejects.toBeInstanceOf(OsoInvalidJsonError);
    expect(fn).toHaveBeenCalledTimes(2);
    const zodFn = vi.fn().mockImplementationOnce(async () => z.object({ a: z.string() }).parse({})).mockResolvedValueOnce('fixed');
    await expect(withOsoRetry(zodFn, noSleep)).resolves.toBe('fixed');
  });

  it('does not retry policy/auth errors', async () => {
    const fn = vi.fn().mockRejectedValue(new OsoRouterError('x', 403, 'classification_not_permitted'));
    await expect(withOsoRetry(fn, noSleep)).rejects.toBeInstanceOf(OsoRouterError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('OsoClient re-asks once when the first reply is not JSON', async () => {
    const bad = { ...okBody, choices: [{ index: 0, message: { role: 'assistant', content: 'I cannot do that' }, finish_reason: 'stop' }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(bad), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await new OsoClient('oso/fast').generateStructured({ systemPrompt: 's', prompt: 'p', schema: z.object({ ok: z.boolean() }) });
    expect(r.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('extractJson handles fences and surrounding prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Here you go: [1,2] done')).toBe('[1,2]');
    expect(() => extractJson('no json here')).toThrow(OsoInvalidJsonError);
  });
});

describe('legacy shim', () => {
  it('sends routing and returns Oso metadata', async () => {
    const fetchMock = mockFetch(200, okBody, { 'x-request-id': 'req-2', 'x-oso-actual-model': 'gemini-3.5-flash' });
    const client = createLegacyGenAI('oso', 'oso/fast');
    const r = await client.models.generateContent({ model: 'oso/fast', contents: 'hi' });
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body).not.toHaveProperty('response_format');
    expect(body).not.toHaveProperty('routing');
    expect(r.text).toBe('{"ok":true}');
    expect(r.usageMetadata.totalTokenCount).toBe(15);
    expect(r.actualModel).toBe('gemini-3.5-flash');
    expect(r.requestId).toBe('req-2');
  });

  it.each(['gemini', 'openai', 'anthropic'] as const)('refuses direct provider %s for platform traffic', (p) => {
    expect(() => createLegacyGenAI(p, 'm')).toThrow(/no longer supported/);
  });
});

describe('provider selection', () => {
  it('defaults to oso when keyed, ollama when not, and respects an explicit setting', () => {
    expect(platformProvider()).toBe('oso');
    delete process.env.OSO_AI_API_KEY;
    expect(platformProvider()).toBe('ollama');
    process.env.OSO_AI_API_KEY = 'k';
    process.env.AI_PLATFORM_PROVIDER = 'ollama';
    expect(platformProvider()).toBe('ollama');
    process.env.AI_PLATFORM_PROVIDER = 'gemini'; // retired value is ignored
    expect(platformProvider()).toBe('oso');
  });
});

describe('BYOM boundary', () => {
  it('buildProviderClient refuses oso', () => {
    expect(() => buildProviderClient('oso', 'anything')).toThrow(MissingByomKeyError);
  });

  it('rejects X-BYOM-Provider: oso on a request', async () => {
    const headers: Record<string, string> = { 'X-BYOM-Provider': 'oso', 'X-BYOM-Key': 'k' };
    const req = { uid: 'u1', header: (n: string) => headers[n] } as any;
    await expect(getAIClientForRequest(req, 'keywords')).rejects.toBeInstanceOf(MissingByomKeyError);
  });

  it('gives a non-BYOM request the platform Oso client', async () => {
    const { getBillingState } = await import('../billing');
    (getBillingState as any).mockResolvedValueOnce({ plan: 'free' });
    const client = await getAIClientForRequest({ uid: 'u1', header: () => undefined } as any, 'keywords');
    expect(client.provider).toBe('oso');
    expect(client.model).toBe('oso/general');
  });
});

describe('admin config validation', () => {
  it('accepts oso and ollama, rejects direct cloud providers', () => {
    expect(() => validateAiDefaultsUpdate({ provider: 'oso', model: 'oso/general' })).not.toThrow();
    expect(() => validateAiDefaultsUpdate({ provider: 'ollama', model: 'qwen3:14b' })).not.toThrow();
    for (const p of ['gemini', 'openai', 'anthropic']) {
      expect(() => validateAiDefaultsUpdate({ provider: p, model: 'm' })).toThrow(/Unknown provider/);
      expect(() => validatePromptAiConfigUpdate('parse', { modelOverride: { provider: p, model: 'm' } })).toThrow(/Unknown provider/);
    }
  });
});
