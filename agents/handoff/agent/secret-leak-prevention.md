# Handoff: agent/secret-leak-prevention

## Summary
- Add a read-only GitHub Actions workflow that scans full Git history with Gitleaks on pushes and pull requests.
- Pin checkout, Gitleaks Action, and Gitleaks scanner versions.
- Add the matching pinned pre-commit hook and a credential storage/rotation runbook.

## Key files
- `.github/workflows/secret-scan.yml`
- `.pre-commit-config.yaml`
- `docs/security/credential-handling.md`
- `README.md`

## How to verify
Run:

```bash
gitleaks git --redact --verbose .
pre-commit run gitleaks --all-files --verbose
npm run lint
npm test
git diff --check origin/main...HEAD
```

Expected results:
- both Gitleaks scans report no leaks;
- lint passes;
- 34 test files / 133 tests pass;
- the GitHub workflow starts on push, pull request, or manual dispatch with read-only contents permission.

## Behavior changes
- Pull requests and pushes now fail their dedicated secret-scan check when Gitleaks detects credential material.
- Developers who run `pre-commit install` receive the same scanner before commit.

## Risks / edge cases
- Gitleaks Action v3 requires a GitHub runner with Node 24 support; GitHub-hosted `ubuntu-latest` satisfies this.
- Legitimate false positives should use a single finding fingerprint after review, never a broad rule or path exclusion.
- This control prevents new leaks; it does not rotate credentials. Any credential that may already have been shared must still be revoked by its owner.

## Follow-ups
- Make the `Secret scan / gitleaks` status check required in branch protection after the workflow has run successfully once.
- Review the action and scanner pins during normal dependency maintenance.
