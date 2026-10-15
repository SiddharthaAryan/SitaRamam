// Some competing client transactions are rejected by cross-document rules before
// the SDK classifies them as conflicts. Retry only when the counter actually moved.
export async function retryCounterWrite(save,counterMoved,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 for(let attempt=0;;attempt++){
  try{return await save();}catch(error){
   if(attempt>=31||!['permission-denied','aborted'].includes(error.code))throw error;
   await wait(Math.min(1000,80*2**attempt)+Math.floor(Math.random()*250));
   if(!await counterMoved())throw error;
  }
 }
}
