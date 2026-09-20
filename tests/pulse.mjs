import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCompanyPulse, pulseSnapshot } from '../.v3-test-build/intelligence/pulse.js';

const completeProfile = {
  description: 'Company', problem: 'Problem', solution: 'Solution',
  businessModel: 'Subscription', targetCustomer: 'Teams', strategy: 'Pilot',
};

test('pulse uses recorded evidence and exposes coverage', () => {
  const pulse = calculateCompanyPulse({
    profile: completeProfile,
    tasks: [{status:'completed'},{status:'todo'}],
    memories: [
      {kind:'customer_signal'}, {kind:'experiment'},
      {kind:'assumption',assumption_status:'supported'},
    ],
  });
  assert.equal(pulse.dimensions[0].score,100);
  assert.equal(pulse.dimensions[1].score,29);
  assert.equal(pulse.dimensions[2].score,null);
  assert.equal(pulse.dimensions[3].score,null);
  assert.equal(pulse.dimensions[4].score,50);
  assert.equal(pulse.score,60);
  assert.equal(pulse.coverage,60);
  assert.match(pulse.note,/not company value/);
});

test('source-grounded Research Agent findings contribute visible pulse evidence', () => {
  const pulse=calculateCompanyPulse({profile:completeProfile,tasks:[],memories:[
    {kind:'learning',source_agent:'research',evidence:{sources:[{url:'https://example.com/report'}]}},
    {kind:'learning',source_agent:'research',evidence:{sources:[{url:'https://example.org/data'}]}},
  ]});
  assert.equal(pulse.dimensions.find(d=>d.key==='validation')?.score,10);
  assert.match(pulse.dimensions.find(d=>d.key==='validation')?.evidence??'',/2 sourced research findings/);
});

test('zero validation is visible while unsupported integrations stay unavailable', () => {
  const pulse = calculateCompanyPulse({profile:completeProfile,tasks:Array(12).fill({status:'todo'}),memories:[]});
  assert.deepEqual(pulse.dimensions.map(d=>d.score),[100,0,null,null,0]);
  assert.equal(pulse.score,33);
  const snapshot=pulseSnapshot(pulse);
  assert.equal(snapshot.overall_score,33);
  assert.equal(snapshot.reasoning.metric,'evidence_coverage_v1');
  assert.equal(snapshot.reasoning.available_dimensions,3);
});

test('no records do not produce fake precision', () => {
  const pulse=calculateCompanyPulse({profile:null,tasks:[],memories:[]});
  assert.equal(pulse.score,null);
  assert.equal(pulse.availableDimensions,0);
  assert.equal(pulse.dimensions.find(d=>d.key==='validation')?.score,null);
  assert.equal(pulse.dimensions.find(d=>d.key==='execution')?.score,null);
});
