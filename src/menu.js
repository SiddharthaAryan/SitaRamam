// Transcribed from the Rassense IIM Jammu printed night menu.
export const PRINTED_MENU = [
  {id:'veg-maggie',name:'Veg Maggie',price:50,description:''},
  {id:'omelette-single',name:'Omelette · Single',price:30,description:'1 egg · 2 pieces of bread'},
  {id:'omelette-double',name:'Omelette · Double',price:50,description:'2 eggs · 4 pieces of bread'},
  {id:'tea',name:'Tea',price:20,description:''},
  {id:'coffee',name:'Coffee',price:25,description:''},
  {id:'paneer-pakoda',name:'Paneer Pakoda',price:100,description:'6 pieces'},
  {id:'french-fries',name:'French Fries',price:80,description:'Single portion'},
  {id:'aloo-paratha',name:'Aloo Paratha',price:40,description:'1 piece · pickle & chutney'},
  {id:'paneer-paratha',name:'Paneer Paratha',price:60,description:'1 piece · pickle & chutney'},
  {id:'chicken-sandwich',name:'Chicken Sandwich',price:150,description:'2 pieces'},
  {id:'chicken-frankie',name:'Chicken Frankie',price:150,description:'1 piece'},
  {id:'chicken-nuggets',name:'Chicken Nuggets',price:175,description:'8 pieces'},
].map(item=>({...item,name:item.description?`${item.name} · ${item.description}`:item.name,available:true}));
export function menuOrder(a,b) {
  const rank=id=>{const index=PRINTED_MENU.findIndex(item=>item.id===id);return index<0?PRINTED_MENU.length:index;};
  return rank(a.id)-rank(b.id)||a.name.localeCompare(b.name);
}
