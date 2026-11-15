# Website deployment

The editable website is in `web/`. **Publish the output of `python build_site.py`,
`dist/site/`, rather than `web/` or the repository root.** The standard-library
builder needs no scientific dependencies or model training. Relative assets and
hash navigation support the GitHub Pages repository subpath.

For the owner's local → GitHub → published-site procedure, see
[the Chinese publishing guide](publishing_guide_zh.md).

## What identifies a published build

- The visible research version remains **v0.2**; this maintenance does not change
  models, results or the research protocol.
- Scripts and CSS have content-derived names, for example
  `assets/app.<12-character-sha256>.js`. Changing a resource changes its URL.
- `version.json` records the full Git revision, build ID, HTML checksum and every
  asset checksum. The build ID includes the revision and source content. Building
  the same clean revision twice gives the same output; a different revision gets
  a different ID even when the research version remains v0.2.
- The HTML embeds the matching build ID and research version. The builder writes
  only the staging directory; it does not rewrite the frozen research files.
- `preserve_assets.py` retains content-addressed resources from this revision's
  first-parent Git history, plus the four original resource URLs with exact bytes
  from the published pre-maintenance baseline. Cached old HTML can still retrieve
  its scripts/styles after a deployment. `compatibility.json` records their hashes.
  This does not execute old code while building, change current HTML references,
  or copy files from unrelated branches. Keeping all ancestral versions supports
  skipped/failed deployments and ordinary revert commits. Storage grows with the
  number of distinct historical resources; review this if the demo becomes large.

The update watcher checks a fresh `version.json` on page load, approximately once
a minute while visible, and on returning to the tab (with throttling). A different
build ID displays **Refresh now / Later**. It also handles a rollback, without
assuming that version numbers only increase. The page never refreshes itself.
Later suppresses that build's notice for this page session; another build can
prompt again. Refresh keeps the URL's route and query parameters and adds a build
parameter to request fresh HTML. In-memory filters reset on this explicit refresh.
Failed, offline, timed-out or invalid update checks leave the working page alone.

An old page loaded **before this watcher was introduced** needs one manual reload
to obtain it. Already-downloaded offline demos remain fixed snapshots and do not
check the network, even if someone serves the standalone HTML over HTTP. Neither
asset fingerprints nor a new deployment can modify an already-open old document.
This design follows the URL-versioning guidance in
[MDN's HTTP caching guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).

## Local publication preview

From the repository root in a full Git checkout:

```sh
python build_site.py
python preserve_assets.py
python -m http.server 8765 --bind 127.0.0.1 --directory dist/site
```

Open `http://127.0.0.1:8765/`. In another terminal, from the same repository:

```sh
python check_deployment.py --url http://127.0.0.1:8765/ --timeout 0
```

`python run_demo.py` still serves the editable `web/` for ordinary interface work;
its empty build metadata disables update checks. `python package_demo.py` still
produces the self-contained `dist/Engagement_Lab_v0.2.html` and source ZIP. A ZIP
without Git history can use `build_site.py --revision FULL_40_CHARACTER_COMMIT`
only when that provenance is known; this is a caller-supplied assertion.

## GitHub Pages and publication evidence

1. Set **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Push a feature branch and open a PR. **Verify research prototype** runs Python
   and Node tests, regenerates the reference overlay, checks frozen artifacts and
   syntax, builds the site, checks it through HTTP, and packages the offline demo.
3. Review and merge to `main`. **Deploy demo to GitHub Pages** repeats verification,
   builds from that exact commit and publishes `dist/site/`.
4. Wait for **Verify the published HTML, revision and asset checksums**. It checks
   the fresh public manifest, the canonical homepage without a cache-busting query,
   matching HTML metadata/references, all five asset hashes and retained historical
   resource checksums. It retries for
   up to 12 minutes to allow the observed ten-minute Pages cache lifetime. A
   mismatch fails the workflow; a successful upload alone is insufficient.
5. Inspect the Actions summary and **pages-publication-check** artifact. It retains
   the expected manifests and HTTP diagnostic report, including cache headers,
   attempts and mismatches. PR checks retain **build-verification** for the local
   HTTP check. Artifacts use the repository's configured retention period, not
   permanent archival; commits, PRs and this rollback record retain source history.
6. Open the live demo and exercise the affected interaction. HTTP checks verify
   publication integrity, not rendered layout or accessibility. A green run also
   cannot prove that every geographic cache or already-open tab is fresh.

Only `main` can deploy; manual runs from other branches skip deployment. The
workflow uses standard Pages actions and OIDC permissions, with no personal token
in the repository. An unsuccessful post-deployment check **does not automatically
roll back** files already published. Inspect the report, rerun after a temporary
delivery failure, or use a reviewed rollback PR for a code defect.

For a manual live check, first check out the exact deployed main revision and
build it, then run:

```sh
python check_deployment.py --url https://rongsenzhang.github.io/engagement-to-support-lab/
```

Do not compare a feature-branch build with the live main deployment and interpret
the expected mismatch as a publication fault.

## Preserve research and rollback history

The pre-maintenance baseline is main commit
`c648e192fa9dd629cb70ff4fb61c11296e506ca1` (v0.2, PR #3). Maintenance is tracked by
issue #4 on `fix/versioned-deployment`. Tag `v0.1.0` remains unchanged; there is no
invented v0.2 release tag.

For a defect after merging, use **Revert** on this PR, inspect the rollback PR,
let checks pass, and merge. This creates a new commit preserving both the change
and rollback. Do not force-push or move tags. A full revert restores the previous
unversioned publishing workflow and removes these new safeguards; that older
workflow will not run this new publication check. Verify its Pages run and homepage
manually. Prefer a focused repair when it can retain the safeguards.

Reverting a later content change while retaining this infrastructure produces a
different build ID, so open updated tabs receive the same refresh prompt. Reverting
this entire infrastructure to a site without `version.json` cannot notify existing
tabs through the removed endpoint: reload them manually.

Keep `web/data.js` frozen. Rebuild the v0.2 reference overlay only with
`python build_reference.py` in a full Git checkout. Protocol commit
`95f95902be9c3905b5c04bf26d8481ec219d9cf9` must remain in history; the v0.2 PR was
merged with that history intact. Original model retraining belongs in a separate
checkout of its release. Raw data, environments and generated `dist/` stay out of Git.

Official workflow reference, checked 15 November 2026:
[GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
