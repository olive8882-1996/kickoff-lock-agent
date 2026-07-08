import { describe, expect, it, vi } from "vitest";
import { buildSupabaseProductionDoctorReport } from "./supabaseProductionDoctor";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

const pngBytes = (width = 1200, height = 675, size = 12_000) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
};

const shareImageResponse = (options: { width?: number; height?: number; size?: number } = {}) => {
  const bytes = pngBytes(options.width, options.height, options.size);
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(bytes.byteLength) },
  });
};

const env = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
  KICKOFF_VERIFY_USER_ID: "user-1",
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_ID: "mode-1",
  KICKOFF_VERIFY_MODE_IDS: "mode-1,mode-2,mode-3,mode-4,mode-5,mode-6",
  KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
  KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-card.png",
};
const envWithService = { ...env, SUPABASE_SERVICE_ROLE_KEY: "service-role" };

const modeIds = env.KICKOFF_VERIFY_MODE_IDS.split(",");
const publicProofUrl = (id = env.KICKOFF_VERIFY_PROOF_ID) => `${env.VITE_SUPABASE_REDIRECT_URL}?proof=${id}`;
const publicModeUrl = (id: string) => `${env.VITE_SUPABASE_REDIRECT_URL}?mode=${id}`;

const xIntent = (proofUrl: string, text = "proof") => {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", `Kickoff Lock ${text} proof\nVerify: ${proofUrl}`);
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

const backendHealthRow = (patch: Record<string, unknown> = {}) => ({
  ready: true,
  schema_version: "2026-07-04-cloud-v3",
  missing_tables: [],
  missing_views: [],
  missing_rls_tables: [],
  missing_columns: [],
  missing_view_columns: [],
  unsafe_write_policies: [],
  policy_count: 8,
  required_policy_count: 8,
  storage_bucket_public: true,
  storage_policy_count: 3,
  required_storage_policy_count: 3,
  ...patch,
});

const rowsFor = (url: string) => {
  if (url.includes("/auth/v1/admin/users/user-1")) {
    return {
      id: "user-1",
      email: "fan@example.com",
      email_confirmed_at: "2026-07-04T00:00:00.000Z",
      identities: [{ provider: "google" }],
      app_metadata: { providers: ["google"] },
    };
  }
  if (url.includes("/storage/v1/bucket/kickoff-share-cards")) {
    return { id: "kickoff-share-cards", public: true };
  }
  if (url.includes("kickoff_backend_health")) {
    return [backendHealthRow()];
  }
  if (url.includes("kickoff_profiles")) {
    return [
      {
        id: "user-1",
        email: "fan@example.com",
        display_name: "Chengdu Analyst",
        location: "Chengdu",
        friend_code: "chengdu",
        updated_at: "2026-07-04T00:00:00.000Z",
      },
    ];
  }
  if (url.includes("kickoff_records")) return [{ id: "cap-1", user_id: "user-1", season_key: "world-cup-run", friend_code: "chengdu" }];
  if (url.includes("kickoff_mode_runs")) {
    if (url.includes("id=in.")) {
      return modeIds.map((id, index) => ({
        id,
        user_id: "user-1",
        mode_id: ["bracket", "parlay", "agent-vs-human", "upset", "group-path", "penalty-pressure"][index],
        season_key: "world-cup-run",
        friend_code: "chengdu",
      }));
    }
    return [{ id: "mode-1", user_id: "user-1", mode_id: "bracket", season_key: "world-cup-run", friend_code: "chengdu" }];
  }
  if (url.includes("kickoff_share_artifacts")) {
    if (url.includes("kind=eq.mode")) {
      return modeIds.map((id) => ({
        id,
        user_id: "user-1",
        season_key: "world-cup-run",
        friend_code: "chengdu",
        kind: "mode",
        image_url: env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL,
        image_hash: "b".repeat(64),
        proof_url: publicModeUrl(id),
        image_mime: "image/png",
        image_byte_length: 42_000,
        generated_at: "2026-07-04T00:00:00.000Z",
        x_intent_url: xIntent(publicModeUrl(id), "mode"),
        x_intent_opened_at: "2026-07-04T00:00:00.000Z",
      }));
    }
    return [{
      id: "cap-1",
      user_id: "user-1",
      season_key: "world-cup-run",
      friend_code: "chengdu",
      kind: "record",
      image_url: env.KICKOFF_VERIFY_SHARE_IMAGE_URL,
      image_hash: "a".repeat(64),
      proof_url: publicProofUrl(),
      image_mime: "image/png",
      image_byte_length: 42_000,
      generated_at: "2026-07-04T00:00:00.000Z",
      x_intent_url: xIntent(publicProofUrl(), "record"),
      x_intent_opened_at: "2026-07-04T00:00:00.000Z",
    }];
  }
  if (url.includes("kickoff_leaderboard")) {
    return [
      {
        id: "user-1",
        friend_code: "chengdu",
        season_key: "world-cup-run",
        xp: 120,
        global_rank: 4,
        friend_rank: 1,
        season_rank: 2,
        rank: 4,
      },
    ];
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

  it("rejects a generic HTTPS Supabase URL while still allowing independent image read checks", async () => {
    const fetcher = vi.fn();
    const report = await buildSupabaseProductionDoctorReport(
      {
        ...env,
        VITE_SUPABASE_URL: "https://example.com",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "supabase-env")).toMatchObject({
      status: "failed",
      detail: "VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL",
    });
    expect(report.checks.find((check) => check.id === "backend-health")).toMatchObject({
      status: "failed",
      detail: "VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("passes required checks with readable schema rows, target rows, leaderboard scopes and public share image", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        expect(init?.method).toBe("GET");
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(envWithService, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.checks.find((check) => check.id === "backend-health")?.detail).toContain("Storage policies");
    expect(report.checks.find((check) => check.id === "target-auth-user")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("Auth user user-1 read back"),
    });
    expect(report.checks.find((check) => check.id === "target-auth-profile-identity")).toMatchObject({
      status: "passed",
      detail: "Auth user user-1 and profile user-1 share email fan@example.com",
      sampleIds: ["user-1", "user-1"],
    });
    expect(report.checks.find((check) => check.id === "storage-bucket-admin-read")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "auth-redirect-url")).toMatchObject({
      status: "passed",
      detail: "https://example.com/kickoff-lock-agent/",
    });
    expect(report.checks.find((check) => check.id === "auth-google-authorize-url")?.url).toContain(
      "provider=google",
    );
    expect(report.checks.find((check) => check.id === "target-account-identity")).toMatchObject({
      status: "passed",
      detail: "user-1 owns profile, records, modes and leaderboards",
    });
    expect(report.checks.find((check) => check.id === "target-share-artifact-row")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "target-share-channel-row")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "target-mode-share-channel-row")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "public-share-image-read")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "public-mode-share-image-read")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "target-record-row")?.detail).toContain("matching scope");
    expect(report.checks.find((check) => check.id === "target-mode-row")?.detail).toContain("6/6");
    expect(report.checks.find((check) => check.id === "target-mode-row")?.detail).toContain("matching scope");
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain("6/6");
    expect(report.checks.find((check) => check.id === "leaderboard-friend-user")?.detail).toContain("current user present");
    expect(report.checks.find((check) => check.id === "leaderboard-friend-user")?.detail).toContain("friend_code matched");
    expect(report.checks.find((check) => check.id === "leaderboard-friend-user")?.detail).toContain("friend_rank #1");
    expect(report.checks.find((check) => check.id === "leaderboard-season-user")?.detail).toContain("season_key matched");
    expect(report.checks.find((check) => check.id === "leaderboard-season-user")?.detail).toContain("season_rank #2");
    expect(report.checks.find((check) => check.id === "leaderboard-global-board")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("global board row"),
    });
    expect(report.checks.find((check) => check.id === "leaderboard-friend-board")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("friend board row"),
    });
    expect(report.checks.find((check) => check.id === "leaderboard-season-board")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("season board row"),
    });
  });

  it("rejects leaderboard board rows that do not match the scoped friend or season filters", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_leaderboard") && url.includes("order=friend_rank.asc")) {
        return jsonResponse([
          {
            id: "user-2",
            friend_code: "other-city",
            season_key: "world-cup-run",
            xp: 300,
            global_rank: 2,
            friend_rank: 1,
            season_rank: 2,
            rank: 2,
          },
        ]);
      }
      if (url.includes("kickoff_leaderboard") && url.includes("order=season_rank.asc")) {
        return jsonResponse([
          {
            id: "user-3",
            friend_code: "chengdu",
            season_key: "old-season",
            xp: 200,
            global_rank: 3,
            friend_rank: 2,
            season_rank: 1,
            rank: 3,
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(envWithService, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "leaderboard-friend-board")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("friend_code other-city != chengdu"),
    });
    expect(report.checks.find((check) => check.id === "leaderboard-season-board")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("season_key old-season != world-cup-run"),
    });
  });

  it("requires a local service role key to prove the target Supabase Auth user", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-auth-user")).toMatchObject({
      status: "failed",
      required: true,
      detail: "SUPABASE_SERVICE_ROLE_KEY missing for Auth admin user read-back",
    });
  });

  it("rejects a target Auth user that cannot prove an email and sign-in identity", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/auth/v1/admin/users/user-1")) {
        return jsonResponse({ id: "user-1", identities: [] });
      }
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(envWithService, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-auth-user")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("email missing"),
    });
    expect(report.checks.find((check) => check.id === "target-auth-user")?.detail).toContain(
      "confirmed identity missing",
    );
  });

  it("rejects account readiness when the Auth user email does not match the synced profile email", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/auth/v1/admin/users/user-1")) {
        return jsonResponse({
          id: "user-1",
          email: "signed-in@example.com",
          email_confirmed_at: "2026-07-04T00:00:00.000Z",
          identities: [{ provider: "google" }],
        });
      }
      if (url.includes("kickoff_profiles") && url.includes("id=eq.user-1")) {
        return jsonResponse([
          {
            id: "user-1",
            email: "stale-profile@example.com",
            display_name: "Chengdu Analyst",
            location: "Chengdu",
            friend_code: "chengdu",
            updated_at: "2026-07-04T00:00:00.000Z",
          },
        ]);
      }
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(envWithService, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-auth-user")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "target-profile-row")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "target-auth-profile-identity")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("email mismatch (signed-in@example.com != stale-profile@example.com)"),
    });
  });

  it("rejects old backend health rows that do not prove columns and Storage readiness", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_backend_health")) {
        return jsonResponse([
          {
            ready: true,
            schema_version: "2026-07-03-cloud-v2",
            missing_tables: [],
            missing_views: [],
            missing_rls_tables: [],
            policy_count: 8,
            required_policy_count: 8,
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "backend-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("missing columns missing from kickoff_backend_health"),
    });
    expect(report.checks.find((check) => check.id === "backend-health")?.detail).toContain(
      "storage bucket is not public",
    );
  });

  it("rejects backend health rows that still expose email-fallback write policies", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_backend_health")) {
        return jsonResponse([
          backendHealthRow({
            ready: false,
            unsafe_write_policies: ["kickoff_records:users can upsert their own records"],
            detail: "unsafe write policies 1",
          }),
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(envWithService, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "backend-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("unsafe write policies: kickoff_records:users can upsert their own records"),
    });
  });

  it("requires a deployed HTTPS redirect URL for account login acceptance", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      { ...env, VITE_SUPABASE_REDIRECT_URL: "http://localhost:5173/kickoff-lock-agent/" },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "auth-redirect-url")).toMatchObject({
      status: "failed",
      detail: "Missing valid HTTPS VITE_SUPABASE_REDIRECT_URL",
    });
    expect(report.checks.find((check) => check.id === "auth-google-authorize-url")).toMatchObject({
      status: "failed",
      detail: "Supabase env or redirect URL missing",
    });
  });

  it("requires the auth redirect URL to match the configured public app URL", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      {
        ...env,
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_REDIRECT_URL: "https://other.example.com/kickoff-lock-agent/",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "auth-redirect-url")).toMatchObject({
      status: "failed",
      detail:
        "VITE_SUPABASE_REDIRECT_URL (https://other.example.com/kickoff-lock-agent/) must match VITE_PUBLIC_APP_URL (https://example.com/kickoff-lock-agent/)",
    });
    expect(report.checks.find((check) => check.id === "auth-google-authorize-url")).toMatchObject({
      status: "failed",
      detail: "Supabase env or redirect URL missing",
    });
  });

  it("fails the target profile row when account identity fields are empty shells", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_profiles") && url.includes("id=eq.user-1")) {
        return jsonResponse([{ id: "user-1", email: "", display_name: "", location: "", friend_code: "chengdu" }]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-profile-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("email missing"),
    });
    expect(report.checks.find((check) => check.id === "target-profile-row")?.detail).toContain("display_name missing");
    expect(report.checks.find((check) => check.id === "target-profile-row")?.detail).toContain("location missing");
  });

  it("fails the target profile row when cloud profile sync has no updated_at timestamp", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_profiles") && url.includes("id=eq.user-1")) {
        return jsonResponse([
          {
            id: "user-1",
            email: "fan@example.com",
            display_name: "Chengdu Analyst",
            location: "Chengdu",
            friend_code: "chengdu",
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-profile-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("updated_at is missing or invalid"),
    });
  });

  it("fails production acceptance when profile and user env targets belong to different accounts", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_profiles") && url.includes("id=eq.profile-2")) {
        return jsonResponse([
          {
            id: "profile-2",
            email: "fan@example.com",
            display_name: "Chengdu Analyst",
            location: "Chengdu",
            friend_code: "chengdu",
            updated_at: "2026-07-04T00:00:00.000Z",
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      { ...env, KICKOFF_VERIFY_PROFILE_ID: "profile-2" },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-account-identity")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_USER_ID (user-1) must match KICKOFF_VERIFY_PROFILE_ID (profile-2)",
    });
  });

  it("fails scoped leaderboard checks when current user row has the wrong friend or season key", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_leaderboard") && url.includes("friend_code=eq.chengdu")) {
        return jsonResponse([
          {
            id: "user-1",
            friend_code: "wrong-friend",
            season_key: "world-cup-run",
            xp: 120,
            global_rank: 4,
            friend_rank: 1,
            season_rank: 2,
            rank: 4,
          },
        ]);
      }
      if (url.includes("kickoff_leaderboard") && url.includes("season_key=eq.world-cup-run")) {
        return jsonResponse([
          {
            id: "user-1",
            friend_code: "chengdu",
            season_key: "old-season",
            xp: 120,
            global_rank: 4,
            friend_rank: 1,
            season_rank: 2,
            rank: 4,
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "leaderboard-friend-user")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("friend_code missing"),
    });
    expect(report.checks.find((check) => check.id === "leaderboard-season-user")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("season_key missing"),
    });
  });

  it("fails scoped leaderboard checks when the upgraded view omits scoped rank fields", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_leaderboard") && url.includes("friend_code=eq.chengdu")) {
        return jsonResponse([
          {
            id: "user-1",
            friend_code: "chengdu",
            season_key: "world-cup-run",
            global_rank: 4,
            season_rank: 2,
            rank: 4,
          },
        ]);
      }
      if (url.includes("kickoff_leaderboard") && url.includes("season_key=eq.world-cup-run")) {
        return jsonResponse([
          {
            id: "user-1",
            friend_code: "chengdu",
            season_key: "world-cup-run",
            global_rank: 4,
            friend_rank: 1,
            rank: 4,
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "leaderboard-friend-user")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("friend_rank missing"),
    });
    expect(report.checks.find((check) => check.id === "leaderboard-season-user")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("season_rank missing"),
    });
  });

  it("fails target account rows when prediction or mode proofs are not owned by the verified user and scope", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_profiles") && url.includes("id=eq.user-1")) {
        return jsonResponse([
          {
            id: "user-1",
            email: "fan@example.com",
            display_name: "Chengdu Analyst",
            location: "Chengdu",
            friend_code: "wrong-friend",
            updated_at: "2026-07-04T00:00:00.000Z",
          },
        ]);
      }
      if (url.includes("kickoff_records") && url.includes("id=eq.cap-1")) {
        return jsonResponse([{ id: "cap-1", user_id: "other-user", season_key: "old-season", friend_code: "wrong-friend" }]);
      }
      if (url.includes("kickoff_mode_runs") && url.includes("id=in.")) {
        return jsonResponse(
          modeIds.map((id, index) => ({
            id,
            user_id: index === 0 ? "other-user" : "user-1",
            mode_id: ["bracket", "parlay", "agent-vs-human", "upset", "group-path", "penalty-pressure"][index],
            season_key: index === 1 ? "old-season" : "world-cup-run",
            friend_code: index === 2 ? "wrong-friend" : "chengdu",
          })),
        );
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-profile-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("friend_code wrong-friend != chengdu"),
    });
    expect(report.checks.find((check) => check.id === "target-record-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("user_id other-user != user-1"),
    });
    expect(report.checks.find((check) => check.id === "target-record-row")?.detail).toContain("season_key old-season != world-cup-run");
    expect(report.checks.find((check) => check.id === "target-mode-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("mode proofs scope mismatch"),
    });
    expect(report.checks.find((check) => check.id === "target-mode-row")?.detail).toContain("mode-1 user_id other-user != user-1");
    expect(report.checks.find((check) => check.id === "target-mode-row")?.detail).toContain("mode-2 season_key old-season != world-cup-run");
    expect(report.checks.find((check) => check.id === "target-mode-row")?.detail).toContain("mode-3 friend_code wrong-friend != chengdu");
  });

  it("fails target mode proof rows when six ids do not cover all production mode types", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_mode_runs") && url.includes("id=in.")) {
        return jsonResponse(
          modeIds.map((id) => ({
            id,
            user_id: "user-1",
            mode_id: "parlay",
            season_key: "world-cup-run",
            friend_code: "chengdu",
          })),
        );
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-mode-row")).toMatchObject({
      status: "failed",
      detail: "mode proofs mode type coverage missing bracket, agent-vs-human, upset, group-path, penalty-pressure",
      sampleIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
    });
  });

  it("fails share artifact and channel rows when they are not owned by the verified account scope", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("kind=eq.record")) {
        return jsonResponse([{
          id: "cap-1",
          user_id: "other-user",
          season_key: "old-season",
          friend_code: "wrong-friend",
          kind: "record",
          image_url: env.KICKOFF_VERIFY_SHARE_IMAGE_URL,
          image_hash: "a".repeat(64),
          proof_url: publicProofUrl(),
          image_mime: "image/png",
          image_byte_length: 42_000,
          generated_at: "2026-07-04T00:00:00.000Z",
          x_intent_url: xIntent(publicProofUrl(), "record"),
          x_intent_opened_at: "2026-07-04T00:00:00.000Z",
        }]);
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("kind=eq.mode")) {
        return jsonResponse(
          modeIds.map((id, index) => ({
            id,
            user_id: index === 0 ? "other-user" : "user-1",
            season_key: index === 1 ? "old-season" : "world-cup-run",
            friend_code: index === 2 ? "wrong-friend" : "chengdu",
            kind: "mode",
            image_url: env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL,
            image_hash: "b".repeat(64),
            proof_url: publicModeUrl(id),
            image_mime: "image/png",
            image_byte_length: 42_000,
            generated_at: "2026-07-04T00:00:00.000Z",
            x_intent_url: xIntent(publicModeUrl(id), "mode"),
            x_intent_opened_at: "2026-07-04T00:00:00.000Z",
          })),
        );
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-share-artifact-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("user_id other-user != user-1"),
    });
    expect(report.checks.find((check) => check.id === "target-share-channel-row")?.detail).toContain(
      "season_key old-season != world-cup-run",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "mode-1 user_id other-user != user-1",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "mode-2 season_key old-season != world-cup-run",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-channel-row")?.detail).toContain(
      "mode-3 friend_code wrong-friend != chengdu",
    );
  });

  it("keeps Supabase sharing incomplete when the mode share artifact row is missing", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("kind=eq.mode")) return jsonResponse([]);
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")).toMatchObject({
      status: "failed",
      detail: "mode share artifacts missing mode-1, mode-2, mode-3, mode-4, mode-5, mode-6",
    });
  });

  it("requires six mode proof ids before querying mode production targets", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      { ...env, KICKOFF_VERIFY_MODE_IDS: "mode-1" },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-mode-row")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; got 1",
      sampleIds: ["mode-1"],
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; got 1",
      sampleIds: ["mode-1"],
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-channel-row")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; got 1",
      sampleIds: ["mode-1"],
    });
  });

  it("does not accept legacy single mode id for full Supabase production acceptance", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      { ...env, KICKOFF_VERIFY_MODE_IDS: "", KICKOFF_VERIFY_MODE_ID: "mode-1" },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-mode-row")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough",
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough",
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-channel-row")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough",
    });
  });

  it("keeps Supabase sharing incomplete when X/native share channel evidence is missing", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("x_intent_url")) {
        return jsonResponse([{
          id: "cap-1",
          user_id: "user-1",
          season_key: "world-cup-run",
          friend_code: "chengdu",
          kind: "record",
          x_intent_url: "https://twitter.com/intent/tweet",
        }]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-share-channel-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("proof_url does not match configured public proof target"),
    });
  });

  it("accepts native share timestamps as Supabase share-channel evidence with a reproducible X intent URL", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("x_intent_url") && url.includes("kind=eq.record")) {
        return jsonResponse([{
          id: "cap-1",
          user_id: "user-1",
          season_key: "world-cup-run",
          friend_code: "chengdu",
          kind: "record",
          proof_url: publicProofUrl(),
          generated_at: "2026-07-04T00:00:00.000Z",
          x_intent_url: xIntent(publicProofUrl(), "record"),
          native_share_opened_at: "2026-07-04T00:00:01.000Z",
        }]);
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("x_intent_url") && url.includes("kind=eq.mode")) {
        return jsonResponse(
          modeIds.map((id) => ({
            id,
            user_id: "user-1",
            season_key: "world-cup-run",
            friend_code: "chengdu",
            kind: "mode",
            proof_url: publicModeUrl(id),
            generated_at: "2026-07-04T00:00:00.000Z",
            x_intent_url: xIntent(publicModeUrl(id), "mode"),
            native_share_opened_at: "2026-07-04T00:00:01.000Z",
          })),
        );
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.checks.find((check) => check.id === "target-share-channel-row")).toMatchObject({
      status: "passed",
      detail: "record:cap-1 share channel opened and synced",
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-channel-row")).toMatchObject({
      status: "passed",
      detail: "mode 6/6 share channels opened and synced",
    });
  });

  it("rejects share rows whose proof URL does not target the configured public proof page", async () => {
    const staleProofUrl = "https://example.com/kickoff-lock-agent/?proof=old-cap";
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("kind=eq.record")) {
        return jsonResponse([{
          id: "cap-1",
          user_id: "user-1",
          season_key: "world-cup-run",
          friend_code: "chengdu",
          kind: "record",
          image_url: env.KICKOFF_VERIFY_SHARE_IMAGE_URL,
          image_hash: "a".repeat(64),
          proof_url: staleProofUrl,
          image_mime: "image/png",
          image_byte_length: 42_000,
          generated_at: "2026-07-04T00:00:00.000Z",
          x_intent_url: xIntent(staleProofUrl, "record"),
          x_intent_opened_at: "2026-07-04T00:00:01.000Z",
        }]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-share-artifact-row")?.detail).toContain(
      "proof_url does not match configured public proof target",
    );
    expect(report.checks.find((check) => check.id === "target-share-channel-row")?.detail).toContain(
      "proof_url does not match configured public proof target",
    );
  });

  it("does not accept share artifact manifests with local URLs, mismatched image URLs or short hashes", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("kind=eq.mode") && url.includes("image_url")) {
        return jsonResponse(
          modeIds.map((id) => ({
            id,
            user_id: "user-1",
            season_key: "world-cup-run",
            friend_code: "chengdu",
            kind: "mode",
            image_url: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/wrong-mode-card.png",
            image_hash: "short",
            proof_url: `http://localhost:5173/?mode=${id}`,
            image_mime: "image/jpeg",
            image_byte_length: 512,
            generated_at: "not-a-date",
            x_intent_url: xIntent(`http://localhost:5173/?mode=${id}`, "mode"),
            x_intent_opened_at: "2026-07-04T00:00:00.000Z",
          })),
        );
      }
      if (url.includes("kickoff_share_artifacts") && url.includes("kind=eq.record") && url.includes("image_url")) {
        return jsonResponse([
          {
            id: "cap-1",
            user_id: "user-1",
            season_key: "world-cup-run",
            friend_code: "chengdu",
            kind: "record",
            image_url: "http://127.0.0.1:5173/card.png",
            image_hash: "a".repeat(64),
            proof_url: publicProofUrl(),
            image_mime: "image/png",
            image_byte_length: 42_000,
            generated_at: "2026-07-04T00:00:00.000Z",
            x_intent_url: xIntent(publicProofUrl(), "record"),
            x_intent_opened_at: "2026-07-04T00:00:00.000Z",
          },
        ]);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-share-artifact-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("image_url is not a deployed HTTPS URL"),
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("mode share artifacts invalid"),
    });
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "image_url does not match configured public share image",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "image_hash is not a 64-character SHA-256 digest",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "proof_url is not a deployed HTTPS URL",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "image_mime image/jpeg is not image/png",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "image_byte_length 512 is below 10000",
    );
    expect(report.checks.find((check) => check.id === "target-mode-share-artifact-row")?.detail).toContain(
      "generated_at is missing or invalid",
    );
  });

  it("fails the mode target when any required mode proof row is missing", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      if (url.includes("kickoff_mode_runs") && url.includes("id=in.")) {
        const rows = rowsFor(url);
        return jsonResponse(Array.isArray(rows) ? rows.filter((row: any) => row.id !== "mode-4") : rows);
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "target-mode-row")).toMatchObject({
      status: "failed",
      detail: "mode proofs missing mode-4",
    });
  });

  it("uses service role for target Auth and optional Storage bucket metadata checks", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/storage/v1/bucket/kickoff-share-cards")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer service-role" });
        return jsonResponse({ id: "kickoff-share-cards", public: true });
      }
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL || url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(
      envWithService,
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
      if (url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "public-share-image-read")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("HTTP 404"),
    });
  });

  it("keeps sharing incomplete when the public image URL is a tiny placeholder", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === env.KICKOFF_VERIFY_SHARE_IMAGE_URL) {
        return shareImageResponse({ width: 320, height: 180, size: 512 });
      }
      if (url === env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL) {
        return shareImageResponse();
      }
      return jsonResponse(rowsFor(url));
    });

    const report = await buildSupabaseProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "public-share-image-read")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("image bytes 512/10000"),
    });
    expect(report.checks.find((check) => check.id === "public-share-image-read")?.detail).toContain("width 320/1000");
    expect(report.checks.find((check) => check.id === "public-share-image-read")?.detail).toContain("height 180/560");
  });
});
