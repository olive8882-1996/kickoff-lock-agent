import { describe, expect, it } from "vitest";
import { buildProfileAutosyncStatus, canAutoSyncCloudWrites } from "./profileAutosync";
import type { CloudSyncState } from "./types";

const state = (patch: Partial<CloudSyncState>): CloudSyncState => ({
  configured: false,
  authenticated: false,
  mode: "local",
  status: "offline",
  message: "Local profile active.",
  ...patch,
});

describe("profile autosync status", () => {
  it("keeps profile edits local when Supabase env is missing", () => {
    expect(buildProfileAutosyncStatus(state({}))).toMatchObject({
      enabled: false,
      label: "Local profile only",
    });
  });

  it("requires sign-in when Supabase is configured but not authenticated", () => {
    expect(buildProfileAutosyncStatus(state({ configured: true, mode: "supabase" }))).toMatchObject({
      enabled: false,
      label: "Sign-in required",
    });
  });

  it("enables automatic cloud save only for authenticated Supabase sessions", () => {
    expect(buildProfileAutosyncStatus(state({ configured: true, authenticated: true, mode: "supabase" }))).toMatchObject({
      enabled: true,
      label: "Auto cloud save",
      detail: "Profile edits sync to Supabase with read-back for public profile recovery.",
    });
  });

  it("keeps automatic cloud save enabled for refreshable Supabase sessions", () => {
    const cloudState = state({
      configured: true,
      authenticated: false,
      refreshable: true,
      sessionExpired: true,
      mode: "supabase",
    });

    expect(buildProfileAutosyncStatus(cloudState)).toMatchObject({
      enabled: true,
      label: "Auto cloud save",
      detail: "Profile edits will refresh the Supabase session, then sync with read-back for public profile recovery.",
    });
    expect(canAutoSyncCloudWrites(cloudState)).toBe(true);
  });

  it("does not allow background cloud writes without a configured recoverable session", () => {
    expect(canAutoSyncCloudWrites(state({ configured: true, mode: "supabase" }))).toBe(false);
    expect(canAutoSyncCloudWrites(state({ configured: false, authenticated: true }))).toBe(false);
  });
});
