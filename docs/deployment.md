# Website deployment

The static website source is `web/`; its `index.html` is the deployment entry point. Publish this directory's contents, not the repository root or the standalone package in `dist/`. Relative assets and hash navigation support a repository subpath. No build, API key, Python server or model training is needed for hosting.

## GitHub Pages

1. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Push the website to `main`, or run **Deploy demo to GitHub Pages** from the Actions tab.
3. Wait for the deployment to succeed. Use the URL reported by its `github-pages` environment.

The workflow uploads only `web/` and uses GitHub's standard Pages actions. Its deployment job has repository read access, Pages write access and OIDC token access; no personal access token is required. Website changes on `main` redeploy automatically. Manual runs from another branch are skipped.

Model results are precomputed. To update them, run the analysis locally as described in the README and commit the refreshed `web/data.js` alongside the relevant research evidence. Raw data and local environments remain excluded.

Official setup and action versions checked on 8 November 2026: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
