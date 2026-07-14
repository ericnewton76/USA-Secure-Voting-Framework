const express = require('express');
const crypto = require('crypto');
const path = require('path');
const QRCode = require('qrcode');
const { ballots, getBallot, labelFor, buildChoiceString } = require('./ballot');

const app = express();
const PORT = process.env.PORT || 3000;

// Plain-english details of the election branch (ELECTION-DAY.md). The election
// branch is defined by the ballot the voter selected (its `electionBranch`
// field); this env/default value is only a fallback for ballots that omit one.
const ELECTION_BRANCH_FALLBACK =
  process.env.ELECTION_BRANCH ||
  'STATE OF VIRGINIA / PRECINCT 000 / 1789 GENERAL';

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
const criticalVoteKey = resolveSecret('CRITICAL_VOTE_SECRET');
const electionBranchSecret = electionBranchKey.value;
const timeBasedSerialSecret = timeBasedSerialKey.value;
const criticalVoteSecret = criticalVoteKey.value;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
// Keyed integrity hash: unlike a bare sha1, a value cannot be recomputed or
// forged without the secret key.
const hmacSha1 = (key, s) =>
  crypto.createHmac('sha1', key).update(s).digest('hex');

// Non-secret metadata for the /config admin page: source and last 4 chars only,
// never the full key. Enough for an admin to confirm WHICH key is loaded.
const keyMeta = (envName, key) => ({
  envName,
  generated: key.generated,
  last4: key.value.slice(-4),
});
const secretKeyMeta = [
  keyMeta('ELECTION_BRANCH_SECRET', electionBranchKey),
  keyMeta('TIME_BASED_SERIAL_SECRET', timeBasedSerialKey),
  keyMeta('CRITICAL_VOTE_SECRET', criticalVoteKey),
];

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
// extended:true so the /config admin form's nested field names
// (contest[0][option][1][label]) parse into nested objects/arrays.
app.use(express.urlencoded({ extended: true }));

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

// BALLOT-INDEX: lists the available ballots. Each links to its own selection
// page (/ballot/:id) and admin page (/config/:id).
app.get('/', (req, res) => {
  res.render('ballots', { ballots });
});

// SAMPLE-BALLOT: renders one ballot's selection form, which posts to
// /ballot/:id/receipt.
app.get('/ballot/:id', (req, res) => {
  const ballot = getBallot(req.params.id);
  if (ballot == null) return res.status(404).send('Ballot not found');
  res.render('ballot', { ballot });
});

// Turn free-text into a form/name/URL-safe slug (for contest ids and option
// values). Falls back to 'item' so a slug is never empty.
function slugify(s) {
  return (
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

// Restrict a QR fragment to the sanctioned QR alphanumeric set (ELECTION-DAY.md):
// uppercase letters, digits, and $ % * + - . / : and space. Anything else
// (commas, lowercase, etc.) is dropped so codes stay in QR alphanumeric mode.
function sanitizeQr(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9$%*+\-./: ]/g, '')
    .trim();
}

// Rebuild the ballot's contest array from a submitted /config form. Ids and
// option values are slugified and de-duplicated so radio names never collide.
// Contests and options without a title/label are dropped (blank template rows).
function parseContestsFromBody(body) {
  const rawContests = body.contest ? Object.values(body.contest) : [];
  const usedIds = new Set();
  return rawContests
    .filter((c) => c && String(c.title || '').trim())
    .map((c) => {
      const type = c.type === 'choice' ? 'choice' : 'yeanay';
      let id = slugify(c.id || c.title);
      while (usedIds.has(id)) id = `${id}-x`;
      usedIds.add(id);

      const contest = {
        id,
        type,
        title: String(c.title).trim(),
        instruction: String(c.instruction || '').trim(),
      };

      if (type === 'choice') {
        const rawOpts = c.option ? Object.values(c.option) : [];
        const usedValues = new Set();
        contest.options = rawOpts
          .filter((o) => o && String(o.label || '').trim())
          .map((o) => {
            let value = slugify(o.value || o.label);
            while (usedValues.has(value)) value = `${value}-x`;
            usedValues.add(value);
            return {
              value,
              label: String(o.label).trim(),
              party: String(o.party || '').trim(),
              // Keep a usable QR code even if the admin leaves it blank.
              qr: sanitizeQr(o.qr) || sanitizeQr(o.label),
            };
          });
      }
      return contest;
    });
}

// CONFIG-ADMIN: view/edit one ballot's contests and check which secret keys are
// loaded (last 4 chars only). NOTE: this endpoint is unauthenticated — put it
// behind machine/network access control before any real deployment.
app.get('/config/:id', (req, res) => {
  const ballot = getBallot(req.params.id);
  if (ballot == null) return res.status(404).send('Ballot not found');
  res.render('config', {
    ballot,
    secretKeys: secretKeyMeta,
    saved: req.query.saved === '1',
    error: req.query.error || null,
  });
});

// Apply an edited ballot. Edits are in-memory only (reset on restart). Uses the
// POST/redirect/GET pattern so a refresh does not re-submit.
app.post('/config/:id', (req, res) => {
  const ballot = getBallot(req.params.id);
  if (ballot == null) return res.status(404).send('Ballot not found');
  const contests = parseContestsFromBody(req.body);
  if (contests.length === 0) {
    return res.redirect(`/config/${ballot.id}?error=empty`);
  }
  const title = String(req.body.title || '').trim();
  if (title) ballot.title = title;
  ballot.contests = contests;
  res.redirect(`/config/${ballot.id}?saved=1`);
});

// RECEIPT-GEN: turns submitted selections into a verifiable voter receipt.
app.post('/ballot/:id/receipt', async (req, res, next) => {
  try {
    const ballot = getBallot(req.params.id);
    if (ballot == null) return res.status(404).send('Ballot not found');
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
    const choiceString = buildChoiceString(ballot, req.body).trimEnd();
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
    // The election branch comes from the selected ballot; fall back to the
    // env/default only when the ballot does not declare one.
    const electionBranch = ballot.electionBranch || ELECTION_BRANCH_FALLBACK;
    // Election-Branch-Hash keyed with its own, separate secret.
    const electionBranchHash = hmacSha1(electionBranchSecret, electionBranch);

    // CRITICAL-VOTE-HASH (ELECTION-DAY.md): the culminating keyed hash binding
    // the voting-choices hash, the time-based serial, and the election-branch
    // details into one value. Keyed with its own independent secret so it
    // cannot be forged even if one of the other keys leaks.
    const criticalVoteHash = hmacSha1(
      criticalVoteSecret,
      `${votingChoicesHash}.${timeSerial}.${electionBranch}`
    );

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
      electionBranch,
      electionBranchHash,
      criticalVoteHash,
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
    ['CRITICAL_VOTE_SECRET', criticalVoteKey],
  ]) {
    if (key.generated) {
      console.log(`  ${name} (generated for dev): ${key.value}`);
    } else {
      console.log(`  ${name}: (from environment)`);
    }
  }
});
