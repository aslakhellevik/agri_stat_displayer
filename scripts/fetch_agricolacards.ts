import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { CardRecord, DatasetPackage } from "./lib/contracts";
import { publicDatasetsDir, rawDataDir, writeJson } from "./lib/io";
import { canonicalIdFromParts, normalizeCardType, normalizeName } from "./lib/normalize";
import { getGeneratedAt } from "./lib/timestamps";

const SOURCE_URL = "https://www.agricolacards.com/get-cards";
const RAW_SNAPSHOT_PATH = path.join(rawDataDir, "agricolacards_get_cards_snapshot.json");
const OUTPUT_DATASET_PATH = path.join(publicDatasetsDir, "agricolacards_get_cards_local.json");

interface AgricolaCardsRow {
  base_expansion?: unknown;
  card_title?: unknown;
  cost?: unknown;
  players?: unknown;
  vps?: unknown;
  text?: unknown;
  type?: unknown;
}

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value.trim() : undefined);
const asDisplayString = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value}`
    : typeof value === "string"
      ? value.trim()
      : undefined;

const normalizeExpansionTag = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "base") {
    return "Base Cards";
  }
  if (normalized === "expansion") {
    return "Expansion Cards";
  }

  return value;
};

const canReadFile = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const parseRows = (payload: unknown): AgricolaCardsRow[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is AgricolaCardsRow => Boolean(row && typeof row === "object"));
};

const makeRowSuffix = (row: AgricolaCardsRow): string => {
  const expansion = asString(row.base_expansion);
  const players = asString(row.players);
  const cost = asString(row.cost);
  const parts = [expansion, players, cost].filter((value): value is string => Boolean(value));
  if (parts.length === 0) {
    return "";
  }
  return normalizeName(parts.join("_")).slice(0, 20);
};

const ensureUniqueCanonicalId = (preferred: string, row: AgricolaCardsRow, used: Set<string>): string => {
  if (!used.has(preferred)) {
    return preferred;
  }

  const rowSuffix = makeRowSuffix(row);
  if (rowSuffix) {
    const withRowSuffix = `${preferred}_${rowSuffix}`;
    if (!used.has(withRowSuffix)) {
      return withRowSuffix;
    }
  }

  let index = 2;
  while (used.has(`${preferred}_${index}`)) {
    index += 1;
  }
  return `${preferred}_${index}`;
};

const rowToCard = (row: AgricolaCardsRow, used: Set<string>): CardRecord | null => {
  const name = asString(row.card_title);
  const typeRaw = asString(row.type);
  const text = asString(row.text) ?? "";
  if (!name || !typeRaw) {
    return null;
  }

  let cardType: CardRecord["cardType"];
  try {
    cardType = normalizeCardType(typeRaw);
  } catch {
    return null;
  }

  const baseCanonicalId = canonicalIdFromParts("mixed", cardType, name);
  const canonicalId = ensureUniqueCanonicalId(baseCanonicalId, row, used);
  used.add(canonicalId);

  const expansion = normalizeExpansionTag(asString(row.base_expansion));
  const cost = asString(row.cost);
  const players = asString(row.players);
  const vps = asDisplayString(row.vps);
  const metadata: Record<string, string> = {};
  if (expansion) {
    metadata.expansion = expansion;
  }
  if (cost) {
    metadata.cost = cost;
  }
  if (players) {
    metadata.playerCount = players;
  }
  if (vps) {
    metadata.vps = vps;
  }
  metadata.type = typeRaw;

  return {
    canonicalId,
    name,
    aliases: [],
    cardType,
    text,
    metadata
  };
};

const fallbackCards = (): CardRecord[] => [
  {
    canonicalId: "mixed:occupation:academic",
    name: "Academic",
    aliases: [],
    cardType: "occupation",
    text: "This card counts as 2 Occupations for Minor Improvements and when scoring the \"Reeve\" Occupation card.",
    metadata: {
      expansion: "Base Cards",
      cost: "",
      playerCount: "3+",
      type: "Occupation"
    }
  }
];

const run = async (): Promise<void> => {
  let payload: unknown = null;

  if (await canReadFile(RAW_SNAPSHOT_PATH)) {
    const raw = JSON.parse(await readFile(RAW_SNAPSHOT_PATH, "utf-8")) as { payload?: unknown };
    payload = raw.payload ?? null;
  } else {
    try {
      const response = await fetch(SOURCE_URL);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      payload = await response.json();
      await writeJson(RAW_SNAPSHOT_PATH, {
        fetchedAt: getGeneratedAt(),
        sourceMode: "local",
        sourceUrl: SOURCE_URL,
        payload
      });
    } catch {
      payload = null;
    }
  }

  const rows = parseRows(payload);
  const used = new Set<string>();
  let invalidRows = 0;
  const cards = rows
    .map((row) => {
      const card = rowToCard(row, used);
      if (!card) {
        invalidRows += 1;
      }
      return card;
    })
    .filter((card): card is CardRecord => Boolean(card))
    .sort((a, b) => a.name.localeCompare(b.name));

  const outputCards = cards.length > 0 ? cards : fallbackCards();
  const usedFallbackSample = cards.length === 0;
  const importNote = usedFallbackSample
    ? `Included fields: expansion, card title, cost, player count, vps, text, type. Invalid rows skipped: ${invalidRows}. Local snapshot missing or invalid; fallback sample emitted.`
    : `Included fields: expansion, card title, cost, player count, vps, text, type. Invalid rows skipped: ${invalidRows}.`;

  const generatedAt = getGeneratedAt();
  const dataset: DatasetPackage = {
    manifest: {
      id: "agricolacards_get_cards_local",
      label: "AgricolaCards Snapshot (get-cards)",
      version: generatedAt.slice(0, 10),
      sourceName: "AgricolaCards",
      sourceUrl: SOURCE_URL,
      edition: "mixed",
      comparabilityGroup: "metadata_reference",
      generatedAt,
      licenseNote:
        "Snapshot of publicly available card data from agricolacards.com. No redistribution licence has been granted; included here for a non-commercial fan tool and removed on request.",
      hasFullCardText: outputCards.every((card) => card.text.trim().length > 0),
      hasStats: false,
      importStatus: {
        sourceMode: "local",
        sourceRows: rows.length,
        importedCards: outputCards.length,
        note: importNote
      }
    },
    cards: outputCards,
    stats: []
  };

  await writeJson(OUTPUT_DATASET_PATH, dataset);
  console.log(`agricolacards: wrote ${dataset.cards.length} cards using local snapshot mode.`);
};

void run();
