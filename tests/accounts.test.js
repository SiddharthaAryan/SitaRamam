import test from 'node:test';
import assert from 'node:assert/strict';
import {accounts,day,csv} from '../src/accounts.js';
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
