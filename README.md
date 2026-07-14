# USA-Secure-Voting-Framework

A set of documents outlining how we can have AUDITABLE and SECURE voting with election systems.

## Reference implementation: `voter-receipt-gen`

`voter-receipt-gen/` is a small **Node.js + Express** app that demonstrates the
framework's printed **VOTER-RECEIPT** — turning a voter's ballot selections into a
verifiable, tamper-evident receipt.

What it does:

- **Ballot index** (`GET /`) — lists the available ballots, one per `.hjson` file
  in `public/ballots/`.
- **Sample ballot** (`GET /ballot/:id`) — renders a ballot's selection form.
- **Receipt generator** (`POST /ballot/:id/receipt`) — turns the submitted
  selections into a verifiable receipt: a SHA-256 fingerprint and Receipt ID, a
  compact QR-encoded choice line, a time-based serial, and three independent
  keyed (HMAC) hashes — Election-Branch-Hash, Time-Based-Serial-Hash, and the
  culminating Critical-Vote-Hash that binds them together — plus a VERIFY-URL QR.
- **Config admin** (`GET`/`POST /config/:id`) — edit a ballot's contests and
  confirm which secret keys are loaded (in-memory, unauthenticated — dev only).

### Run

```
cd voter-receipt-gen
npm install
npm start        # http://localhost:3000
npm run dev      # same, with live-reload + server auto-restart
```

Ballot data lives in [Hjson](https://hjson.github.io/) files under
`voter-receipt-gen/public/ballots/`. In production the three secret keys
(`ELECTION_BRANCH_SECRET`, `TIME_BASED_SERIAL_SECRET`, `CRITICAL_VOTE_SECRET`)
must be set or the server refuses to start.

See [`voter-receipt-gen/README.md`](voter-receipt-gen/README.md) for full
details on the routes, secret keys, and shipped sample ballots.

See [`ELECTION-DAY.md`](ELECTION-DAY.md) for more specific proposals
