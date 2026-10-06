import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {JSDOM} from 'jsdom';
import QRCode from 'qrcode';
import {accounts,day,csv} from '../src/accounts.js';
import {icon,category,foodArt} from '../src/visuals.js';
import {PRINTED_MENU,menuOrder} from '../src/menu.js';

function app() {
  const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});
  const writes=[];dom.window.scrollTo=()=>{};
  const context=vm.createContext({document:dom.window.document,window:dom.window,sessionStorage:dom.window.sessionStorage,location:dom.window.location,crypto:webcrypto,QRCode,accounts,day,csv,icon,category,foodArt,PRINTED_MENU,menuOrder,URL,Blob,Intl,console,setTimeout,auth:{},db:{},doc:(_db,collection,id)=>({collection,id}),serverTimestamp:()=>({sentinel:true}),setDoc:async(ref,data)=>writes.push({ref,data}),runTransaction:async(_db,fn)=>fn({get:async()=>({exists:()=>false}),set:(ref,data)=>writes.push({ref,data})})});
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/import\.meta\.env\.BASE_URL/g,"'/'").replace(/import\.meta\.env\.[A-Z_]+/g,"''").replace(/\nstart\(\);\s*$/,'');
  vm.runInContext(source+'\nglobalThis.api={state,customer,review,place,confirmation,renderStaff,orderCard};',context);
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
  assert.equal(api.state.screen,'receipt');
});
test('payment controls and account summaries are owner-only; served unpaid orders remain outstanding',()=>{
  const {api,document}=app();
  const date={seconds:1791226800,toDate:()=>new Date('2026-10-05T19:00Z')};
  api.state.orders=[{id:'ABC234',customerName:'A Student',items:[{name:'Tea',qty:1,price:20}],total:20,status:'given',createdAt:date,givenAt:date}];
  api.state.date='2026-10-06';api.state.role='owner';api.renderStaff();
  assert.equal(document.querySelectorAll('[data-pay]').length,1);assert.match(document.body.textContent,/Paid \/ unpaid orders/);assert.match(document.body.textContent,/₹20/);
  document.querySelector('#unpaid-all').click();assert.equal(document.querySelectorAll('.order-card').length,1);
  api.state.role='kitchen';api.renderStaff();assert.equal(document.querySelectorAll('[data-pay]').length,0);assert.equal(document.querySelector('#export-payments'),null);assert.equal(document.body.textContent.includes('Paid / unpaid orders'),false);
});
test('owner can search by number or name and switch month reports',()=>{
  const {api,document}=app();const t={toDate:()=>new Date('2026-10-05T19:00Z')};
  api.state.role='owner';api.state.date='2026-10-06';api.state.orders=[{id:'ABC234',customerName:'Aryan',total:40,items:[],status:'new',createdAt:t},{id:'DEF567',customerName:'Other',total:20,items:[],status:'new',createdAt:t}];
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
  assert.equal(document.querySelector('#place').disabled,true);
  assert.match(document.querySelector('.preview-note').textContent,/Digital orders open soon/);
  api.review();await api.place('Test',[{id:'tea',name:'Tea',price:20,qty:1}],20);
  assert.equal(writes.length,0);assert.equal(api.state.screen,'menu');
});

test('customer navigation has no staff link and quantity controls expand after adding',()=>{
 const {api,document}=app();api.customer();
 assert.equal(document.querySelector('a[href="/staff"]'),null);
 const add=document.querySelector('.add-cart');assert.match(add.textContent,/Add to basket/);add.click();
 assert.equal(document.querySelector('.stepper b').textContent,'1');
 assert.match(document.querySelector('.selected-label').textContent,/1 in your basket/);
});
