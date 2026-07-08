import { describe, expect, it } from "vitest";
import {
  hasProductionShareChannelEvidence,
  productionShareChannelProblem,
  validXIntentForProof,
  xIntentProblemForProof,
} from "./shareChannelValidation";

const xIntent = (proofUrl: string) => {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", `Kickoff Lock proof\nVerify: ${proofUrl}`);
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

const row = {
  proof_url: "https://example.com/kickoff-lock-agent/?proof=cap-1",
  generated_at: "2026-07-04T12:00:00.000Z",
  x_intent_opened_at: "2026-07-04T12:01:00.000Z",
};

describe("production share channel validation", () => {
  it("accepts an X intent that targets the exact production proof URL and was opened after generation", () => {
    const evidence = {
      ...row,
      x_intent_url: xIntent(row.proof_url),
    };

    expect(validXIntentForProof(evidence)).toBe(true);
    expect(productionShareChannelProblem(evidence)).toBe("");
    expect(hasProductionShareChannelEvidence(evidence)).toBe(true);
  });

  it("rejects local or mismatched proof URLs in the X intent", () => {
    expect(
      productionShareChannelProblem({
        ...row,
        proof_url: "http://localhost:5173/?proof=cap-1",
        x_intent_url: xIntent("http://localhost:5173/?proof=cap-1"),
      }),
    ).toBe("production proof_url missing");

    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: xIntent("https://example.com/kickoff-lock-agent/?proof=another"),
      }),
    ).toBe("X intent url parameter must match proof_url");
  });

  it("rejects share evidence when the opened timestamp is missing or before generation", () => {
    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: xIntent(row.proof_url),
        x_intent_opened_at: "2026-07-04T11:59:59.000Z",
      }),
    ).toBe("opened timestamp missing, invalid, before generated_at or in the future");

    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: xIntent(row.proof_url),
        x_intent_opened_at: "",
      }),
    ).toBe("opened timestamp missing, invalid, before generated_at or in the future");

    expect(
      productionShareChannelProblem({
        proof_url: row.proof_url,
        x_intent_url: xIntent(row.proof_url),
        x_intent_opened_at: "2026-07-04T12:01:00.000Z",
      }),
    ).toBe("opened timestamp missing, invalid, before generated_at or in the future");
  });

  it("rejects share evidence when the opened timestamp is in the future", () => {
    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: xIntent(row.proof_url),
        x_intent_opened_at: "2099-07-04T12:01:00.000Z",
      }),
    ).toBe("opened timestamp missing, invalid, before generated_at or in the future");
  });

  it("rejects X intents whose text or hashtags are not reproducible from the proof", () => {
    const missingProofText = new URL(xIntent(row.proof_url));
    missingProofText.searchParams.set("text", "Kickoff proof without link");

    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: missingProofText.toString(),
      }),
    ).toBe("X intent text must include proof_url");

    const missingHashtags = new URL(xIntent(row.proof_url));
    missingHashtags.searchParams.set("hashtags", "KickoffLock,WorldCup");

    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: missingHashtags.toString(),
      }),
    ).toBe("X intent missing KickoffLock, Filecoin or WorldCup hashtags");
  });

  it("rejects X intents whose tweet text is too long or too generic for one-click publishing", () => {
    const tooLong = new URL(xIntent(row.proof_url));
    tooLong.searchParams.set("text", `Kickoff Lock proof ${row.proof_url} ${"x".repeat(280)}`);

    expect(xIntentProblemForProof({ ...row, x_intent_url: tooLong.toString() })).toBe(
      "X intent text exceeds 280 characters",
    );
    expect(validXIntentForProof({ ...row, x_intent_url: tooLong.toString() })).toBe(false);

    const generic = new URL(xIntent(row.proof_url));
    generic.searchParams.set("text", `Check this link ${row.proof_url}`);

    expect(xIntentProblemForProof({ ...row, x_intent_url: generic.toString() })).toBe(
      "X intent text must describe the lock or proof",
    );
  });

  it("accepts native share open time when X intent open time is absent", () => {
    expect(
      productionShareChannelProblem({
        ...row,
        x_intent_url: xIntent(row.proof_url),
        x_intent_opened_at: "",
        native_share_opened_at: "2026-07-04T12:05:00.000Z",
      }),
    ).toBe("");
  });
});
