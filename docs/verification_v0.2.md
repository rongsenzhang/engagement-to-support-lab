# v0.2 verification and publication status

Checked locally on 13 November 2026, in the existing
`rongsenzhang/engagement-to-support-lab` checkout, branch
`research/v0.2-reference-diagnosis`. Base: `fe0fcaf91bddb552ddf92ec3b5c9d8a8c592f32f`.
This file distinguishes executed checks from pending publication and browser work.

## Executed checks

| Check | Observed result | Scope |
|---|---|---|
| Python test suite | **34 passed** (15 original, 19 added) | Data boundaries, scoring, joins, outcome independence, example rules, frozen files and artifact/provenance agreement |
| Node application tests | **11 passed** | Actual scripts and payloads in a simulated DOM: routes, index units, filters, exports, outcome visibility, cases and malformed-overlay fallback |
| Reference rebuild | Passed; no diff in committed experiment artifacts or overlays | Deterministic regeneration, including manifest, from the separately committed protocol and fixed inputs |
| v0.1 preservation | Ten SHA-256 comparisons passed | Seven original artifacts, original browser data, pipeline and original protocol remain byte-identical |
| JavaScript syntax | All three application scripts passed | `app.js`, `data.js`, `reference-data.js` |
| Python compilation | Passed using a writable local bytecode-cache directory | Python source, tests and entry points |
| Offline packaging | Passed | HTML and source ZIP generated; three inline scripts parse, reference overlay is included, no external JavaScript/CSS application assets remain |
| Whitespace/error check | `git diff --check` passed | Tracked changes |

Local environment: Python 3.9.6 with `requirements.txt`, Node 24.22.1. CI is
configured for Python 3.11 and Node 24. CI results for this version are **pending**.
The default macOS Python cache path was outside the writable workspace; compilation
was rerun successfully with `-X pycache_prefix=dist/pycache`. This changed no source
or model specification.

The simulated-DOM tests exposed a null-record crash in an invalid reference
overlay. The UI guard was corrected, and all eleven tests passed afterwards.
Invalid or missing overlays retain the original results without fabricating an R
score. Full dataset checks remain in the Python tests and provenance manifest.

## Limits of this verification

- A fresh browser launch failed under the current desktop sandbox. No completed
  visual screenshot, mobile-device, screen-reader or real-browser interaction
  test is claimed for v0.2. Responsive CSS and semantic controls are implemented;
  their final appearance and assistive behaviour still need browser review.
- Node tests use a small simulated DOM, not a browser layout engine. They verify
  generated content and event-driven logic, not visual correctness.
- None of these software checks validates predictive benefit, intervention
  effectiveness, proprietary parity or real tutor usefulness.

## GitHub and deployment status

The existing remote `main` and v0.1.0 release were read and checked before work.
The protocol was committed locally before the new reference evaluation. Source,
research, generated artifacts and application changes are maintained on the
feature branch; the released baseline is preserved.

The GitHub connector rejected creation of the remote branch with HTTP 403
`Resource not accessible by integration`. A standard Git dry-run push also had no
usable credentials. External Chrome login does not provide this connection with
repository write access, and this session has no desktop/browser-control tool.
These are access limitations, not a lack of user authorization.

**Pending:** push the existing branch, open its PR against `main`, inspect GitHub
Actions, complete real-browser review, merge, verify Pages, and publish the v0.2
release. No successful remote push, PR, CI run, deployment or release is claimed.
The live website remains at its existing published version until those steps occur.

Once write access is available, use **Create a merge commit**, with no squash or
rebase. Preserve the protocol-before-evaluation history and its commit identity;
rewriting it would change the generated manifest and fail the deployment check.
The prepared PR text is
in [pr_v0.2.md](pr_v0.2.md); progress belongs in
[Issue #1](https://github.com/rongsenzhang/engagement-to-support-lab/issues/1).
Rollback instructions remain in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Re-run locally

```sh
python -m pytest -q tests
python build_reference.py
git diff --exit-code -- artifacts web/data.js web/reference-data.js
python -m compileall -q src tests download_data.py run_demo.py package_demo.py build_reference.py
node --check web/app.js
node --check web/data.js
node --check web/reference-data.js
node --test tests/test_web.cjs
python package_demo.py
git diff --check
```

Use a full Git checkout for protocol provenance. On a restricted macOS setup,
add `-X pycache_prefix=dist/pycache` to the compilation command. Tests and packaging
use the committed public artifacts; no institutional data or raw-data download is
required.
