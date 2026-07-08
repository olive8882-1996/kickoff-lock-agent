import { isProductionProofUrl } from "./shareCard";

export type ShareChannelValidationRow = {
  proof_url?: string;
  x_intent_url?: string;
  generated_at?: string;
  x_intent_opened_at?: string;
  native_share_opened_at?: string;
};

const validTimestamp = (value: unknown) => {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time);
};

const TIMESTAMP_FUTURE_TOLERANCE_MS = 60_000;

const timestampIsNotFuture = (value: string, now = Date.now()) =>
  Date.parse(value) <= now + TIMESTAMP_FUTURE_TOLERANCE_MS;

const openedAfterGenerated = (row: ShareChannelValidationRow, openedAt?: string, now = Date.now()) => {
  if (!validTimestamp(openedAt)) return false;
  if (!validTimestamp(row.generated_at)) return false;
  return Date.parse(openedAt ?? "") >= Date.parse(row.generated_at ?? "") && timestampIsNotFuture(openedAt ?? "", now);
};

const hasRequiredHashtags = (url: URL) => {
  const tags = new Set(
    (url.searchParams.get("hashtags") ?? "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  return ["kickofflock", "filecoin", "worldcup"].every((tag) => tags.has(tag));
};

const describesProof = (text: string, proofUrl: string) =>
  /\b(kickoff lock|locked|sealed|proof)\b/i.test(text.replace(proofUrl, " "));

const validTweetText = (text: string, proofUrl: string) =>
  text.trim().length > 0 &&
  text.length <= 280 &&
  text.includes(proofUrl) &&
  describesProof(text, proofUrl);

export const xIntentProblemForProof = (row: ShareChannelValidationRow) => {
  if (!isProductionProofUrl(row.proof_url)) return "production proof_url missing";
  if (!row.x_intent_url) return "X intent URL missing";
  try {
    const url = new URL(String(row.x_intent_url));
    const hostname = url.hostname.toLowerCase();
    const text = url.searchParams.get("text") ?? "";
    if (url.protocol !== "https:" || !["twitter.com", "www.twitter.com", "x.com", "www.x.com"].includes(hostname)) {
      return "X intent host must be twitter.com or x.com over HTTPS";
    }
    if (url.pathname !== "/intent/tweet") return "X intent path must be /intent/tweet";
    if (url.searchParams.get("url") !== row.proof_url) return "X intent url parameter must match proof_url";
    if (!text.includes(row.proof_url ?? "")) return "X intent text must include proof_url";
    if (text.length > 280) return "X intent text exceeds 280 characters";
    if (!describesProof(text, row.proof_url ?? "")) {
      return "X intent text must describe the lock or proof";
    }
    if (!hasRequiredHashtags(url)) return "X intent missing KickoffLock, Filecoin or WorldCup hashtags";
    if (!validTweetText(text, row.proof_url ?? "")) return "X intent text is not publishable";
    return "";
  } catch {
    return "X intent URL is malformed";
  }
};

export const validXIntentForProof = (row: ShareChannelValidationRow) => {
  return !xIntentProblemForProof(row);
};

export const productionShareChannelProblem = (row: ShareChannelValidationRow) => {
  const xIntentProblem = xIntentProblemForProof(row);
  if (xIntentProblem) return xIntentProblem;
  if (!openedAfterGenerated(row, row.x_intent_opened_at) && !openedAfterGenerated(row, row.native_share_opened_at)) {
    return "opened timestamp missing, invalid, before generated_at or in the future";
  }
  return "";
};

export const hasProductionShareChannelEvidence = (row: ShareChannelValidationRow) =>
  !productionShareChannelProblem(row);
