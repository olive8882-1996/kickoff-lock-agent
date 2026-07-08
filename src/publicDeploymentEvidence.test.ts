import { describe, expect, it } from "vitest";
import {
  buildPublicDeploymentEvidencePacket,
  evaluatePublicDeploymentEvidenceArtifact,
  extractBuiltAssetsFromIndex,
} from "./publicDeploymentEvidence";

const liveIndex = (bundle: string, stylesheet = "assets/index-style.css") => `
<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/kickoff-lock-agent/${bundle}"></script>
    <link rel="stylesheet" crossorigin href="/kickoff-lock-agent/${stylesheet}">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("public deployment evidence", () => {
  it("extracts Vite bundle and stylesheet assets from built index HTML", () => {
    const assets = extractBuiltAssetsFromIndex(liveIndex("assets/index-app123.js", "assets/index-css456.css"));

    expect(assets.bundle).toBe("assets/index-app123.js");
    expect(assets.stylesheet).toBe("assets/index-css456.css");
    expect(assets.assets).toEqual(["assets/index-app123.js", "assets/index-css456.css"]);
  });

  it("passes when Pages build, commit, live bundle and asset responses match", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      generatedAt: "2026-07-04T20:00:00.000Z",
      publicAppUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      expectedCommit: "abc123",
      pagesBuildStatus: "built",
      pagesBuildCommit: "abc123456",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
    });

    expect(packet.ready).toBe(true);
    expect(packet.liveBundle).toBe("assets/index-new.js");
    expect(packet.expectedBundle).toBe("assets/index-new.js");
    expect(packet.checks.every((check) => check.passed)).toBe(true);
    expect(packet.copyText).toContain("Ready: yes");
  });

  it("requires deployed same-origin data and seal proxy health when those runtime switches are enabled", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://app.example/kickoff-lock-agent/",
      pagesBuildStatus: "built",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
      sameOriginDataProxy: true,
      dataProxyHealthStatus: 200,
      requireOddsProxyKey: true,
      dataProxyHealthText: JSON.stringify({
        ok: true,
        service: "kickoff-data-proxy",
        apiFootballServerKey: true,
        oddsApiServerKey: true,
      }),
      sameOriginSealProxy: true,
      sealProxyHealthStatus: 200,
      sealProxyHealthText: JSON.stringify({
        ok: true,
        service: "kickoff-lock-filecoin-seal-proxy",
        tokenInjected: true,
      }),
    });

    expect(packet.ready).toBe(true);
    expect(packet.checks.find((check) => check.key === "same-origin-data-proxy-health")).toMatchObject({
      passed: true,
      detail: "HTTP 200 · service kickoff-data-proxy · apiFootballKey yes · oddsKey yes",
      url: "https://app.example/data-proxy/health",
    });
    expect(packet.checks.find((check) => check.key === "same-origin-seal-proxy-health")).toMatchObject({
      passed: true,
      detail: "HTTP 200 · service kickoff-lock-filecoin-seal-proxy · tokenInjected yes",
      url: "https://app.example/health",
    });
  });

  it("keeps same-origin data deployment evidence incomplete without server-side provider keys", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://app.example/kickoff-lock-agent/",
      pagesBuildStatus: "built",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
      sameOriginDataProxy: true,
      dataProxyHealthStatus: 200,
      requireOddsProxyKey: true,
      dataProxyHealthText: JSON.stringify({
        ok: true,
        service: "kickoff-data-proxy",
        apiFootballServerKey: false,
        oddsApiServerKey: false,
      }),
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "same-origin-data-proxy-health")).toMatchObject({
      passed: false,
      detail: "HTTP 200 · service kickoff-data-proxy · apiFootballKey no · oddsKey no",
    });
    expect(evaluatePublicDeploymentEvidenceArtifact(packet).detail).toContain("1/9 checks failed");
  });

  it("keeps same-origin Filecoin deployment evidence incomplete without server-side token injection", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://app.example/kickoff-lock-agent/",
      pagesBuildStatus: "built",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
      sameOriginSealProxy: true,
      sealProxyHealthStatus: 200,
      sealProxyHealthText: JSON.stringify({
        ok: true,
        service: "kickoff-lock-filecoin-seal-proxy",
        tokenInjected: false,
      }),
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "same-origin-seal-proxy-health")).toMatchObject({
      passed: false,
      detail: "HTTP 200 · service kickoff-lock-filecoin-seal-proxy · tokenInjected no",
    });
    expect(evaluatePublicDeploymentEvidenceArtifact(packet).detail).toContain("1/9 checks failed");
  });

  it("accepts a lagging GitHub Pages build status when the live hashed assets already match", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      expectedCommit: "fae69bd",
      pagesBuildStatus: "building",
      pagesBuildCommit: "fae69bd923",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
    });

    expect(packet.ready).toBe(true);
    expect(packet.checks.find((check) => check.key === "pages-build")).toMatchObject({
      passed: true,
      detail: "building · live assets already match",
    });
    expect(packet.nextAction).toContain("Public deployment is live");
  });

  it("fails clearly when GitHub Pages is still serving an older bundle", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      expectedCommit: "fae69bd",
      pagesBuildStatus: "building",
      pagesBuildCommit: "fae69bd923",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-old.js", "assets/index-old.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "pages-build")).toMatchObject({
      passed: false,
      detail: "building",
    });
    expect(packet.checks.find((check) => check.key === "bundle-match")).toMatchObject({
      passed: false,
      detail: "expected assets/index-new.js · live assets/index-old.js",
    });
    expect(packet.nextAction).toContain("Rerun the failed GitHub Pages deployment");
  });

  it("rejects a public deployment that points at an invalid public app URL or missing asset", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "http://localhost:4173/kickoff-lock-agent/",
      pagesBuildStatus: "built",
      liveIndexStatus: 200,
      liveIndexText: "<html></html>",
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
    });

    expect(packet.ready).toBe(false);
    expect(packet.publicAppUrl).toBe("");
    expect(packet.checks.find((check) => check.key === "public-url")?.passed).toBe(false);
    expect(packet.checks.find((check) => check.key === "live-index")?.detail).toContain("bundle missing");
  });

  it("evaluates a stored public deployment artifact for production evidence", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      pagesBuildStatus: "built",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
    });
    const evaluation = evaluatePublicDeploymentEvidenceArtifact(packet);

    expect(evaluation.passed).toBe(true);
    expect(evaluation.detail).toContain("public deployment checks passed");
    expect(evaluation.sampleIds).toContain("assets/index-new.js");
  });

  it("keeps a stale deployment artifact out of production-ready status", () => {
    const packet = buildPublicDeploymentEvidencePacket({
      publicAppUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      pagesBuildStatus: "built",
      liveIndexStatus: 200,
      liveIndexText: liveIndex("assets/index-old.js", "assets/index-old.css"),
      expectedIndexText: liveIndex("assets/index-new.js", "assets/index-new.css"),
      liveBundleStatus: 200,
      liveStylesheetStatus: 200,
    });
    const evaluation = evaluatePublicDeploymentEvidenceArtifact(packet);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.detail).toContain("artifact not ready");
    expect(evaluation.detail).toContain("bundle mismatch");
  });
});
