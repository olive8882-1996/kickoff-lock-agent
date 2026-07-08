import { describe, expect, it } from "vitest";
import { validatePublicShareImageBytes } from "./shareImageValidation";

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

describe("share image validation", () => {
  it("accepts a production-sized public PNG share card", () => {
    const result = validatePublicShareImageBytes({
      ok: true,
      status: 200,
      contentType: "image/png",
      bytes: pngBytes(),
    });

    expect(result.passed).toBe(true);
    expect(result.detail).toContain("1200x675");
    expect(result.problems).toEqual([]);
  });

  it("rejects tiny placeholders and unsupported MIME types", () => {
    const result = validatePublicShareImageBytes({
      ok: true,
      status: 200,
      contentType: "text/html",
      bytes: new Uint8Array([1, 2, 3, 4]),
    });

    expect(result.passed).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining(["unsupported mime text/html", "image bytes 4/10000", "image dimensions unreadable"]),
    );
  });
});
