# Dashboard API

The server side of the teacher dashboard (`/admin/` on the site): a Cloudflare Worker.
It checks "Sign in with Google" against the school domain and the teacher list, hands
out 8-hour dashboard sessions, and reads (and later saves) projects in the private
`cs-student-work` repo through the "Punahou CS Work Dashboard" GitHub App.

| Route | What |
|---|---|
| `POST /session` | Google sign-in in, dashboard session out |
| `GET /me` | Who is signed in |
| `GET /projects` | Every project, shown or hidden, plus sketch folders with no `project.yml` yet, with what each is missing. Same rules as the work repo's `build_manifest.py` |
| `GET /file?path=` | A cover picture or video from the repo, for thumbnails |
| `POST /projects` | Add a project: details and files in, checked, then saved as one commit under the teacher's name, with `project.yml` (and `assignment.yml` for a new assignment) written for them |
| `GET /status?commit=` | Whether that save is live yet (the work repo's Action run for it) |

One dependency, `yaml` (run `npm install` once). Node runs it locally; `npx wrangler`
deploys it.

## Settings

| Name | Where | What |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `wrangler.toml` | The Google sign-in client from the school's Google Cloud project |
| `ALLOWED_DOMAIN` | `wrangler.toml` | `punahou.edu`: other accounts are refused |
| `ALLOWED_ORIGINS` | `wrangler.toml` | Pages allowed to call the API (the live site, and localhost for testing) |
| `ALLOWED_EMAILS` | secret | The teacher list, comma-separated. A secret so it isn't in this public repo |
| `SESSION_SECRET` | secret | A long random string that signs dashboard sessions |
| `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` | `wrangler.toml` | The GitHub App and its installation on the work repo |
| `GITHUB_REPO`, `GITHUB_BRANCH` | `wrangler.toml` | `drichardi/cs-student-work`, `main` |
| `GITHUB_APP_KEY` | secret | The app's private key as base64 PKCS#8 (see below) |

The GitHub App has Contents (read and write) and Actions (read) on `cs-student-work`
only. Read-only work asks GitHub for a read-only token.

GitHub hands out the key as a `.pem` file in an older format. To convert it and store it
without it appearing on screen:

```
node -e "process.stdout.write(require('crypto').createPrivateKey(require('fs').readFileSync('KEY.pem')).export({type:'pkcs8',format:'der'}).toString('base64'))" | npx wrangler secret put GITHUB_APP_KEY
```

Changing the teacher list: `npx wrangler secret put ALLOWED_EMAILS` and type the whole
list again. Someone taken off the list is locked out at their next click.

## Run it locally

```
npm install
cp .dev.vars.example .dev.vars     # then fill in SESSION_SECRET, ALLOWED_EMAILS, GITHUB_APP_KEY
node dev.mjs                       # http://localhost:8787
```

With the site served on http://localhost:8123, `/admin/` uses this local API
automatically.

**Testing saves without touching real work:** create a branch in `cs-student-work`
(for example `dashboard-test`, from `main`), add `GITHUB_BRANCH=dashboard-test` to
`.dev.vars`, and restart `node dev.mjs`. The dashboard shows "Test mode" and saves go to
that branch; the site only builds from `main`. Delete the branch and the line afterwards.

## Test

```
node --test test/*.test.mjs
```

The sign-in tests play Google's part with their own key and check every rule: the
teacher list, the school domain, tokens for other apps, expired, forged or tampered
sign-ins, removed teachers, and which pages may call the API. The project tests check
the folder rules against a made-up repo: assignment folders, skipped folders, depth,
sketches without a `project.yml`, broken files, missing covers, and `assignment.yml`.
The save tests check folder names, the checks on what's sent (named by field), consent,
file paths and sizes, and that the `project.yml` written reads back as the builder expects.

## Deploy (first time)

```
npx wrangler login                    # opens Cloudflare in the browser
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ALLOWED_EMAILS
npx wrangler secret put GITHUB_APP_KEY   # see the conversion command above
npx wrangler deploy                   # prints the API's address
```

Put the printed address in `admin/config.js` as `API_BASE`, then push the site.
