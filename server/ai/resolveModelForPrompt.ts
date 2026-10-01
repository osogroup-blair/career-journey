import type { App } from "firebase-admin/app";
import type { AIProviderId } from "./types";
import { getAiDefaults } from "../aiDefaults";
import { getPromptAiConfigFor } from "../promptAiConfig";
import { PLATFORM_PROVIDERS } from "../../src/types/billing";
import { defaultAiDefaults } from "../aiDefaults";

export interface ResolvedModel {
  provider: AIProviderId;
  model: string;
  source: "byom" | "promptOverride" | "globalDefault";
}

/**
 * Precedence: an explicit per-request BYOM choice (the user is paying for
 * their own key — only `keywords`/`fitScore` pass one today) beats an admin's
 * per-prompt override, which beats the admin's global default. Both admin
 * reads are 30s-cached, so calling this per-request is cheap.
 */
export async function resolveModelForPrompt(
  app: App | null,
  promptId: string,
  byom?: { provider: AIProviderId; model?: string }
): Promise<ResolvedModel> {
  if (byom) {
    const globalDefault = await getAiDefaults(app);
    return { provider: byom.provider, model: byom.model || globalDefault.model, source: "byom" };
  }

  const promptConfig = await getPromptAiConfigFor(app, promptId);
  if (promptConfig.modelOverride) {
    if (isPlatformProvider(promptConfig.modelOverride.provider)) {
      return { ...promptConfig.modelOverride, source: "promptOverride" };
    }
    warnStaleOnce(`prompt override for "${promptId}"`, promptConfig.modelOverride.provider);
  }

  const globalDefault = await getAiDefaults(app);
  if (!isPlatformProvider(globalDefault.provider)) {
    warnStaleOnce("global AI default", globalDefault.provider);
    return { ...defaultAiDefaults(), source: "globalDefault" };
  }
  return { ...globalDefault, source: "globalDefault" };
}

function isPlatformProvider(p: AIProviderId): boolean {
  return PLATFORM_PROVIDERS.includes(p);
}

// Stored admin config written before the Oso cutover may still name a direct
// cloud provider. Those are BYOM-only now; fall back to the current platform
// default until `npm run migrate:oso` rewrites the stored docs.
const warned = new Set<string>();
function warnStaleOnce(where: string, provider: string): void {
  const key = `${where}:${provider}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[ai] ${where} names provider "${provider}", which is no longer a platform provider — using the platform default. Run \`npm run migrate:oso\` to update stored config.`);
}
