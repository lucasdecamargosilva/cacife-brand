const test=require('node:test'),assert=require('node:assert/strict');
const {createReader}=require('./ml-auth');
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const base={serviceKey:'service',config:{clientId:'app',clientSecret:'private'}};
test('401 reloads credential rotated by the existing integration without refreshing',async()=>{
 let reads=0,oauth=0;const get=await createReader({...base,fetchImpl:async(url,opt)=>{if(url.includes('ml_tokens'))return response([{access_token:++reads===1?'old':'new'}]);if(url.includes('oauth'))oauth++;return opt.headers.Authorization==='Bearer new'?response({ok:true}):response({},401);}});
 assert.deepEqual(await get('/users/674281461'),{ok:true});assert.equal(oauth,0);
});
test('parallel 401 requests rotate once and save both tokens with server expiry',async()=>{
 let row={access_token:'old',refresh_token:'refresh'},oauth=0,patches=0;
 const fetchImpl=async(url,opt)=>{if(url.includes('ml_tokens')){if(opt.method==='PATCH'){patches++;assert.equal(new URL(url).searchParams.get('access_token'),'eq.old');row=JSON.parse(opt.body);return response([row]);}return response([{...row}]);}if(url.includes('/oauth/token')){oauth++;await new Promise(r=>setTimeout(r,10));return response({user_id:674281461,access_token:'new',refresh_token:'rotated',expires_in:3600});}return opt.headers.Authorization==='Bearer new'?response({ok:true}):response({},401);};
 const readers=await Promise.all([createReader({...base,fetchImpl}),createReader({...base,fetchImpl})]);await Promise.all(readers.map(get=>get('/orders/search')));assert.equal(oauth,1);assert.equal(patches,1);assert.equal(row.refresh_token,'rotated');assert(Math.abs(new Date(row.expires_at)-Date.now()-3600000)<5000);
});
test('revoked access reports reconnect without exposing the provider response or credentials',async()=>{
 let calls=0;const get=await createReader({...base,fetchImpl:async url=>{if(url.includes('ml_tokens'))return response([{access_token:'old',refresh_token:'private'}]);if(url.includes('oauth')){calls++;return response({error:'private'},400);}return response({},401);}});await assert.rejects(get('/orders/search'),e=>/Reconecte/.test(e.message)&&!e.message.includes('private'));assert.equal(calls,1);
});
test('failed persistence does not silently continue with an unsaved rotating token',async()=>{
 const get=await createReader({...base,fetchImpl:async(url,opt)=>url.includes('ml_tokens')?(opt.method==='PATCH'?response({},503):response([{access_token:'old',refresh_token:'r'}])):url.includes('oauth')?response({user_id:674281461,access_token:'new',refresh_token:'r2',expires_in:3600}):response({},401)});await assert.rejects(get('/orders/search'),/salvar/);
});
test('non-auth resource failures never trigger token rotation',async()=>{
 let calls=0;const get=await createReader({...base,fetchImpl:async url=>{calls++;return url.includes('ml_tokens')?response([{access_token:'old'}]):response({},403);}});await assert.rejects(get('/questions'),/403/);assert.equal(calls,2);
});

test('temporary rate limits retry the same resource without rotating credentials',async()=>{let attempts=0;const get=await createReader({...base,fetchImpl:async url=>{if(url.includes('ml_tokens'))return response([{access_token:'token'}]);assert(!url.includes('oauth'));attempts++;return attempts===1?response({},429):response({complete:true});}});assert.deepEqual(await get('/orders/search'),{complete:true});assert.equal(attempts,2);});
