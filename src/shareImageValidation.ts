export type ShareImageDimensions = {
  width: number;
  height: number;
};

export type PublicShareImageValidation = {
  passed: boolean;
  detail: string;
  mime: string;
  byteLength: number;
  dimensions?: ShareImageDimensions;
  problems: string[];
};

export const PRODUCTION_SHARE_IMAGE_MIN_BYTES = 10_000;
export const PRODUCTION_SHARE_IMAGE_MIN_WIDTH = 1_000;
export const PRODUCTION_SHARE_IMAGE_MIN_HEIGHT = 560;
export const PRODUCTION_SHARE_IMAGE_MIN_ASPECT = 1.5;
export const PRODUCTION_SHARE_IMAGE_MAX_ASPECT = 1.9;

const normalizedMime = (contentType: string) => contentType.split(";")[0]?.trim().toLowerCase() ?? "";

const readUint24Le = (bytes: Uint8Array, offset: number) =>
  bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16);

const pngDimensions = (bytes: Uint8Array): ShareImageDimensions | undefined => {
  if (
    bytes.length < 29 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
};

const jpegDimensions = (bytes: Uint8Array): ShareImageDimensions | undefined => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    const standalone = marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7);
    if (standalone) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && length >= 7) {
      return {
        height: (bytes[offset + 5]! << 8) + bytes[offset + 6]!,
        width: (bytes[offset + 7]! << 8) + bytes[offset + 8]!,
      };
    }
    offset += 2 + length;
  }
  return undefined;
};

const webpDimensions = (bytes: Uint8Array): ShareImageDimensions | undefined => {
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (bytes.length < 30 || riff !== "RIFF" || webp !== "WEBP") return undefined;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: readUint24Le(bytes, 24) + 1,
      height: readUint24Le(bytes, 27) + 1,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21]!;
    const b1 = bytes[22]!;
    const b2 = bytes[23]!;
    const b3 = bytes[24]!;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + ((b3 << 6) | (b2 >> 2) | ((b1 & 0xc0) << 6)),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes[26]! | ((bytes[27]! & 0x3f) << 8),
      height: bytes[28]! | ((bytes[29]! & 0x3f) << 8),
    };
  }
  return undefined;
};

export const shareImageDimensions = (bytes: Uint8Array, mime: string): ShareImageDimensions | undefined => {
  const type = normalizedMime(mime);
  if (type === "image/png") return pngDimensions(bytes);
  if (type === "image/jpeg" || type === "image/jpg") return jpegDimensions(bytes);
  if (type === "image/webp") return webpDimensions(bytes);
  return undefined;
};

export const validatePublicShareImageBytes = ({
  ok,
  status,
  contentType,
  bytes,
}: {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: Uint8Array;
}): PublicShareImageValidation => {
  const mime = normalizedMime(contentType);
  const allowedMime = mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg" || mime === "image/webp";
  const dimensions = shareImageDimensions(bytes, mime);
  const aspect = dimensions ? dimensions.width / dimensions.height : 0;
  const problems = [
    ok ? "" : `HTTP ${status}`,
    allowedMime ? "" : `unsupported mime ${mime || "missing"}`,
    bytes.byteLength >= PRODUCTION_SHARE_IMAGE_MIN_BYTES
      ? ""
      : `image bytes ${bytes.byteLength}/${PRODUCTION_SHARE_IMAGE_MIN_BYTES}`,
    dimensions ? "" : "image dimensions unreadable",
    dimensions && dimensions.width >= PRODUCTION_SHARE_IMAGE_MIN_WIDTH
      ? ""
      : dimensions
        ? `width ${dimensions.width}/${PRODUCTION_SHARE_IMAGE_MIN_WIDTH}`
        : "",
    dimensions && dimensions.height >= PRODUCTION_SHARE_IMAGE_MIN_HEIGHT
      ? ""
      : dimensions
        ? `height ${dimensions.height}/${PRODUCTION_SHARE_IMAGE_MIN_HEIGHT}`
        : "",
    dimensions && aspect >= PRODUCTION_SHARE_IMAGE_MIN_ASPECT && aspect <= PRODUCTION_SHARE_IMAGE_MAX_ASPECT
      ? ""
      : dimensions
        ? `aspect ${aspect.toFixed(2)} outside ${PRODUCTION_SHARE_IMAGE_MIN_ASPECT}-${PRODUCTION_SHARE_IMAGE_MAX_ASPECT}`
        : "",
  ].filter(Boolean);
  const detailBase = `${mime || "unknown content-type"} · ${bytes.byteLength} bytes${
    dimensions ? ` · ${dimensions.width}x${dimensions.height}` : ""
  }`;
  return {
    passed: problems.length === 0,
    detail: problems.length === 0 ? detailBase : `${detailBase} · ${problems.join("; ")}`,
    mime,
    byteLength: bytes.byteLength,
    dimensions,
    problems,
  };
};

export const validatePublicShareImageResponse = async (response: Response): Promise<PublicShareImageValidation> => {
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return validatePublicShareImageBytes({
    ok: response.ok,
    status: response.status,
    contentType,
    bytes,
  });
};
