const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const YAML = createRequire(path.join(root, 'server/package.json'))('yaml');
const workflow = name => YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));

test('automatic production checks run only for main PRs and pushes', () => {
  const release = workflow('deploy.yml');
  assert.deepEqual(release.on.push.branches, ['main']);
  assert.deepEqual(release.on.pull_request.branches, ['main']);
});
test('expensive reusable suites have no independent automatic triggers or duplicate backend suite', () => {
  for (const name of ['deals-regression.yml', 'delivery-navigation.yml', 'integration-e2e.yml']) {
    const suite = workflow(name);
    assert.ok(Object.hasOwn(suite.on, 'workflow_call'));
    assert.equal(suite.on.push, undefined);
    assert.equal(suite.on.pull_request, undefined);
  }
  for (const name of ['deals-regression.yml', 'delivery-navigation.yml']) {
    assert.ok(Object.hasOwn(workflow(name).on, 'workflow_dispatch'));
    assert.ok(!fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8').includes('npm run test:release'));
  }
});
test('production waits for all critical suites and exact UAT evidence', () => {
  const release = workflow('deploy.yml');
  const gate = release.jobs['production-release-gate'];
  for (const job of ['backend-tests', 'client-quality', 'subscription-e2e-status', 'uat-verification', 'deals-regression', 'delivery-navigation']) {
    assert.ok(gate.needs.includes(job), job);
  }
  assert.equal(release.jobs['deals-regression'].uses, './.github/workflows/deals-regression.yml');
  assert.equal(release.jobs['delivery-navigation'].uses, './.github/workflows/delivery-navigation.yml');
  const command = gate.steps.map(step => step.run || '').join('\n');
  for (const result of ['BACKEND', 'CLIENT', 'E2E', 'UAT', 'DEALS', 'NAVIGATION']) assert.ok(command.includes(`[[ "$${result}_RESULT" == "success" ]]`));
});
test('UAT stays deployable without full regression, browser or Stripe prerequisites', () => {
  const uat = workflow('uat.yml');
  assert.deepEqual(uat.on.push.branches, ['uat']);
  assert.equal(uat.jobs['subscription-e2e'], undefined);
  assert.equal(uat.jobs.deploy.needs, 'verify');
  assert.equal(uat.jobs.integrations.needs, 'deploy');
  const commands = Object.values(uat.jobs).flatMap(job => (job.steps || []).map(step => step.run || '')).join('\n');
  assert.ok(!commands.includes('npm run test:release'));
  assert.ok(!commands.includes('playwright'));
  assert.ok(commands.includes('npm run test:uat-safety'));
  assert.ok(commands.includes('deploy $RELEASE_SHA'));
  assert.ok(commands.includes('verify $RELEASE_SHA'));
});
test('development checks are PR-only, exclude main and cancel superseded runs', () => {
  const dev = workflow('development.yml');
  assert.deepEqual(dev.on.pull_request['branches-ignore'], ['main']);
  assert.equal(dev.on.push, undefined);
  assert.equal(dev.concurrency['cancel-in-progress'], true);
  const commands = dev.jobs.quick.steps.map(step => step.run || '').join('\n');
  assert.ok(!commands.includes('npm run test:release'));
  assert.ok(!commands.includes('playwright'));
  assert.ok(commands.includes('npm run check:release'));
});
