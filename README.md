# nectar-sql demo

A split-pane web UI that converts raw SQL into [HoneySQL](https://github.com/seancorfield/honeysql) — powered by the [nectar-sql](https://github.com/plooney81/nectar-sql) Clojure library.

**Supports:** `SELECT` and `INSERT` queries. `UPDATE`/`DELETE` are not yet supported by the underlying library.

---

## Running locally

### Prerequisites

- [Clojure CLI](https://clojure.org/guides/install_clojure) (`brew install clojure/tools/clojure`)

### Common commands

```bash
make run       # start dev server at http://localhost:8080
make build     # run tests then build the uberjar
make jar       # build uberjar only (skip tests)
make test      # run tests only
make run-jar   # run the built jar locally
make clean     # delete build output
```

Run `make` (or `make help`) to see all available targets.

---

## Deploying to Fly.io

### First deploy

```bash
brew install flyctl
fly auth login
fly launch --no-deploy   # confirm fly.toml
make deploy
```

### Subsequent deploys

```bash
make deploy    # fly deploy
make logs      # tail live logs
make status    # app status
```

The app targets region `dfw` (Dallas) on a `shared-cpu-1x` / 512 MB VM with auto-start/stop enabled.

---

## Architecture

```
Browser
  └── GET /           → serves index.html (Ring wrap-resource)
  └── POST /api/convert → (nsql/ripen sql) → HoneySQL EDN as JSON
  └── GET /health     → {"status": "ok"}
```

Single Fly.io container — Clojure uberjar serving both the API and the static frontend.

---

## Tech stack

| Layer | Technology |
|---|---|
| HTTP server | [http-kit](https://http-kit.github.io/) |
| Routing | [Compojure](https://github.com/weavejester/compojure) |
| Middleware | [Ring](https://github.com/ring-clojure/ring) |
| SQL parsing | [nectar-sql](https://github.com/plooney81/nectar-sql) |
| Frontend | Vanilla JS + [CodeMirror 5](https://codemirror.net/5/) |
| Deployment | [Fly.io](https://fly.io) |

---

## License

[MIT](LICENSE)
