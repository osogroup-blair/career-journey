# Local Model (Ollama) Implementation Plan

2026-09-24 · for: career-journey repo

**Audience:** a junior developer (human or agent) implementing this end-to-end. **Goal:** add a fourth BYOM provider — a locally-run model via Ollama — alongside the existing Gemini/OpenAI/Anthropic providers, reusing the existing multi-provider AI abstraction.

A living copy of this plan is also kept as a Claude Doc: https://claude.ai/code/artifact/a46a1026-fc7d-45ce-ae61-8f8e5c785730 — that copy may pick up edits/comments after this file was written; treat this file as the snapshot to hand to an agent that only has repo access.

---

## What already exists (read these first)

- `server/ai/types.ts` — the `StructuredAIClient` interface every provider implements.
- `server/ai/openaiClient.ts`, `server/ai/anthropicClient.ts`, `server/ai/geminiClient.ts` — the three existing implementations. Yours will look just like these.
- `server/ai/getAIClient.ts` — `buildProviderClient()` (the switch you'll extend) and `getAIClientForRequest()` (the plan-gating logic).
- `src/types/billing.ts:14` — `AIProviderId` union type, currently `'gemini' | 'openai' | 'anthropic'`.
- `src/lib/byomKeyStorage.ts` — the browser-localStorage-only key store.
- `src/lib/aiClient.ts` — attaches `X-BYOM-*` headers to every AI request.
- `src/pages/Settings.tsx` — user-facing provider/model/key picker.
- `src/pages/AdminModels.tsx` — admin-curated list of allowed models per provider.
- `server/scripts/seedAllowedModels.ts` — seeds that admin list.
- `server.ts:181` `/api/billing/validateByomKey` — already provider-agnostic; it just calls `buildProviderClient(...)`.

---

## ⚠️ Read this before writing any code: the reachability problem

Every existing provider (Gemini/OpenAI/Anthropic) is called **from the server**, and their APIs live on the public internet, so it doesn't matter where the server itself runs. A local model is different: something like [Ollama](https://ollama.com) runs on `http://localhost:11434` — but *localhost relative to what machine?*

- **In dev** (`npm run dev` — see `package.json`), the Express server and Ollama are both on the developer's own machine, so `http://localhost:11434` from the server reaches it fine.
- **In production**, the README says this app is meant to deploy to Cloud Run (`README.md:213`). Cloud Run is a remote container — it has no way to reach a random end-user's laptop. If we call Ollama from the server, this feature **only works for self-hosted deployments** (someone running the whole app, including Ollama, on their own machine/home server/LAN), not for arbitrary users of a hosted SaaS instance.

There's a more ambitious alternative (call Ollama directly from the browser, so it always works no matter how the app is deployed), but it requires moving prompt construction out of the server (which is deliberately server-side and admin-editable today — see `getActivePrompt` in `server.ts:353`). That's a much bigger, riskier change.

**Recommendation: build the server-side version first.** It reuses 100% of the existing architecture, is a well-scoped task, and is genuinely useful (dev environments, self-hosters, privacy-conscious users running the whole stack locally). Document the Cloud Run limitation clearly so it isn't a surprise later. The browser-direct approach is included as an optional Phase 2 at the end.

---

## Decision point: should local models bypass the BYOM plan gate?

Today, `getAIClientForRequest` only honors BYOM headers for `byom_monthly`/`byom_yearly` plans (`server/ai/getAIClient.ts:54`). A local model costs the platform nothing — there's a real argument for letting **any** plan (including free) choose it, as a differentiator ("don't want to pay? run your own model for free"). This plan implements it that way, but flags the one line to change if you'd rather keep it BYOM-only.

---

## Step-by-step implementation

### Step 0 — Get Ollama running locally so you can actually test this

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
ollama serve
```

Verify it in another terminal: `curl http://localhost:11434/api/tags` should return JSON listing `llama3.2`. Do this before writing code — you'll use it to test every step below.

### Step 1 — Add `'ollama'` to the shared provider type

Edit `src/types/billing.ts:14`:

```ts
export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'ollama';
```

This one line will make TypeScript flag every place that exhaustively switches/lists providers — that's your checklist for the rest of this plan. Run `npm run lint` (which is just `tsc --noEmit`) now and after each later step to catch what still needs updating.

### Step 2 — Add the local server URL to env config

Edit `.env.example` near the other provider keys:

```bash
# OLLAMA_BASE_URL: default endpoint for the "ollama" BYOM provider when a
# user's request doesn't override it. Must be reachable from wherever this
# Express server process runs — your own machine in dev, or the same
# host/LAN in a self-hosted deployment. NOT reachable from a hosted Cloud
# Run deployment unless you also expose your own Ollama instance to it.
OLLAMA_BASE_URL="http://localhost:11434"
```

Add the same line to your local `.env`.

### Step 3 — Write `server/ai/ollamaClient.ts`

Ollama has an OpenAI-compatible endpoint, but its structured-output support there has been inconsistent across versions. Use Ollama's **native** `/api/chat` endpoint instead — it accepts a JSON Schema directly via the `format` field, which is the documented, stable way to get structured output:

```ts
import { z } from "zod";
import type { StructuredAIClient, GenerateStructuredParams } from "./types";

export class OllamaClient implements StructuredAIClient {
  readonly provider = "ollama" as const;

  constructor(private baseUrl: string, private model: string = "llama3.2") {}

  async generateStructured<T>({ systemPrompt, prompt, schema }: GenerateStructuredParams<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          format: z.toJSONSchema(schema),
          stream: false,
        }),
      });
    } catch (e: any) {
      throw new Error(`Could not reach your local model server at ${this.baseUrl} — is "ollama serve" running? (${e.message})`);
    }

    if (!response.ok) {
      throw new Error(`Local model server returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const content = data?.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response");
    }
    // Re-validate against zod like every other client — never trust a
    // model's structured-output guarantee blindly.
    return schema.parse(JSON.parse(content));
  }
}
```

Note the constructor takes a **base URL**, not an API key — local models don't need one. This is the key difference from the other three clients and it ripples through the next few steps.

### Step 4 — Wire it into `getAIClient.ts`

Edit `server/ai/getAIClient.ts`:

```ts
import { OllamaClient } from "./ollamaClient";

export function buildProviderClient(
  provider: AIProviderId,
  apiKeyOrUrl: string,
  model?: string
): StructuredAIClient {
  switch (provider) {
    case "gemini":
      return new GeminiClient(apiKeyOrUrl, model);
    case "openai":
      return new OpenAIClient(apiKeyOrUrl, model);
    case "anthropic":
      return new AnthropicClient(apiKeyOrUrl, model);
    case "ollama":
      return new OllamaClient(apiKeyOrUrl, model); // apiKeyOrUrl is the base URL here
  }
}
```

I renamed the parameter to `apiKeyOrUrl` rather than adding a whole new parameter — it keeps every existing call site working unchanged, at the cost of the name being slightly more generic. (If you'd rather keep call sites self-documenting, add a distinct `baseUrl?: string` fourth parameter instead and update the two call sites in Step 8 — either is fine, just be consistent.)

Now update `getAIClientForRequest` to (a) allow `'ollama'` for any plan per the decision above, and (b) not require an API key for it:

```ts
export async function getAIClientForRequest(req: Request): Promise<StructuredAIClient> {
  const uid = (req as any).uid as string | undefined;
  const app = getAdminApp();
  if (!app || !uid) {
    return getPlatformClient();
  }

  const billing = await getBillingState(app, uid);
  const requestedProvider = req.header("X-BYOM-Provider") as AIProviderId | undefined;

  // Local models are free to run and cost the platform nothing, so they're
  // available regardless of plan — unlike cloud BYOM, which stays gated to
  // BYOM plans below.
  if (requestedProvider === "ollama") {
    const baseUrl = req.header("X-BYOM-Local-Url") || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = req.header("X-BYOM-Model") || billing.byomModel;
    return buildProviderClient("ollama", baseUrl, model);
  }

  if (!isByomPlan(billing.plan)) {
    return getPlatformClient();
  }

  const apiKey = req.header("X-BYOM-Key");
  const provider = (req.header("X-BYOM-Provider") || billing.byomProvider) as AIProviderId | undefined;
  const model = req.header("X-BYOM-Model") || billing.byomModel;

  if (!apiKey || !provider) {
    throw new MissingByomKeyError(
      "You're on a BYOM plan but haven't added an API key yet — add one in Settings."
    );
  }
  return buildProviderClient(provider, apiKey, model);
}
```

*(If you decide against the free-for-everyone approach, delete the `if (requestedProvider === "ollama")` block and fold `'ollama'` into the normal BYOM path below it — it'll then require `isByomPlan`, and the existing `X-BYOM-Key` header can just carry the URL instead of adding `X-BYOM-Local-Url`.)*

### Step 5 — Client-side: a new header, and an optional API key

Edit `src/lib/byomKeyStorage.ts` — the stored shape needs a base URL, and the key becomes optional:

```ts
export interface StoredByomKey {
  provider: AIProviderId;
  apiKey: string;   // unused/empty string for 'ollama'
  model: string;
  baseUrl?: string; // only used for 'ollama'
}
```

Edit `src/lib/aiClient.ts:19` `byomHeaders()`:

```ts
function byomHeaders(): Record<string, string> {
  const stored = getStoredByomKey();
  if (!stored) return {};
  const headers: Record<string, string> = {
    'X-BYOM-Provider': stored.provider,
    'X-BYOM-Model': stored.model,
  };
  if (stored.provider === 'ollama') {
    if (stored.baseUrl) headers['X-BYOM-Local-Url'] = stored.baseUrl;
  } else {
    headers['X-BYOM-Key'] = stored.apiKey;
  }
  return headers;
}
```

### Step 6 — `Settings.tsx`: let the user pick "Local (Ollama)"

Edit `src/pages/Settings.tsx`:

1. Add to the provider list/labels (lines 11–15 and 124):
   ```ts
   const PROVIDER_LABEL: Record<AIProviderId, string> = {
     gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Local (Ollama)',
   };
   // and in the <select>:
   (['gemini', 'openai', 'anthropic', 'ollama'] as AIProviderId[]).map(...)
   ```
2. The "not on a BYOM plan" gate at line 96 currently blocks the whole card for non-BYOM users. Per the decision above, local models should stay visible/usable even on the free plan — so change the condition to `!onByomPlan && provider !== 'ollama'`, and let `onByomPlan` also become `isByomPlan(billing.plan) || provider === 'ollama'` for the rest of the render logic.
3. Swap the API-key input for a base-URL input when `provider === 'ollama'`:
   ```tsx
   {provider === 'ollama' ? (
     <div>
       <Label htmlFor="byom-local-url">Local server URL</Label>
       <Input id="byom-local-url" value={apiKey /* reuse state, see note below */}
         onChange={(e) => setApiKey(e.target.value)}
         placeholder="http://localhost:11434" />
       <p className="text-xs text-slate-500 mt-1">
         The address of your own Ollama server. It must be reachable from wherever
         this app's backend runs — your own machine if you're running this app locally.
       </p>
     </div>
   ) : (
     /* existing API key <Input type="password" .../> */
   )}
   ```
   Reusing the `apiKey` state field for the URL is a shortcut to avoid adding a parallel `baseUrl` state var — reasonable for a small component, but rename the state variable to something like `secretOrUrl` if you want it to read cleanly.
4. In `handleTestAndSave`, build the stored value based on provider:
   ```ts
   const value: StoredByomKey = provider === 'ollama'
     ? { provider, apiKey: '', model, baseUrl: apiKey.trim() || 'http://localhost:11434' }
     : { provider, apiKey: apiKey.trim(), model };
   ```

### Step 7 — `AdminModels.tsx` + seed script: let admins curate local model tags

Unlike cloud models, a model tag here is only usable if the person running Ollama has actually pulled it (`ollama pull llama3.3`) — the admin list is just "what shows up in the dropdown," not "what's guaranteed to work." Worth a one-line note in the UI.

Edit `src/pages/AdminModels.tsx:10-11`:
```ts
const PROVIDERS: AIProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama'];
const PROVIDER_LABEL: Record<AIProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Local (Ollama)' };
```
and the two `useState` records at lines 21–22 need an `ollama: ''` entry, and `emptyConfig()` (line 13) needs `ollama: []`.

Edit `server/scripts/seedAllowedModels.ts` — add an example set (check ollama.com/library for current tags before committing this, the same way the existing comment tells you to re-verify cloud model IDs):
```ts
ollama: [
  { id: 'llama3.3', label: 'Llama 3.3 70B', enabled: true },
  { id: 'llama3.2', label: 'Llama 3.2 3B (small/fast, default)', enabled: true },
  { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B', enabled: true },
],
```
Also confirm `AllowedModelsConfig`'s type in `src/types/aiModels.ts` (`Record<AIProviderId, AllowedModel[]>`) picks up `'ollama'` automatically from Step 1 — no change needed there, just re-run `npm run lint` to confirm.

### Step 8 — Loosen `validateByomKey` for the no-key case

Edit `server.ts:181`:
```ts
app.post("/api/billing/validateByomKey", async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body as { provider: AIProviderId; apiKey: string; model?: string };
    if (!provider || (provider !== 'ollama' && !apiKey)) {
      res.status(400).json({ valid: false, error: "provider and apiKey are required" });
      return;
    }
    const client = buildProviderClient(provider, apiKey || process.env.OLLAMA_BASE_URL || 'http://localhost:11434', model);
    ...
```
Everything below this is already generic (it just calls `client.generateStructured(...)` with a trivial schema) — no other change needed. This is a good example of why the existing abstraction was worth building.

### Step 9 — Add it to the manual verification script

Edit `server/scripts/verifyAiProviders.ts`:
```ts
import { OllamaClient } from '../ai/ollamaClient';
...
if (process.env.OLLAMA_BASE_URL) clients.push(new OllamaClient(process.env.OLLAMA_BASE_URL));
```
Run `npm run verify:ai` with `ollama serve` running — it should print `PASS — ollama` alongside whichever cloud providers you have keys for.

### Step 10 — Update docs

Add a short section to `README.md` near the BYOM section explaining: what it is, that it requires the user to run Ollama themselves, and the Cloud Run reachability caveat from the top of this plan. Update `.env.example` (done in Step 2) so a new dev sees `OLLAMA_BASE_URL` immediately.

---

## Testing checklist

1. `npm run lint` passes with no leftover `AIProviderId` exhaustiveness errors.
2. With `ollama serve` running and `llama3.2` pulled: go to Settings → pick "Local (Ollama)" → leave URL as default → Test & Save → should succeed.
3. Run a real flow end-to-end (e.g. paste a JD and let it parse) and confirm in your terminal running `ollama serve` that a request actually landed there — this proves the wiring, not just the validate endpoint.
4. Stop `ollama serve`, retry the same flow, confirm you get the friendly "Could not reach your local model server…" message, not a raw 500 or stack trace.
5. As a free-plan test user, confirm you can still select and use "Local (Ollama)" (if you kept the free-for-everyone decision) while cloud BYOM providers stay correctly blocked for you.
6. In Admin → Models, disable a model tag and confirm it disappears from the Settings dropdown immediately (this path is unchanged, just confirm `'ollama'` behaves like the other three).
7. `npm run verify:ai` with `OLLAMA_BASE_URL` set passes.

---

## Optional Phase 2 (not required for MVP): browser-direct local calls

If you later want local models to work for *any* user of the hosted SaaS (not just self-hosters), the real fix is to stop routing the actual inference call through the server at all: have the server's `/api/ai/*` routes return `{ systemPrompt, prompt, schema }` for `provider === 'ollama'` instead of calling `generateStructured` themselves, and have the browser call the user's own `http://localhost:11434` directly (Ollama supports CORS via `OLLAMA_ORIGINS`). This is bigger — it needs the zod schemas in `server/ai/schemas.ts` to become importable from client code, and each of the ~15 route handlers in `server.ts` to grow a branch. Worth doing later if local-model adoption is real; not worth it for a first version.
