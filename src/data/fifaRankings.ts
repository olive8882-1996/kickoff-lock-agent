export type RankingSnapshot = {
  rank: number;
  source: string;
  updatedAt: string;
};

const snapshotSource = "FIFA/Coca-Cola Men's World Ranking snapshot, 2026-06-11";

const aliases: Record<string, string> = {
  "côte divoire": "ivory coast",
  "cote divoire": "ivory coast",
  "cote d ivoire": "ivory coast",
  "congo dr": "congo dr",
  "dr congo": "congo dr",
  "iran": "iran",
  "ir iran": "iran",
  "korea republic": "south korea",
  "south korea": "south korea",
  "turkiye": "türkiye",
  "türkiye": "türkiye",
  "usa": "united states",
  "united states": "united states",
};

const normalizeTeam = (team: string) => {
  const key = team
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return aliases[key] ?? key;
};

const rankingRows: Array<[string, number]> = [
  ["Argentina", 1],
  ["Spain", 2],
  ["France", 3],
  ["England", 4],
  ["Portugal", 5],
  ["Brazil", 6],
  ["Morocco", 7],
  ["Netherlands", 8],
  ["Belgium", 9],
  ["Germany", 10],
  ["Croatia", 11],
  ["Italy", 12],
  ["Colombia", 13],
  ["Mexico", 14],
  ["Senegal", 15],
  ["Uruguay", 16],
  ["United States", 17],
  ["Japan", 18],
  ["Switzerland", 19],
  ["Iran", 20],
  ["Denmark", 21],
  ["Türkiye", 22],
  ["Ecuador", 23],
  ["Austria", 24],
  ["South Korea", 25],
  ["Nigeria", 26],
  ["Australia", 27],
  ["Algeria", 28],
  ["Egypt", 29],
  ["Canada", 30],
  ["Norway", 31],
  ["Ukraine", 32],
  ["Ivory Coast", 33],
  ["Panama", 34],
  ["Russia", 35],
  ["Poland", 36],
  ["Wales", 37],
  ["Sweden", 38],
  ["Hungary", 39],
  ["Czechia", 40],
  ["Paraguay", 41],
  ["Scotland", 42],
  ["Serbia", 43],
  ["Cameroon", 44],
  ["Tunisia", 45],
  ["Congo DR", 46],
  ["Slovakia", 47],
  ["Greece", 48],
  ["Venezuela", 49],
  ["Uzbekistan", 50],
  ["Qatar", 56],
  ["Iraq", 57],
  ["South Africa", 60],
  ["Saudi Arabia", 61],
  ["Jordan", 63],
  ["Bosnia and Herzegovina", 64],
  ["Cape Verde", 67],
];

const rankingMap = new Map(
  rankingRows.map(([team, rank]) => [
    normalizeTeam(team),
    {
      rank,
      source: snapshotSource,
      updatedAt: "2026-06-11",
    },
  ]),
);

export const lookupFifaRanking = (team: string): RankingSnapshot | undefined => rankingMap.get(normalizeTeam(team));

export const rankLabel = (team: string) => {
  const ranking = lookupFifaRanking(team);
  return ranking ? `#${ranking.rank} · ${ranking.source}` : "No ranking snapshot match";
};
