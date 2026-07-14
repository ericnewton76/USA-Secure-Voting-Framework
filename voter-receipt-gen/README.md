# VOTER-RECEIPT-GEN

A small Node.js + Express app for the USA Secure Voting Framework.

- **BALLOT-INDEX** (`GET /`) — lists the available ballots (one per `.hjson` file
  in `public/ballots/`), each linking to its selection page and admin page.
- **SAMPLE-BALLOT** (`GET /ballot/:id`) — renders one ballot's selection form that
  POSTs to the receipt generator. `:id` is the ballot file name (e.g. `sample-general`).
- **RECEIPT-GEN** (`POST /ballot/:id/receipt`) — turns the submitted selections into a
  verifiable voter receipt with a SHA-256 fingerprint and human-readable Receipt ID.
- **CONFIG-ADMIN** (`GET`/`POST /config/:id`) — admin page to edit one ballot's
  contests/options and confirm which secret keys are loaded (last 4 chars only).
  Edits are **in-memory** (reset on restart) and the page is **unauthenticated** —
  put it behind machine/network access control before any real deployment.

## Secret keys

Three independent keys back the keyed (HMAC-SHA1) receipt hashes:

| Env var | Keys | Dev fallback |
|---|---|---|
| `ELECTION_BRANCH_SECRET` | Election-Branch-Hash | random per run |
| `TIME_BASED_SERIAL_SECRET` | Time-Based-Serial-Hash | random per run |
| `CRITICAL_VOTE_SECRET` | Critical-Vote-Hash (binds choices hash + serial + branch) | random per run |

In development, an unset key is generated at startup and its full value printed
to the console (so you can pin it via env to persist it). In production
(`NODE_ENV=production`) all three **must** be set or the server refuses to start.

## Ballots

Each `.hjson` file under `public/ballots/` is one ballot; its file name is the
ballot id used in URLs (`/ballot/:id`, `/config/:id`). Shipped ballots:

- **`sample-general`** — Sample general election
  1. **President / Vice President** — Washington & Adams (Constitution Party) vs. Jay & Harrison (Federalist Party)
  2. **11th Amendment** — continue ratification (barring individuals from suing a State in Federal court)? Yea/Nay
  3. **Economic System** — capitalist (Yea) or communist (Nay)?
  4. **Seat of Government** — carve the swamps of Maryland into Washington, D.C. and build the White House there? Yea/Nay
- **`fl-orange-aug18`** — Orange County, FL Republican primary (Aug 18, 2026): 12 "vote for one" contests (US Senator, Governor, CFO, Agriculture Commissioner, judicial races, County Mayor, School Board Chair).

## Run

```
npm install
npm start        # http://localhost:3000
npm run dev      # http://localhost:3000 with live-reload + server auto-restart
```

Set `PORT` to override the default port.

`npm run dev` runs `node --watch` (restarts the server when `.js` files change)
and a [livereload](https://www.npmjs.com/package/livereload) server that reloads
the browser when `views/` or `public/` change. The client snippet is injected
only when `NODE_ENV !== 'production'`, so `npm start` / production serve nothing
extra. Set `NODE_ENV=production` to force it off.

## Layout

- `server.js` — Express routes for the pages.
- `public/ballots/*.hjson` — canonical ballot data in [Hjson](https://hjson.github.io/) (human-readable JSON with comments); single source of truth for contest/option labels. One file per ballot; the file name is the ballot id.
- `ballot.js` — loads every ballot in `public/ballots/` and adds the shared lookup/formatting helpers.
- `views/` — EJS templates (`ballots.ejs`, `ballot.ejs`, `config.ejs`, `receipt.ejs`).
- `public/style.css` — styling.
