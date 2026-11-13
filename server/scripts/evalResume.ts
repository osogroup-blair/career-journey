import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';

dotenv.config({ quiet: true });
// Env-default platform models only, and no SQLite: admin per-prompt model
// overrides and careerJourneyFields selections are NOT applied, and nothing
// is read from or written to any user's data.


/**
 * Tailored-resume eval (resume-quality-plan.md Phase 0). Runs parse →
 * keywords → resumeStrategy → generateResume in-process with the same prompt
 * construction as the routes (server/resumePipelinePrompts.ts), then scores
 * the result. Also scores any plain-text resume (e.g. `pdftotext` output) so
 * hand-made or older resumes can be compared on the same term list.
 *
 *   npm run eval:resume -- --cj ~/cj.json --jd server/scripts/fixtures/blitzy.jd.txt \
 *     --options server/scripts/fixtures/blitzy.options.json --terms server/scripts/fixtures/blitzy.terms.json
 *   npm run eval:resume -- --cj ~/cj.json --terms <terms.json> --score-text resume.txt
 *
 * Flags:
 *   --cj <path>          Career Journey JSON (required)
 *   --jd <path>          JD text (required unless --score-text)
 *   --company/--role     Passed to parse
 *   --options <path>     ResumeBuildOptions JSON, or { pageTarget, full: [], condensed: [] } (others excluded)
 *   --terms <path>       { "label": ["regex", ...] } hand-curated JD term list
 *   --reuse <dir>        Reuse parse.json + keywords.json from an earlier run (same keywords, fair A/B)
 *   --out <dir>          Output directory (default: $TMPDIR/career-journey-eval/<timestamp>)
 *   --score-text <path>  Skip the AI; just score this resume text against --terms
 */

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[++i];
  }
  return out;
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function normText(t: string): string {
  return t.toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ');
}

function termCoverage(terms: Record<string, string[]>, resumeText: string, cjText: string) {
  const r = normText(resumeText);
  const c = normText(cjText);
  const hit = (text: string, pats: string[]) => pats.some((p) => new RegExp(p, 'i').test(text));
  const rows = Object.entries(terms).map(([label, pats]) => ({ label, inResume: hit(r, pats), inCareerJourney: hit(c, pats) }));
  return {
    covered: rows.filter((x) => x.inResume).length,
    total: rows.length,
    missedButSupported: rows.filter((x) => !x.inResume && x.inCareerJourney).map((x) => x.label),
    usedButNotInCareerJourney: rows.filter((x) => x.inResume && !x.inCareerJourney).map((x) => x.label),
  };
}

/** Numbers (%, $, counts with +, multiples) in the resume that appear nowhere in the Career Journey — invented-metric candidates. Years and single digits are skipped. */
function numbersNotInCareerJourney(resume: any, cjText: string): string[] {
  const { earlierExperience: _e, education: _ed, contactInfo: _c, ...body } = resume || {};
  const squash = (t: string) => t.toLowerCase().replace(/[\u00a0\u202f\s]+/g, '');
  const cj = squash(cjText);
  const found = new Set<string>();
  for (const m of JSON.stringify(body).replace(/[\u00a0\u202f]/g, ' ').toLowerCase().matchAll(/\$?\d[\d,.]*\s?(?:%|m\b|k\b|x\b|\+)?/g)) {
    const tok = m[0].trim().replace(/[.,]+$/, '');
    if (/^(19|20)\d\d$/.test(tok) || /^\d$/.test(tok)) continue;
    const t = squash(tok);
    if (![t, t.replace(/^\$/, ''), t.replace(/%$/, 'percent')].some((v) => v && cj.includes(v))) found.add(tok);
  }
  return [...found].sort();
}

function buildOptions(raw: any, careerJourney: any, normalize: (raw: any, cj: any) => any) {
  if (!raw) return normalize(undefined, careerJourney);
  if (!Array.isArray(raw.full)) return normalize(raw, careerJourney);
  const roles: Record<string, { mode: string }> = {};
  for (const role of careerJourney.roles || []) {
    roles[role.id] = { mode: raw.full.includes(role.id) ? 'full' : (raw.condensed || []).includes(role.id) ? 'condensed' : 'excluded' };
  }
  return normalize({ pageTarget: raw.pageTarget ?? 2, roles, guidance: raw.guidance, format: raw.format }, careerJourney);
}

async function main() {
  const a = args();
  if (!a.cj) throw new Error('--cj <career journey json> is required');
  const careerJourney = readJson(a.cj);
  const cjText = JSON.stringify(careerJourney);
  const terms = a.terms ? readJson(a.terms) : null;

  if (a['score-text']) {
    if (!terms) throw new Error('--score-text needs --terms');
    const text = fs.readFileSync(a['score-text'], 'utf8');
    console.log(JSON.stringify({ file: a['score-text'], words: text.split(/\s+/).filter(Boolean).length, terms: termCoverage(terms, text, cjText) }, null, 2));
    return;
  }
  if (!a.jd) throw new Error('--jd <job description text> is required');

  const { countTokens } = await import('gpt-tokenizer');
  const { resolveModelForPrompt } = await import('../ai/resolveModelForPrompt');
  const { createLegacyGenAI } = await import('../ai/legacyGenAIShim');
  const { LEGACY_RESPONSE_SCHEMAS } = await import('../ai/legacySchemas');
  const { getAIClientForRequest } = await import('../ai/getAIClient');
  const { KeywordsResponseSchema } = await import('../ai/schemas');
  const P = await import('../resumePipelinePrompts');
  const RB = await import('../../src/lib/resumeBuild');
  const { keywordUse } = await import('../../src/lib/resumeKeywordPlan');
  const { cleanKeywordBreakdown, averagePhraseWords } = await import('../../src/lib/keywordList');
  const { scoreResumeKeywords, resumeToPlainText, containsAny, normalize } = await import('../../src/lib/resumeScore');
  const { segmentJdText } = await import('../../src/lib/jdSegments');

  const out = a.out || path.join(os.tmpdir(), 'career-journey-eval', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(out, { recursive: true });
  const save = (name: string, data: unknown) => fs.writeFileSync(path.join(out, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  const tokens: Record<string, number> = {};

  async function legacy(promptId: string, contents: string, extra: Record<string, unknown> = {}) {
    tokens[promptId] = countTokens(contents);
    const resolved = await resolveModelForPrompt(null, promptId);
    const client = createLegacyGenAI(resolved.provider, resolved.model);
    const started = Date.now();
    const response = await client.models.generateContent({
      model: resolved.model,
      contents,
      config: { responseMimeType: 'application/json', responseSchema: (LEGACY_RESPONSE_SCHEMAS as any)[promptId], ...extra },
    });
    console.error(`${promptId}: ${resolved.provider}/${resolved.model}, ${tokens[promptId]} prompt tokens, ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return JSON.parse(response.text!);
  }

  const jdText = fs.readFileSync(a.jd, 'utf8');
  let parse: any;
  let keywords: any[];
  if (a.reuse) {
    parse = readJson(path.join(a.reuse, 'parse.json'));
    keywords = cleanKeywordBreakdown(readJson(path.join(a.reuse, 'keywords.json')));
    console.error(`Reusing parse + ${keywords.length} keywords from ${a.reuse}`);
  } else {
    parse = { ...(await legacy('parse', await P.parseContents(null, { jdText, company: a.company, roleTitle: a.role }))), jdSegments: segmentJdText(jdText) };
    const client = await getAIClientForRequest({ header: () => undefined } as any, 'keywords');
    const kwPrompt = await P.keywordsPrompt(null, { parse, careerJourney, jdSegments: parse.jdSegments });
    tokens.keywords = countTokens(kwPrompt.systemPrompt + kwPrompt.prompt);
    const started = Date.now();
    const { data } = await client.generateStructured({ ...kwPrompt, schema: KeywordsResponseSchema });
    console.error(`keywords: ${tokens.keywords} prompt tokens, ${((Date.now() - started) / 1000).toFixed(1)}s`);
    keywords = cleanKeywordBreakdown(data as any[]);
  }
  save('parse.json', parse);
  save('keywords.json', keywords);

  const options = buildOptions(a.options ? readJson(a.options) : null, careerJourney, RB.normalizeResumeBuildOptions);
  save('options.json', options);
  const base = { parse, careerJourney, contextEntries: {}, keywords, options };
  const strategy = await legacy('resumeStrategy', await P.resumeStrategyContents(null, base));
  save('strategy.json', strategy);
  const raw = await legacy('generateResume', await P.generateResumeContents(null, { ...base, strategy }), { thinkingConfig: { thinkingBudget: 1024 } });
  save('raw-resume.json', raw);
  save('keywordPlan.json', raw.keywordPlan ?? []);
  const { resume, warnings } = RB.enforceResumeConstraints(P.withoutKeywordPlan(raw), options, careerJourney, keywords, strategy);
  save('resume.json', resume);

  const text = resumeToPlainText(resume, strategy.headerTagline);
  save('resume.txt', text);
  const normalizedCj = normalize(cjText);
  const allBullets = (resume.experience || []).flatMap((e: any) => e.bullets || []);
  const metrics = {
    out,
    promptTokens: tokens,
    words: text.split(/\s+/).filter(Boolean).length,
    bullets: { total: allBullets.length, withoutEvidence: allBullets.filter((b: any) => !(b?.evidenceRefs?.length)).length },
    perRole: (resume.experience || []).map((e: any) => `${e.roleId} ${e.company}: ${e.bullets.length} bullets, ${e.dates}`),
    keywordGate: (() => {
      const s = scoreResumeKeywords(resume, strategy.headerTagline, keywords, parse);
      return { score: s.score, passed: s.passed, missing: s.missingKeywords };
    })(),
    keywordCount: keywords.length,
    keywordPhraseWords: +averagePhraseWords(keywords).toFixed(1),
    numbersNotInCareerJourney: numbersNotInCareerJourney(resume, cjText),
    unsupportedKeywordsUsed: keywords
      .filter((k) => keywordUse(k) === 'omit' || keywordUse(k) === 'if-supported')
      .filter((k) => containsAny(normalize(text), [k.phrase, ...(k.aliases || [])]) && !containsAny(normalizedCj, [k.phrase, ...(k.aliases || [])]))
      .map((k) => k.phrase),
    terms: terms ? termCoverage(terms, text, cjText) : undefined,
    enforcementWarnings: warnings,
  };
  save('metrics.json', metrics);
  console.log(JSON.stringify(metrics, null, 2));
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
