import { AIProviderId } from './billing';

export interface AllowedModel {
  id: string;
  label: string;
  enabled: boolean;
}

/** Shape of the config/allowedModels Firestore doc — admin-write-only (Phase 5), every signed-in user can read it. */
export type AllowedModelsConfig = Record<AIProviderId, AllowedModel[]>;
