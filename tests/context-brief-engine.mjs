import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const testModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: testModule, exports: testModule.exports, Date, Set, process: { env: {} },
    require(name) { if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`); return dependencies[name]; },
  });
  return testModule.exports;
}
function database(resolve) {
  const calls = [];
  return { calls, from(table) {
    const query = { table, operation: 'select', filters: [] };
    const builder = {};
    for (const method of ['select','eq','neq','lt','gte','in','or','order','limit','maybeSingle','single','insert','update','upsert']) {
      builder[method] = (...args) => {
        if (['insert','update','upsert'].includes(method)) { query.operation = method; query.value = args[0]; query.options = args[1]; }
        else query.filters.push([method,...args]);
        return builder;
      };
    }
    builder.then = (success, failure) => Promise.resolve().then(() => { calls.push(query); return resolve(query); }).then(success, failure);
    return builder;
  } };
}
const context = load('lib/company-context.ts');
const types = load('lib/intelligence/event-types.ts');
const company = { id: 'company', name: 'Test Company', stage: 'validation', industry: null };

test('context retains successful sections on database and transport failures', async () => {
  const db = database(query => {
    if (query.table === 'companies') return { data: company, error: null };
    if (query.table === 'company_profiles') return { data: null, error: { message: 'unavailable' } };
    if (query.table === 'memories') throw new Error('transport');
    if (query.table === 'missions') return { data: { id: 'mission', objective: 'Validate demand' }, error: null };
    if (query.table === 'tasks') throw new Error('transport');
    return { data: query.table === 'decisions' ? [{ id: 'decision', title: 'Customer interview', status: 'active' }] : null, error: null };
  });
  const result = await context.loadCompanyContext(db, 'company');
  assert.equal(result.company.name, company.name);
  assert.equal(result.activeMission.id, 'mission');
  assert.equal(result.recentDecisions.length, 1);
  assert.equal(result.tasks.length, 0);
  assert.deepEqual([...result.unavailableSections].sort(), ['memories','profile','tasks']);
  assert.match(context.formatCompanyContext(result), /unknown, not evidence that none exist/);
});

test('daily reads never write; explicit generation saves only once per day', async () => {
  const ctx = { company, primaryGoal: null, activeMission: { id: 'mission' } };
  const brief = load('lib/daily-brief.ts', { './company-context': { loadCompanyContext: async () => ctx }, './intelligence/event-types': types });
  let saved = null;
  const db = database(query => {
    if (query.table === 'daily_briefs' && query.operation === 'upsert') {
      assert.equal(query.options.onConflict, 'company_id,brief_date');
      assert.equal(query.options.ignoreDuplicates, true);
      saved ??= query.value;
    }
    if (query.table === 'daily_briefs') return { data: saved, error: null };
    // This task's title contains "blocked", but its actual signal is critical.
    const critical = query.filters.some(([method,key,value]) => method === 'eq' && key === 'priority' && value === 'critical');
    return { data: critical ? [{ id: 'task', title: 'Explain blocked terminology' }] : [], error: null, count: 0 };
  });
  assert.equal(await brief.getDailyBrief(db, 'company'), null);
  assert.ok(db.calls.every(query => query.operation === 'select'));
  const result = await brief.generateDailyBrief(db, 'company', 'owner');
  assert.match(result.nextBestAction.reason, /marked critical/);
  await brief.generateDailyBrief(db, 'company', 'owner');
  await brief.getDailyBrief(db, 'company');
  assert.equal(db.calls.filter(query => query.operation === 'upsert').length, 1);
});

test('intelligence task writes remain batched as item count grows', async () => {
  const engine = load('lib/intelligence/engine.ts', {
    '../connectors/github': {}, './pulse': { calculateCompanyPulse: () => ({}), pulseSnapshot: () => ({}) },
    '../ai': {}, '../company-context': {}, './event-types': types,
  });
  for (const size of [2, 200]) {
    const db = database(query => ({ data: query.table === 'tasks' ? Array.from({ length: size }, (_,i) => ({ id: String(i), title: 'Task', source: 'user', status: i % 2 ? 'completed' : 'blocked' })) : null, error: null }));
    await engine.refreshIntelligence(db, 'company', 'owner');
    assert.equal(db.calls.length, 6);
    const writes = db.calls.filter(query => query.table === 'company_insights');
    assert.equal(writes.length, 2);
    assert.equal(writes[0].value.length, size / 2);
    assert.ok(writes[1].filters.some(([method,key,value]) => method === 'eq' && key === 'company_id' && value === 'company'));
  }
});

test('GitHub event writes remain batched and unknown events do not resolve insights', async () => {
  const events = Array.from({ length: 200 }, (_, i) => ({
    external_id: String(i), event_type: i % 2 ? types.COMPANY_EVENT_TYPES.issueClosed : types.COMPANY_EVENT_TYPES.issueOpened,
    title: 'Issue', payload: { repository: 'owner/repo', number: i + 1 },
  }));
  events.push({ external_id: 'unknown', event_type: 'unrelated_event', title: 'Other', payload: { repository: 'owner/repo', number: 999 } });
  const engine = load('lib/intelligence/engine.ts', {
    '../connectors/github': { githubConnector: { sync: async () => ({ events, metadata: { repository: 'owner/repo' } }) } },
    './pulse': {}, '../ai': {}, '../company-context': {}, './event-types': types,
  });
  const db = database(query => ({ data: query.table === 'connections'
    ? { id: 'connection', status: 'connected', metadata: { repository: 'owner/repo' } }
    : query.table === 'connector_sync_logs' ? { id: 'log' } : null, error: null }));
  await engine.syncGitHub(db, 'company', 'owner');
  assert.equal(db.calls.length, 9);
  const writes = db.calls.filter(query => query.table === 'company_insights');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].value.length, 100);
  const keys = writes[1].filters.find(([method,key]) => method === 'in' && key === 'dedupe_key')[2];
  assert.equal(keys.length, 100);
  assert.ok(!keys.includes('github-issue:owner/repo:999'));
});
