# U007 append-only current authority

The original capture index and seal remain byte-exact. The original verifier
helper is unchanged. The original U007 production and evidence-test source have
byte-exact retained predecessors under the amendment directory.

The amended evidence-test bootstrap independently pins both the new current
helper and the original helper before loading them. An immutable base anchors
the original index, seal and predecessors. Append-only addenda and heads bind
the current production, bootstrap and new tests without changing old records.
Raw and exact LF-canonical digests are accepted; arbitrary mixed-newline
rewrites are not normalized into success.

The current helper first verifies the original history using only those
retained predecessor source bytes. It separately verifies every current pin,
new derived stream and source-matched full-production coverage capture. The
in-memory index used to reuse the original capture checker never replaces the
original index or seal on disk.

New public transcripts are explicitly derived, separately hashed, portable
views. Original manifests, stdout, stderr, exits and input hashes remain
immutable in private storage. A capture from an earlier production epoch is
history, not coverage of current production.

This is a consistency tripwire anchored by accepted source history, not
authentication against a coordinated rewrite of all source and evidence.
Passing it grants neither browser qualification, live-application permission,
publication, acceptance nor Kano credit.
