# Dashboard API

The server side of the teacher dashboard (`/admin/` on the site): a Cloudflare Worker.
It checks "Sign in with Google" against the school domain and the teacher list and
hands out 8-hour dashboard sessions. Later steps add reading and saving projects in
`cs-student-work` through a GitHub App.

No dependencies; the only tool needed is Node (and `npx wrangler` to deploy).

## Settings

| Name | Where | What |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `wrangler.toml` | The Google sign-in client from the school's Google Cloud project |
| `ALLOWED_DOMAIN` | `wrangler.toml` | `punahou.edu`: other accounts are refused |
| `ALLOWED_ORIGINS` | `wrangler.toml` | Pages allowed to call the API (the live site, and localhost for testing) |
| `ALLOWED_EMAILS` | secret | The teacher list, comma-separated. A secret so it isn't in this public repo |
| `SESSION_SECRET` | secret | A long random string that signs dashboard sessions |

Changing the teacher list: `npx wrangler secret put ALLOWED_EMAILS` and type the whole
list again. Someone taken off the list is locked out at their next click.

## Run it locally

```
cp .dev.vars.example .dev.vars     # then fill in SESSION_SECRET and ALLOWED_EMAILS
node dev.mjs                       # http://localhost:8787
```

With the site served on http://localhost:8123, `/admin/` uses this local API
automatically.

## Test

```
node --test test/*.test.mjs
```

The tests play Google's part with their own key and check every rule: the teacher list,
the school domain, tokens for other apps, expired, forged or tampered sign-ins, removed
teachers, and which pages may call the API.

## Deploy (first time)

```
npx wrangler login                    # opens Cloudflare in the browser
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ALLOWED_EMAILS
npx wrangler deploy                   # prints the API's address
```

Put the printed address in `admin/config.js` as `API_BASE`, then push the site.
