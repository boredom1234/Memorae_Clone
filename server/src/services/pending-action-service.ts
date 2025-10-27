import { getSupabaseClient } from "../lib/supabase";
import { logError, logInfo } from "../utils/logger";

export type PendingActionStatus = "pending" | "confirmed" | "cancelled";

export interface PendingAction {
  id: string;
  user_id: string;
  type: string;
  payload: any;
  status: PendingActionStatus;
  selection?: {
    entityType?: string;
    id?: string;
  } | null;
  created_at: string;
  expires_at?: string | null;
}

export class PendingActionService {
  private supabase = getSupabaseClient();

  async create(params: {
    userId: string;
    type: string;
    payload?: any;
    expiresInSeconds?: number;
  }): Promise<{ pendingId: string; status: PendingActionStatus } | { success: false; message: string } > {
    try {
      const expiresAt = params.expiresInSeconds
        ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
        : null;
      const { data, error } = await this.supabase
        .from("pending_actions")
        .insert({
          user_id: params.userId,
          type: params.type,
          payload: params.payload || {},
          status: "pending",
          expires_at: expiresAt,
        })
        .select()
        .single();
      if (error) throw error;
      logInfo("PENDING_ACTION_CREATE", { id: data.id, type: params.type });
      return { pendingId: data.id, status: data.status as PendingActionStatus };
    } catch (error) {
      logError("Failed to create pending action", error, params);
      return { success: false, message: "Failed to create pending action" };
    }
  }

  async get(params: { id: string; userId: string }): Promise<PendingAction | null> {
    try {
      const { data, error } = await this.supabase
        .from("pending_actions")
        .select("*")
        .eq("id", params.id)
        .eq("user_id", params.userId)
        .single();
      if (error) throw error;
      return (data as PendingAction) || null;
    } catch (error) {
      logError("Failed to get pending action", error, params);
      return null;
    }
  }

  async confirm(params: {
    id: string;
    userId: string;
    yesNo: boolean;
  }): Promise<{ success: boolean; status: PendingActionStatus }> {
    try {
      const status: PendingActionStatus = params.yesNo ? "confirmed" : "cancelled";
      const { error } = await this.supabase
        .from("pending_actions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("user_id", params.userId);
      if (error) throw error;
      return { success: true, status };
    } catch (error) {
      logError("Failed to confirm pending action", error, params);
      return { success: false, status: "cancelled" };
    }
  }

  async cancel(params: { id: string; userId: string }): Promise<{ success: boolean }> {
    try {
      const { error } = await this.supabase
        .from("pending_actions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("user_id", params.userId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      logError("Failed to cancel pending action", error, params);
      return { success: false };
    }
  }

  async selectCandidate(params: {
    id: string;
    userId: string;
    entityType: string;
    candidateId: string;
  }): Promise<{ success: boolean }> {
    try {
      const { error } = await this.supabase
        .from("pending_actions")
        .update({
          selection: { entityType: params.entityType, id: params.candidateId },
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .eq("user_id", params.userId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      logError("Failed to select candidate", error, params);
      return { success: false };
    }
  }
}
