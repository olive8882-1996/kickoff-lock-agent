import type { CloudSyncState } from "./types";
import { shouldAutoRecoverCloudSession } from "./cloud";

export type ProfileAutosyncStatus = {
  enabled: boolean;
  label: "Auto cloud save" | "Sign-in required" | "Local profile only";
  detail: string;
};

export const canAutoSyncCloudWrites = (cloudState: CloudSyncState) => shouldAutoRecoverCloudSession(cloudState);

export const buildProfileAutosyncStatus = (cloudState: CloudSyncState): ProfileAutosyncStatus => {
  if (!cloudState.configured) {
    return {
      enabled: false,
      label: "Local profile only",
      detail: "Supabase env missing; profile edits stay on this device.",
    };
  }
  if (!shouldAutoRecoverCloudSession(cloudState)) {
    return {
      enabled: false,
      label: "Sign-in required",
      detail: cloudState.refreshable
        ? "Refresh the Supabase session before profile edits can sync."
        : "Sign in before profile edits can sync across devices.",
    };
  }
  return {
    enabled: true,
    label: "Auto cloud save",
    detail: cloudState.authenticated
      ? "Profile edits sync to Supabase with read-back for public profile recovery."
      : "Profile edits will refresh the Supabase session, then sync with read-back for public profile recovery.",
  };
};
