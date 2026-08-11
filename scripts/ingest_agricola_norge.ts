import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parseNorgeHtml, type ParsedNorgeRow } from "./lib/agricolaNorge";
import type { CardRecord, CardType, DatasetPackage, StatRecord } from "./lib/contracts";
import { publicDatasetsDir, rawDataDir, reportsDir, writeJson, writeText } from "./lib/io";
import { canonicalIdFromParts, normalizeCardType, normalizeEdition } from "./lib/normalize";
import { getGeneratedAt } from "./lib/timestamps";

const SOURCE_URL = "https://agricola.no/play-agricola-4player-card-statistics/";
const LOCAL_HTML_PATH = path.join(rawDataDir, "agricola_norge_play_agricola_4p.html");

const canReadFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const readSourceHtml = async (): Promise<{ html: string; mode: "local_file" | "network" | "fallback" }> => {
  if (await canReadFile(LOCAL_HTML_PATH)) {
    const localHtml = await readFile(LOCAL_HTML_PATH, "utf-8");
    return { html: localHtml, mode: "local_file" };
  }

  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    await writeText(LOCAL_HTML_PATH, html);
    return { html, mode: "network" };
  } catch {
    return { html: "", mode: "fallback" };
  }
};

const sourceTypeToCardType = (rawType: string | undefined, fallbackType?: CardType): CardType => {
  if (!rawType) {
    return fallbackType ?? "occupation";
  }

  const normalized = rawType.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  try {
    return normalizeCardType(normalized);
  } catch {
    return fallbackType ?? "occupation";
  }
};

const ensureUniqueCanonicalId = (
  preferredCanonicalId: string,
  sourceCardUuid: string | undefined,
  used: Set<string>
): string => {
  if (!used.has(preferredCanonicalId)) {
    return preferredCanonicalId;
  }

  if (sourceCardUuid) {
    const suffix = sourceCardUuid.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10);
    const alternative = `${preferredCanonicalId}_${suffix}`;
    if (!used.has(alternative)) {
      return alternative;
    }
  }

  let index = 2;
  while (used.has(`${preferredCanonicalId}_${index}`)) {
    index += 1;
  }
  return `${preferredCanonicalId}_${index}`;
};

const buildCardRecord = (row: ParsedNorgeRow, canonicalId: string, fallbackType?: CardType): CardRecord => {
  const aliases = row.sourcePlayAgricolaCardName && row.sourcePlayAgricolaCardName !== row.name ? [row.sourcePlayAgricolaCardName] : [];
  const metadata: Record<string, string> = {
    source: "Agricola Norge",
    sourceCardUuid: row.sourceCardUuid ?? "",
    sourcePlayAgricolaCardName: row.sourcePlayAgricolaCardName ?? "",
    sourceCardType: row.sourceCardType ?? ""
  };

  const card: CardRecord = {
    canonicalId,
    name: row.name,
    aliases,
    cardType: sourceTypeToCardType(row.sourceCardType, fallbackType),
    text: "",
    metadata
  };

  if (row.deckHint?.trim()) {
    card.deck = row.deckHint.trim();
  }

  return card;
};

const fallbackDataset = (): DatasetPackage => ({
  manifest: {
    id: "agricola_norge_full_4p_play_agricola",
    label: "Agricola Norge Full 4P (Play-Agricola Source)",
    version: "fallback",
    sourceName: "Agricola Norge",
    sourceUrl: SOURCE_URL,
    edition: "mixed",
    comparabilityGroup: "norge_4p_play_agricola_counts",
    generatedAt: getGeneratedAt(),
    licenseNote:
      "Aggregated play statistics from agricola.no. No redistribution licence has been granted; included here for a non-commercial fan tool and removed on request.",
    hasFullCardText: false,
    hasStats: true,
    importStatus: {
      sourceMode: "local",
      sourceRows: 1,
      importedCards: 1,
      note: "Live/local source unavailable; fallback sample emitted."
    }
  },
  cards: [
    {
      canonicalId: "old:minor_improvement:abandoned_willow",
      name: "Abandoned Willow",
      aliases: [],
      cardType: "minor_improvement",
      text: ""
    }
  ],
  stats: [
    {
      canonicalId: "old:minor_improvement:abandoned_willow",
      metricSet: "4p_comp",
      bannedCount: 0,
      dealtCount: 1343,
      draftedCount: 874,
      playedCount: 560,
      wonCount: 172,
      adp: 5.2,
      pwr: 1.8
    }
  ]
});

const run = async (): Promise<void> => {
  const source = await readSourceHtml();
  if (source.mode === "fallback" || source.html.trim().length === 0) {
    const fallback = fallbackDataset();
    await writeJson(path.join(publicDatasetsDir, "agricola_norge_full_4p_play_agricola.json"), fallback);
    await writeJson(path.join(reportsDir, "unmatched_cards_norge.json"), []);
    console.log("agricola_norge: source unavailable, wrote fallback dataset.");
    return;
  }

  const parsedRows = parseNorgeHtml(source.html);
  if (parsedRows.length === 0) {
    const fallback = fallbackDataset();
    await writeJson(path.join(publicDatasetsDir, "agricola_norge_full_4p_play_agricola.json"), fallback);
    await writeJson(path.join(reportsDir, "unmatched_cards_norge.json"), []);
    console.log("agricola_norge: parsed zero rows, wrote fallback dataset.");
    return;
  }

  const cards = new Map<string, CardRecord>();
  const stats: StatRecord[] = [];
  const usedCanonicalIds = new Set<string>();

  for (const row of parsedRows) {
    const rowCardType = sourceTypeToCardType(row.sourceCardType);
    const canonicalEdition = normalizeEdition("mixed", row.deckHint);
    const canonicalBase = canonicalIdFromParts(canonicalEdition, rowCardType, row.name);
    const canonicalId = ensureUniqueCanonicalId(canonicalBase, row.sourceCardUuid, usedCanonicalIds);
    usedCanonicalIds.add(canonicalId);

    cards.set(canonicalId, buildCardRecord(row, canonicalId, rowCardType));
    stats.push({
      canonicalId,
      metricSet: "4p_comp",
      ...row.stat
    });
  }

  const generatedAt = getGeneratedAt();
  const dataset: DatasetPackage = {
    manifest: {
      id: "agricola_norge_full_4p_play_agricola",
      label: "Agricola Norge Full 4P (Play-Agricola Source)",
      version: generatedAt.slice(0, 10),
      sourceName: "Agricola Norge",
      sourceUrl: SOURCE_URL,
      edition: "mixed",
      comparabilityGroup: "norge_4p_play_agricola_counts",
      generatedAt,
      licenseNote:
        "Aggregated play statistics from agricola.no. No redistribution licence has been granted; included here for a non-commercial fan tool and removed on request.",
      hasFullCardText: false,
      hasStats: stats.length > 0,
      importStatus: {
        sourceMode: "local",
        sourceRows: parsedRows.length,
        importedCards: cards.size
      }
    },
    cards: Array.from(cards.values()).sort((a, b) => a.name.localeCompare(b.name)),
    stats
  };

  await writeJson(path.join(publicDatasetsDir, "agricola_norge_full_4p_play_agricola.json"), dataset);
  await writeJson(path.join(reportsDir, "unmatched_cards_norge.json"), []);
  console.log(`agricola_norge: wrote ${dataset.stats.length} rows.`);
};

void run();
