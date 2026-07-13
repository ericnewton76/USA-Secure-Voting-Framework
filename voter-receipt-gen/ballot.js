// Canonical ballot. The DATA is the single source of truth in ballot.hjson
// (Hjson = human-readable JSON with comments); this module parses it and adds
// the shared lookup/formatting helpers used by the SAMPLE-BALLOT and
// RECEIPT-GEN pages so option labels live in one place.

const fs = require('fs');
const path = require('path');
const Hjson = require('hjson');

const ballot = Hjson.parse(
  fs.readFileSync(path.join(__dirname, 'ballot.hjson'), 'utf8')
);

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
function buildChoiceString(body) {
  return ballot.contests
    .map((contest, i) => {
      const code = qrCodeFor(contest, body[contest.id]);
      return code ? `${i + 1}:${code}` : null;
    })
    .filter(Boolean)
    .join(' ');
}

module.exports = { ballot, labelFor, qrCodeFor, buildChoiceString };
