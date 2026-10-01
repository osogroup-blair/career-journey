export interface AiUsageLog {
  id: string;
  uid: string;
  timestamp: string; // ISO String
  endpoint: string; // e.g. "parse", "fitScore", "interviewPrepChat"
  featureName?: string; // e.g. "Job Parse", "Fit Analysis"
  model: string; // e.g. "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"
  provider?: string; // e.g. "gemini", "openai", "anthropic"
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isByom?: boolean;
  /** Oso only: the physical model behind the alias in `model`, when the router reports it. */
  actualModel?: string;
  /** Oso only: the router request id (see Oso Operations > Requests). */
  requestId?: string;
}

export interface UserAiUsageSummary {
  lifetimeTokensUsed: number;
  currentPeriodTokensUsed: number;
  recentLogs: AiUsageLog[];
}
