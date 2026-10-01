import { isOsoConfigured } from "./osoClient";

/**
 * Env-only fallback provider, used when there's no admin config doc to read
 * (local dev without Firebase) or no providerOverride is given. An explicit
 * AI_PLATFORM_PROVIDER ("oso" | "ollama") wins; otherwise Oso when its key is
 * configured, else local Ollama — a local model costs nothing to run, which
 * keeps the app usable with zero external services.
 */
export function platformProvider(): "oso" | "ollama" {
  const explicit = (process.env.AI_PLATFORM_PROVIDER || "").toLowerCase();
  if (explicit === "oso" || explicit === "ollama") return explicit;
  return isOsoConfigured() ? "oso" : "ollama";
}
