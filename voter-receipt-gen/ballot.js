// Canonical ballots. The DATA is the single source of truth in the Hjson files
// under public/ballots/ (Hjson = human-readable JSON with comments); this module
// loads every one of them and adds the shared lookup/formatting helpers used by
// the SAMPLE-BALLOT and RECEIPT-GEN pages so option labels live in one place.

const fs = require('fs');
const path = require('path');
const Hjson = require('hjson');

const BALLOTS_DIR = path.join(__dirname, 'public', 'ballots');

// Load every *.hjson under public/ballots/. The file name (sans extension) is
// the ballot id used in URLs (/ballot/:id). Sorted for a stable listing order.
function loadBallots() {
  return fs
    .readdirSync(BALLOTS_DIR)
    .filter((f) => f.endsWith('.hjson'))
    .sort()
    .map((file) => {
      const id = path.basename(file, '.hjson');
      const data = Hjson.parse(
        fs.readFileSync(path.join(BALLOTS_DIR, file), 'utf8')
      );
      return { id, ...data };
    });
}

const ballots = loadBallots();
// Indexed by id for O(1) lookup from the request handlers.
const ballotsById = new Map(ballots.map((b) => [b.id, b]));

function getBallot(id) {
  return ballotsById.get(id) || null;
}

// Map a submitted value to a human-readable answer for a given contest.
function labelFor(contest, value) {
  if (contest.type === 'yeanay') {
    if (value === 'yea') return 'YEA';
    if (value === 'nay') return 'NAY';
    return null;
  }
  const opt = contest.options.find((o) => o.value === value);
  return opt ? opt.label : null;
}

// Map a submitted value to its compact, QR/alphanumeric-friendly code
// (per ELECTION-DAY.md: uppercase, no LF, YEA/NAY for yes/no).
function qrCodeFor(contest, value) {
  if (contest.type === 'yeanay') {
    if (value === 'yea') return 'YEA';
    if (value === 'nay') return 'NAY';
    return null;
  }
  const opt = contest.options.find((o) => o.value === value);
  return opt ? opt.qr : null;
}

// Build the compact choice line, e.g. "1:WASH.G/ADAMS.J 2:YEA 4:NAY".
// Line index is 1-based; contests with no selection are stripped entirely
// for space efficiency (ELECTION-DAY.md QR section).
function buildChoiceString(ballot, body) {
  return ballot.contests
    .map((contest, i) => {
      const code = qrCodeFor(contest, body[contest.id]);
      return code ? `${i + 1}:${code}` : null;
    })
    .filter(Boolean)
    .join(' ');
}

module.exports = {
  ballots,
  getBallot,
  labelFor,
  qrCodeFor,
  buildChoiceString,
};
