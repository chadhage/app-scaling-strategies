# Repository planning and process

This directory contains material about organizing, delivering, and operating
this repository, rather than the application-scaling subject matter itself.

## Planning documents

- [Harness backlog](wiki/backlog.md): implementation stories and acceptance criteria.
- [Kanban](wiki/kanban.md): delivery inventory, contribution rules, and shared lessons.
- [Execution ledger](wiki/flow-state.json): work ownership, approvals, and acceptance records.
- [Deployment plan](deployment-plan.md): native demonstration scope and deployment gates.

The existing `wiki` layout is retained so relative links and pinned source
sections remain stable. The backlog, Kanban, and ledger were previously under
`.docs/wiki/`; the deployment plan was under `.azure/`.

## Subject matter and executable material

The [scaling strategy catalog](../README.md), [portable lessons](../learning/),
[capability demonstrations](../capability/), [native demonstrations](../demo/),
[infrastructure](../infra/), and [published site](../site/) remain in their
existing locations. [Shared test tooling](../testing/) and lesson-specific tests
and evidence also stay with their existing consumers.

Current navigation and filesystem readers use the new planning paths.
Commit-specific source links, frozen snapshots, historical evidence, and their
recorded paths and hashes retain their original meaning; relocating a document
does not refresh an acceptance snapshot or grant execution approval.
Archived publisher guards retain their original `.docs/wiki/` allowlists;
publishing the new paths requires separately verified current authorization.

A small [compatibility pointer](../.docs/wiki/backlog.md) preserves the original
backlog link in the checksum-pinned S001 lesson. The backlog content lives only
here; the lesson bytes, host integrity checks, and acceptance pins are unchanged.

Historical byte-integrity suites can report source drift for updated navigation
or filesystem readers. Their original captures remain unchanged and do not
qualify the reorganized source tree; current functional checks are separate.
