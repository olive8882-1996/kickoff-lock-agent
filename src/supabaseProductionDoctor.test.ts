import { describe, expect, it, vi } from "vitest";
import { buildSupabaseProductionDoctorReport } from "./supabaseProductionDoctor";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

const env = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
  KICKOFF_VERIFY_USER_ID: "user-1",
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_ID: "mode-1",
  KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
  KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
};

const rowsFor = (url: string) => {
  if (url.includes("kickoff_backend_health")) {
    return [
      {
        ready: true,
        schema_version: "2026-07-03-cloud-v2",
      },
    ];
  }
  if (url.includes("kickoff_profiles")) return [{ id: "user-1", friend_code: "chengdu" }];
  if (url.includes("kickoff_records")) return [{ id: "cap-1", user_id: "user-1", season_key: "world-cup-run", friend_code: "chengdu" }];
  if (url.includes("kickoff_mode_runs")) return [{ id: "mode-1", user_id: "user-1", mode_id: "bracket" }];
  if (url.includes("kickoff_share_artifacts")) {
    return [{ id: "cap-1", kind: "record", image_url: env.KICKOFF_VERIFY_SHARE_IMAGE_URL, image_hash: "a".repeat(64), proof_url: "https://example.com/?proof=cap-1" }];
  }
  if (url.includes("kickoff_leaderboard")) {
    return [{ id: "user-1", friend_code: "chengdu", season_key: "world-cup-run", xp: 120, rank: 1 }];
  }
  return [];
};

describe("Supabase production doctor", () => {
  it("fails every required Supabase gate clearly when env is missing", async () => {
    const fetcher = vi.fn();
    const report = await buildSupabaseProductionDoctorReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.requiredPassed).toBe(0);
    expect(report.checks.find((check) => check.id === "supabase-env")?.detail).toContain("Missing");
    expect(report.nextActions.map((check) => check.id)).toContain("backend-health");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes required checks with readable schema rows, target rows, leaderboard scopes and public share image", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL) {
        expect(init?.method).toBe("GET");
        return new Response("png", { status: 200, headers: { "content-type": "image/png" } });
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.checks.find((check) => check.id === "storage-bucket-admin-read")?.status).toBe("skipped");
    expect(report.checks.find((check) => check.id === "target-share-artifact-row")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "leaderboard-friend-user")?.detail).toContain("current user present");
  });

  it("uses service role only for optional Storage bucket metadata checks", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/storage/v1/bucket/kickoff-share-cards")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer service-role" });
        return jsonResponse({ id: "kickoff-share-cards", public: true });
      }
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL) {
        return new Response("png", { status: 200, headers: { "content-type": "image/png" } });
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      { ...env, SUPABASE_SERVICE_ROLE_KEY: "service-role" },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "storage-bucket-admin-read")).toMatchObject({
      status: "passed",
      required: false,
    });
  });

  it("keeps sharing incomplete when the public image URL is not an image response", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL) {
        return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "public-share-image-read")).toMatchObject({
      status: "failed",
      detail: "HTTP 404",
    });
  });
});

