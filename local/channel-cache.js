'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
// Only sanitized channel responses belong here. Authentication is checked by the route before every read.
class ChannelCache{
 constructor(directory=path.join(os.homedir(),'.cacife-local','channel-cache')){this.directory=directory;this.entries=new Map();this.pending=new Map();this.failures=new Map();try{for(const file of fs.readdirSync(directory)){if(!file.endsWith('.json'))continue;try{const e=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));if(e.version===1&&e.key&&e.data&&Number.isFinite(e.updated))this.entries.set(e.key,e);}catch{}}}catch{}}
 async put(key,data,updated=Date.now()){const entry={version:1,key,data,updated};this.entries.set(key,entry);await fs.promises.mkdir(this.directory,{recursive:true});const file=path.join(this.directory,createHash('sha256').update(key).digest('hex')+'.json');const tmp=file+'.tmp';await fs.promises.writeFile(tmp,JSON.stringify(entry));await fs.promises.rename(tmp,file);return entry;}
 coveringOrders(start,end){return [...this.entries.values()].filter(e=>e.key.startsWith('ml-orders:')).filter(e=>{const [,a,b]=e.key.split(':');return a<=start&&b>=end;}).sort((a,b)=>b.updated-a.updated)[0];}
 async get(key,load,{ttl=120000,force=false,seed}={}){
  let entry=this.entries.get(key);if(!entry&&seed){entry={version:1,key,data:seed.data,updated:seed.updated};this.entries.set(key,entry);}
  const stale=!entry||Date.now()-entry.updated>=ttl;
  const failure=this.failures.get(key);
  if((force||stale)&&!this.pending.has(key)&&(force||!failure||Date.now()-failure.at>30000)){
   const work=Promise.resolve().then(load).then(async data=>{await this.put(key,data);this.failures.delete(key);return data;}).catch(error=>{this.failures.set(key,{at:Date.now(),message:error.message});throw error;}).finally(()=>this.pending.delete(key));this.pending.set(key,work);work.catch(()=>{});
  }
  if(!entry){await this.pending.get(key);entry=this.entries.get(key);if(!entry)throw new Error(this.failures.get(key)?.message||'Consulta indisponível.');}
  return {...entry.data,cache:{updatedAt:new Date(entry.updated).toISOString(),refreshing:this.pending.has(key),stale:Date.now()-entry.updated>=ttl,error:this.failures.get(key)?.message||null}};
 }
}
module.exports={ChannelCache};
