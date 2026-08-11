# agri_stat_displayer

Agricola card lookup PWA: search card text and compare per-card play statistics across
datasets. Phone-first, installable, works offline.

Live at <https://agricola.aslakhellevik.no>. [Project write-up](https://aslakhellevik.no/projects/agricola-stats/).

## Data and takedown

This is a non-commercial fan tool. The shipped datasets are snapshots of publicly
available pages from [AgricolaCards](https://www.agricolacards.com/) and
[Agricola Norge](https://agricola.no/), and **no redistribution licence has been granted
for either**. Agricola card text remains the copyright of its publisher.

If you hold rights to any of this material and would like it removed, email
<ah@aslakhellevik.no> and I will take it down. The MIT licence covers the source code of
this project only, not the datasets in `public/datasets/`.

## What it does

- Search cards by name and card text; filter by card type and edition.
- Switch between datasets, each with its own source, snapshot date and licence note.
- Show per-card statistics in list and detail views, including ADP and PWR where the
  dataset provides them.
- For the Agricola Norge 4-player data, score an opening hand against a precomputed
  Monte Carlo baseline.

Values are not comparable across datasets — the app says so, and only ever compares
within the active one.

## Quick start

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

```bash
npm run test:run   # vitest
npm run build      # tsc -b && vite build
npm run deploy     # build, then wrangler deploy
```

## Data refresh

```bash
npm run data:refresh
```

This fetches the AgricolaCards snapshot, ingests the Agricola Norge table, regenerates
the hand-strength baseline, and validates every output against its schema. Optional
manual import paths (`data:import:csv`, `data:import:bgg`) exist for BoardGameGeek
exports and generic CSVs.

See [`docs/datasets.md`](docs/datasets.md) for sources, templates, output files and
deterministic-timestamp options.

## Project layout

| Path | Contents |
| --- | --- |
| `src/` | app UI, data loading, search and hand-strength logic |
| `scripts/` | dataset fetch, ingest, import and validation scripts |
| `public/datasets/` | generated dataset JSON served by the app |
| `public/baselines/` | precomputed Monte Carlo hand-strength baselines |
| `datasets/_imports`, `datasets/_bgg` | manual import templates and input |
| `docs/datasets.md` | data source and refresh documentation |

## Hosting

Deployed as a Cloudflare Worker serving the static build. `wrangler.jsonc` declares
`agricola.aslakhellevik.no` as a custom domain, so wrangler creates and manages that DNS
record itself — never add it by hand. Declaring a route also disables the `workers.dev`
URL; add `"workers_dev": true` if you ever want a staging URL back.

## Licence

MIT — see [`LICENSE`](LICENSE). Source code only; see **Data and takedown** above.
