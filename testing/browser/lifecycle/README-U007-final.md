# U007 final private integration

This is the original U007 opt-in implementation rebased additively onto the
accepted 514-file U034/U061/U062 lifecycle baseline. All 514 baseline files and
all 185 retained U007 files remain byte-exact. Neither production file changed.
U061/U062 verification repairs and Edge qualification are accepted dependencies,
not new U007 authorship.

## Current proof

- Both complete production files are independently included by their literal
  absolute `.git` paths, without a globstar or an exclusion. Scratch coverage is
  100 / 99.7 / 100; session coverage is 100 / 95.9 / 96.77.
- The original nine behavioral tests are unchanged. The retained one-attempt
  implementation fails six specified assertions, including genuine Windows
  `FileShare.ReadWrite` and `FileShare.None` delete-denial barriers. Current
  production passes all nine, including the bounded, named persistent remainder.
- The exact original 2,213-mutant campaign is reused, not rerun or relabeled:
  2,148 named test kills, five witnessed iteration-bound kills and 60 paired
  equivalence witnesses. The independent rebase audit recomputes 6,180 mutant
  stream hashes, 63 original capture pairs and 8,353 recorded inputs; all 117
  current campaign source/test inputs match the new fork. No timeout is a kill.
- A new actual capture runs two live scratch sessions and a separately owned
  same-image neighbor in both FIFO and LIFO order. Each pair uses the unchanged
  lesson and loopback sealed helpers. The installed browser is Microsoft-signed
  Edge 157.0.4341.42; its qualification is read, never appended or changed.
- Native browser roots are authenticated through the owned CDP connection,
  matched to native creation identities and independently bound to their profile
  command lines. Profile ownership comes from successful exclusive `mkdtemp`
  observations, not names, directory differences or an error string.
- The four scratch sessions close cleanly; repeated closes share their original
  promise and issue no extra kill. Both neighbors survive both corresponding
  cleanups, then end through their own identity-bound closer. All six positively
  created profiles are confirmed absent. All 54 observed native children exit.

The original virtual-clock REDs, failed captures, partial mutation campaigns,
source epochs, Windows transcripts, capture index and head remain immutable.
New command-driver failures are retained and explicitly **not** behavioral REDs.
Private native stdio and commands are originals; portable public transcripts are
separately hashed derivatives linked to those originals.

## Append-only current authority

`evidence\u007\final\authority-base.json` anchors the accepted baseline, all
retained U007 files and unchanged sealed dependencies. The new head links the
original U007 head without repinning a historical producer, import or pin file.
The new independently pinned checker verifies the exact current addition set,
current coverage, native observations and portable transcript bytes.

Current, LF and CRLF namespace captures are retained privately after the public
byte set is sealed, avoiding a capture changing the namespace it just measured.
Evidence and qualification-policy bytes are never newline-normalized. Code
accepts only its exact recorded raw/LF/CRLF digests, not arbitrary mixed endings.

## Reproduction and limits

Run the existing `tests\u007-replay.cjs` from a private copy for namespace and
original RED/GREEN checks. The final result contains the exact commands, input
hashes, original stdio paths and independent full-file coverage receipts.

The explicit actual-browser fixture is:

```powershell
# U007_FINAL_ROOT must be an existing, empty, caller-owned private directory.
node --test --test-concurrency=1 --test-timeout=4000000 testing\browser\lifecycle\tests\u007-final-native.cjs
```

The browser fixture uses existing installed Playwright only; no installation,
identity change, expenditure or policy write is authorized. It starts only an
ephemeral IPv4 loopback server and closes it in `finally`.

All new native runtime paths are inside the private fork. The unrelated shared
runtime is preserve-only; this work never claims it is globally clean. The
original same-user filesystem TOCTOU and synchronous-adapter limitations remain.
This proof does not grant live application, qualification acceptance, publication,
Done or Kano credit. The parent owns all such decisions.
