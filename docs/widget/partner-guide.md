# IsThisJobGreen? Widget Partner Guide

## Overview
The IsThisJobGreen? widget renders commute CO2 badges for job listings and detail pages. Partners can integrate in two ways:

1) **Server-side render (SSR)** — compute scores server-side and inject into the page.
2) **Client-side scan** — embed the widget script and let it fetch scores from a same-origin endpoint operated by the partner.

## Server-side render (preferred)

1) Call the IsThisJobGreen? API from your backend.
2) Inject the response into the page:

```
<span data-carbonrank='{"status":"ok","score":123,"breakdown":{"annualKgCO2e":123}}'></span>
```

3) Load the widget assets:

```
<link rel="stylesheet" href="https://cdn.example.com/widget-1.0.0.css" />
<script src="https://cdn.example.com/widget-1.0.0.js"></script>
<script>window.CarbonRankWidget?.init?.();</script>
```

## Client-side scan (pilots)

1) Load the widget assets:

```
<link rel="stylesheet" href="https://cdn.example.com/widget-1.0.0.css" />
<script src="https://cdn.example.com/widget-1.0.0.js"></script>
```

2) Configure the widget:

```
window.CarbonRankWidget?.init?.({
  apiBaseUrl: "/api/widget/score",
  cardSelector: ".job-card",
  fields: {
    employer: ".job-card__employer",
    location: ".job-card__location",
    link: ".job-card__link"
  }
});
```

The browser endpoint must be same-origin. It forwards the validated request from
the partner server to the central IsThisJobGreen? API and adds the partner key
there. Never put the partner key in browser JavaScript, HTML, or a public bundle.

Example partner-server request:

```js
const response = await fetch("https://api.example.com/api/widget/score", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.IS_THIS_JOB_GREEN_API_KEY,
  },
  body: JSON.stringify(validatedWidgetRequest),
});
```

The central API rejects requests carrying an `Origin` header. This makes the
partner key a server-side credential rather than a browser-visible identifier.

## JSON-LD detail pages
If the job detail page contains `JobPosting` JSON-LD, the widget inserts a badge beneath the page `<h1>` automatically and requests scores from the API.

Remote roles are treated as 0 kgCO2e/yr when:
- `jobLocationType` is `TELECOMMUTE`, or
- `applicantLocationRequirements` is present.

## API request payload

```
{
  "title": "Job title",
  "employer": "Company",
  "locationName": "London",
  "lat": 51.5,
  "lon": -0.12,
  "remoteFlag": false,
  "jobUrl": "https://partner.example/jobs/123"
}
```

## CSP and request security

- Add the widget CDN to `script-src` and `style-src`.
- A relative same-origin endpoint works with the site's existing `connect-src 'self'` policy.
- Validate and bound the request again in the partner endpoint before forwarding it.
- Do not forward the browser's `Origin` header to the central API.
- Keep the partner key in a server-side secret manager and rotate it if it was ever browser-visible.

## SRI (optional)
Provide Subresource Integrity hashes in partner docs once assets are published:

```
<script src=".../widget-1.0.0.js" integrity="sha384-..." crossorigin="anonymous"></script>
```

## Demo deployment plan (static hosting)

1) Build the widget assets: `npm run build:widget`.
2) Upload `dist/widget-1.0.0.js` and `dist/widget-1.0.0.css` to a static host (S3, Cloudflare R2, Netlify).
3) Enable long-lived cache headers (1 year) and versioned URLs.
4) Share the CDN URL with partners and update the API allowlist.

## Troubleshooting

- **No badge appears**: ensure the widget script is loaded and `window.CarbonRankWidget.init()` runs.
- **Cross-origin endpoint error**: configure a relative same-origin `apiBaseUrl` and proxy the request from the partner server.
- **No data**: check that location data is present or that lat/lon can be resolved.
