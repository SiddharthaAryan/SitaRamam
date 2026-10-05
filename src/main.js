import './style.css';
import QRCode from 'qrcode';
import { accounts, day, csv } from './accounts.js';
import { icon, category, foodArt } from './visuals.js';
import { auth, authReady, configured, db } from './firebase.js';
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

const root = document.querySelector('#app');
const state = { menu: [], cart: {}, user: null, role: null, orders: [], payments: new Map(), status: '', unsubscribe: [], selected: null, date: day({toDate:()=>new Date()}), unpaidOnly: false, reportPeriod: 'day', search: '', paymentFilter: 'all', screen: 'menu', receipt: null, menuCategory:'All', menuSearch:'', lastSurface:'' };
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
function shell(body, staff=false) {
  const surface=staff?`staff-${state.role||'login'}-${state.selected||'orders'}`:state.screen;
  const entering=state.lastSurface!==surface;state.lastSurface=surface;
  const focus=document.activeElement?.id,caret=document.activeElement?.selectionStart;
  root.innerHTML=`<a class="skip-link" href="#main-content">Skip to content</a><header><a class="brand" href="${homeUrl}" aria-label="Rassense Night Mess home"><span class="brand-mark">r<span>.</span></span><span class="brand-copy">rassense<span>IIM JAMMU · NIGHT MESS</span></span></a><nav aria-label="Main navigation">${staff?`<a class="nav-link" href="${homeUrl}">${icon('back',16)} Student menu</a>`:`<a class="nav-link" href="${staffUrl}">${icon('lock',15)} Staff access</a>`}</nav></header><main id="main-content" class="${entering?'page-enter':''}">${body}</main><footer><span class="footer-mark">rassense<span> ✦ </span></span><span>A little comfort for your late nights.</span><span class="footer-campus">Made for IIM Jammu</span></footer>`;
  if(entering&&!staff)window.scrollTo({top:0,behavior:'instant'});
  if(focus&&staff){const target=document.getElementById(focus);if(target){target.focus();if(typeof caret==='number'&&target.setSelectionRange&&target.type==='text')target.setSelectionRange(caret,caret);}}
}
function steps(current) { return `<div class="order-steps" aria-label="Ordering progress">${['Choose your food','Review your order','Order & payment'].map((label,i)=>`<span class="${i===current?'current':i<current?'complete':''}"><b>${i<current?icon('check',12):i+1}</b><span>${label}</span></span>`).join('')}</div>`; }
function rememberName(){const input=root.querySelector('#customer-name');if(input)sessionStorage.setItem('customerName',input.value);}
function notice(message, kind='info') { state.status = message; const target = document.querySelector('#notice'); if (target) { target.hidden = false; target.className = `notice ${kind}`; target.textContent = message; } }
function clean() { state.unsubscribe.forEach(unsub => unsub()); state.unsubscribe = []; }
function itemRow(item) {
  const qty=state.cart[item.id]||0, group=category(item), tile=group==='Drinks'?'drinks':group==='Parathas'?'parathas':'bites';
  return `<article class="item ${qty?'chosen':''} ${item.available===false?'sold-out':''}"><div class="food-tile ${tile}">${foodArt(item.name)}${item.available===false?'<span class="sold-out-label">Sold out</span>':''}</div><div class="item-content"><span class="item-category">${group}</span><h3 class="item-title">${esc(item.name)}</h3>${item.description?`<p>${esc(item.description)}</p>`:''}<div class="item-bottom"><strong>${money(item.price)}</strong>${item.available===false?'<span class="muted">Back soon</span>':`<div class="stepper"><button data-item="${esc(item.id)}" data-delta="-1" ${qty===0?'disabled':''} aria-label="Remove ${esc(item.name)}">−</button><b aria-label="Quantity">${qty}</b><button data-item="${esc(item.id)}" data-delta="1" aria-label="Add ${esc(item.name)}">+</button></div>`}</div></div></article>`;
}
function selectedItems() { return state.menu.filter(x => state.cart[x.id] > 0 && x.available !== false).map(x => ({ id:x.id, name:x.name, price:x.price, qty:state.cart[x.id] })); }
function customer() {
  state.screen='menu';
  const items=selectedItems(), total=items.reduce((n,x)=>n+x.qty*x.price,0), quantity=items.reduce((n,x)=>n+x.qty,0);
  const needle=state.menuSearch.trim().toLowerCase();
  const menu=state.menu.filter(item=>(state.menuCategory==='All'||category(item)===state.menuCategory)&&(!needle||item.name.toLowerCase().includes(needle)));
  shell(`<section class="hero"><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-copy"><div class="eyebrow hero-label">${icon('spark',14)} THE NIGHT IS STILL YOUNG</div><h1>Late nights.<br><em>Good bites.</em></h1><p>Your favourites, a few taps away.<br>Choose. Order. Make the night delicious.</p><a href="#menu-section" class="hero-cta">Find your favourites ${icon('arrow',19)}</a><div class="hero-meta"><span>${icon('clock',15)} 11 PM – 3 AM</span><span>IIM Jammu</span></div></div><div class="hero-visual"><div class="food-halo"></div><div class="hero-food">${foodArt('maggie')}</div><span class="hero-note note-top">Freshly made ${icon('spark',14)}</span><span class="hero-note note-bottom">A little late-night comfort.</span><div class="hero-stars">✦</div></div></section>${steps(0)}<div id="notice" class="notice" hidden></div><div class="layout"><section id="menu-section" class="menu-section"><div class="section-head"><div><div class="eyebrow">THE GOOD STUFF</div><h2>What sounds good?</h2></div><span class="menu-count">${state.menu.length} favourites</span></div><div class="menu-tools"><div class="category-tabs" role="group" aria-label="Menu categories">${['All','Quick bites','Parathas','Drinks'].map(c=>`<button data-category="${c}" aria-pressed="${state.menuCategory===c}" class="${state.menuCategory===c?'active':''}">${c}</button>`).join('')}</div><label class="menu-search">${icon('search',17)}<span class="sr-only">Search the menu</span><input id="menu-search" type="search" placeholder="Find your craving…" value="${esc(state.menuSearch)}"/></label></div><div id="menu" class="menu-grid">${state.menu.length?(menu.length?menu.map(itemRow).join(''):'<div class="empty"><h3>No matches yet.</h3><p>Try another craving or category.</p></div>'):`<div class="empty menu-empty"><div class="empty-food">${foodArt('coffee')}</div><h3>We’re setting the table.</h3><p>The menu will appear here shortly.<br>For now, please order at the counter.</p></div>`}</div></section><aside class="cart" id="basket"><div class="cart-heading"><div><div class="eyebrow">YOUR LITTLE FEAST</div><h2>Your basket</h2></div><span class="cart-icon">${icon('bag',23)}${quantity?`<b>${quantity}</b>`:''}</span></div>${items.length?`<div class="basket-items">${items.map(x=>`<div class="cart-line"><span>${esc(x.name)}<small>${x.qty} × ${money(x.price)}</small></span><b>${money(x.qty*x.price)}</b></div>`).join('')}</div>`:`<div class="basket-empty">${icon('bag',35)}<p>Something delicious<br>belongs here.</p></div>`}<div class="total"><span>Total to pay</span><strong>${money(total)}</strong></div><label for="customer-name">Your name <span>so we know it’s yours</span></label><input id="customer-name" maxlength="40" autocomplete="name" placeholder="What should we call you?" value="${esc(sessionStorage.getItem('customerName')||'')}"/><button id="place" class="primary" ${!items.length?'disabled':''}>Review order ${icon('arrow',18)}</button>${sessionStorage.getItem('lastReceipt')?'<button id="last-bill" class="secondary last-bill">View last bill</button>':''}<p class="hint basket-hint">${icon('clock',14)} Usually ready in 10–15 minutes.</p><p class="hint fine-print">Pay by UPI or cash at the counter. Orders cannot be cancelled once placed.</p></aside></div>${items.length?`<div class="mobile-order-bar"><div><b>${money(total)}</b><span>${quantity} ${quantity===1?'item':'items'} in your basket</span></div><button id="mobile-review" class="primary">Review ${icon('arrow',18)}</button></div>`:''}`);
  root.querySelectorAll('[data-item]').forEach(button=>button.onclick=()=>{rememberName();const id=button.dataset.item;state.cart[id]=Math.max(0,Math.min(20,(state.cart[id]||0)+Number(button.dataset.delta)));customer();});
  root.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{rememberName();state.menuCategory=button.dataset.category;customer();});
  root.querySelector('#menu-search').oninput=e=>{const caret=e.target.selectionStart;rememberName();state.menuSearch=e.target.value;customer();const input=root.querySelector('#menu-search');input.focus();input.setSelectionRange(caret,caret);};
  root.querySelector('#customer-name').oninput=rememberName;
  root.querySelector('#place').onclick=review;
  const mobile=root.querySelector('#mobile-review');if(mobile)mobile.onclick=()=>{if(root.querySelector('#customer-name').value.trim().length>=2)return review();root.querySelector('#basket').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});root.querySelector('#customer-name').focus({preventScroll:true});};
  const last=root.querySelector('#last-bill');if(last)last.onclick=async()=>{try{const saved=JSON.parse(sessionStorage.getItem('lastReceipt'));const snapshot=await getDoc(doc(db,'orders',saved.id));if(!snapshot.exists()||snapshot.data().customerUid!==state.user.uid)throw new Error('This bill is not available for this browser.');const order=snapshot.data();confirmation(saved.id,order.customerName,order.total,order.items);}catch(e){notice(errorText(e),'error');}};
}
function review() {
  const name=root.querySelector('#customer-name').value.trim();
  if (name.length < 2 || name.length > 40) return notice('Please enter a name (2–40 characters).','error');
  sessionStorage.setItem('customerName',name);
  const items=selectedItems(); if (!items.length || items.length > 8) return notice('Choose between 1 and 8 different items.','error');
  const total=items.reduce((sum,x)=>sum+x.price*x.qty,0);
  state.screen='review';
  shell(`${steps(1)}<section class="narrow review-screen"><div class="eyebrow">ONE LAST LOOK</div><h1>Looks delicious.</h1><p>A little feast for <b>${esc(name)}</b>.</p><div class="panel receipt"><div class="receipt-heading"><span>YOUR ORDER</span><span>${items.reduce((n,x)=>n+x.qty,0)} items</span></div>${items.map(x=>`<div class="cart-line"><span>${esc(x.name)}<small>${x.qty} × ${money(x.price)}</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="total"><span>Total to pay</span><strong>${money(total)}</strong></div><div class="receipt-footer">${icon('clock',16)} Freshly prepared · usually 10–15 min</div></div><div id="notice" class="notice" hidden></div><div class="actions"><button id="back" class="secondary">${icon('back',17)} Edit order</button><button id="confirm" class="primary">Place order · ${money(total)} ${icon('arrow',17)}</button></div><p class="hint">Get your order number first, then pay by UPI or at the counter. Only the owner records payment.</p></section>`);
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
  shell(`${steps(2)}<section class="success"><div class="success-heading"><div class="success-check">${icon('check',30)}<span></span></div><div class="eyebrow">YOUR LATE-NIGHT FIX IS IN</div><h1>Order placed.<br><em>Good food awaits.</em></h1><p>${esc(name)}, keep this number. It’s your ticket to something delicious.</p></div><div class="checkout-grid"><div><div class="order-ticket"><span>YOUR ORDER NUMBER</span><div class="number">#${esc(id)}</div><p>Show this number at the counter.</p><div class="ticket-notch notch-left"></div><div class="ticket-notch notch-right"></div></div><div class="panel receipt"><div class="receipt-heading"><span>YOUR BILL</span><strong class="badge unpaid">UNPAID</strong></div>${items.map(x=>`<div class="cart-line"><span>${esc(x.name)}<small>${x.qty} × ${money(x.price)}</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="total"><span>Total to pay</span><strong>${money(total)}</strong></div><div class="receipt-footer">Status when placed · current payment record at counter</div></div><div class="actions"><button id="print-customer" class="secondary">${icon('print',17)} Print / save bill</button><button id="another" class="secondary">Order something else ${icon('arrow',17)}</button></div></div><div class="panel payment-panel"><div class="eyebrow">THE NEXT LITTLE STEP</div><h2>Time to pay.</h2><div class="payment-amount">${money(total)}<span>UPI or cash · your choice</span></div><div class="qr-frame"><img id="payment-qr" width="240" height="240" alt="UPI payment QR for this bill"/><span>Scan with any UPI app</span></div><a class="primary link-button" href="${esc(paymentUrl)}">Open UPI app ${icon('arrow',18)}</a><p class="hint">On this phone, use the button. On another device, scan the QR. If the app does not open, use the counter QR and enter ${money(total)}.</p><div class="payment-note">${icon('lock',18)}<p>After paying, give <b>#${esc(id)}</b> to the counter. The owner confirms payment. You can also pay after eating.</p></div><p class="recipient">Paytm · paytm.s119vgx@pty<br>Check the recipient in your UPI app before paying.</p></div></div><p class="hint receipt-reminder">Keep your bill or take a screenshot. You can reopen the last bill in this browser session.</p></section>`);
  const qr=root.querySelector('#payment-qr');
  QRCode.toDataURL(paymentUrl,{width:280,margin:3,errorCorrectionLevel:'M'}).then(url=>{if(qr.isConnected)qr.src=url;}).catch(()=>{qr.hidden=true;});
  root.querySelector('#print-customer').onclick=()=>printReceipt(state.receipt,'UNPAID');
  root.querySelector('#another').onclick=customer;
}
async function login() {
  state.role=null;
  shell(`<section class="login-layout"><div class="login-intro"><div class="eyebrow">BEHIND THE GOOD FOOD</div><h1>Your counter.<br><em>Everything in view.</em></h1><p>A calmer queue. A clearer ledger.<br>A better night for everyone.</p><div class="login-art">${foodArt('maggie')}<span class="login-art-note">${icon('check',14)} Orders · Payments · Accounts</span></div><div class="login-intro-bottom">Made for the people who keep the kitchen moving.</div></div><div class="login-card"><span class="login-lock">${icon('lock',24)}</span><div class="eyebrow">STAFF ACCESS</div><h2>Welcome back.</h2><p>Choose your station. We’ll take it from here.</p><form id="login"><label for="station">Your station</label><select id="station" name="station"><option value="owner">Counter / owner</option><option value="kitchen">Kitchen</option></select><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password" placeholder="Enter your station password"/><button class="primary">Sign in →</button></form><div id="notice" class="notice" hidden></div><p class="hint">Owner: payments & accounts.<br>Kitchen: prepare, serve & keep the queue moving.</p></div></section>`,true);
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
  shell(`<section class="staff-top"><div><div class="eyebrow">LIVE OPERATIONS</div><h1>${owner?'Counter & accounts':'Kitchen queue'}</h1><p>${owner?'Orders, payments and service in one place.':'Prepare, serve and clear each order.'}</p></div><button id="logout" class="secondary">Sign out</button></section><div id="notice" class="notice" hidden></div><div class="metrics"><div><b>${active.length}</b><span>In kitchen queue</span></div><div><b>${owner?periodOrders.length:orders.length}</b><span>${owner?'Orders in period':'Orders loaded'}</span></div>${owner?`<div><b>${money(sales)}</b><span>Orders placed · ${period}</span></div><div><b>${paidOrders.length} / ${outstanding.length}</b><span>Paid / unpaid orders</span></div><div><b>${money(paidOrderValue)}</b><span>Paid order value · ${period}</span></div><div><b>${money(report.outstandingValue)}</b><span>Outstanding on orders · ${period}</span></div><div><b>${money(received)}</b><span>Payments received · ${period}</span></div><div><b>${money(report.upi)} / ${money(report.cash)}</b><span>UPI / cash received · ${period}</span></div>`:''}</div>${owner?`<nav class="tabs"><button id="orders-tab" class="${state.selected!=='menu'?'active':''}">Orders & accounts</button><button id="menu-tab" class="${state.selected==='menu'?'active':''}">Edit menu</button></nav>`:''}<div id="staff-content"></div>` ,true);
  root.querySelector('#logout').onclick=async()=>{clean();await signOut(auth);state.user=null;state.role=null;login();};
  if(owner){root.querySelector('#orders-tab').onclick=()=>{state.selected='orders';renderStaff();};root.querySelector('#menu-tab').onclick=()=>{state.selected='menu';renderStaff();};}
  const target=root.querySelector('#staff-content');
  if(owner && state.selected==='menu') return renderMenu(target);
  target.innerHTML=`${owner?`<div class="report-controls"><label>Report <select id="report-period"><option value="day" ${period==='day'?'selected':''}>Day</option><option value="month" ${period==='month'?'selected':''}>Month</option></select></label><label>${period==='month'?'Month':'Date'} <input id="report-date" type="${period==='month'?'month':'date'}" value="${period==='month'?state.date.slice(0,7):state.date}"/></label><button class="secondary" id="unpaid-all">${state.unpaidOnly?'Show selected period':'Show all unpaid ('+unpaid.length+')'}</button><button class="secondary" id="export-csv">Export ${period} orders</button><button class="secondary" id="export-payments">Export ${period} collections</button><label>Find an order<input id="order-search" placeholder="Order number or name" value="${esc(state.search)}"/></label><label>Payment<select id="payment-filter"><option value="all" ${state.paymentFilter==='all'?'selected':''}>All</option><option value="paid" ${state.paymentFilter==='paid'?'selected':''}>Paid</option><option value="unpaid" ${state.paymentFilter==='unpaid'?'selected':''}>Unpaid</option></select></label></div><p class="hint">Sales are the value of orders placed in this period. Payments received are grouped by payment date, so late payments can appear in a later period. Unpaid orders remain outstanding even after food is given.</p>`:''}<div class="section-head"><h2>${owner?(state.unpaidOnly?'All unpaid orders':'Orders for '+(period==='month'?state.date.slice(0,7):state.date)):'Orders to make'}</h2><span class="pill live-pill"><i></i> Updates live</span></div><div class="order-grid">${(owner?filtered.slice().reverse():active).map(x=>orderCard(x,owner)).join('')||'<div class="empty">No orders in this view.</div>'}</div>`;
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
