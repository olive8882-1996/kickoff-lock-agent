import type { AppView } from "./types";

const appViews: AppView[] = ["matches", "predict", "memory", "verify", "account", "modes", "profile"];

export const appViewFromParams = (params: URLSearchParams): AppView => {
  const view = params.get("view")?.toLowerCase();
  if (view === "leaderboard") return "memory";
  if (appViews.includes(view as AppView)) return view as AppView;

  const action = params.get("action")?.toLowerCase();
  if (action === "lock") return "predict";
  if (action === "verify") return "verify";

  return "matches";
};

export const initialAppViewFromLocation = (): AppView => {
  if (typeof window === "undefined") return "matches";
  return appViewFromParams(new URLSearchParams(window.location.search));
};
