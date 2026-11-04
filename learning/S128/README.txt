S128 — Separate GA and private preview, fixed fictional DATA ONLY

Training rehearsal - synthetic data - not a live Azure result

Open learning\S128\index.html directly in a browser. No server, Azure account,
resource, identity, network, deployment or IaC is used. No packages or framework
were added. All selectors, Deployments, Services, pod labels, software versions,
GA/preview membership, authorization, routing, requests and state are teaching
DATA, not actual AKS objects, commands or executable infrastructure configuration.

Objective:
Route GA/preview to separate AKS versions; identify a selector that accidentally
mixes audiences. Here build-1/build-2 are software versions, not Kubernetes API
versions or the profile-v1 API contract, normally supported by both builds.

Worked exercise:
1. Keep GA build-1-only, preview build-2-only and cohort-gateway. Inspect selectors.
   Both separate Services match only their own two fictional pods.
2. Observe routes. The desired and observed Service/pod/build DATA must agree.
   Complete journeys and authorization remain unknown at this point.
3. Verify journeys and access. Two attempted journeys must finish login,
   callback, navigation, compatible profile payload and preserved cart, identity,
   session and one fictional effect within their original 400 ms budgets.
   Four private paths each have an unauthorized GA denial and authorized preview
   allowance observation. Only the finite synthetic result now passes.
4. Set GA to app-only, inspect, observe and verify. The selector matches all four
   pods and mixes GA with private build-2. This is a failed separation result,
   not a working selector. Empty and wrong-build selections also fail.
5. Restore separated selectors and choose private-preview-leak. The selected GA
   route still goes only to build-1 (zero GA selection to build-2), but a GA
   callback probe reaches private build-2 with HTTP 200. Authorization fails.
6. Compare contract-break, state-loss, slow-200 and incomplete-journey. Correct
   software routing or HTTP 200 alone cannot pass the complete journey.
   The breaking payload actually replaces required displayName with fullName;
   it is a measured old-client contract failure, not just a version-name change.
   Unobserved route/access/completion remains unknown and attempts stay counted.
7. Try deployments-only: Deployment objects alone do not supply weighted user
   routing. No fictional destination is invented. An unverified gateway is
   unknown. No actual gateway weights, cluster or routing is configured here.

Controls and safety:
- Exact allowlisted string tokens; no arbitrary selectors, expressions, URLs,
  identities or configurations. Descriptor-based typed guards reject getters,
  coercion, hidden/symbol/extra fields, prototypes, cycles and sparse arrays.
- State is immutable and compared with deterministic retained-history replay.
  Invalid input/state raises ERR_INPUT/ERR_STATE and never changes evidence.
- Premature valid actions or changed controls produce retained failed holds.
  Inspect the exact current controls, then observe before verifying.
- 12 actions, no pruning. ERR_LIMIT requires an explicit reset. Reset clears
  only this page's memory, restores controls and focuses GA; form reset uses
  HTMLFormElement.prototype.reset.call(form), not a shadowable form member.
- Labels, visible focus, semantic buttons, a focused alert and live status
  support keyboard operation. Missing model DATA is an explicit unknown/error,
  never a manufactured positive result.
- Strict local CSP blocks inline script/event/style, eval, all connections,
  images, frames, objects, workers, media, base changes and form navigation.

Source and documented AKS constraints were read before design:
- Exact S128 README row: capable ingress/gateway/service-mesh routing is required;
  Deployment objects alone do not supply weighted user routing.
- Exact D-S128 acceptance: Separate Deployments/Services and gateway routes
  preserve cohorts; no accidental selector mixes GA and preview; user outcomes
  are verified. Original dependencies remain P003 and D-S008 plus BASE.
- Exact portable A-S128 card, packet SC-S128, SOURCE gate, frozen S unit.
- Kubernetes Services usually select pod endpoints by labels. Service selector
  equality-map requirements combine with AND; app-only equality can match both
  builds. Selectors and labels do not enforce preview authorization.
- A qualified capable Gateway can weight separate Service backends. This lesson
  does not generate any of the documented example manifests/resources.
- AKS workload readiness, overlap capacity and lifecycle reliability have their
  own evidence requirements, not supplied by this toy routing exercise.
References and exact working/raw versus canonical Git source seals are recorded
in evidence\raw\source-inputs.json and manifest.json.

Implementation/evidence order:
BDD -> loadable browser stub -> genuine ERR_ASSERTION RED (unknown != passed) ->
IaC N/A -> implement/refactor -> focused GREEN, syntax/integrity and actual DOM,
keyboard/error/reset/failure/CSP observations. Exact archived stub and assertions
are evidence\red-stub\; original raw proof is evidence\raw\. Neither is normal
test autodiscovery. Never relabel the archived failing assertion as a green test.

Verification from the repository root, PowerShell:
  node --test learning\S128\model.test.cjs learning\S128\integrity.test.cjs learning\S128\browser.test.cjs
  node learning\S128\verify.cjs
Normal verification is READ-ONLY: no source or proof writes, including prior raw
captures. The wrapper hashes every owned file before/after the focused command.
To deliberately append a uniquely named browser capture and raw verification:
  $env:CAPTURE_BROWSER_EVIDENCE='1'
  node learning\S128\verify.cjs
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
Only the exact value 1 captures. Existing files are never overwritten. Ordinary
reruns and the parent reviewer leave historical proof unchanged.
The one-time source capture and intentional seal-evidence.cjs operation also
require that exact flag. Sealing appends an immutable raw source-seal and updates
only the current evidence\source-hashes.json pointer; normal verification never
invokes either capture utility. Raw CRLF archives and canonical Git bytes are
checked separately, not normalized into one purported identity.

The first actual browser attempt retained a failed CSP eval assertion: calling
the probe inside DevTools page.evaluate inherited its eval exemption. The probe
now runs in an external-script native keyboard event; evaluate only reads the
finished observation. The separate successful capture observes actual CSP
denials. The initial failure/transcript is preserved, never relabeled as success.
The first combined run also preserved an integrity failure: a nested archived
RED runner inherited Node's internal NODE_TEST_CONTEXT child-v8 transport and
returned no standalone failure. Only that internal variable is now removed for
the explicit archived child, which again emits the genuine ERR_ASSERTION RED.
This repair does not change any original stub or raw proof bytes.

Existing private test tooling:
Node 22.23.4, offline Playwright 1.56.1 and Microsoft-signed Edge 156.0.4314.50.
Use only testing\browser\isolated.cjs, SHA-256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055,
published commit 53c0c0d, openIsolatedLesson with awaited close() in finally.
The helper's unattended page/context/cleanup lifecycle remains unqualified;
the inactive recovery prototype is not used. Missing tooling is an error, not
a download or fallback. No foreground browser lease or unsafe flags are used.

Honest remainder:
B-S128 still requires CORE, DATA, AKS (C073/C077), C074, an explicitly approved
native target and live execution authorization, version-specific real endpoint
selection, capable gateway routing, all reachable private-preview authorization,
compatible complete user journeys and ordered ring/canary promotion observations.
D-S128/P003/D-S008 and BASE retain their original acceptance requirements.
No native AKS result, actual weighted-distribution proof, source-parent completion,
production Node.js 24 validation, durable state or five-nines inference is claimed.
One original frozen A-S128 S unit only, after parent-owned acceptance; zero extra
test/repair/proof/refinement credits. C005-C008/local-harness integration and all
root/shared documentation/ledger edits remain parent-owned and untouched.
