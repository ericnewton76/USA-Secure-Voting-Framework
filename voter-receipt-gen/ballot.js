// Canonical ballot definition. Shared by the SAMPLE-BALLOT page and the
// RECEIPT-GEN page so option labels live in exactly one place.

const ballot = {
  title: 'Sample Ballot — General Election',
  contests: [
    {
      id: 'president',
      type: 'choice',
      title: 'President / Vice President of the United States',
      instruction: 'Vote for ONE ticket.',
      options: [
        {
          value: 'washington-adams',
          label: 'George Washington (President) & John Adams (Vice President)',
          party: 'Constitution Party',
          qr: 'WASH,G/ADAMS,J',
        },
        {
          value: 'jay-harrison',
          label: 'John Jay (President) & Robert H. Harrison (Vice President)',
          party: 'Federalist Party',
          qr: 'JAY,J/HARRISON,R',
        },
      ],
    },
    {
      id: 'amendment-11',
      type: 'yeanay',
      title: '11th Amendment Ratification',
      instruction:
        'Shall the ratification process continue for the 11th Amendment to the ' +
        'Constitution, preventing individuals from suing a State in Federal court?',
    },
    {
      id: 'economic-system',
      type: 'yeanay',
      title: 'Economic System',
      instruction:
        'Shall the society be organized as a capitalist society? ' +
        '(Yea = Capitalist, Nay = Communist)',
    },
    {
      id: 'dc-capital',
      type: 'yeanay',
      title: 'Seat of Government',
      instruction:
        'Shall the swamps of Maryland be carved into Washington, D.C., with the ' +
        'White House built there?',
    },
  ],
};

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

// Build the compact choice line, e.g. "1:WASH,G/ADAMS,J 2:YEA 4:NAY".
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
