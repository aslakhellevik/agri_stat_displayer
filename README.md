# agri_stat_displayer

General Agricola card lookup PWA with card text and dataset-specific statistics.

Built and maintained by Aslak Hellevik. Card text and stats are sourced from publicly available pages (see `docs/datasets.md`); each shipped dataset carries a `licenseNote` field declaring it approved for publication.

## What it does

1. Mobile-friendly lookup with installable PWA support.
2. Search cards by name and card text.
3. Filter by available card type and edition in the active dataset.
4. Switch between datasets and view source/snapshot metadata.
5. Show per-card stats in both list and detail views (including PWR where available).
6. Show import status for each dataset at the bottom of the page.

## Built-in datasets

1. `agricolacards_get_cards_local` (card metadata snapshot)
2. `agricola_norge_full_4p_play_agricola` (Agricola Norge stats snapshot)

## Quick start

```bash
npm install
npm run dev
```

Other common commands:

```bash
npm run test:run
npm run build
```

## Data refresh workflow

```bash
npm run data:refresh
```

This runs:

1. `scripts/fetch_agricolacards.ts`
2. `scripts/ingest_agricola_norge.ts`
3. `scripts/generate_norge_hand_strength_baseline.ts`
4. `scripts/validate_datasets.ts`

Optional manual imports:

```bash
npm run data:baseline:norge-hand
npm run data:import:csv
npm run data:import:bgg
```

See `docs/datasets.md` for source details, templates, and output files.

## Project layout (cleaned)

1. `src/` app UI and data loading/search logic
2. `scripts/` dataset fetch/ingest/import/validation scripts
3. `public/datasets/` generated dataset JSON files used by the app
4. `datasets/_imports` and `datasets/_bgg` manual import templates/input
5. `public/baselines/` precomputed Monte Carlo hand-strength baselines
6. `docs/datasets.md` data source and refresh documentation

## Hosting

Production build is deployed as a Cloudflare Worker (configured in `wrangler.jsonc`). The live URL is `https://agri-stat-displayer.aslakhellevik2002.workers.dev`; a custom subdomain will be added once the parent zone is on Cloudflare.

```bash
npm run deploy
```

## License

Released under the MIT License — see `LICENSE`.
