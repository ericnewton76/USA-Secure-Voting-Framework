# VOTER-RECEIPT-GEN

A small Node.js + Express app for the USA Secure Voting Framework.

- **SAMPLE-BALLOT** (`GET /`) — renders a sample ballot form that POSTs to the receipt generator.
- **RECEIPT-GEN** (`POST /receipt`) — turns the submitted selections into a
  verifiable voter receipt with a SHA-256 fingerprint and human-readable Receipt ID.

## Ballot contests

1. **President / Vice President** — Washington & Adams (Constitution Party) vs. Jay & Harrison (Federalist Party)
2. **11th Amendment** — continue ratification (barring individuals from suing a State in Federal court)? Yea/Nay
3. **Economic System** — capitalist (Yea) or communist (Nay)?
4. **Seat of Government** — carve the swamps of Maryland into Washington, D.C. and build the White House there? Yea/Nay

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

- `server.js` — Express routes for the two pages.
- `ballot.js` — canonical ballot definition (single source of truth for contest/option labels).
- `views/` — EJS templates (`ballot.ejs`, `receipt.ejs`).
- `public/style.css` — styling.
