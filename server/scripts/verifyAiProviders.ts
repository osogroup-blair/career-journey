import dotenv from 'dotenv';
dotenv.config();

import { GeminiClient } from '../ai/geminiClient';
import { OpenAIClient } from '../ai/openaiClient';
import { AnthropicClient } from '../ai/anthropicClient';
import { KeywordsResponseSchema, FitAnalysisSchema } from '../ai/schemas';
import type { StructuredAIClient } from '../ai/types';

/**
 * Manual verification for the Phase 3 multi-provider AI abstraction — not run
 * automatically. Tests both pilot schemas (keywords: simple/flat, fitScore:
 * nested) against every provider that has a real key configured, so it's
 * safe to run with only some of GEMINI_API_KEY / OPENAI_API_KEY /
 * ANTHROPIC_API_KEY set. Usage: npx tsx server/scripts/verifyAiProviders.ts
 */
async function testClient(client: StructuredAIClient) {
  console.log(`\n=== ${client.provider} ===`);

  console.log('--- keywords (simple/flat pilot) ---');
  const keywords = await client.generateStructured({
    systemPrompt: 'You are a job-fit keyword extraction assistant. Given a job requirement and a candidate profile, extract keyword signals in the exact schema provided.',
    prompt: `Job Parse: {"requirements": ["5+ years of React experience", "Strong TypeScript skills"]}
Candidate Career Journey Context: {"skills": [{"id": "SK-1", "name": "React", "years_experience": 6}]}
Extract 1-2 keyword signals for these requirements, citing SK-1 as an evidenceRef where it applies.`,
    schema: KeywordsResponseSchema,
  });
  console.log(`Got ${keywords.length} keyword(s), schema-valid.`);

  console.log('--- fitScore (nested/complex pilot) ---');
  const fit = await client.generateStructured({
    systemPrompt: 'You are a job-fit scoring assistant. Score the candidate against the role in the exact schema provided.',
    prompt: `Job Parse: {"title": "Senior Frontend Engineer", "requirements": ["5+ years React"]}
Career Journey: {"roles": [{"id": "ROLE-1", "title": "Frontend Engineer", "years": 6}]}
Score this candidate's fit, citing ROLE-1 where relevant.`,
    schema: FitAnalysisSchema,
  });
  console.log(`Got overallVerdict "${fit.overallVerdict}", schema-valid.`);

  console.log(`PASS — ${client.provider}`);
}

async function main() {
  const clients: StructuredAIClient[] = [];
  if (process.env.GEMINI_API_KEY) clients.push(new GeminiClient(process.env.GEMINI_API_KEY));
  if (process.env.OPENAI_API_KEY) clients.push(new OpenAIClient(process.env.OPENAI_API_KEY));
  if (process.env.ANTHROPIC_API_KEY) clients.push(new AnthropicClient(process.env.ANTHROPIC_API_KEY));

  if (clients.length === 0) {
    console.error('No provider keys configured (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY) — nothing to test.');
    process.exit(1);
  }

  const failures: string[] = [];
  for (const client of clients) {
    try {
      await testClient(client);
    } catch (e: any) {
      console.error(`FAIL — ${client.provider}:`, e.message || e);
      failures.push(client.provider);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length}/${clients.length} provider(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nAll ${clients.length} configured provider(s) passed.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
