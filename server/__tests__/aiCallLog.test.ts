import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'firebase-admin/app';

const mockAdd = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ add: mockAdd }) }),
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
}));

import { configureAiCallLog, instrumentLegacyClient, instrumentStructuredClient, formatAiCallLine } from '../aiCallLog';
import { OsoRouterError } from '../ai/osoClient';
import type { LegacyGenAI } from '../ai/legacyGenAIShim';
import type { StructuredAIClient } from '../ai/types';

const ctx = { promptId: 'liteScan', provider: 'oso' as const, model: 'oso/fast', source: 'promptOverride' as const, uid: 'user-1' };

describe('aiCallLog', () => {
  beforeEach(() => {
    mockAdd.mockReset().mockResolvedValue({});
    configureAiCallLog(() => ({}) as App);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('records a successful legacy call with the router metadata and no undefined fields', async () => {
    const inner: LegacyGenAI = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: '{}',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          requestId: 'req-1',
        }),
      },
    };
    const result = await instrumentLegacyClient(inner, ctx).models.generateContent({ model: 'oso/fast', contents: 'hi' });

    expect(result.text).toBe('{}');
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const doc = mockAdd.mock.calls[0][0];
    expect(doc).toMatchObject({ promptId: 'liteScan', model: 'oso/fast', source: 'promptOverride', ok: true, totalTokens: 15, requestId: 'req-1', uid: 'user-1' });
    expect(Object.values(doc)).not.toContain(undefined);
    expect(doc).not.toHaveProperty('actualModel');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[ai-call] liteScan oso/fast (oso, promptOverride)'));
  });

  it('records a failed call with the router error code and request id, then rethrows', async () => {
    const err = new OsoRouterError('slow down', 429, 'rate_limited', 'req-err');
    const inner: LegacyGenAI = { models: { generateContent: vi.fn().mockRejectedValue(err) } };

    await expect(instrumentLegacyClient(inner, ctx).models.generateContent({ model: 'oso/fast', contents: 'hi' })).rejects.toBe(err);
    expect(mockAdd.mock.calls[0][0]).toMatchObject({ ok: false, errorCode: 'rate_limited', errorMessage: 'slow down', requestId: 'req-err', totalTokens: 0 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ERROR rate_limited: slow down'));
  });

  it('records structured calls using the model the client reports', async () => {
    const inner: StructuredAIClient = {
      provider: 'oso',
      model: 'oso/reasoning',
      generateStructured: vi.fn().mockResolvedValue({
        data: { ok: true },
        usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        model: 'oso/reasoning',
        actualModel: 'some-physical-model',
      }),
    };
    const client = instrumentStructuredClient(inner, { promptId: 'fitScore', source: 'globalDefault' });
    expect(client.provider).toBe('oso');
    await client.generateStructured({ systemPrompt: '', prompt: '', schema: {} as any });
    expect(mockAdd.mock.calls[0][0]).toMatchObject({ promptId: 'fitScore', provider: 'oso', model: 'oso/reasoning', actualModel: 'some-physical-model', totalTokens: 7 });
  });

  it('still logs to the console when Firestore is not configured', async () => {
    configureAiCallLog(() => null);
    const inner: LegacyGenAI = { models: { generateContent: vi.fn().mockResolvedValue({ text: 'x', usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } }) } };
    await instrumentLegacyClient(inner, ctx).models.generateContent({ model: 'oso/fast', contents: 'hi' });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it('shows requested -> actual model in the log line only when they differ', () => {
    const base = { timestamp: '', promptId: 'p', provider: 'oso' as const, model: 'oso/fast', durationMs: 5, ok: true, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    expect(formatAiCallLine({ ...base, actualModel: 'm1' })).toContain('oso/fast -> m1');
    expect(formatAiCallLine({ ...base, actualModel: 'oso/fast' })).not.toContain('->');
  });
});
