import dotenv from 'dotenv';
dotenv.config();

import { createLegacyGenAI } from '../ai/legacyGenAIShim';
import { LEGACY_RESPONSE_SCHEMAS } from '../ai/legacySchemas';
import { OsoClient } from '../ai/osoClient';
import { KeywordsResponseSchema, FitAnalysisSchema } from '../ai/schemas';
import { SAMPLE_INPUTS, renderSampleContents } from '../ai/promptSampleInputs';
import { DEFAULT_PROMPTS } from '../promptStore';
import { osoAliasForPrompt } from '../ai/osoAliasMap';

/**
 * Manual verification for the Oso router integration — not run automatically.
 * For every prompt with sample input, sends the sample to that prompt's
 * mapped alias through the exact platform code path (OsoClient for the two Zod
 * endpoints, the legacy shim for the rest) and checks the reply parses as JSON
 * (and against the Zod schema where one exists), VERIFY_CONCURRENCY at a time (default 1 — the router returns routing_failed for some prompts under 4x concurrency). Prints alias -> actual model,
 * latency and tokens. Usage: npm run verify:oso [-- promptId ...]
 */
async function main() {
  if (!process.env.OSO_AI_API_KEY) {
    console.error('OSO_AI_API_KEY is not set in .env.');
    process.exit(1);
  }
  const only = process.argv.slice(2);
  const ids = Object.keys(SAMPLE_INPUTS).filter((id) => (only.length ? only.includes(id) : true));
  let failed = 0;
  const concurrency = Number(process.env.VERIFY_CONCURRENCY || 1);

  const runOne = async (id: string) => {
    const alias = osoAliasForPrompt(id);
    const started = Date.now();
    try {
      let actual: string | undefined, tokens: number, note = '';
      if (id === 'keywords' || id === 'fitScore') {
        const client = new OsoClient(alias);
        const schema = id === 'keywords' ? KeywordsResponseSchema : FitAnalysisSchema;
        const contents = renderSampleContents(id, '', DEFAULT_PROMPTS[id].template);
        const r = await client.generateStructured({ systemPrompt: 'Respond in the exact schema provided.', prompt: contents, schema: schema as any });
        actual = r.actualModel; tokens = r.usage.totalTokens; note = 'zod-valid';
      } else {
        const client = createLegacyGenAI("oso", alias);
        const schema = LEGACY_RESPONSE_SCHEMAS[id];
        const contents = renderSampleContents(id, '', DEFAULT_PROMPTS[id].template);
        const r = await client.models.generateContent({
          model: alias,
          contents,
          config: schema ? { responseMimeType: 'application/json', responseSchema: schema as any } : undefined,
        });
        if (schema) JSON.parse(r.text);
        actual = r.actualModel; tokens = r.usageMetadata.totalTokenCount; note = schema ? 'json-valid' : 'text';
      }
      console.log(`PASS ${id.padEnd(24)} ${alias.padEnd(14)} -> ${(actual || 'n/a').padEnd(24)} ${String(Date.now() - started).padStart(6)}ms ${String(tokens).padStart(6)} tok ${note}`);
    } catch (e: any) {
      failed++;
      console.log(`FAIL ${id.padEnd(24)} ${alias.padEnd(14)} ${e.name === 'OsoRouterError' ? `${e.code} (req ${e.requestId})` : e.message}`);
    }
  };

  const queue = [...ids];
  await Promise.all(Array.from({ length: concurrency }, async () => { for (let id = queue.shift(); id; id = queue.shift()) await runOne(id); }));
  console.log(`\n${ids.length - failed}/${ids.length} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
