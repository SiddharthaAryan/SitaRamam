import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {JSDOM} from 'jsdom';
import QRCode from 'qrcode';
import {retryCounterWrite} from '../src/counter-retry.js';
import {accounts,day,csv,serviceDay,periodBounds} from '../src/accounts.js';
import {icon,category,foodArt} from '../src/visuals.js';
import {PRINTED_MENU,menuOrder} from '../src/menu.js';

function app(url='https://example.test/', overrides={}) {
  const dom=new JSDOM('<div id="app"></div>',{url});
  const writes=[];dom.window.scrollTo=()=>{};
  const context=vm.createContext({setInterval:()=>0,document:dom.window.document,window:dom.window,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,location:dom.window.location,crypto:webcrypto,retryCounterWrite,QRCode,accounts,day,csv,serviceDay,periodBounds,serviceDay,periodBounds,icon,category,foodArt,PRINTED_MENU,menuOrder,URL,URLSearchParams,Blob,Intl,console,setTimeout,auth:{},db:{},doc:(_db,collection,id)=>({collection,id}),serverTimestamp:()=>({sentinel:true}),setDoc:async(ref,data)=>writes.push({ref,data}),runTransaction:async(_db,fn)=>fn({get:async()=>({exists:()=>false}),set:(ref,data)=>writes.push({ref,data})}),...overrides});
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/import\.meta\.env\.BASE_URL/g,"'/'").replace(/import\.meta\.env\.[A-Z_]+/g,"''").replace(/\nstart\(\);\s*$/,'');
  vm.runInContext(source+'\nglobalThis.api={state,customer,review,place,confirmation,renderStaff,orderCard,subscribeOrderWindow,loadOlderOrders,monthlyReport,loadStudentMenu,refreshWaitTimers};',context);
  context.api.state.menuReady=true;
  return {api:context.api,document:dom.window.document,writes};
}
test('placing an order creates food record only, and displays unpaid bill with exact UPI amount',async()=>{
  const {api,document,writes}=app();
  api.state.user={uid:'student'};api.state.menu=[{id:'tea',name:'Tea',price:20,available:true}];api.state.cart={tea:2};
  api.customer();document.querySelector('#customer-name').value='Student Test';api.review();
  await api.place('Student Test',[{id:'tea',name:'Tea',price:20,qty:2}],40);
  assert.equal(writes.length,2);assert.equal(writes[0].ref.collection,'dailyCounters');assert.equal(writes[1].ref.collection,'orders');assert.equal(writes[1].data.total,40);assert.equal(writes[1].data.status,'new');assert.equal(writes[1].data.orderNumber,1);assert.equal('paymentStatus' in writes[1].data,false);
  assert.equal(document.querySelector('.badge').textContent,'UNPAID');
  const link=document.querySelector('a[href^="upi:"]');const uri=new URL(link.href);
  assert.equal(uri.searchParams.get('pa'),'paytm.s119vgx@pty');assert.equal(uri.searchParams.get('am'),'40.00');
  assert.equal(document.querySelectorAll('[data-pay]').length,0);assert.equal(document.body.textContent.includes('I paid'),false);
  assert.match(document.querySelector('.receipt').textContent,/Tea/);assert.match(document.querySelector('.number').textContent,/^1$/);
  assert.equal(api.state.screen,'receipt');assert.equal(document.querySelector('.order-confirmed-dialog').hasAttribute('open'),true);assert.equal(document.querySelector('.confirmed-number').textContent,'1');assert.match(document.querySelector('.confirmed-instruction').textContent,/payment proof at the counter/);
});
test('payment controls and account summaries are owner-only; served unpaid orders remain outstanding',()=>{
  const {api,document}=app();
  const date={seconds:1791226800,toDate:()=>new Date('2026-10-05T19:00Z')};
  api.state.orders=[{id:'ABC234',customerName:'A Student',items:[{name:'Tea',qty:1,price:20}],total:20,status:'given',createdAt:date,givenAt:date}];
  api.state.date='2026-10-05';api.state.role='owner';api.renderStaff();
  assert.equal(document.querySelectorAll('[data-pay]').length,1);assert.match(document.body.textContent,/Paid \/ unpaid orders/);assert.match(document.body.textContent,/₹20/);
  document.querySelector('#unpaid-all').click();assert.equal(document.querySelectorAll('.order-card').length,1);
  api.state.role='kitchen';api.renderStaff();assert.equal(document.querySelectorAll('[data-pay]').length,0);assert.equal(document.querySelector('#export-payments'),null);assert.equal(document.body.textContent.includes('Paid / unpaid orders'),false);
});
test('owner can search by number or name and switch month reports',()=>{
  const {api,document}=app();const t={toDate:()=>new Date('2026-10-05T19:00Z')};
  api.state.role='owner';api.state.date='2026-10-05';api.state.orders=[{id:'ABC234',customerName:'Aryan',total:40,items:[],status:'new',createdAt:t},{id:'DEF567',customerName:'Other',total:20,items:[],status:'new',createdAt:t}];
  api.state.search='#ABC234';api.renderStaff();assert.equal(document.querySelectorAll('.order-card').length,1);
  api.state.search='other';api.renderStaff();assert.match(document.querySelector('.order-card').textContent,/DEF567/);
  api.state.search='';api.state.reportPeriod='month';api.renderStaff();assert.equal(document.querySelector('#report-date').type,'month');assert.match(document.querySelector('#export-payments').textContent,/month collections/);
});
test('menu filtering preserves the name and basket while finding matching food',()=>{
  const {api,document}=app();
  api.state.menu=[{id:'tea',name:'Tea',price:20,available:true},{id:'aloo',name:'Aloo Paratha',price:40,available:true}];
  api.state.cart={aloo:2};api.customer();document.querySelector('#customer-name').value='Aryan';
  document.querySelector('[data-category="Drinks"]').click();
  assert.equal(document.querySelectorAll('.item').length,1);assert.match(document.querySelector('.item').textContent,/Tea/);
  assert.equal(document.querySelector('#customer-name').value,'Aryan');assert.equal(api.state.cart.aloo,2);
  document.querySelector('[data-category="All"]').click();
  const search=document.querySelector('#menu-search');search.value='paratha';search.dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(document.querySelectorAll('.item').length,1);assert.match(document.querySelector('.item').textContent,/Aloo Paratha/);
  assert.equal(document.querySelector('#customer-name').value,'Aryan');
});
test('the printed menu remains browsable before activation and cannot create unvalidated orders',async()=>{
  const {api,document,writes}=app();
  api.state.menuReady=false;api.state.menu=PRINTED_MENU;api.state.cart={tea:1};api.customer();
  assert.equal(document.querySelectorAll('.item').length,12);
  assert.equal(document.querySelector('#place').disabled,false);
  assert.match(document.querySelector('.preview-note').textContent,/Digital orders open soon/);
  document.querySelector('#customer-name').value='Test';api.review();assert.equal(document.querySelector('#confirm').disabled,true);await api.place('Test',[{id:'tea',name:'Tea',price:20,qty:1}],20);
  assert.equal(writes.length,0);assert.equal(api.state.screen,'review');
});

test('customer navigation has no staff link and quantity controls expand after adding',()=>{
 const {api,document}=app();api.customer();
 assert.equal(document.querySelector('a[href="/staff"]'),null);
 const add=document.querySelector('.add-cart');assert.match(add.textContent,/ADD/);add.click();
 assert.equal(document.querySelector('.stepper b').textContent,'1');
 assert.match(document.querySelector('.selected-label').textContent,/1 in your basket/);
});

test('review edits quantities and totals without losing the basket or customer name',()=>{
 const {api,document}=app();api.state.cart={tea:2};api.customer();document.querySelector('#customer-name').value='Siddhartha';document.querySelector('#place').click();
 assert.equal(api.state.screen,'review');assert.match(document.querySelector('.total').textContent,/₹40/);
 document.querySelector('[data-review="tea"][data-delta="1"]').click();assert.match(document.querySelector('.total').textContent,/₹60/);
 document.querySelector('#back').click();assert.equal(api.state.cart.tea,3);assert.match(document.querySelector('.section-head').textContent,/Welcome Siddhartha/);
});

test('menu has dietary labels, category headings and unambiguous basket action',()=>{
 const {api,document}=app();api.state.cart={tea:1};api.customer();
 assert.equal(document.querySelectorAll('.menu-group-heading').length,3);
 assert.match(document.querySelector('#mobile-review').textContent,/View basket/);
 assert.match(document.querySelector('.mobile-basket').textContent,/1 item · ₹20/);
 assert.equal(document.querySelectorAll('.diet-label.nonveg').length,3);
 assert.equal(document.querySelectorAll('.diet-label.egg').length,2);
});


test('counter exposes payment and printing only; chefs have a read-only order log',()=>{
 const {api,document}=app();const date={seconds:1791226800,toDate:()=>new Date('2026-10-05T19:00Z')};api.state.date='2026-10-05';api.state.orders=[{id:'ABC234',orderNumber:12,customerName:'Aryan',total:20,items:[{name:'Tea',qty:1,price:20}],status:'new',createdAt:date}];api.state.role='owner';api.renderStaff();assert.equal(document.querySelectorAll('[data-status]').length,0);assert.equal(document.querySelector('[data-pay]').textContent,'Mark paid');assert.match(document.querySelector('[data-print]').textContent,/Print slip/);api.state.payments.set('ABC234',{});api.renderStaff();assert.equal(document.querySelectorAll('[data-pay]').length,0);api.state.role='kitchen';api.renderStaff();assert.equal(document.querySelectorAll('[data-status]').length,0);assert.equal(document.querySelectorAll('[data-print]').length,0);assert.match(document.querySelector('.chef-order-time').textContent,/ORDER PLACED/);assert.match(document.querySelector('.chef-order-time strong').textContent,/12:30/);assert.match(document.querySelector('.chef-order-time small').textContent,/2026-10-06.*IST/);assert.equal(document.querySelector('[data-wait]'),null);assert.doesNotMatch(document.querySelector('.chef-log').textContent,/Waiting/);assert.equal(document.querySelectorAll('[data-pay]').length,0);
});

test('chef link stays read-only even with an existing owner login',()=>{const {api,document}=app('https://example.test/staff?station=kitchen');api.state.role='owner';api.state.orders=[{id:'ABC234',orderNumber:1,customerName:'Test',items:[],total:20,status:'new',createdAt:{seconds:1791226800,toDate:()=>new Date('2026-10-05T19:00Z')}}];api.renderStaff();assert.equal(document.querySelectorAll('[data-pay]').length,0);assert.equal(document.querySelectorAll('[data-status]').length,0);assert.equal(document.querySelector('#menu-tab'),null);assert.equal(document.querySelector('.staff-reports'),null);assert.match(document.querySelector('.chef-log').textContent,/ORDER PLACED/);assert.doesNotMatch(document.querySelector('.chef-log').textContent,/Waiting/);});

test('live orders use a bounded service-night query and older pages deduplicate',async()=>{
 const listeners=[],calls=[];let reads=0;const stamp={seconds:1792083600,toDate:()=>new Date('2026-10-15T17:00Z')};const row=n=>({id:'O'+n,data:()=>({customerName:'Test',orderNumber:n,total:20,items:[],status:'new',createdAt:stamp})});
 const {api,document}=app('https://example.test/staff?station=kitchen',{collection:(_db,name)=>name,where:(...x)=>({where:x}),orderBy:(...x)=>({orderBy:x}),limit:n=>({limit:n}),startAfter:x=>({after:x.id}),query:(...x)=>{calls.push(x);return x;},onSnapshot:(q,fn)=>{listeners.push(fn);return ()=>{};},getDocs:async()=>{reads++;return {docs:[row(1),row(0)]};}});
 api.state.role='kitchen';api.subscribeOrderWindow();assert.equal(calls[0].some(x=>x.limit===200),true);assert.equal(calls[0].filter(x=>x.where).length,2);listeners[0]({docs:[row(3),row(2),row(1)]});await api.loadOlderOrders();assert.equal(api.state.orders.length,4);assert.equal(reads,1);api.refreshWaitTimers();assert.equal(reads,1);assert.equal(document.querySelectorAll('[data-pay]').length,0);
});
test('monthly totals use aggregate queries without downloading order documents',async()=>{
 let aggregates=0;const {api,document}=app('https://example.test/staff',{collection:(_db,name)=>name,where:(...x)=>x,query:(...x)=>x,count:()=>1,sum:x=>x,getAggregateFromServer:async(q)=>{aggregates++;return {data:()=>q[0]==='orders'?{orders:30000,sales:1500000}:{payments:29000,received:1450000}};},getDocs:()=>{throw Error('Full collection read forbidden');}});
 api.state.role='owner';await api.monthlyReport();await document.querySelector('#load-totals').onclick();assert.equal(aggregates,2);assert.match(document.querySelector('#month-totals').textContent,/30000/);assert.match(document.querySelector('#month-totals').textContent,/not an unpaid balance/);
});
test('fresh cached menu avoids a database read and never signs in a menu visitor',async()=>{let reads=0;const {api,document}=app('https://example.test/',{collection:(_db,name)=>name,getDocs:async()=>{reads++;return {docs:[{id:'tea',data:()=>({name:'Tea',price:20})}]};}});await api.loadStudentMenu();await api.loadStudentMenu();assert.equal(reads,1);assert.equal(api.state.user,null);});
