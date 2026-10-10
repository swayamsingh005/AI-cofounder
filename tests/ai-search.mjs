import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadSearch(fetch) {
  let abort, cleared = false;
  const testModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ai.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: testModule, exports: testModule.exports, process: { env: { TAVILY_API_KEY: 'test-only-placeholder' } },
    fetch, AbortController, URL,
    setTimeout(callback, ms) { assert.equal(ms,10_000); abort = callback; return 1; },
    clearTimeout(id) { assert.equal(id,1); cleared = true; },
  });
  return { search: testModule.exports.tavilySearch, abort: () => abort(), cleared: () => cleared };
}

test('Tavily aborts stalled searches and returns empty results', async () => {
  const mock = loadSearch((_url, options) => new Promise((_resolve,reject) => options.signal.addEventListener('abort',() => reject(new Error('aborted')))));
  const result = mock.search('test'); mock.abort();
  assert.equal(JSON.stringify(await result), JSON.stringify({text:'',sources:[]}));
  assert.ok(mock.cleared());
});
test('Tavily clears timeout on success and HTTP failure', async () => {
  for (const ok of [true,false]) {
    const mock = loadSearch(async () => ({ok,json:async () => ({results:[{title:'Source',url:'https://example.com',content:'Evidence'}]})}));
    const result = await mock.search('test');
    assert.equal(result.sources.length,ok ? 1 : 0); assert.ok(mock.cleared());
  }
});
test('Tavily timeout also covers response body reading', async () => {
  const mock = loadSearch(async (_url, options) => ({ok:true,json:() => new Promise((_resolve,reject) => options.signal.addEventListener('abort',() => reject(new Error('aborted'))))}));
  const promise = mock.search('test'); await new Promise(resolve => setImmediate(resolve)); mock.abort();
  assert.equal((await promise).sources.length,0); assert.ok(mock.cleared());
});
