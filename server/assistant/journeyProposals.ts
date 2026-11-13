import { z } from "zod";
import { DomainError, id } from "../agent/contracts";
import { hash, required, type Repository } from "../agent/repository";
import { CareerJourneySchema } from "../../src/types/careerJourney";
import {
  produceJourney,
  addRole,
  updateRole,
  addAchievement,
  updateAchievement,
  addSkill,
  updateSkill,
  findRole,
} from "../../src/lib/journeyMutations";
import { computeNextVersion } from "../../src/lib/careerJourneyIds";
import { proposalsEnabled } from "./contracts";
const field = z.string().max(4000);
const role = z
  .object({
    organization: field.optional(),
    title: field.optional(),
    description: field.optional(),
    start_date: field.optional(),
    end_date: field.optional(),
    location: field.optional(),
  })
  .strict();
const achievement = z
  .object({
    title: field.optional(),
    description: field.optional(),
    category: field.optional(),
  })
  .strict();
const skill = z
  .object({
    name: field.optional(),
    category: field.optional(),
    description: field.optional(),
    proficiency: field.optional(),
    last_used: field.optional(),
  })
  .strict();
export const proposalSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    operations: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("add_role"), fields: role }).strict(),
          z
            .object({ kind: z.literal("update_role"), id, fields: role })
            .strict(),
          z
            .object({
              kind: z.literal("add_achievement"),
              fields: achievement,
              roleIds: z.array(id).max(20),
            })
            .strict(),
          z
            .object({
              kind: z.literal("update_achievement"),
              id,
              fields: achievement,
            })
            .strict(),
          z.object({ kind: z.literal("add_skill"), fields: skill }).strict(),
          z
            .object({ kind: z.literal("update_skill"), id, fields: skill })
            .strict(),
        ]),
      )
      .min(1)
      .max(10),
  })
  .strict();
export function applyRecipes(
  journey: any,
  input: z.infer<typeof proposalSchema>,
) {
  const result = produceJourney(journey, (draft, ids) => {
    for (const op of input.operations) {
      if (op.kind === "add_role") addRole(draft, ids, op.fields);
      if (op.kind === "add_achievement") {
        if (op.roleIds.some((r) => !findRole(draft, r)))
          throw new DomainError("NOT_FOUND", "Role not found", 404);
        addAchievement(draft, ids, op.fields, op.roleIds);
      }
      if (op.kind === "add_skill") addSkill(draft, ids, op.fields);
      if ("id" in op) {
        const collection =
          op.kind === "update_role"
            ? "roles"
            : op.kind === "update_skill"
              ? "skills_index"
              : "achievements";
        if (!(draft[collection] ?? []).some((x: any) => x.id === op.id))
          throw new DomainError("NOT_FOUND", "Career item not found", 404);
        if (op.kind === "update_role") updateRole(draft, op.id, op.fields);
        if (op.kind === "update_skill") updateSkill(draft, op.id, op.fields);
        if (op.kind === "update_achievement")
          updateAchievement(draft, op.id, op.fields);
      }
    }
  }).journey;
  result.meta.version = computeNextVersion(journey.meta?.version);
  return CareerJourneySchema.parse(result);
}
export async function applyProposal(
  repo: Repository,
  uid: string,
  proposalId: string,
  expectedPayloadHash: string,
) {
  if (!proposalsEnabled())
    throw new DomainError(
      "FEATURE_UNAVAILABLE",
      "Journey proposals are disabled",
      503,
    );
  return repo.transaction(uid, async (tx) => {
    const proposal = await required(
      tx,
      "assistantJourneyProposals",
      proposalId,
    );
    if (proposal.payloadHash !== expectedPayloadHash)
      throw new DomainError("REVISION_CONFLICT", "Proposal changed", 409);
    if (
      proposal.state !== "pending" ||
      Date.parse(proposal.expiresAt) < Date.now()
    )
      throw new DomainError(
        "REVISION_CONFLICT",
        "Proposal expired or already resolved",
        409,
      );
    const thread = await required(tx, "assistantThreads", proposal.threadId);
    if (thread.deletedAt)
      throw new DomainError("NOT_FOUND", "Thread not found", 404);
    const journey = await required(tx, "careerJourney", "current");
    if (hash(journey) !== proposal.baseHash)
      throw new DomainError(
        "REVISION_CONFLICT",
        "Career Journey changed. Request a new proposal and review it.",
        409,
      );
    const updated = applyRecipes(journey, proposalSchema.parse(proposal.input));
    tx.set("careerJourney", "current", updated);
    tx.set("assistantJourneyProposals", proposalId, {
      ...proposal,
      state: "applied",
      appliedAt: new Date().toISOString(),
    });
    tx.set("assistantSteps", `applied_${proposalId}`, {
      id: `applied_${proposalId}`,
      action: "human_apply_proposal",
      threadId: proposal.threadId,
      proposalId,
      createdAt: new Date().toISOString(),
      beforeHash: proposal.baseHash,
      afterHash: hash(updated),
    });
    return { journey: updated };
  });
}
