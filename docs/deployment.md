# Website deployment

The static website source is `web/`; its `index.html` is the deployment entry point. Publish this directory's contents, not the repository root or the standalone package in `dist/`. Relative assets and hash navigation support a repository subpath. No build, API key, Python server or model training is needed for hosting.

## GitHub Pages

1. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Push the website to `main`, or run **Deploy demo to GitHub Pages** from the Actions tab.
3. Wait for the deployment to succeed. Use the URL reported by its `github-pages` environment.

The workflow uploads only `web/` and uses GitHub's standard Pages actions. Its deployment job has repository read access, Pages write access and OIDC token access; no personal access token is required. Website changes on `main` redeploy automatically. Manual runs from another branch are skipped.

Model results are precomputed. For v0.2, keep `web/data.js` frozen and run `python build_reference.py` in a full Git checkout to regenerate the separate `web/reference-data.js` overlay. Commit its matching `artifacts/v0.2/` outputs, manifest and relevant research evidence. Re-running the original training experiment belongs in a separate checkout of its release. Raw data and local environments remain excluded.

Before deployment, the reusable verification workflow runs Python tests, regenerates the overlay and checks for changed artifacts, checks JavaScript syntax and simulated-DOM interactions, and packages the standalone app. Full history is required to verify the protocol commit. These checks are not real-browser visual validation or live model monitoring.

A feature branch or local commit does not change the public website. Push the branch, review its PR and checks, merge to `main`, and verify the resulting Pages run and displayed version. Preserve existing tags. A rollback uses a revert PR, passes the same checks and redeploys `main`; changing a release label alone does not roll the website back.

For the v0.2 PR use **Create a merge commit**, not squash or rebase. Its manifest
pins the protocol's original commit, which must remain in the history used by
the rebuild. Full checkout history alone cannot preserve a commit rewritten by
squash/rebase. After merging, verify the Pages run before calling it published.

Official setup and action versions checked on 8 November 2026: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
