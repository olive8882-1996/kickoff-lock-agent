import { describe, expect, it } from "vitest";
import {
  buildShareChannelEvidenceArtifact,
  buildSharingProductionBootstrapPlan,
} from "./sharingProductionBootstrap";
import type { SupabaseDoctorReport } from "./supabaseProductionDoctor";

const uploadEnv = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

const completeEnv = {
  ...uploadEnv,
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_IDS: "mode-1,mode-2,mode-3,mode-4,mode-5,mode-6",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
};

const doctorReport = (failedCheckIds: string[] = []): SupabaseDoctorReport => {
  const ids = ["target-share-channel-row", "target-mode-share-channel-row"];
  return {
    ready: failedCheckIds.length === 0,
    requiredPassed: failedCheckIds.length === 0 ? 2 : 1,
    requiredTotal: 2,
    checks: ids.map((id) => ({
      id,
      label: id,
      required: true,
      status: failedCheckIds.includes(id) ? "failed" : "passed",
      detail: failedCheckIds.includes(id) ? "channel missing" : "channel opened",
      action: "Open and sync share channel",
    })),
    nextActions: [],
  };
};

describe("public sharing production bootstrap plan", () => {
  it("opens local share image generation even when cloud upload env is missing", () => {
    const plan = buildSharingProductionBootstrapPlan({});

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "record-image")).toMatchObject({
      status: "ready",
      command: "bun run share:production-image",
    });
    expect(plan.stages.find((stage) => stage.id === "record-upload")).toMatchObject({
      status: "blocked",
      missingEnv: ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "VITE_PUBLIC_APP_URL",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
      ]),
    );
  });

  it("queues record and mode uploads when Supabase upload env is ready", () => {
    const plan = buildSharingProductionBootstrapPlan(uploadEnv, {
      recordImageExists: true,
      modeImageExists: true,
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "record-image")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "mode-image")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "record-upload")).toMatchObject({
      status: "ready",
      command: "bun run share:upload-image",
    });
    expect(plan.stages.find((stage) => stage.id === "mode-upload")).toMatchObject({
      status: "ready",
      command: "bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
    });
  });

  it("does not queue uploads against a local Supabase project", () => {
    const plan = buildSharingProductionBootstrapPlan(
      {
        ...uploadEnv,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      },
      {
        recordImageExists: true,
        modeImageExists: true,
      },
    );

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "record-upload")).toMatchObject({
      status: "blocked",
      missingEnv: ["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"],
    });
    expect(plan.stages.find((stage) => stage.id === "mode-upload")).toMatchObject({
      status: "blocked",
      missingEnv: ["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"],
    });
  });

  it("switches to sharing doctor once public target ids and image URLs are collected", () => {
    const plan = buildSharingProductionBootstrapPlan(completeEnv, {
      recordImageExists: true,
      modeImageExists: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.stages.find((stage) => stage.id === "record-upload")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "mode-upload")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "ready",
      command: "bun run doctor:sharing",
    });
    expect(plan.copyText).toContain("public sharing production bootstrap");
    expect(plan.copyText).toContain("Read-back commands:");
    expect(plan.readBackCommands).toHaveLength(23);
    expect(plan.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "public-proof-page",
          kind: "proof-page",
          ready: true,
          responseExpectation: {
            responseType: "public-html",
            targetId: "cap-1",
            targetKind: "record",
            requiredFields: ["canonical-url", "og:title", "og:image", "twitter:card", "json-ld", "public-source-cloud"],
            expectedProofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
          },
          command: "curl -sS 'https://example.com/kickoff-lock-agent/?proof=cap-1'",
        }),
        expect.objectContaining({
          id: "public-mode-page:mode-5",
          kind: "proof-page",
          ready: true,
          command: "curl -sS 'https://example.com/kickoff-lock-agent/?mode=mode-5'",
        }),
        expect.objectContaining({
          id: "public-mode-page:mode-6",
          kind: "proof-page",
          ready: true,
          command: "curl -sS 'https://example.com/kickoff-lock-agent/?mode=mode-6'",
        }),
        expect.objectContaining({
          id: "record-share-channel-open",
          kind: "share-channel-open",
          ready: true,
          responseExpectation: expect.objectContaining({
            responseType: "x-intent",
            targetId: "cap-1",
            targetKind: "record",
            expectedHost: "twitter.com",
            expectedHashtags: ["KickoffLock", "Filecoin", "WorldCup"],
          }),
          command: expect.stringContaining("https://twitter.com/intent/tweet"),
        }),
        expect.objectContaining({
          id: "mode-share-channel-open:mode-5",
          kind: "share-channel-open",
          ready: true,
          url: expect.stringContaining("KickoffLock%2CFilecoin%2CWorldCup"),
        }),
        expect.objectContaining({
          id: "record-share-image",
          kind: "share-image",
          ready: true,
          responseExpectation: {
            responseType: "public-image",
            targetId: "cap-1",
            targetKind: "record",
            requiredFields: ["content-type:image", "content-length", "sha256"],
            expectedImageUrl:
              "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
          },
          command:
            "curl -sS 'https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png' -o /tmp/kickoff-record-share-card.png",
        }),
        expect.objectContaining({
          id: "record-share-artifact-row",
          kind: "share-artifact-row",
          ready: true,
          responseExpectation: expect.objectContaining({
            responseType: "supabase-array",
            targetId: "cap-1",
            targetKind: "record",
            minRows: 1,
            expectedProofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
            expectedImageUrl:
              "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
          }),
          command: expect.stringContaining("$VITE_SUPABASE_ANON_KEY"),
        }),
        expect.objectContaining({
          id: "mode-share-artifact-row:mode-5",
          kind: "share-artifact-row",
          ready: true,
          command: expect.stringContaining("id=eq.mode-5&kind=eq.mode"),
        }),
      ]),
    );
    expect(plan.readBackCommands.map((command) => command.command).join("\n")).not.toContain("anon");
    expect(plan.readBackCommands.map((command) => command.command).join("\n")).not.toContain("service");
    const shareChannelOpenCommands = plan.readBackCommands.filter((command) => command.kind === "share-channel-open");
    expect(shareChannelOpenCommands).toHaveLength(7);
    expect(shareChannelOpenCommands.every((command) => command.ready)).toBe(true);
    expect(shareChannelOpenCommands.every((command) => command.url?.includes("intent/tweet") === true)).toBe(true);
    expect(shareChannelOpenCommands.every((command) => command.url?.includes("url=https%3A%2F%2Fexample.com%2Fkickoff-lock-agent%2F") === true)).toBe(true);
    const shareArtifactRowCommands = plan.readBackCommands.filter((command) => command.kind === "share-artifact-row");
    expect(shareArtifactRowCommands.every((command) => command.url?.includes("proof_url=eq.") === true)).toBe(true);
    expect(shareArtifactRowCommands.every((command) => command.url?.includes("image_url=eq.") === true)).toBe(true);
  });

  it("keeps sharing doctor blocked until all six public mode proof ids are present", () => {
    const plan = buildSharingProductionBootstrapPlan(
      {
        ...completeEnv,
        KICKOFF_VERIFY_MODE_IDS: "mode-1",
      },
      {
        recordImageExists: true,
        modeImageExists: true,
      },
    );

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: ["KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids"],
    });
  });

  it("treats GitHub Pages preview images as completed public share image evidence", () => {
    const plan = buildSharingProductionBootstrapPlan(
      {
        ...completeEnv,
        KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-share.png",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-mode-share.png",
      },
      {
        recordImageExists: true,
        modeImageExists: true,
      },
    );

    expect(plan.ready).toBe(true);
    expect(plan.stages.find((stage) => stage.id === "record-upload")).toMatchObject({
      status: "done",
      missingEnv: [],
    });
    expect(plan.stages.find((stage) => stage.id === "mode-upload")).toMatchObject({
      status: "done",
      missingEnv: [],
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")?.missingEnv).toEqual(
      expect.not.arrayContaining([
        "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a public HTTPS URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must be a public HTTPS URL",
      ]),
    );
  });

  it("rejects local and non-image sharing URLs", () => {
    const plan = buildSharingProductionBootstrapPlan(
      {
        ...completeEnv,
        KICKOFF_VERIFY_SHARE_IMAGE_URL: "http://localhost/share.png",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.svg",
      },
      {
        recordImageExists: true,
        modeImageExists: true,
      },
    );

    expect(plan.stages.find((stage) => stage.id === "record-upload")).toMatchObject({
      status: "ready",
      missingEnv: ["KICKOFF_VERIFY_SHARE_IMAGE_URL must be a public HTTPS URL"],
    });
    expect(plan.stages.find((stage) => stage.id === "mode-upload")).toMatchObject({
      status: "ready",
      missingEnv: ["KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must point to a PNG, JPEG or WebP image path"],
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")?.missingEnv).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a public HTTPS URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must point to a PNG, JPEG or WebP image path",
      ]),
    );
  });

  it("rejects legacy single mode id for full production sharing acceptance", () => {
    const plan = buildSharingProductionBootstrapPlan(
      {
        ...completeEnv,
        KICKOFF_VERIFY_MODE_IDS: "",
        KICKOFF_VERIFY_MODE_ID: "mode-legacy",
      },
      {
        recordImageExists: true,
        modeImageExists: true,
      },
    );

    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: [
        "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough for full mode acceptance",
      ],
    });
  });

  it("builds reusable share-channel evidence only after record and all mode channels pass doctor read-back", () => {
    const plan = buildSharingProductionBootstrapPlan(completeEnv, {
      recordImageExists: true,
      modeImageExists: true,
    });
    const artifact = buildShareChannelEvidenceArtifact(plan, {
      env: completeEnv,
      envFiles: [".env.production.local"],
      doctor: doctorReport(),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.targets).toEqual({
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
      proofId: "cap-1",
      proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
      proofXIntentUrl: expect.stringContaining("https://twitter.com/intent/tweet"),
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      modeProofUrls: [
        "https://example.com/kickoff-lock-agent/?mode=mode-1",
        "https://example.com/kickoff-lock-agent/?mode=mode-2",
        "https://example.com/kickoff-lock-agent/?mode=mode-3",
        "https://example.com/kickoff-lock-agent/?mode=mode-4",
        "https://example.com/kickoff-lock-agent/?mode=mode-5",
        "https://example.com/kickoff-lock-agent/?mode=mode-6",
      ],
      modeXIntentUrls: [
        expect.stringContaining("mode%3Dmode-1"),
        expect.stringContaining("mode%3Dmode-2"),
        expect.stringContaining("mode%3Dmode-3"),
        expect.stringContaining("mode%3Dmode-4"),
        expect.stringContaining("mode%3Dmode-5"),
        expect.stringContaining("mode%3Dmode-6"),
      ],
      shareArtifactIds: ["record:cap-1", "mode:mode-1", "mode:mode-2", "mode:mode-3", "mode:mode-4", "mode:mode-5", "mode:mode-6"],
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
    });
    expect(artifact.acceptance).toMatchObject({
      recordChannelOpened: true,
      modeChannelCount: 6,
      requiredModeChannelCount: 6,
      passedTargetCount: 7,
      requiredTargetCount: 7,
      targetEnvReady: true,
      publicTargetUrlsReady: true,
    });
    expect(artifact.readBackCommands.map((command) => command.id)).toEqual(
      expect.arrayContaining(["public-proof-page", "record-share-image", "record-share-artifact-row"]),
    );
  });

  it("keeps share-channel evidence not ready when the mode channel doctor read-back fails", () => {
    const plan = buildSharingProductionBootstrapPlan(completeEnv, {
      recordImageExists: true,
      modeImageExists: true,
    });
    const artifact = buildShareChannelEvidenceArtifact(plan, {
      env: completeEnv,
      doctor: doctorReport(["target-mode-share-channel-row"]),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.recordChannelOpened).toBe(true);
    expect(artifact.acceptance.modeChannelCount).toBe(0);
    expect(artifact.doctor?.failedShareChannelCheckIds).toEqual(["target-mode-share-channel-row"]);
  });

  it("does not mark share-channel evidence reusable without deployed public target URLs", () => {
    const plan = buildSharingProductionBootstrapPlan(
      {
        ...completeEnv,
        VITE_PUBLIC_APP_URL: "http://localhost:5173",
      },
      {
        recordImageExists: true,
        modeImageExists: true,
      },
    );
    const artifact = buildShareChannelEvidenceArtifact(plan, {
      env: {
        ...completeEnv,
        VITE_PUBLIC_APP_URL: "http://localhost:5173",
      },
      doctor: doctorReport(),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.targets.publicAppUrl).toBe("");
    expect(artifact.targets.proofUrl).toBe("");
    expect(artifact.acceptance.publicTargetUrlsReady).toBe(false);
  });
});
