# USA Secure Voting Framework

How can we run elections that are easy to vote in, hard to cheat in, and simple
to double-check afterward? This project collects a set of plain-language
proposals for exactly that: **auditable and secure voting**, where every vote
leaves behind a paper trail that can be independently verified.

The goal is voting you can trust — not because you're told to, but because the
results can be checked by anyone, using the receipt in your own hand.

## Start here: Election Day procedures

**➡️ [ELECTION-DAY.md](ELECTION-DAY.md) — the heart of this project.**

This is the main document. It walks through a full election day, step by step:

- How a voter makes their choices and receives a printed **voter receipt** with a scannable QR code.
- How that receipt is confirmed, copied, and dropped into secure ballot boxes so
  there are multiple independent records of every vote.
- How a recount works, and how each receipt's authenticity is checked using
  tamper-evident codes.
- How printed paper ballots are marked so counterfeit ballots are easy to catch.

If you read one thing, read that.

## The receipt demo app

Inside the [`voter-receipt-gen/`](voter-receipt-gen/) folder is a small working
program that shows what one of these voter receipts actually looks like. You pick your choices on a 
sample ballot, and it prints out a receipt — complete with the QR code and verification codes described in the Election Day document.

It's a demonstration to make the ideas concrete, not real election software.

See [`voter-receipt-gen/README.md`](voter-receipt-gen/README.md) for how to run
it and what it does.
