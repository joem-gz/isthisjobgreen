# IsThisJobGreen? Jobs (MVP)

Chrome Extension that adds an IsThisJobGreen? badge to Reed job cards. It estimates
commute-only annual CO2e using straight-line distance and UK emission factors.

## What it does

- Works on `https://www.reed.co.uk/jobs*` results pages.
- Reads job location names (e.g. "Basingstoke, Hampshire").
- Resolves the place to a centroid using OS Open Names (local index).
- Resolves your home postcode via Postcodes.io.
- Calculates annual commute CO2e for the selected commute mode and office days.
- Includes an IsThisJobGreen? Search page powered by an Adzuna proxy.

Badge states:

- `Set postcode` when no home postcode is stored.
- `0 kgCO2e/yr` for "Work from home" or "Remote".
- `No data` for overly broad locations (e.g. United Kingdom, UK, Nationwide).
- `X kgCO2e/yr` when place resolution succeeds.

## Build and load

1) Install dependencies:

```bash
npm install
```

2) Build the extension:

```bash
npm run build
```

3) Load unpacked in Chrome:

- Open `chrome://extensions`
- Enable Developer mode
- Click "Load unpacked"
- Select the `dist` folder

## Usage

- Open the extension popup and set:
  - Home postcode
  - Commute mode
  - Office days per week
- Visit `https://www.reed.co.uk/jobs` and browse results.
- Hover a badge to see the breakdown.
- In the popup, click "Open IsThisJobGreen? Search" to run Adzuna searches.

## Adzuna proxy

The search page calls a local proxy so Adzuna keys are never embedded in the extension.

1) Copy `server/.env.example` to `server/.env` and add your Adzuna keys.
2) Build and start the proxy:

```bash
npm run server:build
npm run server:start
```

## Data sources

- Companies House API — employer SIC codes (API key required).
- ONS Environmental Accounts — Atmospheric emissions: GHG emissions intensity
  (Table 1b). Snapshot stored in `server/data/ons/04atmosphericemissionsghgintensity.xlsx`
  under the Open Government Licence.

## Privacy

- Stored locally: home postcode, commute mode, office days per week (sync storage).
- Cached locally: geocode lookups for home postcode (local storage).
- Network calls: Postcodes.io (home postcode only), local Adzuna proxy for search queries.
- Job locations are resolved locally via the OS Open Names index.

## Security

- Keep API credentials server-side and follow the
  [credential handling and rotation guide](docs/security/credential-handling.md).
- Enable the repository's pinned Gitleaks pre-commit hook before contributing.

## Notes and caveats

- Uses straight-line distance (haversine), not routing.
- Location resolution is approximate (place centroid, not a specific address).

## Plans

- current plan.md for development agents is at the root of this repo.
- previous archive of plans is in docs/plans
