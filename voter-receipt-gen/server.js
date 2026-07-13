const express = require('express');
const crypto = require('crypto');
const path = require('path');
const QRCode = require('qrcode');
const { ballot, labelFor, buildChoiceString } = require('./ballot');

const app = express();
const PORT = process.env.PORT || 3000;

// Plain-english details of the election branch (ELECTION-DAY.md). Configurable
// per polling place / voting machine.
const ELECTION_BRANCH =
  process.env.ELECTION_BRANCH ||
  'PRECINCT 000 / SAMPLE COUNTY / STATE OF VIRGINIA / 2026 GENERAL';

// Two INDEPENDENT secret keys (ELECTION-DAY.md "Secret-Key"): one keys the
// Election-Branch-Hash, the other keys the Time-Based-Serial-Hash. Keeping them
// separate means compromising one key does not let an attacker forge the other.
// In production both MUST be provided via the environment. In development, a
// random key is generated for any that is unset and reported on startup so the
// value is known for this run (and can be pinned via env to persist it).
const isProduction = process.env.NODE_ENV === 'production';

// Resolve a secret from the environment, or generate a random one in dev.
// Returns { value, generated } so startup logging can flag generated keys.
function resolveSecret(name) {
  const fromEnv = process.env[name];
  if (fromEnv != undefined && fromEnv !== '') {
    return { value: fromEnv, generated: false };
  }
  if (isProduction) {
    throw new Error(`${name} must be set in production`);
  }
  return { value: crypto.randomBytes(32).toString('hex'), generated: true };
}

const electionBranchKey = resolveSecret('ELECTION_BRANCH_SECRET');
const timeBasedSerialKey = resolveSecret('TIME_BASED_SERIAL_SECRET');
const electionBranchSecret = electionBranchKey.value;
const timeBasedSerialSecret = timeBasedSerialKey.value;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
// Keyed integrity hash: unlike a bare sha1, a value cannot be recomputed or
// forged without the secret key.
const hmacSha1 = (key, s) =>
  crypto.createHmac('sha1', key).update(s).digest('hex');

// TIME-BASED-SERIAL: MongoDB-ObjectId-style — 4-byte seconds timestamp plus
// 8 random bytes. Enables detecting a flood of machine-generated ballots.
function timeBasedSerial() {
  const ts = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  return ts + crypto.randomBytes(8).toString('hex');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));

// Development-only browser live-reload. Watches views/ and public/ and reloads
// the page on change. Because `npm run dev` runs `node --watch`, editing server
// code restarts the process; the browser reconnects to the fresh livereload
// server, which then refreshes so server-side changes show too. Templates
// include the client snippet only when `liveReload` is set (see app.locals).
// Gated on NODE_ENV and wrapped so production never requires the dev dependency.
app.locals.liveReload = false;
if (process.env.NODE_ENV !== 'production') {
  try {
    const livereload = require('livereload');
    const lrServer = livereload.createServer({
      exts: ['ejs', 'css', 'js', 'html'],
      delay: 50,
    });
    lrServer.watch([
      path.join(__dirname, 'views'),
      path.join(__dirname, 'public'),
    ]);
    lrServer.server.once('connection', () => {
      setTimeout(() => lrServer.refresh('/'), 100);
    });
    app.locals.liveReload = true;
    console.log('Live-reload enabled (development).');
  } catch (err) {
    console.warn('Live-reload unavailable:', err.message);
  }
}

app.use(express.static(path.join(__dirname, 'public')));

// SAMPLE-BALLOT: renders the ballot form which posts to /receipt.
app.get('/', (req, res) => {
  res.render('ballot', { ballot });
});

// RECEIPT-GEN: turns submitted selections into a verifiable voter receipt.
app.post('/receipt', async (req, res, next) => {
  try {
    const selections = ballot.contests.map((contest) => {
      const submitted = req.body[contest.id];
      return {
        title: contest.title,
        answer: labelFor(contest, submitted),
      };
    });

    // Build a deterministic payload and hash it so the voter can later verify
    // that their recorded selections were not altered.
    const issuedAt = new Date().toISOString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const payload = JSON.stringify({
      selections: selections.map((s) => s.answer),
      issuedAt,
      nonce,
    });
    const digest = crypto.createHash('sha256').update(payload).digest('hex');
    const receiptId = digest
      .slice(0, 16)
      .toUpperCase()
      .match(/.{1,4}/g)
      .join('-');

    // --- ELECTION-DAY.md printed VOTER-RECEIPT fields ---
    // Compact choice line and its SHA-1 (trailing whitespace stripped).
    const choiceString = buildChoiceString(req.body).trimEnd();
    const votingChoicesHash = sha1(choiceString);
    // QR payload = CHOICES + hash, uppercased to stay QR-friendly.
    const qrPayload = `${choiceString} H:${votingChoicesHash}`.toUpperCase();
    const qrSvg = await QRCode.toString(qrPayload, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    const timeSerial = timeBasedSerial();
    // Time-Based-Serial + hash imprinted on the receipt, keyed with its own
    // secret so the serial hash cannot be forged off-machine.
    const serialHash = hmacSha1(
      timeBasedSerialSecret,
      `${timeSerial}.${votingChoicesHash}`
    );
    // Election-Branch-Hash keyed with its own, separate secret.
    const electionBranchHash = hmacSha1(electionBranchSecret, ELECTION_BRANCH);

    res.render('receipt', {
      selections,
      issuedAt,
      nonce,
      digest,
      receiptId,
      // ELECTION-DAY fields
      choiceString,
      votingChoicesHash,
      qrPayload,
      qrSvg,
      timeSerial,
      serialHash,
      electionBranch: ELECTION_BRANCH,
      electionBranchHash,
    });
  } catch (err) {
    next(err);
  }
});

app.listen(PORT, () => {
  console.log(`VOTER-RECEIPT-GEN listening on http://localhost:${PORT}`);
  // Report the secret keys so a development run's values are known. Generated
  // keys are flagged; env-provided keys are shown as sourced from the env.
  for (const [name, key] of [
    ['ELECTION_BRANCH_SECRET', electionBranchKey],
    ['TIME_BASED_SERIAL_SECRET', timeBasedSerialKey],
  ]) {
    if (key.generated) {
      console.log(`  ${name} (generated for dev): ${key.value}`);
    } else {
      console.log(`  ${name}: (from environment)`);
    }
  }
});
