import type { App } from "firebase-admin/app";
import type { AIProviderId } from "./types";
import { getAiDefaults } from "../aiDefaults";
import { getPromptAiConfigFor } from "../promptAiConfig";

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
    return { ...promptConfig.modelOverride, source: "promptOverride" };
  }

  const globalDefault = await getAiDefaults(app);
  return { ...globalDefault, source: "globalDefault" };
}
