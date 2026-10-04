# Credential handling and rotation

API credentials and partner keys are server-side secrets. Never place them in
extension code, widget JavaScript, committed configuration, test fixtures,
screenshots, logs, issue descriptions, or pull-request text.

## Storage

- For local development, keep values in the ignored `server/.env` file. Copy
  names and placeholders from `server/.env.example`; do not replace values in
  the example file with working credentials.
- For deployed services, use the platform's secret manager and inject secrets
  at runtime. Do not bake them into images or build artifacts.
- Grant each environment its own least-privilege credentials. Do not share
  production values with development or CI.
- Treat widget partner keys as server-to-server credentials. A browser cannot
  keep a shared secret.

## Leak prevention

CI scans full Git history on every push and pull request. To scan staged changes
before commit, install [pre-commit](https://pre-commit.com/) and enable the
repository hook:

```bash
pre-commit install
pre-commit run gitleaks --all-files
```

The hook and CI scanner are pinned. Update both pins together after reviewing a
new Gitleaks release. A suspected false positive must be investigated first; if
an exception is justified, allow only the specific finding fingerprint rather
than a path, secret type, or broad regular expression.

## Rotation procedure

When a credential expires, changes owners, or may have been exposed:

1. Revoke or disable the old credential at the provider. Deleting it from Git
   or rewriting history does not make it safe again.
2. Create a replacement with the minimum required permissions, quota, and
   environment scope.
3. Update the local or deployment secret manager without printing the value.
4. Restart or redeploy the consuming service, then verify the new credential
   works and the old one is rejected.
5. Review provider and application logs for unexpected use, without copying
   secret values into the incident record.
6. Record the rotation date, owner, affected environment, and next review date
   in the team's private credential inventory.

If a leak is found in a commit, issue, log, archive, or screenshot, rotate first
and clean up the exposed material second. Notify the credential owner through a
private channel; do not reproduce the value in a public ticket.
