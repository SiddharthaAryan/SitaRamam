import test from 'node:test';
import assert from 'node:assert/strict';
import {accounts,day,csv,serviceDay,periodBounds} from '../src/accounts.js';
const stamp=s=>({toDate:()=>new Date(s)});
test('IST dates roll over at 18:30 UTC',()=>{
  assert.equal(day(stamp('2026-09-30T18:29:59Z')),'2026-09-30');
  assert.equal(day(stamp('2026-09-30T18:30:00Z')),'2026-10-01');
});
test('late collections are counted in payment month independently of order month',()=>{
  const orders=[{id:'old',createdAt:stamp('2026-09-30T12:00Z'),total:80},{id:'new',createdAt:stamp('2026-10-01T12:00Z'),total:100},{id:'debt',createdAt:stamp('2026-10-02T12:00Z'),total:50}];
  const payments=new Map([['old',{orderId:'old',paidAt:stamp('2026-10-02T12:00Z'),amount:80,method:'cash'}],['new',{orderId:'new',paidAt:stamp('2026-10-01T12:00Z'),amount:100,method:'upi'}]]);
  const report=accounts(orders,payments,'2026-10-02','month');
  assert.equal(report.sales,150);assert.equal(report.received,180);assert.equal(report.paidOrderValue,100);assert.equal(report.outstandingValue,50);
  assert.equal(report.cash,80);assert.equal(report.upi,100);assert.equal(report.periodOrders.length,2);assert.equal(report.receipts.length,2);
});
test('CSV preserves commas/quotes and neutralizes spreadsheet formulas',()=>{
  assert.equal(csv([['=HYPERLINK("bad")','A, B',100]]),'\ufeff"\'=HYPERLINK(""bad"")","A, B","100"');
});


test('service-night numbering survives midnight and resets only at 06:00 IST',()=>{assert.equal(serviceDay(new Date('2026-10-15T18:00:00Z')),'2026-10-15');assert.equal(serviceDay(new Date('2026-10-15T23:00:00Z')),'2026-10-15');assert.equal(serviceDay(new Date('2026-10-16T00:29:59Z')),'2026-10-15');assert.equal(serviceDay(new Date('2026-10-16T00:30:00Z')),'2026-10-16');});
test('daily and monthly query bounds are exact, including year rollover',()=>{const d=periodBounds('2026-10-15','day',true);assert.equal(d.start.toISOString(),'2026-10-15T00:30:00.000Z');assert.equal(d.end.toISOString(),'2026-10-16T00:30:00.000Z');const m=periodBounds('2026-12-01','month',true);assert.equal(m.end.toISOString(),'2027-01-01T00:30:00.000Z');});
test('after-midnight orders and payments stay in the previous service night',()=>{const t=stamp('2026-10-15T20:00:00Z');const report=accounts([{id:'a',createdAt:t,total:50}],new Map([['a',{paidAt:t,amount:50,method:'upi'}]]),'2026-10-15');assert.equal(report.sales,50);assert.equal(report.received,50);});
