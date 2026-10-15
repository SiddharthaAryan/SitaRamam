const istDate = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
export function day(value) {
  if (!value?.toDate) return '';
  const parts = Object.fromEntries(istDate.formatToParts(value.toDate()).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function inPeriod(value, date, period) {
  const stamp=day(value);
  return Boolean(stamp) && (period==='month'?stamp.slice(0,7)===date.slice(0,7):stamp===date);
}
export function accounts(orders, payments, date, period='day') {
  const periodOrders=orders.filter(o=>{if(!o.createdAt?.toDate)return false;const stamp=serviceDay(o.createdAt.toDate());return period==='month'?stamp.slice(0,7)===date.slice(0,7):stamp===date;});
  const paidOrders=periodOrders.filter(o=>payments.has(o.id));
  const outstanding=periodOrders.filter(o=>!payments.has(o.id));
  const receipts=[...payments.values()].filter(p=>{if(!p.paidAt?.toDate)return false;const stamp=serviceDay(p.paidAt.toDate());return period==='month'?stamp.slice(0,7)===date.slice(0,7):stamp===date;});
  const sum=(rows,key)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
  return {periodOrders,paidOrders,outstanding,receipts,sales:sum(periodOrders,'total'),paidOrderValue:sum(paidOrders,'total'),outstandingValue:sum(outstanding,'total'),received:sum(receipts,'amount'),cash:sum(receipts.filter(p=>p.method==='cash'),'amount'),upi:sum(receipts.filter(p=>p.method==='upi'),'amount')};
}
export function csv(rows) {
  return '\ufeff'+rows.map(row=>row.map(value=>{
    let text=String(value??'');
    // Prevent names and menu text being interpreted as spreadsheet formulas.
    if (/^[=+@\-\t\r]/.test(text)) text="'"+text;
    return `"${text.replaceAll('"','""')}"`;
  }).join(',')).join('\r\n');
}


// A service night ends at 06:00 IST, so midnight does not split the queue.
export function serviceDay(date=new Date()){return day({toDate:()=>new Date(date.getTime()-6*60*60*1000)});}
export function periodBounds(date,period='day',service=false){
 const first=period==='month'?date.slice(0,7)+'-01':date;
 const start=new Date(first+'T'+(service?'06':'00')+':00:00+05:30');
 const next=new Date(first+'T12:00:00Z');if(period==='month')next.setUTCMonth(next.getUTCMonth()+1);else next.setUTCDate(next.getUTCDate()+1);const end=new Date(next.toISOString().slice(0,10)+'T'+(service?'06':'00')+':00:00+05:30');
 return {start,end};
}
