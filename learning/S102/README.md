# A-S102 — DNS cache persistence

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. Only JavaScript and local file access are required. No server, account, package, framework or network access is needed.

## Conduct the bounded exercise

1. Choose **Retain blue through declared overlap**, then **Publish fixed teaching answer**. At synthetic t=30, the fresh reference changes from blue `192.0.2.10` to green `192.0.2.20`; nothing actually changes DNS.
2. Compare **t=30**, **All three fixed observations available**. Fresh selects green; cached A/B still select usable blue with 90/150 synthetic seconds remaining. The three fixed journeys succeed despite different answers.
3. Predict **SUCCESS** and choose **Retain old overlap; sampled answers do not prove universal convergence**. Interpretation PASS is separate from the measured outcome.
4. Reset and compare **t=120**. A selects green but B remains blue for another 60 synthetic seconds. Retain blue through the declared t=180 overlap. A's expiry does not establish B's expiry.
5. Reset and compare **t=180**. These three samples agree on green; **universal convergence remains NOT ESTABLISHED**. The fixture says nothing about unobserved resolvers or real DNS behavior.
6. Reset and choose **Retire blue immediately**, then compare **t=30**. Fresh succeeds but both cached journeys are interrupted: **FAILURE**, 1 successful / 3 attempted. At t=120 one cached journey still fails. A correct negative interpretation passes without changing those failures.
7. Reset and choose **Cached B observation missing** with retained blue. **UNKNOWN**, 2 successful / 3 attempted; no answer, route, remaining-cache value, usability or latency is invented for B. With early retirement plus missing B, FAILURE and UNKNOWN observations coexist in the denominator.

The display-only name is `service.training.invalid`. All DNS, resolver/cache expiry, address, routing, usability, and latency observations are **fixed teaching DATA ONLY**. A/B expiry deadlines (t=120/t=180) are scenario assumptions, not universal DNS policy. Available successful journeys take fixed 7/8/9 synthetic ms against an illustrative 10 ms budget. An unavailable old destination fails after fixed 4 synthetic ms: being fast does not make failure successful. No wall-clock time or real DNS response is measured.

One comparison is allowed per rehearsal, with at most **12 comparisons** total. Reset restores the baseline, default controls, current trace, errors and keyboard focus while retaining every previous comparison and attempted denominator. It invokes the native, non-shadowed `form.reset()`; no control is named `reset`. Run tokens are bounded positive integers through 65535; stale/invalid inputs, extra fields, impossible state, wrong phases and further comparisons fail atomically. Reload deliberately clears in-memory history. No storage is used.

Standard Tab, Enter and Space controls, skip navigation, visible focus, live result announcements and a focused error alert are supported. No arbitrary hostname, address, command or endpoint can be entered.

## Exact source acceptance and scope

- S102 in the immutable **source README**: **DNS-cache persistence:** Keep cached destinations usable for the required overlap period; do not assume immediate DNS convergence.
- D-S102 acceptance: **Old cached destinations remain usable for the declared overlap; resolver emulation is labeled and not claimed as universal DNS convergence.**
- A-S102: **Compare fresh/cached DNS answers; identify why immediate convergence cannot be assumed.**
- Gate `SOURCE`; fixed packet `SC-S102`; owner `worker-A-S102`; frozen Kano `S`, unit `A-S102`; only `learning\S102\**` is owned.

The original D-S102 dependency is P006, plus the native shared prerequisites. This resource-free A slice is **not** owned test-DNS updates, an actual resolver driver, native B-S102 acceptance or a completed D-S102 source demo. Those remain blocked by their original approved-resource/host/safety prerequisites. There is no DNS operation, host-file change, resolver/system-setting change, real endpoint access, resource operation, cloud, IaC, scaffold, identity, credential, deployment or spending. Node.js 22 is test tooling, not production Node.js 24, and no five-nines or universal convergence claim is made. See the source's [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).

## Focused read-only verification

From the repository root in PowerShell:

```powershell
node --test --test-concurrency=1 .\learning\S102\tests\model.test.cjs .\learning\S102\tests\surface.test.cjs .\learning\S102\tests\integrity.test.cjs && node --test --test-concurrency=1 .\learning\S102\tests\browser.test.cjs
```

Normal verification never rewrites source, RED, green, syntax, browser or integrity evidence. Raw RED streams and the loadable stub/test/BDD snapshots are outside automatic discovery in `evidence\raw\` and `evidence\red\`. Narrow owned `.gitattributes` uses `-text -diff` for raw/snapshot evidence, preserving CRLF bytes without treating them as whitespace-lintable source. Canonical Git LF source is qualified separately; the approved helper's raw CRLF hash is never compared directly with its canonical Git bytes.

Browser checks use only published `testing\browser\isolated.cjs` (`53c0c0d`, raw SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `close()` in `finally`. The existing offline Playwright **1.56.1**, Microsoft-signed installed Edge **156.0.4314.50**, and Node **22.23.4** pairing is the only qualified tooling. No package install, download, unsafe browser flag, foreground lease or abandoned lifecycle prototype is used. The published helper's unattended context/shutdown deadline limitation remains **unqualified**.

`CAPTURE_BROWSER_EVIDENCE=1` is deliberate first-capture only and refuses to overwrite existing browser evidence. The actual page-loaded CSP probe attempts inline execution, evaluation, image, connection and form-action violations against reserved `.invalid` data; the browser must block them without any network response. Ordinary browser verification checks DOM controls, keyboard operation, positive/negative/unknown results, wrong interpretation, invalid/stale input, failed phases, reset and bounded retained history, clean page errors and enforced policy without changing evidence.

## Evidence order and publication

1. `evidence\source-contract.json` binds exact S102/D-S102/A-S102/B-S102, atomic/portable contracts and fixed packet to the immutable source and separately qualified raw/canonical hashes.
2. `dns-cache.feature` and `evidence\bdd.json` precede a loadable stub's **10 genuine assertion failures, 1 baseline pass**. Original raw output and snapshots stay unchanged.
3. `evidence\iac-decision.json` records **N/A**, after RED and before implementation, because all observations are resource-free data.
4. Implementation/refactoring is followed by captured focused green and syntax. The first browser run genuinely failed CSP **evidence qualification**: invoking the probe from Playwright's privileged Runtime evaluation allowed its nested `eval`. Its failed raw output, exact assertion and original driver/probe/capture bytes remain in `evidence\browser-qualification.json` and `evidence\raw\`. No lesson policy was weakened. The bounded correction runs the external probe autonomously through the page's script loader; final syntax and real browser evidence qualify actual enforced CSP. This is not another behavioral RED or Kano credit.
5. A focused pre-seal in-memory RED replay initially failed its own qualification: the manually compiled, frozen archived module was not marked loaded, so Node attempted circular-require prototype handling. `evidence\replay-qualification.json` preserves the actual failed driver, raw child error and streams. Marking that compiled module loaded fixes only the read-only verifier; no source swap or earlier-proof rewrite occurs. `evidence\syntax-qualified.json` binds final checked script hashes.
6. `evidence\index.json` protects every owned file except itself; final normal model/surface/integrity checks precede actual browser verification and remain read-only.
7. The authorized publisher records the scoped `[A-S102][S]` commit, Copilot coauthor, annotated `kanban/A-S102/<12sha>` tag, atomic main/tag push and verified remote refs. The parent independently reviews and **alone accepts once**. Extra tests, fixes, refinement and repeated runs earn no additional credit.

`tests\capture.cjs <stage>` is an explicit append-only evidence writer, not an automatically discovered test. The portable/native split already preserves the blocked remainder; no new Kano unit is created.
