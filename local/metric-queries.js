'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const M=require('../metricas-core'),{summarize}=require('./overview-summary');
function dates(input={},today=M.day(new Date())){
 let start=input.start,end=input.end;
 if(input.period){if(!['today','yesterday','7','15','30'].includes(String(input.period)))throw Error('Período inválido.');end=input.period==='yesterday'?M.shift(today,-1):today;start=['today','yesterday'].includes(input.period)?end:M.shift(end,1-Number(input.period));}
 M.range(start,end);if((new Date(end)-new Date(start))/86400000>365||new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start||new Date(end+'T12:00:00Z').toISOString().slice(0,10)!==end)throw Error('Selecione até 366 dias válidos.');return {start,end};
}
class MetricQueries{
 constructor(file=path.join(os.homedir(),'.cacife-local','metrics.sqlite')){
 if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS metric_periods(start TEXT NOT NULL,end TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,calculated_at TEXT NOT NULL,PRIMARY KEY(start,end));
 CREATE TABLE IF NOT EXISTS metric_channels(start TEXT NOT NULL,end TEXT NOT NULL,channel TEXT NOT NULL,revenue INTEGER NOT NULL,paid INTEGER NOT NULL,orders INTEGER NOT NULL,cancelled INTEGER NOT NULL,PRIMARY KEY(start,end,channel),FOREIGN KEY(start,end) REFERENCES metric_periods(start,end) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS metric_days(start TEXT NOT NULL,end TEXT NOT NULL,channel TEXT NOT NULL,day TEXT NOT NULL,revenue INTEGER NOT NULL,PRIMARY KEY(start,end,channel,day),FOREIGN KEY(start,end) REFERENCES metric_periods(start,end) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS metric_products(start TEXT NOT NULL,end TEXT NOT NULL,rank INTEGER NOT NULL,channel TEXT NOT NULL,product_id TEXT NOT NULL,title TEXT NOT NULL,revenue INTEGER NOT NULL,units INTEGER NOT NULL,PRIMARY KEY(start,end,rank),FOREIGN KEY(start,end) REFERENCES metric_periods(start,end) ON DELETE CASCADE);
 CREATE INDEX IF NOT EXISTS metric_products_sales ON metric_products(start,end,revenue DESC);`);
 this.read=this.db.prepare('SELECT version,payload,calculated_at FROM metric_periods WHERE start=? AND end=?');
 this.sales=this.db.prepare('SELECT channel,revenue,paid,orders,cancelled,CASE WHEN paid>0 THEN 1.0*revenue/paid ELSE 0 END AS ticket FROM metric_channels WHERE start=? AND end=? ORDER BY revenue DESC');
 this.daily=this.db.prepare('SELECT channel,day,revenue FROM metric_days WHERE start=? AND end=? ORDER BY day,channel');
 this.products=this.db.prepare('SELECT rank,channel,product_id AS id,title,revenue AS value,units FROM metric_products WHERE start=? AND end=? ORDER BY revenue DESC,rank LIMIT 5');
 this.put=this.db.prepare('INSERT INTO metric_periods VALUES(?,?,?,?,?)');this.channel=this.db.prepare('INSERT INTO metric_channels VALUES(?,?,?,?,?,?,?)');this.day=this.db.prepare('INSERT INTO metric_days VALUES(?,?,?,?,?)');this.product=this.db.prepare('INSERT INTO metric_products VALUES(?,?,?,?,?,?,?,?)');this.remove=this.db.prepare('DELETE FROM metric_periods WHERE start=? AND end=?');
 }
 sync(ml,ns,start,end){dates({start,end});const version=JSON.stringify(['v2-net',ml.queriedAt,ml.cache?.updatedAt,ns.queriedAt,ns.cache?.updatedAt]);const old=this.read.get(start,end);let value;
 if(old&&old.version===version)value=JSON.parse(old.payload);else{value=summarize(ml,ns,start,end);this.db.exec('BEGIN IMMEDIATE');try{this.remove.run(start,end);this.put.run(start,end,version,JSON.stringify(value),new Date().toISOString());for(const [id,b]of Object.entries(value.byChannel)){this.channel.run(start,end,id,b.revenue,b.paid,b.orders,b.cancelled);for(const [day,total]of Object.entries(b.byDay))this.day.run(start,end,id,day,total);}value.topProducts.forEach((p,i)=>this.product.run(start,end,i+1,p.channel,String(p.id),p.title,p.value,p.units));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 return {...value,refreshing:!!(ml.cache?.refreshing||ns.cache?.refreshing),warnings:[ml.cache?.error,ns.cache?.error].filter(Boolean)};
 }
 query(name,start,end){dates({start,end});const row=this.read.get(start,end);if(!row)return null;const meta={start,end,calculatedAt:row.calculated_at,currency:'BRL',moneyUnit:'centavos',criteria:{mercadolivre:'created_at',nuvemshop:'paid_at'}};
 if(name==='summary')return {...JSON.parse(row.payload),...meta};if(name==='sales')return {...meta,rows:this.sales.all(start,end)};if(name==='daily')return {...meta,rows:this.daily.all(start,end)};if(name==='top-products')return {...meta,rows:this.products.all(start,end)};throw Error('Consulta não disponível.');
 }
 close(){this.db.close();}
}
module.exports={MetricQueries,dates};
