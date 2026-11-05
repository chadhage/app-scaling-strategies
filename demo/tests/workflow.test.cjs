'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const load = name => YAML.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', name), 'utf8'));

test('CI runs without Azure credentials or OIDC and validates Bicep, tests, and workflows', () => {
  const workflow = load('azure-demo-ci.yml');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok(!workflow.jobs.validate.environment);
  const commands = workflow.jobs.validate.steps.map(step => step.run || '').join('\n');
  assert.match(commands, /npm test/);
  assert.match(commands, /az bicep build/);
  assert.match(commands, /actionlint/);
});

test('live execution is manual, environment-gated, serialized, and records cost consent explicitly', () => {
  const workflow = load('azure-demo.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.confirm_cost_and_teardown.default, false);
  assert.equal(workflow.on.workflow_dispatch.inputs.estimated_cost_usd.default, 0);
  assert.equal(workflow.jobs.demonstrate.environment, 'azure-demo');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.jobs.demonstrate.strategy['max-parallel'], 1);
  assert.equal(workflow.jobs.plan.permissions, undefined);
  assert.equal(workflow.permissions['id-token'], undefined);
  assert.equal(workflow.jobs.demonstrate.permissions['id-token'], 'write');
});

test('normal, failure, cancellation-fallback, and TTL cleanup paths remain wired', () => {
  const workflow = load('azure-demo.yml');
  const steps = workflow.jobs.demonstrate.steps;
  const cleanup = steps.find(step => step.run === 'node demo/pipeline.cjs cleanup');
  assert.match(cleanup.if, /always\(\)/);
  assert.ok(steps.findIndex(step => step === cleanup) < steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact')));
  assert.match(workflow.jobs['cleanup-fallback'].if, /always\(\)/);
  assert.equal(workflow.jobs['cleanup-fallback'].environment, 'azure-demo-cleanup');
  assert.ok(load('azure-demo-cleanup.yml').on.schedule.length);
});

test('artifacts exclude secure parameters/packages and external actions use immutable commit pins', () => {
  for (const name of ['azure-demo-ci.yml', 'azure-demo.yml', 'azure-demo-cleanup.yml']) {
    for (const job of Object.values(load(name).jobs)) {
      for (const step of job.steps) {
        if (step.uses) assert.match(step.uses, /^[\w/-]+@[0-9a-f]{40}$/);
        if (step.uses?.startsWith('actions/upload-artifact')) {
          assert.match(step.with.path, /^demo-output\/evidence\//);
          assert.ok(!step.with.path.includes('private'));
        }
      }
    }
  }
});
