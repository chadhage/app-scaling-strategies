# C001: approved local contract

Open `capability\C001\index.html` directly in a browser. Use Tab to reach the action selector and button; Enter probes without executing anything. The summary and JSON are read-only. No server, packages, network access, credentials, or Azure resources are needed.

`approved-contract.js` is the recursively frozen snapshot of `.docs\wiki\flow-state.json` → `approvals.C001`, published in `26747d4fbbd51235c612dbd9d8c92ab335aef78e`. `contract-guard.js` pins its canonical SHA-256 independently and compares explicit approval input exactly, including missing/extra fields, false flags, and zero limits. A visitor's `approved=true` is not authority.

The browser verifies the **bundled snapshot**, not the current ledger. The local command below re-reads the current operator record on each probe and fails closed on missing, malformed, or changed approval:

```powershell
node capability\C001\probe.cjs local.summary
node capability\C001\probe.cjs native.execute
node --test capability\C001\tests\*.test.cjs
```

Allowed local inspection exits 0; denied probes exit 1 with explicit reason codes. Exactly one action argument is accepted; there is no approval or target override.

## Boundaries

- Production target remains **Node.js 24 LTS / Express / App Service Linux**. Node.js **22.23.4** only runs local test tooling; this is not production-runtime validation.
- The exact authentication, authorization design, storage choices, first planned App Service code-slot provider, future Bicep preference, and decision owner are visible in the snapshot and page. No full Express harness or server-side auth/lease boundary is implemented.
- `local.summary` and `local.probe` are the only potentially allowed actions. Unknown, native, IaC, scaffold, deployment, identity-registration, and expenditure probes deny. Every result has `executed: false`.
- Native execution limit **0** and authorized cloud spend **0** mean **forbidden**, not an estimate or an approved free resource.
- Native-target OS, SKU, subscription, resource group, and region remain unapproved. Control-service Linux does not determine native OS.
- IaC is **N/A** for this local consent unit. No resource definitions, registrations, deployments, credentials, price quotes, or native qualification evidence are produced.
- This local guard is not a production security boundary. Future server enforcement must re-check authoritative consent, identity, roles, leases, capacity, and budget; a client decision cannot authorize execution.
- New operator approval deliberately causes snapshot drift. A reviewed snapshot/pin revision is required; the browser cannot edit, approve, or refresh consent.

BDD and actual red/green/browser evidence are in `C001.feature`, `evidence.json`, and `evidence\`.
