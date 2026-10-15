import test from 'node:test';
import assert from 'node:assert/strict';
import {retryCounterWrite} from '../src/counter-retry.js';
test('competing counter commits retry without replacing the order identity',async()=>{let attempts=0,waits=0;const result=await retryCounterWrite(async()=>{if(attempts++<2)throw Object.assign(Error('Race'),{code:'permission-denied'});return {id:'ABC234',number:3};},async()=>true,async()=>{waits++;});assert.equal(result.id,'ABC234');assert.equal(attempts,3);assert.equal(waits,2);});
test('genuine validation failures are not retried',async()=>{let attempts=0;await assert.rejects(retryCounterWrite(async()=>{attempts++;throw Object.assign(Error('Invalid price'),{code:'permission-denied'});},async()=>false,async()=>{}),/Invalid price/);assert.equal(attempts,1);});
test('counter retry has a strict attempt bound',async()=>{let attempts=0;await assert.rejects(retryCounterWrite(async()=>{attempts++;throw Object.assign(Error('Race'),{code:'aborted'});},async()=>true,async()=>{}),/Race/);assert.equal(attempts,32);});
