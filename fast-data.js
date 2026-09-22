(function(root){'use strict';
 const memory=new Map(),pending=new Map(),prefix='cacife-view-v1:';
 function read(key){if(memory.has(key))return memory.get(key);try{const value=JSON.parse(sessionStorage.getItem(prefix+key));if(value&&Date.now()-value.at<600000){memory.set(key,value);return value;}}catch{}return null;}
 function save(key,data){const entry={at:Date.now(),data};memory.set(key,entry);try{const text=JSON.stringify(entry);if(text.length<1200000)sessionStorage.setItem(prefix+key,text);}catch{}return data;}
 async function get(key,load,force=false){const old=read(key);if(!force&&old&&Date.now()-old.at<5000)return old.data;
 if(!pending.has(key)){const work=Promise.resolve().then(load).then(data=>save(key,data)).catch(error=>{if(old)save(key,{...old.data,refreshing:false,cache:{...old.data.cache,refreshing:false,stale:true,error:error.message}});throw error;}).finally(()=>pending.delete(key));pending.set(key,work);work.catch(()=>{});}
 if(!force&&old&&Date.now()-old.at<600000)return {...old.data,refreshing:true,cache:{...old.data.cache,refreshing:true,stale:true}};
 return pending.get(key);
 }
 root.CacifeFastData={get};
})(window);
