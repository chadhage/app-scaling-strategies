'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const browserRequire = createRequire(path.join(__dirname, '..', '..', 'testing', 'browser', 'package.json'));
const { chromium } = browserRequire('playwright');
const walkthrough = pathToFileURL(path.join(__dirname, '..', 'slot-promotion.html')).href;
const parent = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('slot promotion walkthrough', { timeout: 60000 }, async t => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await t.test('selected connections and promotion target drive paths and component timing', async () => {
    await page.goto(walkthrough);
    assert.equal(await page.locator('#component-timing tr').count(), 2);
    assert.equal(await page.locator('#service-connections-1').isVisible(), false);
    await page.locator('#architecture-services').selectOption('3');
    await page.locator('#architecture-target').selectOption('2');
    for (const id of ['spa', 'gateway', 'apim', 'bff', 'postgres', 'redis']) {
      await page.locator(`#architecture-${id}`).check();
    }
    await page.locator('#wire-spa-gateway').uncheck();
    await page.locator('#architecture-bff-order').selectOption('before');
    await page.locator('#wire-3-spa').uncheck();
    await page.locator('#wire-3-apim').uncheck();
    await page.locator('#wire-1-postgres').uncheck();
    await page.locator('#wire-2-postgres').check();

    const first = await page.locator('ol[aria-label="API path to Microservice 1"]').innerText();
    const second = await page.locator('ol[aria-label="API path to Microservice 2"]').innerText();
    assert.doesNotMatch(first, /slot routing/);
    assert.match(second, /App Service slot routing \(Blue live\)/);
    assert.ok(second.indexOf('Backend for Frontend') < second.indexOf('API Management'));
    assert.doesNotMatch(await page.locator('ol[aria-label="SPA delivery"]').innerText(), /Application Gateway/);
    const third = await page.locator('ol[aria-label="API path to Microservice 3"]').innerText();
    assert.match(third, /Other client/);
    assert.doesNotMatch(third, /API Management/);
    assert.equal(await page.locator('ol[aria-label="PostgreSQL path from Microservice 1"]').count(), 0);
    assert.equal(await page.locator('ol[aria-label="PostgreSQL path from Microservice 2"]').count(), 1);
    const componentTiming = await page.locator('#component-timing').innerText();
    assert.match(componentTiming, /PostgreSQL — Microservice 2/);
    assert.match(componentTiming, /1–240 s.*1–86,400 s.*1–3,600 s/);
    assert.match(componentTiming, /timeout-ms.*backend response headers/);
    assert.match(componentTiming, /milliseconds; zero disables it/);
    await page.locator('#wire-2-spa').uncheck();
    assert.match(await page.locator('#architecture-checks').innerText(), /no SPA call to the promotion target is modeled/);
    await page.locator('#wire-2-spa').check();

    await page.getByRole('button', { name: 'Switch slot routing rules', exact: true }).click();
    const offset = await page.locator('#offset').innerText();
    assert.match(await page.locator('ol[aria-label="API path to Microservice 2"]').innerText(), /Green live/);
    await page.locator('#architecture-redis').uncheck();
    assert.equal(await page.locator('ol[aria-label^="Redis path"]').count(), 0);
    assert.doesNotMatch(await page.locator('#component-timing').innerText(), /Azure Managed Redis/);
    assert.equal(await page.locator('#offset').innerText(), offset);
    await page.locator('#architecture-redis').check();

    for (const n of [1, 2, 3]) await page.locator(`#wire-${n}-gateway`).uncheck();
    assert.match(await page.locator('#unlinked-components').innerText(), /Application Gateway/);
    assert.match(await page.locator('#component-timing').innerText(), /Application Gateway — no modeled connection/);

    await page.locator('[data-mode="managed"]').click();
    assert.equal(await page.locator('#architecture-target').inputValue(), '2');
    assert.equal(await page.locator('#wire-2-postgres').isChecked(), true);
    assert.equal(await page.locator('#wire-3-apim').isChecked(), false);
    await page.locator('#architecture-services').selectOption('1');
    assert.equal(await page.locator('#architecture-target').inputValue(), '1');
    assert.equal(await page.locator('#service-connections-2').isVisible(), false);
  });

  await t.test('all component combinations show only selected timing rows and paths', async () => {
    await page.goto(walkthrough);
    const failures = await page.evaluate(() => {
      const ids = ['spa', 'gateway', 'apim', 'bff', 'postgres', 'redis'];
      const names = ['Front-end SPA', 'Application Gateway', 'API Management', 'Backend for Frontend', 'Azure Database for PostgreSQL', 'Azure Managed Redis'];
      const problems = [];
      const change = element => element.dispatchEvent(new Event('change', { bubbles: true }));
      for (const mode of ['native', 'managed']) {
        document.querySelector(`[data-mode="${mode}"]`).click();
        const originalOffset = document.querySelector('#offset').textContent;
        for (let count = 1; count <= 3; count++) {
          const countInput = document.querySelector('#architecture-services');
          countInput.value = String(count);
          change(countInput);
          const targetInput = document.querySelector('#architecture-target');
          targetInput.value = String(count);
          change(targetInput);
          for (let mask = 0; mask < 64; mask++) {
            ids.forEach((id, i) => { document.querySelector(`#architecture-${id}`).checked = Boolean(mask & (1 << i)); });
            change(document.querySelector('#architecture-spa'));
            const headings = [...document.querySelectorAll('#component-timing th')].map(element => element.textContent);
            const paths = [...document.querySelectorAll('#architecture-paths ol')].map(element => element.getAttribute('aria-label'));
            for (let i = 0; i < ids.length; i++) {
              const found = headings.some(heading => heading.startsWith(names[i]));
              if (found !== Boolean(mask & (1 << i))) problems.push(`${mode}/${count}/${mask}: timing ${ids[i]}`);
            }
            if (paths.filter(label => label.startsWith('API path to ')).length !== count) problems.push(`${mode}/${count}/${mask}: service paths`);
            if (paths.includes('SPA delivery') !== Boolean(mask & 1)) problems.push(`${mode}/${count}/${mask}: SPA path`);
            if (paths.includes('PostgreSQL path from Microservice 1') !== Boolean(mask & 16)) problems.push(`${mode}/${count}/${mask}: PostgreSQL path`);
            if (paths.includes('Redis path from Microservice 1') !== Boolean(mask & 32)) problems.push(`${mode}/${count}/${mask}: Redis path`);
            const target = document.querySelector(`ol[aria-label="API path to Microservice ${count}"]`).textContent;
            if (!target.includes(mode === 'native' ? 'App Service slot routing' : 'Controlled router')) problems.push(`${mode}/${count}/${mask}: target routing`);
            if (document.querySelector('#offset').textContent !== originalOffset) problems.push(`${mode}/${count}/${mask}: offset changed`);
          }
        }
      }
      return problems;
    });
    assert.deepEqual(failures, []);
  });

  await t.test('each selected component has an appropriate promotion strategy and path', async () => {
    await page.goto(walkthrough);
    await page.locator('#architecture-services').selectOption('3');
    for (const id of ['spa', 'gateway', 'apim', 'bff', 'postgres', 'redis']) {
      await page.locator(`#architecture-${id}`).check();
    }
    const target = page.locator('#architecture-target');
    const nativeMode = page.locator('[data-mode="native"]');
    const managedMode = page.locator('[data-mode="managed"]');
    for (const n of [1, 2, 3]) {
      await target.selectOption(String(n));
      assert.equal(await nativeMode.isEnabled(), true);
      assert.match(await page.locator(`ol[aria-label="API path to Microservice ${n}"]`).innerText(), /App Service slot routing/);
    }

    await target.selectOption('spa');
    assert.equal(await nativeMode.isEnabled(), true);
    assert.match(await page.locator('#old-release').innerText(), /Front-end SPA.*Blue release/);
    assert.match(await page.locator('#new-release').innerText(), /Front-end SPA.*Green release/);
    assert.match(await page.locator('ol[aria-label="SPA delivery"]').innerText(), /App Service slot routing/);
    await page.getByRole('button', { name: 'Switch slot routing rules', exact: true }).click();
    assert.match(await page.locator('#old-release').innerText(), /Front-end SPA.*Green release/);
    assert.match(await page.locator('#new-release').innerText(), /Front-end SPA.*Blue release/);
    assert.match(await page.locator('ol[aria-label="SPA delivery"]').innerText(), /Green live/);
    await managedMode.click();
    assert.equal(await page.locator('#events tr').count(), 17);
    assert.match(await page.locator('#method-description').innerText(), /not implemented by the demo/);
    assert.match(await page.locator('ol[aria-label="SPA delivery"]').innerText(), /Upstream controlled router/);

    await target.selectOption('bff');
    assert.equal(await nativeMode.isDisabled(), true);
    assert.match(await page.locator('#promotion-capability').innerText(), /host is unspecified/);
    await page.locator('#architecture-bff-host').selectOption('appservice');
    assert.equal(await nativeMode.isEnabled(), true);
    await nativeMode.click();
    assert.match(await page.locator('#old-release').innerText(), /Backend for Frontend.*Blue release/);
    assert.match(await page.locator('#new-release').innerText(), /Backend for Frontend.*Green release/);
    assert.equal(await page.locator('#events tr').count(), 18);
    assert.match(await page.locator('ol[aria-label="API path to Microservice 1"]').innerText(), /App Service slot routing.*Backend for Frontend/s);
    await page.locator('#architecture-bff-host').selectOption('other');
    assert.equal(await nativeMode.isDisabled(), true);
    assert.equal(await managedMode.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#events tr').count(), 17);

    const paths = {
      gateway: ['SPA delivery', /Upstream controlled router.*Application Gateway/s],
      apim: ['API path to Microservice 1', /Upstream controlled router.*API Management/s],
      postgres: ['PostgreSQL path from Microservice 1', /Database endpoint \/ writer control.*PostgreSQL/s],
      redis: ['Redis path from Microservice 1', /Cache client endpoint.*Redis/s]
    };
    for (const [id, [label, expected]] of Object.entries(paths)) {
      await target.selectOption(id);
      assert.equal(await nativeMode.isDisabled(), true, `${id} must not use App Service slots`);
      assert.equal(await managedMode.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#events tr').count(), 17);
      assert.match(await page.locator('#method-description').innerText(), /not implemented by the demo/);
      assert.match(await page.locator(`ol[aria-label="${label}"]`).innerText(), expected);
      assert.match(await page.locator('#architecture-summary').innerText(), /promotion target/);
      assert.match(await page.locator('#component-timing').innerText(), /promotion target/);
    }

    await target.selectOption('postgres');
    await page.getByRole('button', { name: 'Prepare safe handoff', exact: true }).click();
    assert.match(await page.locator('#event-detail').innerText(), /fence writers.*in-flight transactions.*replication health and lag/s);
    assert.match(await page.locator('#old-state').innerText(), /Writes fenced/);
    assert.match(await page.locator('#new-release').innerText(), /Green read replica/);
    await page.getByRole('button', { name: 'Change the destination', exact: true }).click();
    assert.match(await page.locator('#new-state').innerText(), /pending verification/);
    assert.match(await page.locator('#event-detail').innerText(), /planned promotion to primary.*synchronizes pending logs.*swaps server roles/s);
    assert.match(await page.locator('#old-release').innerText(), /last verified/);
    assert.match(await page.locator('#new-release').innerText(), /last verified/);
    const changeOffset = Number((await page.locator('#offset').innerText()).match(/T\+([\d.]+) s/)[1]);
    await page.getByRole('button', { name: 'Verify the effective destination', exact: true }).click();
    const verifyOffset = Number((await page.locator('#offset').innerText()).match(/T\+([\d.]+) s/)[1]);
    assert.equal(verifyOffset - changeOffset, 120);
    assert.match(await page.locator('#new-release').innerText(), /Green primary/);
    assert.match(await page.locator('#old-release').innerText(), /Blue read replica/);
    assert.match(await page.locator('#old-state').innerText(), /not a writer/);
    await page.getByRole('button', { name: 'Assess rollback safety', exact: true }).click();
    assert.match(await page.locator('#event-detail').innerText(), /Do not simply point writers back/);
    assert.match(await page.locator('#gate').innerText(), /Replication is asynchronous; forced promotion can lose data/);

    await target.selectOption('redis');
    await page.getByRole('button', { name: 'Prepare safe handoff', exact: true }).click();
    assert.match(await page.locator('#event-detail').innerText(), /stop if state cannot safely be regenerated or migrated/);
    assert.match(await page.locator('#gate').innerText(), /authoritative/);
    assert.match(await page.locator('#old-release').innerText(), /Blue cache/);
    await page.getByRole('button', { name: 'Change the destination', exact: true }).click();
    assert.match(await page.locator('#new-state').innerText(), /Client endpoint change pending verification/);
    assert.doesNotMatch(await page.locator('#diagram-state').innerText(), /Route written/);

    await target.selectOption('postgres');
    await page.locator('#wire-1-postgres').uncheck();
    assert.match(await page.locator('ol[aria-label="Unlinked promotion target"]').innerText(), /PostgreSQL.*no modeled connection/s);
    assert.match(await page.locator('#gate').innerText(), /target has no modeled connection/);
    await page.locator('#wire-1-postgres').check();
    assert.equal(await page.locator('ol[aria-label="Unlinked promotion target"]').count(), 0);
    assert.doesNotMatch(await page.locator('#gate').innerText(), /target has no modeled connection/);

    await target.selectOption('gateway');
    await page.locator('#wire-spa-gateway').uncheck();
    for (const n of [1, 2, 3]) await page.locator(`#wire-${n}-gateway`).uncheck();
    assert.match(await page.locator('ol[aria-label="Unlinked promotion target"]').innerText(), /Application Gateway.*no modeled connection/s);
    await page.locator('#wire-spa-gateway').check();
    assert.equal(await page.locator('ol[aria-label="Unlinked promotion target"]').count(), 0);

    for (const id of ['spa', 'gateway', 'apim', 'bff', 'postgres', 'redis']) {
      await target.selectOption(id);
      await page.locator(`#architecture-${id}`).uncheck();
      assert.equal(await target.inputValue(), '1', `${id} should fall back when removed`);
      assert.equal(await nativeMode.isEnabled(), true);
      await page.locator(`#architecture-${id}`).check();
    }
  });

  await t.test('timing provenance, demo limits and route verification remain distinct', async () => {
    await page.goto(walkthrough);
    assert.equal(await page.locator('#events tr').count(), 18);
    await page.getByRole('button', { name: 'Warm each source instance', exact: true }).click();
    assert.match(await page.locator('#duration').innerText(), /Illustrative estimate/);
    assert.match(await page.locator('#event-timing-control').innerText(), /Not directly configurable/);
    await page.getByRole('button', { name: 'Keep the source slot for rollback', exact: true }).click();
    assert.match(await page.locator('#event-timing-control').innerText(), /Retention policy configurable/);

    await page.locator('[data-mode="managed"]').click();
    assert.equal(await page.locator('#events tr').count(), 22);
    const rows = page.locator('#events tr');
    for (const row of await rows.all()) {
      assert.equal(await row.locator('td').count(), 4);
      assert.notEqual((await row.locator('td').last().innerText()).trim(), '');
    }
    const offset = async title => {
      const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) });
      return Number((await row.locator('td').first().innerText()).match(/T\+([\d.]+) s/)[1]);
    };
    assert.ok(await offset('Confirm readiness gate') - await offset('Probe green dependencies') >= 2);
    assert.ok(await offset('Write green route') < await offset('Finish previously admitted blue work'));
    assert.ok(await offset('Verify no active demo requests') - await offset('Observe and gate the release') >= 2);
    assert.ok(await offset('Authorize owned-resource cleanup') - await offset('Preserve the rollback option') >= 2);

    await page.getByRole('button', { name: 'Confirm readiness gate', exact: true }).click();
    assert.match(await page.locator('#event-timing-control').innerText(), /three consecutive checks.*1 s polling intervals.*10 min readiness timeout/);
    await page.getByRole('button', { name: 'Write green route', exact: true }).click();
    assert.match(await page.locator('#diagram-state').innerText(), /read-back pending/);
    assert.doesNotMatch(await page.locator('ol[aria-label="API path to Microservice 1"]').innerText(), /Green live/);
    await page.getByRole('button', { name: 'Read back effective route', exact: true }).click();
    assert.match(await page.locator('ol[aria-label="API path to Microservice 1"]').innerText(), /Green live/);
    await page.getByRole('button', { name: 'Observe and gate the release', exact: true }).click();
    assert.match(await page.locator('#duration').innerText(), /Workflow input: 2–60 s; default 5 s/);
    assert.match(await page.locator('#event-timing-control').innerText(), /offsets assume 2 s/);
    await page.getByRole('button', { name: 'Preserve the rollback option', exact: true }).click();
    assert.match(await page.locator('#duration').innerText(), /Demo code setting: 2 s/);
    assert.match(await page.locator('#event-timing-control').innerText(), /not a workflow input/);
  });

  await t.test('parent styling follows the system theme and the controls fit a narrow screen', async () => {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(parent);
      const parentStyle = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
        note: getComputedStyle(document.querySelector('.note.status')).backgroundColor,
        button: getComputedStyle(document.querySelector('.btn')).backgroundColor
      }));
      await page.goto(walkthrough);
      const childStyle = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
        note: getComputedStyle(document.querySelector('.note.status')).backgroundColor,
        button: getComputedStyle(document.querySelector('.mode[aria-pressed="true"]')).backgroundColor
      }));
      assert.deepEqual(childStyle, parentStyle);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('#architecture-services').selectOption('3');
    for (const id of ['spa', 'gateway', 'apim', 'bff', 'postgres', 'redis']) {
      await page.locator(`#architecture-${id}`).check();
    }
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    assert.ok(size.scrollWidth <= size.width + 1, `page overflows: ${size.scrollWidth} > ${size.width}`);
    assert.deepEqual(errors, []);
  });
});
