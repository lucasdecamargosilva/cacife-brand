document.addEventListener('DOMContentLoaded', async () => {
 'use strict';
 const M=window.CacifeMetrics, el=id=>document.getElementById('metrics-'+id);
 const channels=['shopee','tiktokshop','mercadolivre','nuvemshop'].map(id=>M.channels.find(c=>c.id===id));
 const all={id:'all',name:'Total Geral',available:true};
 const colors={shopee:'#ee4d2d',tiktokshop:'#161616',mercadolivre:'#f2c200',nuvemshop:'#2c83ff'};
 const brl=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
 const number=value=>new Intl.NumberFormat('pt-BR').format(value);
 const short=value=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(value);
 const displayDate=date=>date.split('-').reverse().join('/');
 const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 let client,generation=0,exportSummary=null;
 el('end').value=M.day(new Date());el('start').value=M.shift(el('end').value,-29);
 function icon(id){const n=node('span','platform-icon '+id);n.setAttribute('aria-hidden','true');if(id==='shopee'||id==='tiktokshop'){n.classList.add('official-channel-icon');const img=node('img');img.src=id+'-logo.'+(id==='shopee'?'png':'ico');img.alt='';n.append(img);}else if(id==='nuvemshop'||id==='mercadolivre'){n.classList.add('channel-emblem');const img=node('img');img.src=id+'-logo.png';img.alt='';n.append(img);}else n.append(node('i','ph '+({shopee:'ph-bag',mercadolivre:'ph-handshake',all:'ph-shopping-cart'}[id])));return n;}
 function empty(target,text){target.replaceChildren();const n=node('div','chart-empty');n.append(node('i','ph ph-chart-line'),node('span','',text));target.append(n);}
 function notice(text,state=''){el('notice').textContent=text;el('notice').dataset.state=state;el('notice').hidden=!text;}
 function included(c,selected){return c.available&&(selected==='all'||selected===c.id||c.id==='all');}
 function bucket(summary,c){return c.id==='all'?summary:(summary?.byChannel[c.id]||{revenue:0,paid:0,orders:0});}
 function delta(value,old){if(!old)return {text:'Sem base anterior',style:''};const p=(value/old-1)*100;return {text:(p>=0?'↑ ':'↓ ')+Math.abs(p).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%',style:p>=0?'positive':'negative'};}
 function cards(summary,previous,selected,state){
  el('results').replaceChildren();
  if(selected!=='all'){
   const b=summary?bucket(summary,{id:selected}):null,bp=previous?bucket(previous,{id:selected}):null;
   const v=b?{revenue:b.revenue,paid:b.paid,orders:b.orders,ticket:b.paid?b.revenue/b.paid:0}:null;
   const vp=bp?{revenue:bp.revenue,paid:bp.paid,orders:bp.orders,ticket:bp.paid?bp.revenue/bp.paid:0}:null;
   for(const [label,key,format]of [['Vendas confirmadas','revenue',brl],['Pedidos pagos','paid',number],['Ticket médio','ticket',brl],['Total de pedidos','orders',number]]){
    const card=node('div','channel-card '+selected),heading=node('div','channel-card-title');heading.append(icon(selected),node('span','',label));card.append(heading,node('strong','channel-kpi',v?format(v[key]):'—'));
    const d=v?delta(v[key],vp?.[key]):{text:state,style:''};card.append(node('p','card-delta '+d.style,d.text));el('results').append(card);
   }return;
  }
  for(const c of [...channels,all]){
   const ready=!!summary&&included(c,selected),b=bucket(summary,c),p=bucket(previous,c);
   const card=node('button','channel-card '+c.id+(selected===c.id&&selected!=='all'?' selected':''));card.type='button';card.dataset.channel=c.id;
   const heading=node('div','channel-card-title');heading.append(icon(c.id),node('span','',c.name));card.append(heading);
   const stats=node('div','card-stats');
   for(const [key,label] of [['revenue','Vendas'],['paid','Pedidos pagos']]){
    const group=node('div');const value=node('strong','',ready?(key==='revenue'?brl(b?.[key]):number(b?.[key])):'—');
    if(c.id==='all')value.id='metrics-'+key;
    const d=ready?delta(b?.[key],p?.[key]):{text:'—',style:''};group.append(node('small','',label),value,node('span','card-delta '+d.style,d.text));stats.append(group);
   }
   const liq=node('p','card-liquido',ready?'Líquido: '+brl(b?.net??b?.revenue):'Líquido: —');liq.style.cssText='margin-top:8px;font-size:11px;font-weight:700;opacity:.92';
   card.append(stats,liq,node('p','card-status',!c.available?'Conexão não configurada':!included(c,selected)?'Fora do filtro':summary?'vs. período anterior':state));
   card.addEventListener('click',()=>selectChannel(c.id));el('results').append(card);
  }
 }
 function table(summary,selected){
  el('channels').replaceChildren();
  for(const c of [...channels,all]){
   const ready=summary&&included(c,selected),b=bucket(summary,c),tr=node('tr',c.id==='all'?'total-row':'');
   const name=node('td'),nameWrap=node('span','platform-name');nameWrap.append(icon(c.id),node('span','',c.name));name.append(nameWrap);tr.append(name);
   for(const value of [ready?brl(b?.revenue):'—',ready?brl(b?.net??b?.revenue):'—',ready?number(b?.paid):'—',ready&&b?.paid?brl(b.revenue/b.paid):'—','—'])tr.append(node('td','',value));
   tr.lastChild.title='Visitas por canal ainda não conectadas';el('channels').append(tr);
  }
 }
 function legends(selected='all'){for(const target of ['legend','evolution-legend']){el(target).replaceChildren();for(const c of channels.filter(c=>selected==='all'||c.id===selected)){const item=node('span','legend-item'),dot=node('span','dot');dot.style.backgroundColor=colors[c.id];item.append(dot,node('span','',c.name));el(target).append(item);}}}
 function svgElement(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
 const chartTip=node('div','overview-chart-tooltip');chartTip.id='overview-chart-tooltip';chartTip.setAttribute('role','tooltip');chartTip.hidden=true;document.body.append(chartTip);
 function detailTip(element,lines){element.setAttribute('tabindex','0');element.setAttribute('aria-label',lines.join('. '));element.style.cursor='crosshair';function show(event){chartTip.replaceChildren(...lines.map((line,i)=>{const row=node(i?'div':'strong','',line);const channel=channels.find(c=>line===c.name||line.startsWith(c.name+':'));if(channel){const dot=node('span','tooltip-channel-dot');dot.style.backgroundColor=colors[channel.id];row.prepend(dot);}return row;}));chartTip.hidden=false;const box=element.getBoundingClientRect(),x=event?.clientX??box.x+box.width/2,y=event?.clientY??box.y;const width=chartTip.offsetWidth,height=chartTip.offsetHeight;chartTip.style.left=Math.max(8,Math.min(innerWidth-width-8,x+14))+'px';chartTip.style.top=Math.max(8,Math.min(innerHeight-height-8,y+14))+'px';}function hide(){chartTip.hidden=true;}element.addEventListener('pointerenter',show);element.addEventListener('pointermove',show);element.addEventListener('pointerleave',hide);element.addEventListener('focus',()=>show());element.addEventListener('blur',hide);element.addEventListener('click',show);element.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});}
 function series(summary,start,end,cumulative,target){
  if(!summary||!summary.orders){empty(target,summary?'Nenhum pedido encontrado no período.':'Aguardando dados dos canais');return;}
  const dates=[];for(let d=start;d<=end;d=M.shift(d,1))dates.push(d);
  const datasets=channels.filter(c=>summary.byChannel[c.id]).map(c=>{let total=0;return {c,values:dates.map(d=>{const value=summary.byChannel[c.id].byDay[d]||0;total+=value;return cumulative?total:value;})};});
  const max=Math.max(100,...datasets.flatMap(s=>s.values)),w=440,h=180,l=48,r=10,t=10,b=26;
  const svg=svgElement('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':(cumulative?'Vendas acumuladas':'Vendas diárias')+' por canal, total '+brl(summary.revenue)});
  for(let i=0;i<=4;i++){const y=t+(h-t-b)*i/4;svg.append(svgElement('line',{x1:l,y1:y,x2:w-r,y2:y,stroke:'var(--line)','stroke-width':'.5'}),svgElement('text',{x:l-7,y:y+3,'text-anchor':'end'},'R$ '+short(max*(1-i/4)/100)));}
  const x=i=>l+i/Math.max(1,dates.length-1)*(w-l-r),y=v=>h-b-v/max*(h-t-b);
  for(const {c,values}of datasets){svg.append(svgElement('polyline',{points:values.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:colors[c.id],'stroke-width':2}));for(let i=0;i<values.length;i++){const circle=svgElement('circle',{cx:x(i),cy:y(values[i]),r:dates.length>60?1.5:2.5,fill:colors[c.id]});circle.append(svgElement('title',{},`${c.name} · ${displayDate(dates[i])}: ${brl(values[i])}`));svg.append(circle);}}
  const indices=[...new Set([0,Math.floor((dates.length-1)/2),dates.length-1])];for(const i of indices)svg.append(svgElement('text',{x:x(i),y:h-5,'text-anchor':i===0?'start':i===dates.length-1?'end':'middle'},dates[i].slice(5).split('-').reverse().join('/')));
  for(let i=0;i<dates.length;i++){const left=i===0?l:(x(i-1)+x(i))/2,right=i===dates.length-1?w-r:(x(i)+x(i+1))/2;const hit=svgElement('rect',{x:left,y:t,width:Math.max(1,right-left),height:h-t-b,fill:'transparent',class:'chart-hover-zone'});detailTip(hit,[displayDate(dates[i])+(cumulative?' · Acumulado':' · Vendas do dia'),...datasets.map(d=>d.c.name+': '+brl(d.values[i])),'Total: '+brl(datasets.reduce((sum,d)=>sum+d.values[i],0))]);svg.append(hit);}
  target.replaceChildren(svg);
 }
 function share(summary,selected){
  const target=el('share');target.replaceChildren();const donut=node('div','donut'),svg=svgElement('svg',{viewBox:'0 0 120 120',role:'group','aria-label':'Participação nas vendas'});
  svg.append(svgElement('circle',{cx:60,cy:60,r:46,fill:'none',stroke:'var(--line)','stroke-width':16}));let offset=0;
  if(summary?.revenue>0)for(const c of channels){const amount=summary.byChannel[c.id]?.revenue||0;if(amount<=0)continue;const fraction=amount/summary.revenue*100;const arc=svgElement('circle',{cx:60,cy:60,r:46,pathLength:100,fill:'none',stroke:colors[c.id],'stroke-width':16,'stroke-dasharray':`${fraction} ${100-fraction}`,'stroke-dashoffset':-offset});detailTip(arc,[c.name,brl(amount),fraction.toLocaleString('pt-BR',{maximumFractionDigits:1})+'% das vendas',number(summary.byChannel[c.id]?.paid||0)+' pedidos pagos']);svg.append(arc);offset+=fraction;}
  const center=node('div','donut-center');center.append(node('small','','Vendas'),node('strong','',summary?brl(summary.revenue):'—'),node('small','','Total'));donut.append(svg,center);target.append(donut);
  const legend=node('div','share-legend');for(const c of channels){const row=node('div','share-row'),dot=node('span','dot');dot.style.backgroundColor=colors[c.id];const name=node('span','',c.name),ready=summary&&included(c,selected),value=summary?.byChannel[c.id]?.revenue||0;name.append(node('small','',!c.available?'Não configurado':ready?brl(value):'Dados indisponíveis'));row.append(dot,name,node('strong','',ready&&summary.revenue>0?(value/summary.revenue*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'));if(ready)detailTip(row,[c.name,brl(value),'Pedidos pagos: '+number(summary.byChannel[c.id]?.paid||0)]);legend.append(row);}target.append(legend);
 }
 function bars(summary,selected){
  if(!summary){empty(el('bars'),'Pedidos aguardando consulta');return;}
  const svg=svgElement('svg',{viewBox:'0 0 330 190',role:'img','aria-label':'Pedidos pagos por plataforma'}),max=Math.ceil(Math.max(4,...channels.map(c=>summary.byChannel[c.id]?.paid||0))/4)*4;
  for(let i=0;i<=4;i++){const y=12+138*i/4;svg.append(svgElement('line',{x1:30,y1:y,x2:325,y2:y,stroke:'var(--line)','stroke-width':'.5'}),svgElement('text',{x:25,y:y+3,'text-anchor':'end'},short(max*(1-i/4))));}
  channels.forEach((c,i)=>{const ready=included(c,selected),value=summary.byChannel[c.id]?.paid||0,x=43+i*73,height=value/max*138;svg.append(svgElement('rect',{x,y:150-height,width:42,height:Math.max(1,height),rx:4,fill:ready?colors[c.id]:'var(--line)'}),svgElement('text',{x:x+21,y:143-height,'text-anchor':'middle'},ready?number(value):'—'));const label=svgElement('text',{x:x+21,y:166,'text-anchor':'middle'});const words=c.name.split(' ');words.forEach((word,j)=>label.append(svgElement('tspan',{x:x+21,dy:j?11:0},word)));svg.append(label);const hit=svgElement('rect',{x:x-8,y:10,width:58,height:174,fill:'transparent',class:'chart-hover-zone'});detailTip(hit,[c.name,ready?number(value)+' pedidos pagos':'Conexão não configurada',...(ready?['Vendas: '+brl(summary.byChannel[c.id]?.revenue||0)]:[])]);svg.append(hit);});el('bars').replaceChildren(svg);
 }
 function products(summary){const target=el('products');target.replaceChildren();if(!summary){target.append(node('p','chart-empty','Aguardando dados dos canais'));return;}const rows=summary.topProducts||M.topProducts(summary.byChannel);if(!rows.length){target.append(node('p','chart-empty','Nenhum produto com venda confirmada no período.'));return;}for(const [i,p]of rows.entries()){const row=node('div','overview-product-row'),name=node('div','overview-product-name');name.append(node('span','product-rank',String(i+1)),node('span','',p.title));const channel=channels.find(c=>c.id===p.channel);name.lastChild.append(node('small','product-channel-badge '+p.channel,channel?.name||p.channel));row.append(name,node('strong','',brl(p.value)),node('span','',number(p.units)));target.append(row);}}
 function insights(summary){
  el('insights').replaceChildren();const top=summary&&Object.entries(summary.byChannel).sort((a,b)=>b[1].revenue-a[1].revenue)[0];
  const items=[top&&summary.revenue>0?['ph-trophy',M.channels.find(c=>c.id===top[0]).name+' lidera em vendas',(top[1].revenue/summary.revenue*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% das vendas confirmadas no período.']:['ph-trophy','Participação por canal','A liderança aparece após uma consulta com vendas.'],summary?['ph-receipt','Pedidos do período',number(summary.paid)+' pagos · '+number(summary.cancelled)+' cancelados/reembolsados.']:['ph-plugs','Conexões em preparação','Shopee e TikTok Shop ainda não configurados.'],['ph-chart-line','Conversão e produtos','Aguardando visitas e itens por pedido para apuração.']];
  for(const [i,title,text]of items){const item=node('div','insight'),copy=node('div');copy.append(node('strong','',title),node('p','',text));item.append(node('i','ph '+i),copy);el('insights').append(item);}
 }
 function reset(selected,state){chartTip.hidden=true;products(null);cards(null,null,selected,state);table(null,selected);share(null,selected);bars(null,selected);for(const key of ['chart','evolution'])empty(el(key),state);insights(null);el('updated').textContent='Consulta ainda não realizada';exportSummary=null;if(el('export'))el('export').disabled=true;}
 function channelDetail(selected,rows,state){
  document.body.dataset.metricsView=selected==='all'?'overview':'channel';
  if(selected==='shopee'&&window.CacifeShopee){
   const target=el('channel-detail');target.hidden=false;
   window.CacifeShopee.render(target,null,state||'Carregando dados da Shopee…');
   window.CacifeShopee.overview(el('start').value,el('end').value).then(d=>{if(el('channel').value==='shopee')window.CacifeShopee.render(target,d);});
   return;
  }
  window.CacifeMarketplaces.render(el('channel-detail'),selected,rows,state);
 }
 function selectChannel(id){if(['mercadolivre','nuvemshop'].includes(id)){location.href=id+'.html?'+new URLSearchParams({start:el('start').value,end:el('end').value});return;}el('channel').value=id;load();}
 async function requestChannel(selected){
  if(location.hostname!=='127.0.0.1'||location.port!=='8879')throw new Error('Consulta direta disponível no servidor local.');
  const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Entre novamente na conta da Cacife.');
  const local=await fetch('/api/session').then(r=>r.json());
  const response=await fetch('/api/channels/'+selected,{headers:{'X-Cacife-Local':local.csrf,Authorization:'Bearer '+session.access_token}});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Consulta indisponível.');return data;
 }
 let overviewCsrf;
 async function liveSummary(start,end){const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Entre novamente na conta da Cacife.');return window.CacifeFastData.get(session.user.id+':overview:'+start+':'+end,()=>networkSummary(start,end));}
 async function networkSummary(start,end){
 const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Entre novamente na conta da Cacife.');
 for(let attempt=0;attempt<2;attempt++){if(!overviewCsrf)overviewCsrf=fetch('/api/session').then(r=>r.json()).catch(e=>{overviewCsrf=null;throw e;});const {csrf}=await overviewCsrf;const response=await fetch('/api/channels/overview?'+new URLSearchParams({start,end}),{headers:{'X-Cacife-Local':csrf,Authorization:'Bearer '+session.access_token}});if(response.status===403&&!attempt){overviewCsrf=null;continue;}const data=await response.json();if(!response.ok)throw Error(data.error||'Consulta indisponível.');return data;}
 }
 async function mergeShopee(summary,start,end){
  try{
   if(!window.CacifeShopee||summary.__shopeeMerged)return;
   const s=await window.CacifeShopee.overview(start,end);
   if(!s)return;
   summary.__shopeeMerged=true;
   summary.byChannel.shopee={revenue:s.revenue,paid:s.paid,orders:s.orders,byDay:s.byDay,ranking:s.ranking,net:s.liquido,fees:s.fees};
   summary.revenue=(summary.revenue||0)+s.revenue;summary.paid=(summary.paid||0)+s.paid;summary.orders=(summary.orders||0)+s.orders;summary.cancelled=(summary.cancelled||0)+s.cancelled;summary.net=(summary.net||0)+(s.liquido||0);summary.fees=(summary.fees||0)+(s.fees||0);
   for(const [d,v] of Object.entries(s.byDay||{}))summary.byDay[d]=(summary.byDay[d]||0)+v;
   summary.ticket=summary.paid?summary.revenue/summary.paid:0;
   const list=(summary.topProducts?summary.topProducts.slice():[]);
   for(const it of (s.ranking||[]))list.push({id:it.id,channel:'shopee',title:it.title,units:it.units,value:it.value});
   summary.topProducts=list.sort((a,b)=>b.value-a.value||b.units-a.units).slice(0,5);
  }catch(_){/* Shopee é complementar; não quebra a Visão Geral */}
 }
 async function load(event){
  event?.preventDefault();if(['mercadolivre','nuvemshop'].includes(el('channel').value)){selectChannel(el('channel').value);return;}const current=++generation,selected=el('channel').value,start=el('start').value,end=el('end').value;
  reset(selected,'Aguardando consulta');el('results').setAttribute('aria-busy','true');
  channelDetail(selected,null,'Consultando dados do canal…');
  legends(selected);
  document.querySelectorAll('.market-nav [data-channel]').forEach(n=>{n.classList.toggle('active',n.dataset.channel===selected);n.setAttribute('aria-pressed',String(n.dataset.channel===selected));});
  el('title').textContent=selected==='all'?'Visão Geral':M.channels.find(c=>c.id===selected).name;
  try{
   const period=M.range(start,end),label=displayDate(start)+' – '+displayDate(end);el('period-label').textContent=label;el('header-period').textContent=label;el('date-menu').open=false;
   if(selected!=='all'&&!M.channels.find(c=>c.id===selected)?.available){notice('Este canal ainda não está configurado. É necessário autorizar a loja e sincronizar os pedidos.');reset(selected,'Aguardando conexão');channelDetail(selected,null,selected==='shopee'?'Aplicativo da Cacife em análise pela Shopee. Nenhum pedido real foi importado.':'Conexão ainda não configurada.');return;}
   if(!client)throw new Error('Configuração de acesso indisponível. Recarregue a página e entre novamente.');
   if((new Date(end)-new Date(start))/86400000>=366)throw Error('Selecione até 366 dias por consulta.');
   notice('Consultando as integrações do Mercado Livre, Nuvemshop e Shopee…');let summary=await liveSummary(start,end);if(current!==generation)return;await mergeShopee(summary,start,end);if(current!==generation)return;
   let comparison=null;
   function paint(previous){comparison=previous;cards(summary,previous,selected,'');table(summary,selected);share(summary,selected);bars(summary,selected);series(summary,start,end,false,el('chart'));series(summary,start,end,true,el('evolution'));insights(summary);products(summary);}
   paint(null);exportSummary={summary,selected,start,end};if(el('export'))el('export').disabled=false;
   el('updated').textContent='Consultado às '+new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'});
   notice('');
   async function refreshCurrent(){if(current!==generation)return;if(document.hidden){setTimeout(refreshCurrent,60000);return;}try{summary=await liveSummary(start,end);if(current!==generation)return;await mergeShopee(summary,start,end);if(current!==generation)return;paint(comparison);el('updated').textContent='Consultado às '+new Date().toLocaleTimeString('pt-BR');notice('');}catch(error){if(current===generation)notice('Últimos dados exibidos. '+error.message,'error');}if(current===generation)setTimeout(refreshCurrent,summary.refreshing?3000:60000);}
   setTimeout(refreshCurrent,summary.refreshing?3000:60000);
   liveSummary(period.previous.slice(0,10),M.shift(start,-1)).then(async previous=>{await mergeShopee(previous,period.previous.slice(0,10),M.shift(start,-1));if(current===generation)paint(previous);}).catch(()=>{if(current===generation)notice('Dados atuais carregados. Comparação anterior indisponível.');});
  }catch(error){if(current!==generation)return;reset(selected,'Dados indisponíveis');channelDetail(selected,null,'Dados indisponíveis. Tente novamente.');notice(error.message,'error');}finally{if(current===generation)el('results').setAttribute('aria-busy','false');}
 }
 const localLink=document.getElementById('local-shopee-link');if(localLink&&location.hostname==='127.0.0.1'&&location.port==='8879'){localLink.hidden=false;localLink.style.removeProperty('display');}
 function syncPresets(){const today=M.day(new Date());document.querySelectorAll('[data-period]').forEach(button=>{const value=button.dataset.period,end=value==='yesterday'?M.shift(today,-1):today,start=value==='today'||value==='yesterday'?end:M.shift(today,1-Number(value));button.setAttribute('aria-pressed',String(el('start').value===start&&el('end').value===end));});}
 document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{const value=button.dataset.period,today=M.day(new Date());el('end').value=value==='yesterday'?M.shift(today,-1):today;el('start').value=value==='today'||value==='yesterday'?el('end').value:M.shift(today,1-Number(value));syncPresets();load();}));
 for(const key of ['start','end'])el(key).addEventListener('input',syncPresets);
 syncPresets();
 el('filters').addEventListener('submit',load);el('channel').addEventListener('change',load);
 document.querySelectorAll('.market-nav [data-channel]').forEach(n=>n.addEventListener('click',event=>{event.preventDefault();selectChannel(n.dataset.channel);}));
 el('export')?.addEventListener('click',()=>{if(!exportSummary)return;const {summary,selected,start,end}=exportSummary;const data=[['Plataforma','Inicio','Fim','Vendas confirmadas BRL','Pedidos pagos','Ticket medio BRL','Status']];for(const c of [...channels,all]){const ready=included(c,selected),b=bucket(summary,c);data.push([c.name,start,end,ready?(b.revenue/100).toFixed(2):'',ready?b.paid:'',ready&&b.paid?(b.revenue/b.paid/100).toFixed(2):'',!c.available?'Nao configurado':ready?'Consultado':'Fora do filtro']);}const csv='\uFEFF'+data.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='cacife-metricas-'+start+'-'+end+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 const initialChannel=new URLSearchParams(location.search).get('channel');if(channels.some(c=>c.id===initialChannel))el('channel').value=initialChannel;
 legends();reset(el('channel').value,'Aguardando consulta');
 try{client=window.supabase.createClient(window.SUPABASE_CONFIG.URL,window.SUPABASE_CONFIG.KEY);const {data:{session},error}=await client.auth.getSession();if(error||!session){location.href='login.html';return;}await load();}catch(_){reset('all','Dados indisponíveis');notice('Não foi possível iniciar a consulta. Verifique a conexão e entre novamente.','error');el('results').setAttribute('aria-busy','false');}
});

