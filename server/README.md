# Adzuna proxy service

Local proxy for Adzuna search to keep API keys server-side.

## Setup

1) Copy the environment template:

```
cp .env.example .env
```

2) Add your Adzuna and Companies House credentials:

```
ADZUNA_APP_ID=your_app_id
ADZUNA_APP_KEY=your_app_key
COMPANIES_HOUSE_API_KEY=your_company_house_key
```

3) Build the proxy:

```
npm run server:build
```

4) Start the proxy:

```
npm run server:start
```

The proxy listens on `http://localhost:8787` by default.

## Endpoints

`GET /api/jobs/search`

Query parameters:

- `q` — keywords
- `where` — location
- `page` — page number (default 1)
- `radius_km` — distance radius
- `remote_only` — `true` or `1` to bias remote roles

Responses are normalised to:

```
{
  results: [
    {
      id,
      title,
      company,
      redirect_url,
      created,
      description_snippet,
      location_name,
      lat,
      lon
    }
  ],
  count,
  page,
  cached
}
```

## Widget API

`POST /api/widget/score`

Headers:

- `X-API-Key` — partner server API key
- `Content-Type: application/json`

This endpoint is server-to-server only. Requests with an `Origin` header are
rejected so partner keys cannot be embedded in browser integrations. Browser
widgets must call a same-origin partner endpoint, which validates the payload
and forwards it with the server-side key.

Request payload:

```
{
  "title": "Job title",
  "employer": "Company",
  "locationName": "London",
  "lat": 51.5,
  "lon": -0.12,
  "remoteFlag": false,
  "jobUrl": "https://partner.test/jobs/123"
}
```

Response payload:

```
{
  "badgeText": "123 kgCO2e/yr",
  "status": "ok",
  "score": 123,
  "breakdown": {
    "distanceKm": 12.3,
    "officeDaysPerWeek": 3,
    "annualKm": 3394,
    "emissionFactorKgPerKm": 0.171,
    "annualKgCO2e": 581
  },
  "reason": ""
}
```

### Configuration

Configure partner keys and allowed job URL origins via `WIDGET_PARTNERS_JSON`:

```
WIDGET_PARTNERS_JSON=[{"key":"partner-key","name":"Partner","origins":["https://partner.test"],"cacheTtlDays":3}]
```

`key` is a secret and must never be sent to a browser. `origins` limits the
origins accepted in request `jobUrl` values; it is not a CORS authentication
mechanism.

Optional defaults:

```
WIDGET_HOME_LAT=51.5074
WIDGET_HOME_LON=-0.1278
WIDGET_COMMUTE_MODE=car
WIDGET_OFFICE_DAYS=3
WIDGET_CACHE_MAX=500
WIDGET_RATE_LIMIT_WINDOW_MS=60000
WIDGET_RATE_LIMIT_MAX=120
`GET /api/employer/resolve`

Query parameters:

- `name` — employer name (required)
- `hint_location` — optional location hint for ranking

Response:

```
{
  candidates: [
    {
      company_number,
      title,
      status,
      address_snippet,
      sic_codes,
      score,
      reasons,
      org_classification,
      classification_reasons
    }
  ],
  cached
}
```

`GET /api/employer/signals`

Query parameters:

- `company_number` — Companies House number (required)
- `company_name` — optional Companies House title for SBTi matching

Response:

```
{
  company_number,
  sic_codes,
  sector_intensity_band,
  sector_intensity_value,
  sector_intensity_sic_code,
  sector_description,
  sbti: {
    match_status,
    match_confidence,
    matched_company_name,
    sbti_id,
    near_term_status,
    near_term_target_classification,
    near_term_target_year,
    net_zero_status,
    net_zero_year,
    ba15_status,
    date_updated,
    reason_for_extension_or_removal,
    sources
  },
  sources,
  cached
}
```
