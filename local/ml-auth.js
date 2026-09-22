'use strict';
const ROOT='https://api.mercadolibre.com';
const STORE='https://quantic-supabase.k5jwra.easypanel.host/rest/v1/ml_tokens';
const SELLER='674281461';
const flights=new WeakMap();
const RECONNECT='A autorização do Mercado Livre expirou ou foi revogada. Reconecte a conta da Cacife.';

async function createReader({serviceKey,config={},fetchImpl=fetch}){
 const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey};
 async function send(url,options={}){
  try{return await fetchImpl(url,{...options,signal:AbortSignal.timeout(25000),redirect:'error'});}
  catch{throw new Error('Não foi possível consultar a integração do Mercado Livre. Tente novamente.');}
 }
 async function read(){
  const r=await send(STORE+'?select=access_token,refresh_token,expires_at&user_id=eq.'+SELLER+'&limit=1',{headers});
  if(!r.ok)throw new Error('Não foi possível acessar a credencial do Mercado Livre.');
  const row=(await r.json())[0];
  if(!row?.access_token)throw new Error(RECONNECT);
  return row;
 }
 let token=await read();
 async function recover(rejected){
  let group=flights.get(fetchImpl);if(!group){group=new Map();flights.set(fetchImpl,group);}
  if(group.has(serviceKey))return group.get(serviceKey);
  const work=(async()=>{
   // Production may already have rotated the shared credential; use its latest value first.
   const current=await read();
   if(current.access_token!==rejected)return current;
   if(!config.clientId||!config.clientSecret||!current.refresh_token)throw new Error(RECONNECT);
   const r=await send(ROOT+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:String(config.clientId),client_secret:config.clientSecret,refresh_token:current.refresh_token}).toString()});
   if(!r.ok){
    const latest=await read();if(latest.access_token!==rejected)return latest;
    if(r.status===400||r.status===401)throw new Error(RECONNECT);
    throw new Error('O Mercado Livre não conseguiu renovar o acesso agora. Tente novamente.');
   }
   const renewed=await r.json();
   if(String(renewed.user_id)!==SELLER||!renewed.access_token||!renewed.refresh_token||!Number.isFinite(renewed.expires_in)||renewed.expires_in<=0)throw new Error('A renovação retornou uma credencial inválida para a Cacife.');
   const saved={access_token:renewed.access_token,refresh_token:renewed.refresh_token,expires_at:new Date(Date.now()+renewed.expires_in*1000).toISOString(),updated_at:new Date().toISOString()};
   // Compare-and-set: never overwrite a credential rotated concurrently by another process.
   const query=new URLSearchParams({user_id:'eq.'+SELLER,access_token:'eq.'+current.access_token});
   const write=await send(STORE+'?'+query,{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(saved)});
   if(!write.ok)throw new Error('O acesso foi renovado, mas não foi possível salvar a credencial. Tente novamente.');
   const rows=await write.json();
   if(rows.length)return saved;
   return read();
  })();
  group.set(serviceKey,work);
  try{return await work;}finally{if(group.get(serviceKey)===work)group.delete(serviceKey);}
 }
 return async function get(route){
  if(!route.startsWith('/')||route.startsWith('//'))throw new Error('Recurso inválido.');
  const request=async t=>{
   for(let attempt=0;attempt<5;attempt++){
    const response=await send(ROOT+route,{headers:{Authorization:'Bearer '+t.access_token}});
    if((response.status!==429&&!(response.status>=500))||attempt===4)return response;
    const retry=Number(response.headers?.get('retry-after'));
    await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1000,Number.isFinite(retry)&&retry>0?retry*1000:1000*2**attempt))));
   }
  };
  let used=token,r=await request(used);
  if(r.status===401){
   token=await recover(used.access_token);used=token;r=await request(used);
   // A newer stored token can itself be expired. Renew once, with a bounded final retry.
   if(r.status===401){token=await recover(used.access_token);r=await request(token);}
  }
  if(r.status===401)throw new Error(RECONNECT);
  if(!r.ok)throw new Error('Recurso indisponível no Mercado Livre (HTTP '+r.status+').');
  return r.json();
 };
}
module.exports={createReader};
