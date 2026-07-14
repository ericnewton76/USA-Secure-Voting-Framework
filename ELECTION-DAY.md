# Election-Day Vote Integrity

**Status:** Work in progress — Request for Comments (draft)
**Audience:** Election officials, lawmakers, and the general public, with a technical appendix for implementers.

---

## 1. Abstract

This document proposes a method for conducting election-day voting — whether by computerized voting machine or by hand-marked paper ballot — in a way that is easy for voters, transparent to observers, and independently auditable after the fact.

The core idea is simple: every voter walks away with a paper **receipt** of their own vote. That receipt carries tamper-evident codes, and identical copies are deposited into multiple sealed ballot boxes. Because the codes are generated from the vote itself (and cannot be forged without a secret key held by election officials), anyone recounting the boxes can prove that the receipts are authentic, that they have not been altered, and that they were not mass-produced by a machine. Critically, none of this links a voter to how they voted.

## 2. Motivation and Threat Model

This design aims to defeat the following attacks without requiring voters to trust any single machine or official:

- **Ballot alteration** — changing a vote after it is cast. Defeated because each receipt carries a hash of its own choices; any change breaks the hash.
- **Ballot forgery / stuffing** — inserting fabricated ballots. Defeated because valid receipts require a hash signed with a secret key that forgers do not have.
- **Machine-generated ballot floods** — a compromised machine emitting thousands of ballots. Detectable because each receipt carries a time-based serial; an implausible burst of serials in a short window is visible on audit.
- **Undetectable recount tampering** — Defeated because the physical copies in the sealed boxes can be re-scanned and cross-checked against each other and against the machine's digital record.

**Privacy guarantee:** The receipt records *what* was voted, never *who* voted it. No component of the system links a voter's identity to their choices.

## 3. Terminology and Notation

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are to be interpreted as described in RFC 2119.

### 3.1 Roles and artifacts

- **VOTER** — the person casting a vote.
- **VOTING-MACHINE** — the computerized station where the VOTER makes and prints their choices.
- **VOTER-RECEIPT-SCANNER** (**SCANNER**) — the second, separate station that validates the receipt, imprints integrity codes, records the vote, and produces copies.
- **VOTER-RECEIPT** — the printed record of one voter's choices; the physical basis of the integrity process.
- **VOTER-RECEIPT-COPY** — a photocopy of a VOTER-RECEIPT that is deposited into a ballot box.
- **SECURE-BALLOT-BOX** — a sealable, timestamped container that receives VOTER-RECEIPT-COPYs.

### 3.2 Hash notation

A **hash** is a computer-generated code that is difficult to reproduce without the original data. The content of a hash has visible and non-visible components; a non-visible component (such as a secret key) is written inside square brackets:

```
visible-text[secret].hash
```

All hashing in this document uses **sha256**.

### 3.3 Named codes

- **VOTER-CHOICES-HASH** — sha256 over the voting choices only. Carried inside the VOTER-CHOICES-BARCODE (§4.1).
- **VOTER-CHOICES-BARCODE** — the Aztec Code symbol on the VOTER-RECEIPT that carries the choices together with the VOTER-CHOICES-HASH (§4.1).
- **TIME-BASED-SERIAL** — a serial number derived from the current timestamp (§4.3).
- **ELECTION-BRANCH** — a plain-English identifier for the precinct/branch (§4.4).
- **VOTER-RECEIPT-HASH** — sha256 over `VOTER-CHOICES-HASH` + `TIME-BASED-SERIAL` + `ELECTION-BRANCH` + `[ElectionBranchSecretKey]` (§4.2). This is the tamper-evident code imprinted by the SCANNER.

## 4. Data Structures

### 4.1 VOTER-CHOICES-BARCODE on the VOTER-RECEIPT

The **VOTER-CHOICES-BARCODE** is an **Aztec Code** symbol carrying the choices together with the VOTER-CHOICES-HASH. Its choices portion is a near-literal, human-readable copy of the choices, so any common barcode scanner shows exactly what was voted. For example, `1:WASH.G/ADAMS.J` encodes George Washington for President with John Adams as Vice-President on the first line of the ballot.

The VOTER-CHOICES-BARCODE does **NOT** link the VOTER to their choices in any way.

Encoding conventions (see Appendix A for the charset and size limits):

- Lines are separated by a space, keeping the payload a single compact token (and matching the exact string that is hashed, per Appendix B).
- Use `YEA` / `NAY` for yes/no questions.
- Use `---` for an explicit NO VOTE, or omit that line index entirely to save space.

```
1:WASH.G/ADAMS.J 2:YEA 3:NAY 4:--- 5:NAY
or
1:WASH.G/ADAMS.J 2:YEA 3:NAY 5:NAY
```

The **VOTER-CHOICES-HASH** is the sha256 of this choices string, with trailing whitespace stripped (worked example in Appendix B).

### 4.2 VOTER-RECEIPT-HASH

The VOTER-RECEIPT-HASH is constructed (sha256) from the following, concatenated with `.` as the delimiter:

- **VOTER-CHOICES-HASH** — binds the receipt to the exact choices; any alteration breaks it.
- **TIME-BASED-SERIAL** — enables detecting a FLOOD of machine-generated ballots.
- **ELECTION-BRANCH** — binds the receipt to its precinct of origin.
- **[ElectionBranchSecretKey]** — a secret key, held by election officials and never printed, that makes the hash impossible to forge. Non-visible per the `visible-text[secret].hash` notation.

The SCANNER computes and imprints this hash only after the VOTER has confirmed their choices (§5.2).

### 4.3 TIME-BASED-SERIAL

A serial number derived from the current timestamp (conceptually similar to a MongoDB ObjectId). Because each serial embeds the time it was issued, an implausible burst of serials — far faster than humans can vote — is evidence of machine-generated ballots rather than genuine voters.

### 4.4 ELECTION-BRANCH

Plain-English details of the election branch — for example `FL-Precinct.100` or `VA-Precinct.50` — defined by state election offices. This single identifier is the authoritative source-of-origin field; it replaces the earlier separate "Election-Source" and "Election-Branch-Info" names.

## 5. Procedures

### 5.1 Election-Day Prestart

- Every SECURE-BALLOT-BOX **MUST** be timestamped when it is opened/constructed or first used.
- A box **MAY** be timestamped when placed into a voting machine.
- A box **MAY** be post-dated to the actual election opening time.
- If paper ballots are used, every printed paper ballot **MUST** carry a TIME-BASED-SERIAL (see §6).

### 5.2 Election-Day Voting Process

1. A VOTER walks up to a VOTING-MACHINE and makes their choices.
2. The VOTER presses PRINT. The VOTING-MACHINE produces a VOTER-RECEIPT bearing a prominent VOTER-CHOICES-BARCODE (choices + VOTER-CHOICES-HASH), the TIME-BASED-SERIAL, and the ELECTION-BRANCH.
3. The VOTER takes the printed VOTER-RECEIPT in hand. They **MAY** scan the VOTER-CHOICES-BARCODE with their own phone to see the choices it contains.
4. The VOTER presents the VOTER-RECEIPT to a separate VOTER-RECEIPT-SCANNER, inserting it so that the VOTER can always physically see the receipt.
5. The SCANNER validates the VOTER-CHOICES-BARCODE (readable, and its hash matches the choices) and displays the choices. The VOTER confirms.
6. The SCANNER computes the **VOTER-RECEIPT-HASH** and imprints it on the receipt, along with a second QR code that is a verification URL back to the Election Official website (so the VOTER can later confirm their vote counted).
7. The SCANNER records the vote into its database.
8. The SCANNER **PHYSICALLY PHOTOCOPIES** the receipt **3 times**:
   - one VOTER-RECEIPT-COPY is dropped into a SECURE-BALLOT-BOX inside the machine;
   - two VOTER-RECEIPT-COPYs are handed to the VOTER.
9. The original VOTER-RECEIPT is returned to the VOTER to keep. The VOTER **MAY** hold the copies up to a light source to verify the barcodes copied cleanly.
10. The VOTER is directed to deposit each of the two VOTER-RECEIPT-COPYs into two **separate** SECURE-BALLOT-BOXes.

> **Open item (please confirm):** The prior draft said "photocopied 2 times" but then required one copy for the in-machine box *and* two copies for the voter to deposit — which needs 3 copies. I set this to **3**. If you'd rather drop the in-machine copy, it becomes 2.

### 5.3 Election-Day Conclusion

Also performed whenever a particular SECURE-BALLOT-BOX is full and can no longer accept VOTER-RECEIPT-COPYs:

1. The SECURE-BALLOT-BOX is sealed, and the total time it was open is recorded.

### 5.4 ELECTION HQ — Post-Election-Day Recount

**Scenario:** a recount is demanded (e.g. a margin threshold is crossed) and a higher authority orders a physical-copy recount.

> **DO NOT ASSUME ANY VOTER-RECEIPT-COPY CONTAINED WITHIN A SECURE-BALLOT-BOX IS VALID.**

1. The SECURE-BALLOT-BOX id and timestamp are recorded.
2. The box is opened and all VOTER-RECEIPT-COPYs inside are retrieved.
3. The box id and timestamp **MUST** be recorded as a prerequisite to scanning *any* VOTER-RECEIPT-COPY.
4. Each VOTER-RECEIPT-COPY is re-scanned. The VOTER-CHOICES-BARCODE's integrity is validated against the recorded **VOTER-CHOICES-HASH** (sha256).
5. The copy's integrity is validated against the **VOTER-RECEIPT-HASH** (which includes ELECTION-BRANCH).
6. Examine the count of copies in the box against the timestamp and the duration the box was open. **Look for unlikely counts** — genuine voters average roughly 30 s – 1 min each, so a box that filled far faster is suspect.

*(more to come)*

## 6. Paper Ballots

When hand-marked paper ballots are used — where the VOTER stamps, colors dots, or hole-punches specific areas of paper — each ballot **MUST** carry serial numbers with a hashed `Batch_ID.hash` and `Batch_ID.Time-based-serial.hash` printed or stamped on it. This makes ballots difficult to manufacture illegitimately, because valid ballots can then only be sourced from legitimate branch offices.

### 6.1 Paper-ballot undersupply

Election officials may need to engage an outside print vendor (e.g. Kinko's, Staples) to print ballots quickly. The same mechanism applies: generate a new `Batch_ID` per 1000 ballots and imprint the code+tag on that batch.

This scenario carries somewhat more risk, but the `Batch_ID.Time-based-serial[secret].hash` still creates a chokepoint against illegitimate ballot reproduction.

## Appendix A — VOTER-CHOICES-BARCODE charset and limits

The VOTER-CHOICES-BARCODE is an **Aztec Code** symbol. Aztec has ample capacity for the offline payloads relevant here (thousands of characters at high density), but the symbol **SHOULD** be kept small so it prints and scans reliably on a receipt — keep the payload compact.

Aztec encodes uppercase letters and digits most compactly; lowercase and other characters force mode-switches that enlarge the symbol. Restrict the choices string to uppercase letters, digits, and a small set of symbols: `$ % * + - . / :` and space. Use a space between ballot lines rather than a line feed. Permitted characters:

```
/[A-Z0-9\$\%\*\+\-\.\/\: ]/
```

Keep the payload compact; strip NO-VOTE lines where space is tight.

## Appendix B — Worked hash example (VOTER-CHOICES-HASH)

Compute the sha256 of the choices string with trailing whitespace stripped:

```bash
> echo '%s' '1:WASH.G/ADAMS.J 2:YEA 3:NAY 4:--- 5:NAY' | sha256sum
1dd38eb162d6582b95bfd3a02dfcbc0a0431a3686eba8f4da3cd6db41ea206f3 *-
```
