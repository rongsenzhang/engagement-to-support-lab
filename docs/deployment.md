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

## Hosted tutor chat

Cloudflare Workers serves the same review queue over HTTPS and streams replies
from OpenAI. The service runs on Cloudflare when the owner's computer is off.
The public website and the downloadable research results can also be used
independently of the chat service.

### Activate or rotate the owner's key

1. Open **Workers & Pages → engagement-to-support-chat → Settings → Variables and Secrets** in the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Choose **Add**, select **Secret**, and name it `OPENAI_API_KEY`. Paste the existing project key into the value field and select **Deploy**. To rotate the key, edit this secret in the same place.
3. Open the Worker's HTTPS address with `/#queue` on a phone or computer. Select a record, expand **Discuss this record with AI**, and send a short question. A streamed answer verifies the whole connection. The status endpoint shows whether the secret is configured. Only a completed answer verifies OpenAI model access and billing.

The secret stays on the server. Visitors share the owner's OpenAI project
usage. The Worker reserves up to 100 requests per UTC day, and 10 requests per
public IP per UTC hour, before contacting OpenAI. A shared network uses a
single hourly allowance. Failed or cancelled calls can use a reservation.
The optional Generate AI analysis button requests a fixed English GPT-6.2 Sol
report with up to 1,800 output tokens. The Worker caches completed reports for
24 hours by record, scoring method, evidence and report instructions. A cache
hit can be served without an additional model call or quota reservation.
Follow-up chat uses `OPENAI_MODEL`, a limited conversation history and up to
700 output tokens. Both share the public quota.
The counters persist across server restarts and deployments.
The app keeps chat history in the open page. It sends the selected evidence
and recent messages to OpenAI with Responses API storage disabled.

### Publish a reviewed update or roll it back

From the reviewed checkout, run:

```sh
python3 build_cloud.py
npx wrangler@4 deploy --keep-vars --config cloud/wrangler.jsonc
```

Use a Cloudflare account with access to this Worker. The deployment uploads
the site, its selected-record evidence and the chat service together. Keep the
same Worker name and account for a stable link. The frontend on GitHub Pages
reads the production Worker origin from `web/tutor-chat-config.json` after a
merge to `main`. Its Pages workflow publishes that file with the static app.
The Worker has its own deployment history. For a rollback, redeploy the
previous reviewed checkout and revert the corresponding Pages change through
a PR. If using Workers Builds for later automatic releases, connect this
repository's `main` branch, use `python3 build_cloud.py` as the build command
and the Wrangler deploy command above as the deploy command.

Check the queue on the Worker and on GitHub Pages. A missing secret leaves the
research views usable and the chat panel offers a connection retry. A mobile
queue has a shortcut to the current record's chat. Verify that changing records
clears the conversation.

[Cloudflare secret settings](https://developers.cloudflare.com/workers/configuration/secrets/) · [Workers hosting allowances](https://developers.cloudflare.com/workers/platform/pricing/).
