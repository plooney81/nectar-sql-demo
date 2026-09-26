# nectar-sql-demo — Claude Code Briefing

## Project Overview

A split-pane web UI where users paste raw SQL on the left and get HoneySQL EDN output
on the right. Powered by the `nectar-sql` Clojure library as the backend, deployed to
Fly.io as a single container.

**Repo:** https://github.com/plooney81/nectar-sql
**Library ns:** `plooney81.nectar.sql`
**Core fn:** `(nsql/ripen "SELECT * FROM foo")` → returns a Clojure map (HoneySQL format)
**Helper output:** `(nsql/ripen sql {:output :both})` → `{:map … :form … :text …}` from one parse,
where `:text` is the query as a pretty-printed `honey.sql.helpers` `->` chain (nectar-sql ≥ 1.0.34)

The library supports **SELECT, INSERT, UPDATE, and DELETE** queries. Anything else throws,
and the UI shows the error message.

---

## Architecture

```
Browser
  └── GET /           → Ring serves index.html (from resources/public/)
  └── GET /app.js     → Ring serves JS (from resources/public/)
  └── POST /api/convert → Ring calls (nsql/ripen ...) → returns EDN string as JSON
```

Single Fly.io app, single Docker container, single deploy.

---

## Tech Stack

- **Backend:** Clojure, http-kit, Compojure, Ring
- **Frontend:** Static HTML/CSS/JS served by Ring (`wrap-resource` middleware)
- **Deployment:** Fly.io (region: `dfw` — Dallas, closest to Houston)
- **Build:** Multi-stage Dockerfile (Clojure tools-deps → eclipse-temurin JRE alpine)

---

## File Structure

```
nectar-sql-site/
├── CLAUDE.md                         ← this file
├── deps.edn                          ← includes nectar-sql + http-kit + ring + compojure
├── build.clj                         ← uberjar build, main = plooney81.nectar-sql-demo.server
├── Dockerfile                        ← multi-stage build
├── fly.toml                          ← Fly.io config, region dfw, port 8080
├── src/
│   └── plooney81/
│       └── nectar/
│           ├── sql.clj               ← EXISTS: the nectar-sql library source
│           └── server.clj            ← NEW: Ring server + routes
└── resources/
    └── public/
        ├── index.html                ← NEW: split-pane UI
        ├── style.css                 ← NEW: styles
        ├── app.js                    ← NEW: fetch logic + CodeMirror wiring
        └── favicon.svg               ← 🍯 emoji favicon, matches the header logo
```

---

## Backend Spec (`server.clj`)

### Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Redirect to `/index.html` |
| `POST` | `/api/convert` | Convert SQL → HoneySQL |
| `GET` | `/health` | Returns `{"status": "ok"}` |

### `/api/convert` Contract

**Request:**
```json
{ "sql": "SELECT * FROM people WHERE age > 25" }
```

**Success (200):**
```json
{
  "honeysql": "{:select [:*], :from [:people], :where [:> :age 25]}",
  "helpers":  ";; (:require [honey.sql.helpers :as h])\n(-> (h/select :*) (h/from :people) (h/where [:> :age 25]))"
}
```

**Error (400):**
```json
{ "error": "JSqlParser error message here" }
```

The `honeysql` value is a **pretty-printed EDN string** via `(with-out-str (pprint (:map result)))`.
The `helpers` value is the library's `:text` as-is. If only the helper conversion fails, the
response is still 200 and `helpers` holds a `;;` comment explaining why (see `ripen-both`).

### Middleware Stack (order matters)

```clojure
(-> app-routes
    (wrap-json-body {:keywords? false})
    wrap-json-response         ; API routes → application/json
    (wrap-resource "public")   ; serves resources/public/*
    wrap-content-type          ; types static files only; inside the JSON middleware it would
                               ; mark extensionless API routes application/octet-stream
    wrap-security-headers)
```

Rate limiting (30 req/min per IP) wraps only the `POST /api/convert` handler, so page
assets and `/health` don't count toward it. The 429 body is JSON like every other API error.

### Port Config

Read from `PORT` env var, default `8080`:
```clojure
(Integer/parseInt (or (System/getenv "PORT") "8080"))
```

---

## Frontend Spec

### Layout

Two equal-width panes, side by side:
- **Left pane:** SQL input — CodeMirror editor (SQL mode, via CDN)
- **Right pane:** Read-only HoneySQL output — CodeMirror editor (Clojure mode, via CDN), with
  **`Data map | Helpers`** tabs in its header (`role="tablist"`, arrow keys switch tabs)

### Behavior

- "Convert" button triggers `POST /api/convert`
- Also support **Cmd/Ctrl+Enter** keyboard shortcut to convert
- On success: keep both `honeysql` and `helpers` strings; the right pane shows the active tab's
- On error: display the `error` string in the right pane (on both tabs) with a red/error style
- "Copy" button on the output pane copies the active tab's output to clipboard
- A small info note in the toolbar: *"Supports SELECT, INSERT, UPDATE, and DELETE queries"*

### CodeMirror (CDN)

Use CodeMirror 5 via cdnjs — it's simpler to wire up than CM6:
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clojure/clojure.min.js"></script>
```

### Shareable Links

Encode the SQL in the URL hash on convert so users can share pre-populated links:
```js
window.location.hash = encodeURIComponent(sqlValue);
// On load: read hash and pre-populate + auto-convert if present
```

The selected output tab is kept in a `?view=helpers` query param (via `history.replaceState`;
omitted for the default `map` view), so shared links open on the same tab. Without the param,
the last-used tab is restored from `localStorage`. The SQL stays in the hash, so older links
still work.

### Sample Queries Dropdown

Include a `<select>` dropdown of example queries that populate the input pane, grouped
with `<optgroup>` by statement type. Keep at least one example per supported statement:
1. SELECT: simple WHERE, JOIN, aggregate (COUNT/GROUP BY/HAVING), CTE + subquery (nested helper chains)
2. INSERT: VALUES, INSERT … SELECT
3. UPDATE: multi-column SET with expressions
4. DELETE: WHERE with a subquery

---

## Dockerfile

```dockerfile
FROM clojure:temurin-21-tools-deps AS build
WORKDIR /app
COPY deps.edn build.clj ./
RUN clojure -P
COPY src ./src
COPY resources ./resources
RUN clojure -T:build ci

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
```

---

## fly.toml

```toml
app = "nectar-sql-demo"
primary_region = "dfw"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

---

## Deployment Steps (first deploy)

```bash
brew install flyctl
fly auth login
fly launch --no-deploy   # generates/confirms fly.toml
fly deploy               # builds image, pushes, deploys
fly certs add <your-domain>  # add custom domain + TLS
```

After `fly certs add`, Fly will output the DNS records to add at your registrar.

---

## deps.edn Dependencies to Add

```clojure
http-kit/http-kit        {:mvn/version "2.8.0"}
ring/ring-core           {:mvn/version "1.12.0"}
ring/ring-json           {:mvn/version "0.5.1"}
compojure/compojure      {:mvn/version "1.7.1"}
```

---

## build.clj Changes Needed

- Set `:main-cls` to `"plooney81.nectar-sql-demo.server"`
- Ensure the uberjar task includes `resources/` so static assets are bundled

---

## Known Constraints

- `nsql/ripen` throws on unsupported SQL — catch and return 400
- JSqlParser doesn't support Postgres implicit casting — surface the error message as-is
- The library returns a Clojure map; use `clojure.pprint/pprint` to produce readable EDN
- The helper `:text` is already pretty-printed by the library; don't re-format it
