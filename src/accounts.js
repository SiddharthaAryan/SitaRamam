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
  const periodOrders=orders.filter(o=>inPeriod(o.createdAt,date,period));
  const paidOrders=periodOrders.filter(o=>payments.has(o.id));
  const outstanding=periodOrders.filter(o=>!payments.has(o.id));
  const receipts=[...payments.values()].filter(p=>inPeriod(p.paidAt,date,period));
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
