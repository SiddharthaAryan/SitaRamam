import './style.css';
import QRCode from 'qrcode';
import { accounts, day, csv } from './accounts.js';
import { auth, authReady, configured, db } from './firebase.js';
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

const root = document.querySelector('#app');
const state = { menu: [], cart: {}, user: null, role: null, orders: [], payments: new Map(), status: '', unsubscribe: [], selected: null, date: day({toDate:()=>new Date()}), unpaidOnly: false, reportPeriod: 'day', search: '', paymentFilter: 'all', screen: 'menu', receipt: null };
const STARTER_MENU = [
  ['veg-maggie','Veg Maggie',50,''],
  ['omelette-single','Omelette - Single Egg - 2 pc Bread',30,''],
  ['omelette-double','Omelette - Double - 2 Eggs - 4 Bread',50,''],
  ['tea','Tea',20,''],
  ['coffee','Coffee',25,''],
  ['paneer-pakoda','Paneer Pakoda - 6 pcs',100,''],
  ['french-fries','French Fries - single portion',80,''],
  ['aloo-paratha','Aloo Paratha 1Pcs with Pickle & Chutney',40,''],
  ['paneer-paratha','Paneer Paratha 1Pcs with Pickle & Chutney',60,''],
  ['chicken-sandwich','Chicken Sandwich - 2 Pcs',150,''],
  ['chicken-frankie','Chicken Frankie - 1 pcs',150,''],
  ['chicken-nuggets','Chicken Nuggets - 8 pcs',175,''],
];
const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const time = value => value?.toDate ? value.toDate().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone:'Asia/Kolkata' }) : 'Just now';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const siteBase = import.meta.env.BASE_URL;
const homeUrl = siteBase;
const staffUrl = `${siteBase}staff`;
const route = () => location.pathname.replace(/\/$/, '') === staffUrl.replace(/\/$/, '') ? 'staff' : 'customer';
const errorText = e => ({'permission-denied':'Access denied. Check your staff role and database rules.','unauthenticated':'Please sign in again.','unavailable':'Connection lost. Check your internet and retry.','resource-exhausted':'Service limit reached. Please order at the counter.','auth/invalid-credential':'Incorrect password for this station.'}[e.code] || e.message || 'Something went wrong.');
function shell(body, staff=false) { root.innerHTML = `<header><a class="brand" href="${homeUrl}">✦ Rassense <span>Night Mess</span></a>${staff ? `<a href="${homeUrl}">Customer view ↗</a>` : `<a href="${staffUrl}">Staff sign in</a>`}</header><main>${body}</main><footer>Made for late night cravings · IIM Jammu</footer>`; }
function notice(message, kind='info') { state.status = message; const target = document.querySelector('#notice'); if (target) { target.hidden = false; target.className = `notice ${kind}`; target.textContent = message; } }
function clean() { state.unsubscribe.forEach(unsub => unsub()); state.unsubscribe = []; }
function itemRow(item) { const qty = state.cart[item.id] || 0; return `<article class="item"><div><div class="item-title">${esc(item.name)} ${item.available === false ? '<small>Sold out</small>' : ''}</div><p>${esc(item.description || '')}</p><strong>${money(item.price)}</strong></div>${item.available === false ? '' : `<div class="stepper"><button data-item="${esc(item.id)}" data-delta="-1" aria-label="Remove ${esc(item.name)}">−</button><b>${qty}</b><button data-item="${esc(item.id)}" data-delta="1" aria-label="Add ${esc(item.name)}">+</button></div>`}</article>`; }
function selectedItems() { return state.menu.filter(x => state.cart[x.id] > 0 && x.available !== false).map(x => ({ id:x.id, name:x.name, price:x.price, qty:state.cart[x.id] })); }
function customer() {
  state.screen='menu';
  const items = selectedItems(), total = items.reduce((n, x) => n + x.qty*x.price, 0);
  shell(`<section class="hero"><div class="eyebrow">IIM JAMMU · 11:00 PM – 3:00 AM</div><h1>Good food.<br><em>One quick order.</em></h1><p>Choose your favourites, check the total, and collect using your order number.</p></section><div id="notice" class="notice" hidden></div><div class="layout"><section><div class="section-head"><div><div class="eyebrow">01 / THE MENU</div><h2>What are you craving?</h2></div><span class="pill">Freshly prepared</span></div><div id="menu">${state.menu.length ? state.menu.map(itemRow).join('') : '<div class="empty">The menu is being set up. Please check back soon.</div>'}</div></section><aside class="cart"><div class="eyebrow">02 / YOUR ORDER</div><h2>Your basket</h2>${items.length ? items.map(x => `<div class="cart-line"><span>${esc(x.name)} <small>× ${x.qty}</small></span><b>${money(x.qty*x.price)}</b></div>`).join('') : '<p class="muted">Add something tasty to begin.</p>'}<div class="total"><span>Total to pay</span><strong>${money(total)}</strong></div><label for="customer-name">Your name <span>required</span></label><input id="customer-name" maxlength="40" autocomplete="name" placeholder="Name for the order" value="${esc(sessionStorage.getItem('customerName') || '')}"/><p class="hint">We’ll call your order number when it’s ready. Estimated preparation: 10–15 minutes. Orders cannot be cancelled after placement.</p><button id="place" class="primary" ${!items.length ? 'disabled' : ''}>Review order →</button>${sessionStorage.getItem('lastReceipt')?'<button id="last-bill" class="secondary">View last bill</button>':''}</aside></div>`);
  root.querySelectorAll('[data-item]').forEach(button => button.onclick = () => { const id=button.dataset.item, next=Math.max(0,Math.min(20,(state.cart[id]||0)+Number(button.dataset.delta))); state.cart[id]=next; const input=root.querySelector('#customer-name'); if(input) sessionStorage.setItem('customerName',input.value); customer(); });
  root.querySelector('#place').onclick = () => review();
  const last=root.querySelector('#last-bill');if(last)last.onclick=async()=>{try{const saved=JSON.parse(sessionStorage.getItem('lastReceipt'));const snapshot=await getDoc(doc(db,'orders',saved.id));if(!snapshot.exists()||snapshot.data().customerUid!==state.user.uid)throw new Error('This bill is not available for this browser.');const order=snapshot.data();confirmation(saved.id,order.customerName,order.total,order.items);}catch(e){notice(errorText(e),'error');}};
}
function review() {
  const name=root.querySelector('#customer-name').value.trim();
  if (name.length < 2 || name.length > 40) return notice('Please enter a name (2–40 characters).','error');
  sessionStorage.setItem('customerName',name);
  const items=selectedItems(); if (!items.length || items.length > 8) return notice('Choose between 1 and 8 different items.','error');
  const total=items.reduce((sum,x)=>sum+x.price*x.qty,0);
  state.screen='review';
  shell(`<section class="narrow"><div class="eyebrow">FINAL CHECK</div><h1>Ready to order?</h1><p>Placed for <b>${esc(name)}</b></p><div class="panel">${items.map(x=>`<div class="cart-line"><span>${esc(x.name)} × ${x.qty}</span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="total"><span>Total</span><strong>${money(total)}</strong></div></div><div id="notice" class="notice" hidden></div><div class="actions"><button id="back" class="secondary">← Edit order</button><button id="confirm" class="primary">Place order · ${money(total)}</button></div><p class="hint">Payment can be made now or after eating. Staff will record when you pay.</p></section>`);
  root.querySelector('#back').onclick=customer;
  root.querySelector('#confirm').onclick=()=>place(name,items,total);
}
function orderId() { const bytes=crypto.getRandomValues(new Uint8Array(6)); const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...bytes].map(x=>alphabet[x % alphabet.length]).join(''); }
async function place(name,items,total) {
  const button=root.querySelector('#confirm'); button.disabled=true; button.textContent='Placing order…';
  // Reuse the ID on retry; a lost response must not create a second order.
  const id=sessionStorage.getItem('pendingOrder') || orderId(); sessionStorage.setItem('pendingOrder',id);
  try {
    const ref=doc(db,'orders',id);
    await setDoc(ref,{customerUid:state.user.uid,customerName:name,items,total,status:'new',createdAt:serverTimestamp()});
    sessionStorage.removeItem('pendingOrder'); state.cart={}; confirmation(id,name,total,items);
  } catch(e) {
    // A timed-out response can still mean the order was saved. Check this exact ID before offering a retry.
    try { const existing=await getDoc(doc(db,'orders',id)); if(existing.exists() && existing.data().customerUid===state.user.uid){sessionStorage.removeItem('pendingOrder');state.cart={};confirmation(id,existing.data().customerName,existing.data().total,existing.data().items);return;} }
    catch (_) { /* Connectivity or a genuine number collision: keep the pending ID for now. */ }
    button.disabled=false;button.textContent='Try placing order again';notice(errorText(e),'error');
  }
}
function confirmation(id,name,total,items=[]) {
  state.screen='receipt';
  state.receipt={id,customerName:name,total,items};
  sessionStorage.setItem('lastReceipt',JSON.stringify(state.receipt));
  const paymentUrl=`upi://pay?pa=paytm.s119vgx%40pty&pn=Paytm&am=${Number(total).toFixed(2)}&cu=INR&tn=${encodeURIComponent('Night mess '+id)}`;
  shell(`<section class="narrow success"><div class="confetti">✦ ✧ ✦</div><div class="eyebrow">ORDER PLACED</div><h1>Food on the way.<br><em>Pay now!</em></h1><p>${esc(name)}, collect your food using this order number.</p><div class="number">#${esc(id)}</div><div class="panel receipt"><h2>Your bill</h2>${items.map(x=>`<div class="cart-line"><span>${esc(x.name)}<small> × ${x.qty} · ${money(x.price)} each</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="total"><span>Total to pay</span><strong>${money(total)}</strong></div><div class="cart-line"><span>Payment status at placement</span><strong class="badge unpaid">UNPAID</strong></div></div><div class="panel payment-panel"><h2>Pay ${money(total)} by UPI</h2><img id="payment-qr" width="240" height="240" alt="UPI payment QR for this bill"/><p class="hint">Paytm merchant · paytm.s119vgx@pty<br>Check the recipient in your UPI app before paying.</p><a class="primary link-button" href="${esc(paymentUrl)}">Open UPI app · ${money(total)}</a><p class="hint">On another device, scan this QR. If your app does not open, use the counter QR and enter ${money(total)}.</p><p>After paying, give <b>#${esc(id)}</b> to the counter. Only the owner confirms payment. You can also pay after eating.</p></div><div class="actions"><button id="print-customer" class="secondary">Print / save bill</button><button id="another" class="secondary">Place another order</button></div><p class="hint">Keep this bill or take a screenshot. It records the unpaid status when your order was placed; the counter keeps the current payment record.</p></section>`);
  const qr=root.querySelector('#payment-qr');
  QRCode.toDataURL(paymentUrl,{width:280,margin:3,errorCorrectionLevel:'M'}).then(url=>{if(qr.isConnected)qr.src=url;}).catch(()=>{qr.hidden=true;});
  root.querySelector('#print-customer').onclick=()=>printReceipt(state.receipt,'UNPAID');
  root.querySelector('#another').onclick=customer;
}
async function login() {
  shell(`<section class="narrow"><div class="eyebrow">STAFF ACCESS</div><h1>Welcome back.</h1><p>Choose your station and enter its password.</p><form id="login" class="panel"><label for="station">Station</label><select id="station" name="station"><option value="owner">Counter / owner</option><option value="kitchen">Kitchen</option></select><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password"/><button class="primary">Sign in →</button></form><div id="notice" class="notice" hidden></div></section>`,true);
  root.querySelector('#login').onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
    const station=event.target.elements.namedItem('station').value;
    const loginEmail=station==='owner' ? import.meta.env.VITE_OWNER_LOGIN_EMAIL : import.meta.env.VITE_KITCHEN_LOGIN_EMAIL;
    try {
      if(!loginEmail) throw new Error('This station is not configured yet.');
      await setPersistence(auth,browserLocalPersistence);
      const {user}=await signInWithEmailAndPassword(auth,loginEmail,event.target.elements.namedItem('password').value);
      state.user=user;await staff();
      if(state.role!==station){clean();await signOut(auth);state.role=null;login();notice('This password does not belong to the selected station.','error');}
    }catch(e){button.disabled=false;notice(errorText(e),'error');}
  };
}
async function staff() {
  clean(); const user=auth.currentUser;
  if (!user || user.isAnonymous) return login();
  state.user=user;
  try { const roleDoc=await getDoc(doc(db,'staff',user.uid)); state.role=roleDoc.data()?.role; if(!['owner','kitchen'].includes(state.role)) throw new Error('This account has no staff role. Add its UID to the staff collection.'); }
  catch(e){login();notice(errorText(e),'error');return;}
  const unsub=onSnapshot(query(collection(db,'orders'),where('status','in',['new','preparing','ready','given'])),snap=>{
    // Limit displayed results in the UI; database indexes and access can be refined with actual traffic.
    state.orders=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));renderStaff();
  },e=>{renderStaff();notice(errorText(e),'error');}); state.unsubscribe.push(unsub);
  if(state.role==='owner') state.unsubscribe.push(onSnapshot(collection(db,'payments'),snap=>{state.payments=new Map(snap.docs.map(x=>[x.id,x.data()]));renderStaff();},e=>notice(errorText(e),'error')));
  if(state.role==='owner') state.unsubscribe.push(onSnapshot(collection(db,'menu'),snap=>{state.menu=snap.docs.map(x=>({id:x.id,...x.data()}));renderStaff();}));
  renderStaff();
}
function renderStaff() {
  const owner=state.role==='owner', orders=state.orders;
  const active=orders.filter(x=>x.status!=='given'), unpaid=orders.filter(x=>!state.payments.has(x.id));
  const period=state.reportPeriod==='month'?'month':'day';
  const report=accounts(orders,state.payments,state.date,period);
  const {periodOrders,paidOrders,outstanding,sales,paidOrderValue,received}=report;
  const visible=owner?(state.unpaidOnly?unpaid:periodOrders):active;
  const needle=state.search.trim().toLowerCase().replace(/^#/,'');
  const filtered=visible.filter(o=>(!needle||o.id.toLowerCase().includes(needle)||o.customerName.toLowerCase().includes(needle)) && (state.paymentFilter==='all'||(state.paymentFilter==='paid'?state.payments.has(o.id):!state.payments.has(o.id))));
  shell(`<section class="staff-top"><div><div class="eyebrow">LIVE OPERATIONS</div><h1>${owner?'Counter & accounts':'Kitchen queue'}</h1><p>${owner?'Orders, payments and service in one place.':'Prepare, serve and clear each order.'}</p></div><button id="logout" class="secondary">Sign out</button></section><div id="notice" class="notice" hidden></div><div class="metrics"><div><b>${active.length}</b><span>In kitchen queue</span></div><div><b>${owner?periodOrders.length:orders.length}</b><span>${owner?'Orders in period':'Orders loaded'}</span></div>${owner?`<div><b>${money(sales)}</b><span>Orders placed · ${period}</span></div><div><b>${paidOrders.length} / ${outstanding.length}</b><span>Paid / unpaid orders</span></div><div><b>${money(paidOrderValue)}</b><span>Paid order value · ${period}</span></div><div><b>${money(report.outstandingValue)}</b><span>Outstanding on orders · ${period}</span></div><div><b>${money(received)}</b><span>Payments received · ${period}</span></div><div><b>${money(report.upi)} / ${money(report.cash)}</b><span>UPI / cash received · ${period}</span></div>`:''}</div>${owner?'<nav class="tabs"><button id="orders-tab">Orders</button><button id="menu-tab">Edit menu</button></nav>':''}<div id="staff-content"></div>` ,true);
  root.querySelector('#logout').onclick=async()=>{clean();await signOut(auth);state.user=null;state.role=null;login();};
  if(owner){root.querySelector('#orders-tab').onclick=()=>{state.selected='orders';renderStaff();};root.querySelector('#menu-tab').onclick=()=>{state.selected='menu';renderStaff();};}
  const target=root.querySelector('#staff-content');
  if(owner && state.selected==='menu') return renderMenu(target);
  target.innerHTML=`${owner?`<div class="report-controls"><label>Report <select id="report-period"><option value="day" ${period==='day'?'selected':''}>Day</option><option value="month" ${period==='month'?'selected':''}>Month</option></select></label><label>${period==='month'?'Month':'Date'} <input id="report-date" type="${period==='month'?'month':'date'}" value="${period==='month'?state.date.slice(0,7):state.date}"/></label><button class="secondary" id="unpaid-all">${state.unpaidOnly?'Show selected period':'Show all unpaid ('+unpaid.length+')'}</button><button class="secondary" id="export-csv">Export ${period} orders</button><button class="secondary" id="export-payments">Export ${period} collections</button><label>Find an order<input id="order-search" placeholder="Order number or name" value="${esc(state.search)}"/></label><label>Payment<select id="payment-filter"><option value="all" ${state.paymentFilter==='all'?'selected':''}>All</option><option value="paid" ${state.paymentFilter==='paid'?'selected':''}>Paid</option><option value="unpaid" ${state.paymentFilter==='unpaid'?'selected':''}>Unpaid</option></select></label></div><p class="hint">Sales are the value of orders placed in this period. Payments received are grouped by payment date, so late payments can appear in a later period. Unpaid orders remain outstanding even after food is given.</p>`:''}<div class="section-head"><h2>${owner?(state.unpaidOnly?'All unpaid orders':'Orders for '+(period==='month'?state.date.slice(0,7):state.date)):'Orders to make'}</h2><span class="pill">Updates live</span></div><div class="order-grid">${(owner?filtered.slice().reverse():active).map(x=>orderCard(x,owner)).join('')||'<div class="empty">No orders in this view.</div>'}</div>`;
  if(owner){target.querySelector('#report-period').onchange=e=>{state.reportPeriod=e.target.value;state.unpaidOnly=false;renderStaff();};target.querySelector('#report-date').onchange=e=>{state.date=e.target.value.length===7?e.target.value+'-01':e.target.value;state.unpaidOnly=false;renderStaff();};target.querySelector('#unpaid-all').onclick=()=>{state.unpaidOnly=!state.unpaidOnly;renderStaff();};target.querySelector('#export-csv').onclick=()=>exportCsv(periodOrders);target.querySelector('#export-payments').onclick=()=>exportCollections(report);target.querySelector('#payment-filter').onchange=e=>{state.paymentFilter=e.target.value;renderStaff();};target.querySelector('#order-search').oninput=e=>{const caret=e.target.selectionStart;state.search=e.target.value;renderStaff();const input=root.querySelector('#order-search');input.focus();input.setSelectionRange(caret,caret);};}
  target.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>changeStatus(b.dataset.id,b.dataset.status));
  target.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>changePayment(b.dataset.id,b.dataset.pay,b.closest('.order-card').querySelector('[data-method]')?.value));
  target.querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>printOrder(b.dataset.print));
}
function orderCard(order,owner){const paid=state.payments.has(order.id),elapsed=order.givenAt&&order.createdAt?Math.max(0,Math.round((order.givenAt.seconds-order.createdAt.seconds)/60)):null;
return `<article class="order-card ${order.status==='given'?'served':''}"><div class="order-heading"><div><div class="eyebrow">${time(order.createdAt)} · ${esc(order.status.toUpperCase())}</div><h2>#${esc(order.id)}</h2><span>${esc(order.customerName)}</span></div>${owner?`<span class="badge ${paid?'paid':'unpaid'}">${paid?'Paid':'Unpaid'}</span>`:''}</div><div class="order-lines">${(order.items||[]).map(x=>`<div><b>${x.qty}×</b> ${esc(x.name)} <span>${money(x.price*x.qty)}</span></div>`).join('')}</div><div class="order-total">Total <b>${money(order.total)}</b></div>${elapsed!==null?`<small>Given in ${elapsed} min · ${time(order.givenAt)}</small>`:''}<div class="order-actions">${order.status==='new'?`<button data-id="${order.id}" data-status="preparing">Start preparing</button>`:''}${order.status==='preparing'?`<button data-id="${order.id}" data-status="ready">Mark ready</button>`:''}${order.status==='ready'?`<button data-id="${order.id}" data-status="given">Mark given</button>`:''}<button class="secondary" data-print="${order.id}">Print slip</button>${owner?`${paid?'':`<select data-method aria-label="Payment method for order ${order.id}"><option value="upi">UPI</option><option value="cash">Cash</option></select>`}<button class="${paid?'secondary':'pay-button'}" data-id="${order.id}" data-pay="${paid?'undo':'paid'}">${paid?'Undo payment':'Mark paid'}</button>`:''}</div></article>`;}
async function changeStatus(id,status){try{const update={status};if(status==='given')update.givenAt=serverTimestamp();await updateDoc(doc(db,'orders',id),update);}catch(e){notice(errorText(e),'error');}}
async function changePayment(id,action,method){try{if(action==='paid'){const order=state.orders.find(x=>x.id===id);if(!order)return;await setDoc(doc(db,'payments',id),{orderId:id,amount:order.total,method:method==='cash'?'cash':'upi',paidAt:serverTimestamp(),recordedBy:state.user.uid});}else if(confirm(`Undo payment for #${id}?`)){await deleteDoc(doc(db,'payments',id));}}catch(e){notice(errorText(e),'error');}}
function exportCsv(orders) {
  const columns=['Order number','Name','Placed (IST)','Items','Order total INR','Food status','Given (IST)','Minutes to give','Payment status','Paid (IST)','Payment method'];
  const fmt=t=>t?.toDate?t.toDate().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'';
  const rows=orders.map(o=>{const p=state.payments.get(o.id);return [o.id,o.customerName,fmt(o.createdAt),(o.items||[]).map(x=>`${x.qty}x ${x.name} @ ${x.price}`).join('; '),o.total,o.status,fmt(o.givenAt),o.givenAt&&o.createdAt?Math.round((o.givenAt.seconds-o.createdAt.seconds)/60):'',p?'Paid':'Unpaid',fmt(p?.paidAt),p?.method||''];});
  downloadCsv([columns,...rows],`rassense-orders-${state.reportPeriod==='month'?state.date.slice(0,7):state.date}.csv`);
}
function downloadCsv(rows,name) {
  const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCollections(report) {
  const fmt=t=>t?.toDate?t.toDate().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'';
  const rows=report.receipts.map(p=>{const o=state.orders.find(o=>o.id===p.orderId);return [p.orderId,o?.customerName||'',fmt(o?.createdAt),fmt(p.paidAt),p.amount,p.method,p.recordedBy];});
  downloadCsv([['Order number','Name','Order placed (IST)','Payment received (IST)','Amount INR','Payment method','Recorded by'],...rows,['TOTAL RECEIVED','','','',report.received],['UPI','','','',report.upi],['CASH','','','',report.cash]],`rassense-collections-${state.reportPeriod==='month'?state.date.slice(0,7):state.date}.csv`);
}
function renderMenu(target){target.innerHTML=`<div class="section-head"><h2>Menu items</h2></div>${state.menu.length===0?'<button id="seed-menu" class="secondary">Load the 12 items from the printed menu</button>':''}<form id="menu-form" class="panel menu-form"><input name="name" placeholder="Item name" maxlength="60" required/><input name="price" type="number" min="1" max="10000" step="1" placeholder="Price ₹" required/><input name="description" placeholder="Description (optional)" maxlength="100"/><button class="primary">Add item</button></form><div class="menu-admin">${state.menu.map(x=>`<div class="cart-line"><span>${esc(x.name)} · ${money(x.price)} ${x.available===false?'· Sold out':''}</span><button data-toggle="${x.id}">${x.available===false?'Make available':'Mark sold out'}</button></div>`).join('')}</div>`;if (state.menu.length===0) target.querySelector('#seed-menu').onclick=async()=>{
    const batch=writeBatch(db);
    STARTER_MENU.forEach(([id,name,price,description])=>batch.set(doc(db,'menu',id),{name,price,description,available:true}));
    try { await batch.commit();notice('Printed menu loaded. Check prices and availability before opening.'); }
    catch(e){notice(errorText(e),'error');}
  };target.querySelector('#menu-form').onsubmit=async e=>{e.preventDefault();let data=new FormData(e.target),name=String(data.get('name')).trim(),price=Number(data.get('price'));if(!name||!Number.isInteger(price)||price<1)return;try{await setDoc(doc(collection(db,'menu')),{name,price,description:String(data.get('description')||'').trim(),available:true});e.target.reset();}catch(err){notice(errorText(err),'error');}};target.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{let item=state.menu.find(x=>x.id===b.dataset.toggle);try{await updateDoc(doc(db,'menu',item.id),{available:item.available===false});}catch(e){notice(errorText(e),'error');}});}
function printOrder(id){const order=state.orders.find(x=>x.id===id);if(!order)return;printReceipt(order,state.role==='owner'?(state.payments.has(id)?'PAID':'UNPAID'):'Confirm with counter');}
function printReceipt(order,payment){
  const receipt=`<html><head><title>Order ${esc(order.id)}</title><style>body{font:16px monospace;width:72mm;margin:4mm}h1{font-size:28px}hr{border:0;border-top:1px dashed}small{font-size:12px}@media print{@page{size:80mm auto;margin:3mm}}</style></head><body><p>Rassense · IIM Jammu Night Mess</p><h1>#${esc(order.id)}</h1><p>${esc(order.customerName)} · ${time(order.createdAt)}</p><hr>${order.items.map(x=>`<p>${x.qty}× ${esc(x.name)} @ ${money(x.price)} — ${money(x.price*x.qty)}</p>`).join('')}<hr><h2>Total: ${money(order.total)}</h2><strong style="color:${payment==='UNPAID'?'#b3261e':'#17352a'}">${payment}</strong><p><small>Payment record maintained at counter.</small></p></body></html>`;
  const w=window.open('','_blank','width=380,height=640');if(!w)return notice('Allow pop-ups to print the slip.','error');w.document.write(receipt);w.document.close();w.onload=()=>w.print();
}
async function start(){if(!configured){shell('<section class="narrow"><h1>Setup needed</h1><p>Copy <code>.env.example</code> to <code>.env</code> and enter the credentials of a NEW Firebase project for this night mess.</p></section>');return;}if(route()==='staff'){const current=await new Promise(resolve=>{const unsubscribe=onAuthStateChanged(auth,user=>{unsubscribe();resolve(user);});});if(current&&!current.isAnonymous)return staff();return login();}try{state.user=await authReady();state.unsubscribe.push(onSnapshot(collection(db,'menu'),snap=>{state.menu=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>a.name.localeCompare(b.name));if(state.screen==='menu')customer();},e=>notice(errorText(e),'error')));customer();}catch(e){shell(`<section class="narrow"><h1>Unable to open the menu</h1><p>${esc(errorText(e))}</p></section>`);}}
start();
