import { describe, it, expect, vi } from 'vitest';

// Only liteScan has a saved override file; it stores template/version/updatedAt and nothing else.
vi.mock('fs', () => {
  const isOverride = (p: string) => p.endsWith('liteScan.json');
  const fsMock = {
    existsSync: (p: string) => isOverride(String(p)),
    readFileSync: () => JSON.stringify({ id: 'liteScan', template: 'custom template', updatedAt: '2026-10-06T00:00:00.000Z', version: 3 }),
  };
  return { default: fsMock, ...fsMock };
});

import { getAllPromptConfigs, DEFAULT_PROMPTS } from '../promptStore';

describe('getAllPromptConfigs', () => {
  it('keeps label, description and stage for a prompt with a saved override', () => {
    const lite = getAllPromptConfigs().liteScan;
    expect(lite).toMatchObject({
      id: 'liteScan',
      label: DEFAULT_PROMPTS.liteScan.label,
      description: DEFAULT_PROMPTS.liteScan.description,
      stage: DEFAULT_PROMPTS.liteScan.stage,
      template: 'custom template',
      version: 3,
      updatedAt: '2026-10-06T00:00:00.000Z',
    });
  });

  it('returns the built-in default for prompts without an override', () => {
    expect(getAllPromptConfigs().parse).toMatchObject({ label: DEFAULT_PROMPTS.parse.label, template: DEFAULT_PROMPTS.parse.template, version: 0, updatedAt: null });
  });
});
