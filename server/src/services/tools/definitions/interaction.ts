import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";

export function createInteractionAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const { pendingActionService } = services;
  return {
    confirmAction: tool({
      description:
        "Confirm or reject a pending action that was created earlier (yes/no).",
      inputSchema: z.object({
        pendingId: z.string().describe("Pending action ID"),
        yes: z.boolean().describe("true to confirm, false to reject"),
      }),
      execute: dedupe("confirmAction", async (params) => {
        return pendingActionService.confirm({
          id: params.pendingId,
          userId,
          yesNo: params.yes,
        });
      }),
    }),
    cancelPendingAction: tool({
      description: "Cancel a pending action by ID.",
      inputSchema: z.object({
        pendingId: z.string().describe("Pending action ID"),
      }),
      execute: dedupe("cancelPendingAction", async (params) => {
        return pendingActionService.cancel({ id: params.pendingId, userId });
      }),
    }),
    selectCandidate: tool({
      description:
        "Select a candidate entity (e.g., reminder/list) for a pending action disambiguation.",
      inputSchema: z.object({
        pendingId: z.string().describe("Pending action ID"),
        entityType: z.string().describe("Entity type, e.g., 'reminder'|'list'|'note'"),
        candidateId: z.string().describe("Chosen entity ID"),
      }),
      execute: dedupe("selectCandidate", async (params) => {
        return pendingActionService.selectCandidate({
          id: params.pendingId,
          userId,
          entityType: params.entityType,
          candidateId: params.candidateId,
        });
      }),
    }),
  };
}
