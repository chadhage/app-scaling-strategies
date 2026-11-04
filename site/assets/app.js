/* App Scaling Strategies explainer: small helpers, no dependencies.
   Classic script (no modules, no fetch) so the page also works when opened from disk.
   The pure functions are exported for Node so they can be checked without a browser. */
(function () {
  'use strict';

  var REPO = 'https://github.com/chadhage/app-scaling-strategies/blob/main/';
  var DOCS = {
    readme: REPO + 'README.md',
    backlog: REPO + '.docs/wiki/backlog.md',
    kanban: REPO + '.docs/wiki/kanban.md'
  };

  /* Scenario groups A-O, ten scenarios each. `readme` and `plan` are the GitHub heading
     slugs in README.md and in backlog.md / kanban.md respectively; they differ in wording. */
  var GROUPS = [
    { letter: 'A', name: 'Deployment and traffic migration', readme: 'a-deployment-and-traffic-migration-strategies', plan: 'a-deployment-and-traffic-migration' },
    { letter: 'B', name: 'Capacity scaling', readme: 'b-actual-capacity-scaling-strategies', plan: 'b-capacity-scaling' },
    { letter: 'C', name: 'Readiness and warm-up', readme: 'c-readiness-and-warm-up', plan: 'c-readiness-and-warm-up' },
    { letter: 'D', name: 'Sessions, authentication, and state', readme: 'd-sessions-authentication-and-user-state', plan: 'd-sessions-authentication-and-state' },
    { letter: 'E', name: 'In-flight requests and long-lived work', readme: 'e-in-flight-requests-and-long-lived-work', plan: 'e-in-flight-requests-and-long-lived-work' },
    { letter: 'F', name: 'N-tier and version compatibility', readme: 'f-n-tier-and-version-compatibility', plan: 'f-n-tier-and-version-compatibility' },
    { letter: 'G', name: 'Database and persistent data', readme: 'g-database-and-persistent-data-scaling', plan: 'g-database-and-persistent-data' },
    { letter: 'H', name: 'Caches, queues, and background workers', readme: 'h-caches-queues-and-background-workers', plan: 'h-caches-queues-and-workers' },
    { letter: 'I', name: 'State machine and orchestration correctness', readme: 'i-state-machine-and-orchestration-correctness', plan: 'i-state-machine-and-orchestration' },
    { letter: 'J', name: 'Failure containment and rollback', readme: 'j-failure-containment-and-rollback', plan: 'j-failure-containment-and-rollback' },
    { letter: 'K', name: 'Networking, configuration, and edge routing', readme: 'k-networking-configuration-and-edge-routing', plan: 'k-networking-configuration-and-routing' },
    { letter: 'L', name: 'Availability zones, regions, and failure domains', readme: 'l-availability-zones-regions-and-failure-domains', plan: 'l-zones-regions-and-failure-domains' },
    { letter: 'M', name: 'Hosting-model-specific scenarios', readme: 'm-hosting-model-specific-scenarios', plan: 'm-hosting-model-specific-demonstrations' },
    { letter: 'N', name: 'Complete end-user journeys', readme: 'n-complete-end-user-journeys', plan: 'n-complete-end-user-journeys' },
    { letter: 'O', name: 'Demonstration and acceptance testing', readme: 'o-demonstration-and-acceptance-testing', plan: 'o-demonstration-and-acceptance-testing' }
  ];

  var H_TITLES = {
    1: 'Product contract, typed schemas, supported configuration matrix and operating envelopes',
    2: 'Searchable web catalog and manifest registry',
    3: 'Authenticated roles, per-conductor sandbox leases, ownership checks, cost and admission controls',
    4: 'Durable run API, queued workers, deployment epochs, idempotent commands, cancellation reconciliation',
    5: 'Extensible n-tier fixtures: frontend, getProfile v1/v2, shared state, database, cache, queue, worker',
    6: 'Browser and backend protocol drivers and the client-side journey/correctness oracle',
    7: 'Telemetry ingestion, readiness observations, version timelines, evidence-backed result evaluation',
    8: 'Run console and schema-driven panels for load, versions, cohorts, routing, scale, faults, drain, rollback',
    9: 'Stable endpoint routing, authorized preview audiences, deterministic cohorts, ring promotion',
    10: 'Reset, lease expiry, checkpoint-aware teardown, reconciliation, operator recovery',
    11: 'Deploy the approved web harness; publish catalog, documentation, evidence export, operational controls',
    12: 'Automated contract, authorization, isolation, accessibility, recovery and UI regression checks'
  };

  var P_INFO = {
    1: { title: 'App Service adapters: Windows/Linux code, custom containers, slots, native swaps, plans, scale', priority: 'P0' },
    2: { title: 'Container Apps adapters: revisions, single/multiple revision modes, probes, scale, routing', priority: 'P0' },
    3: { title: 'AKS adapters: version-specific Deployments/Services, ingress/gateway routing, rollout, scaling, termination', priority: 'P1' },
    4: { title: 'Functions adapters: slot-capable plans, Flex rolling updates, durable/checkpointed workloads', priority: 'P1' },
    5: { title: 'Leased native data, cache, object-storage and messaging services with synthetic fixtures', priority: 'P0' },
    6: { title: 'Private network, DNS/TLS, gateway/WAF and multi-region sandbox extensions', priority: 'P1' },
    7: { title: 'Spring Boot fixture variants and runtime instrumentation for supported Java hosts', priority: 'P1' }
  };

  var W_TITLES = {
    1: 'Progressive deployment rings walkthrough',
    2: 'Shared-orchestrator getProfile walkthrough: v1 GA, v2 private preview, v2 GA (Container Apps or AKS)'
  };

  var X_TITLES = {
    1: 'Scrub a saved run timeline backward and forward without re-execution',
    2: 'Compare two accepted runs side by side',
    3: 'Suggest a next learning exercise from a chosen goal',
    4: 'Animate a recorded ring promotion with clickable blocked gates',
    5: 'Synchronise approved GA and preview presentation actions',
    6: 'Export a self-contained sanitised HTML run story'
  };

  /* Capability cards C061-C108 belong to a platform enabler or guided workflow;
     C001-C060 are harness-story slices (the card row names its parent). */
  var C_FAMILIES = [
    [61, 67, 'P001 App Service adapter slices'],
    [108, 108, 'P001 App Service adapter slices'],
    [68, 72, 'P002 Container Apps adapter slices'],
    [73, 78, 'P003 AKS adapter slices'],
    [79, 82, 'P004 Functions adapter slices'],
    [83, 89, 'P005 data, cache, storage and messaging slices'],
    [90, 96, 'P006 network, DNS/TLS, WAF and region slices'],
    [97, 100, 'P007 Spring Boot slices'],
    [101, 103, 'W001 progressive-rings walkthrough slices'],
    [104, 107, 'W002 shared-orchestrator walkthrough slices']
  ];

  var KINDS = {
    'S': { max: 150 },
    'D-S': { max: 150 },
    'A-S': { max: 150 },
    'B-S': { max: 150 },
    'H': { max: 12 },
    'P': { max: 7 },
    'W': { max: 2 },
    'C': { max: 108 },
    'X': { max: 6 }
  };

  function pad3(n) {
    return ('000' + n).slice(-3);
  }

  function groupFor(n) {
    return GROUPS[Math.floor((n - 1) / 10)];
  }

  function groupRange(group) {
    var start = GROUPS.indexOf(group) * 10 + 1;
    return 'S' + pad3(start) + '\u2013S' + pad3(start + 9);
  }

  function decodeId(input) {
    var match = /^(D-S|A-S|B-S|S|H|P|W|C|X)[\s-]*(\d{1,3})$/.exec(String(input).trim().toUpperCase());
    if (!match) {
      return { ok: false, message: 'Not a recognised ID. Examples: S042, D-S042, A-S042, B-S042, H003, P001, W002, C041, X003.' };
    }
    var prefix = match[1];
    var num = parseInt(match[2], 10);
    var max = KINDS[prefix].max;
    if (num < 1 || num > max) {
      return { ok: false, message: prefix + ' IDs run from ' + prefix + '001 to ' + prefix + pad3(max) + '.' };
    }

    var id = prefix + pad3(num);
    var out = { ok: true, id: id, heading: '', lines: [], links: [] };
    var group;
    var suffix = pad3(num);

    if (prefix === 'S' || prefix === 'D-S' || prefix === 'A-S' || prefix === 'B-S') {
      group = groupFor(num);
      var where = 'Group ' + group.letter + ', ' + group.name + ' (' + groupRange(group) + ').';
      if (prefix === 'S') {
        out.heading = 'scenario in the README catalog';
        out.lines.push(where);
        out.lines.push('The backlog turns it into D-S' + suffix + '; the kanban splits that into A-S' + suffix + ' (portable lesson) and B-S' + suffix + ' (native proof).');
        out.links.push({ label: 'README, group ' + group.letter, href: DOCS.readme + '#' + group.readme });
      } else if (prefix === 'D-S') {
        out.heading = 'backlog scenario-demo story';
        out.lines.push(where);
        out.lines.push('Maps one-to-one to scenario S' + suffix + '. Needs BASE (H011 + P005 + a host adapter) plus any prerequisites in its row. Its kanban children are A-S' + suffix + ' and B-S' + suffix + '.');
        out.links.push({ label: 'Backlog, group ' + group.letter, href: DOCS.backlog + '#' + group.plan });
      } else if (prefix === 'A-S') {
        out.heading = 'kanban portable-lesson card';
        out.lines.push(where);
        out.lines.push('Delivers a browser-openable synthetic rehearsal of scenario S' + suffix + '; no Azure account needed. Its sibling B-S' + suffix + ' carries the native proof.');
        out.lines.push('An accepted lesson lives in learning/S' + suffix + '/. Whether this one has been accepted is recorded in the kanban and its live ledger, not on this page.');
        out.links.push({ label: 'Kanban, group ' + group.letter, href: DOCS.kanban + '#' + group.plan });
      } else {
        out.heading = 'kanban native-proof card';
        out.lines.push(where);
        out.lines.push('Wires one bounded preset to existing primitives, runs the real experiment on a qualified host and attaches observed evidence. Gated by CORE and the other capability gates in its row.');
        out.lines.push('The README lists live Azure execution as unapproved, so native proof depends on that approval.');
        out.links.push({ label: 'Kanban, group ' + group.letter, href: DOCS.kanban + '#' + group.plan });
      }
    } else if (prefix === 'H') {
      out.heading = 'backlog shared harness story (priority P0)';
      out.lines.push(H_TITLES[num] + '.');
      out.links.push({ label: 'Backlog, shared harness stories', href: DOCS.backlog + '#shared-harness-stories' });
    } else if (prefix === 'P') {
      out.heading = 'backlog platform and fixture enabler (priority ' + P_INFO[num].priority + ')';
      out.lines.push(P_INFO[num].title + '.');
      out.links.push({ label: 'Backlog, platform and fixture enablers', href: DOCS.backlog + '#platform-and-fixture-enablers' });
    } else if (prefix === 'W') {
      out.heading = 'backlog integrated guided demonstration (priority P0)';
      out.lines.push(W_TITLES[num] + '.');
      out.lines.push('Composes scenario steps and must run them on one supported target configuration.');
      out.links.push({ label: 'Backlog, integrated guided demonstrations', href: DOCS.backlog + '#integrated-guided-demonstrations' });
    } else if (prefix === 'C') {
      var family = 'Harness-story slice (H001\u2013H012); the card row names its parent.';
      for (var i = 0; i < C_FAMILIES.length; i++) {
        if (num >= C_FAMILIES[i][0] && num <= C_FAMILIES[i][1]) {
          family = C_FAMILIES[i][2] + '.';
          break;
        }
      }
      out.heading = 'kanban capability or workflow card';
      out.lines.push(family);
      out.lines.push('One owner, one reviewable change set, one observable result; sized at 2\u20134 focused hours.');
      out.links.push({ label: 'Kanban, capability and workflow cards', href: DOCS.kanban + '#capability-and-workflow-cards' });
    } else {
      out.heading = 'kanban optional delighter';
      out.lines.push(X_TITLES[num] + '.');
      out.lines.push('Class L: optional, and not required for source-parent completion. Admitted only after its six designated companion cards are Done.');
      out.links.push({ label: 'Kanban, optional delighters', href: DOCS.kanban + '#optional-delighters-and-tandem-packets' });
    }
    return out;
  }

  /* Statistics: with zero failures in n independent, comparable trials, the one-sided upper
     confidence bound on the interruption probability is p = 1 - alpha^(1/n). */

  function parseNumber(text) {
    var t = String(text).trim().replace(/,/g, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return NaN;
    return Number(t);
  }

  /* Percent -> probability of the complement, rounded to avoid binary-float noise
     (100 - 99.999 is not exactly 0.001 in floating point). */
  function complement(pct) {
    return Math.round((100 - pct) * 1e9) / 1e11;
  }

  function checkPercent(value, label) {
    if (!(value > 0 && value < 100)) {
      return label + ' must be above 0 and below 100 percent.';
    }
    if (complement(value) <= 0) {
      return label + ' is too close to 100 percent for this calculator.';
    }
    return null;
  }

  function trialsForZeroFailures(targetPct, confidencePct) {
    var target = parseNumber(targetPct);
    var conf = parseNumber(confidencePct);
    if (isNaN(target)) return { ok: false, message: 'Target success must be a number.' };
    if (isNaN(conf)) return { ok: false, message: 'Confidence must be a number.' };
    var problem = checkPercent(target, 'Target success') || checkPercent(conf, 'Confidence');
    if (problem) return { ok: false, message: problem };
    var p = complement(target);
    var alpha = complement(conf);
    var n = Math.ceil(Math.log(alpha) / Math.log1p(-p));
    return { ok: true, n: n, p: p, alpha: alpha };
  }

  function upperBoundAfterZeroFailures(trials, confidencePct) {
    var n = parseNumber(trials);
    var conf = parseNumber(confidencePct);
    if (isNaN(n) || n < 1 || Math.floor(n) !== n) {
      return { ok: false, message: 'Trials must be a whole number of at least 1.' };
    }
    if (isNaN(conf)) return { ok: false, message: 'Confidence must be a number.' };
    var problem = checkPercent(conf, 'Confidence');
    if (problem) return { ok: false, message: problem };
    var alpha = complement(conf);
    var p = -Math.expm1(Math.log(alpha) / n);
    return { ok: true, p: p, success: 1 - p, n: n, alpha: alpha };
  }

  /* ---------- DOM wiring (skipped when there is no document, e.g. under Node) ---------- */

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function initScrollSpy() {
    if (typeof IntersectionObserver === 'undefined') return;
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
    if (!links.length) return;

    var visible = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      for (var i = 0; i < links.length; i++) {
        var id = links[i].getAttribute('href').slice(1);
        if (visible[id]) {
          links.forEach(function (a) {
            if (a === links[i]) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
          });
          return;
        }
      }
    }, { rootMargin: '0px 0px -65% 0px', threshold: 0 });

    links.forEach(function (a) {
      var target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) observer.observe(target);
    });
  }

  function initIdDecoder() {
    var form = document.getElementById('id-form');
    if (!form) return;
    var input = document.getElementById('id-input');
    var out = document.getElementById('id-output');

    function render() {
      clear(out);
      var result = decodeId(input.value);
      if (!result.ok) {
        out.appendChild(el('p', result.message, 'error'));
        return;
      }
      var lead = el('p');
      lead.appendChild(el('strong', result.id));
      lead.appendChild(document.createTextNode(': ' + result.heading));
      out.appendChild(lead);
      var list = el('ul');
      result.lines.forEach(function (line) { list.appendChild(el('li', line)); });
      out.appendChild(list);
      var open = el('p', 'Open: ');
      result.links.forEach(function (link, index) {
        if (index) open.appendChild(document.createTextNode(' \u00b7 '));
        var a = el('a', link.label);
        a.href = link.href;
        open.appendChild(a);
      });
      out.appendChild(open);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      render();
    });
    render();
  }

  function formatCount(n) {
    return n.toLocaleString('en-US');
  }

  function initBoundCalculator() {
    var form = document.getElementById('bound-form');
    if (!form) return;
    var target = document.getElementById('bound-target');
    var conf = document.getElementById('bound-conf');
    var trials = document.getElementById('bound-n');
    var out = document.getElementById('bound-out');

    function render() {
      clear(out);
      var needed = trialsForZeroFailures(target.value, conf.value);
      var bound = upperBoundAfterZeroFailures(trials.value, conf.value);

      if (needed.ok) {
        out.appendChild(el('p', 'Zero-failure trials needed: ' + formatCount(needed.n) +
          ' (allowed interruption probability ' + needed.p.toExponential(2) + ', confidence ' + parseNumber(conf.value) + '%).'));
      } else {
        out.appendChild(el('p', needed.message, 'error'));
      }
      if (bound.ok) {
        out.appendChild(el('p', 'After ' + formatCount(bound.n) + ' zero-failure trials: interruption probability <= ' +
          bound.p.toExponential(5) + ', i.e. success >= ' + (100 * bound.success).toFixed(5) + '%.'));
      } else {
        out.appendChild(el('p', bound.message, 'error'));
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      render();
    });
    [target, conf, trials].forEach(function (input) { input.addEventListener('input', render); });
    render();
  }

  function init() {
    initScrollSpy();
    initIdDecoder();
    initBoundCalculator();
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      GROUPS: GROUPS,
      decodeId: decodeId,
      trialsForZeroFailures: trialsForZeroFailures,
      upperBoundAfterZeroFailures: upperBoundAfterZeroFailures
    };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
