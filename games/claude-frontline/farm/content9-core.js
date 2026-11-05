'use strict';
// Pure schema, validation and transaction rules. No DOM, network, scripts or executable config.
window.C9Core=(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x)), own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const metrics=['visit','harvest','cook','serve','speak','learn','review','care','plant'];
 const routes=['farm','kitchen','diner','words','shop','tasks','events','growth'];
 const fields={
 currencies:{id:'id',name:'text',initial:'number'},
 products:{id:'id',name:'text',category:'text',description:'long',asset:'asset',modelAsset:'asset',audioAsset:'asset',priceA:'number',currencyA:'currency',priceB:'number',currencyB:'currency',reward:'reward',limit:'number',tag:'text',tagEnabled:'boolean',enabled:'boolean',featured:'boolean',sort:'number'},
 tasks:{id:'id',name:'text',metric:'metric',target:'positive',scope:'scope',route:'route',reward:'reward',asset:'asset',enabled:'boolean',sort:'number'},
 events:{id:'id',name:'text',description:'long',startsAt:'date',endsAt:'date',metric:'metric',target:'positive',route:'route',reward:'reward',asset:'asset',x:'percent',y:'percent',rotation:'rotation',shareEnabled:'boolean',enabled:'boolean',sort:'number'},
 growth:{id:'id',name:'text',points:'number',freeReward:'reward',advancedReward:'reward',asset:'asset',enabled:'boolean',sort:'number'},
 assets:{id:'id',path:'path',kind:'kind',width:'positive',height:'positive',fit:'fit',anchorX:'percent',anchorY:'percent'}
 };
 const schema={metrics,routes,fields};
 function fail(m){throw Error(m);}
 function safeTree(v,depth=0){if(depth>18)fail('配置层级过深');if(v&&typeof v==='object'){for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))fail('配置包含不允许的字段');safeTree(v[k],depth+1);}}}
 const idRE=/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
 function pathOK(s){return typeof s==='string'&&/^Resources\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp|mp3|wav|ogg|glb)$/i.test(s)&&!s.includes('..');}
 function reward(s,c,refs){
  if(typeof s!=='string'||s.length>1500)fail('奖励格式不正确');
  if(!s)return [];
  return s.split('|').map(part=>{const m=part.match(/^([a-zA-Z][\w.-]*):(\d+)$/);if(!m)fail('奖励请使用 coins:20|seed.lettuce:2 格式');
   const key=m[1],n=+m[2];if(!Number.isSafeInteger(n)||n<1||n>1000000)fail('奖励数量应为 1～1000000');
   if(key==='growth'||c.currencies.some(x=>x.id===key))return{key,n};
   const [kind,id]=key.split('.');if(key.split('.').length!==2||!idRE.test(id||'')||!['seed','inv','item'].includes(kind))fail('奖励引用不存在：'+key);
   if(refs&&kind==='seed'&&!refs.seeds.includes(id))fail('种子不存在：'+id);
   if(refs&&kind==='inv'&&!refs.items.includes(id))fail('食材不存在：'+id);
   return{key,n};
  });
 }
 function validate(raw,refs){
  const c=clone(raw);safeTree(c);
  if(c.format!=='xingxing.content'||c.schemaVersion!==1)fail('需要生而向星内容配置第 1 版');
  if(typeof c.revision!=='string'||c.revision.length>80)fail('配置版本不正确');
  if(!c.labels||!c.settings||Array.isArray(c.labels)||Array.isArray(c.settings))fail('缺少文字或界面设置');
  for(const[k,v]of Object.entries(c.labels))if(!idRE.test(k)||typeof v!=='string'||v.length>500)fail('界面文字不正确：'+k);
  for(const tab of Object.keys(fields)){
   if(!Array.isArray(c[tab])||c[tab].length>2000)fail(tab+' 表格式不正确或超过 2000 行');
   const seen=new Set();
   for(const row of c[tab]){
    if(!row||typeof row!=='object'||!idRE.test(row.id)||seen.has(row.id))fail(tab+' 的编号为空、格式错误或重复');seen.add(row.id);
    for(const[k,type]of Object.entries(fields[tab])){
     const v=row[k];if(v===undefined)fail(tab+'.'+row.id+' 缺少 '+k);
     if(['number','positive','percent','rotation'].includes(type)){
      if(!Number.isFinite(v)||!Number.isSafeInteger(v)||v>(type==='rotation'?180:1000000)||v<(type==='rotation'?-180:type==='positive'?1:0)||(type==='percent'&&v>100))fail(row.id+' 的 '+k+' 超出范围');
     }else if(type==='boolean'){if(typeof v!=='boolean')fail(row.id+' 的 '+k+' 应为开关');}
     else if(typeof v!=='string'||v.length>(type==='long'?4000:1500))fail(row.id+' 的 '+k+' 不是有效文字');
     if(type==='scope'&&!['daily','weekly','once'].includes(v)||type==='metric'&&!metrics.includes(v)||type==='route'&&!routes.includes(v)||type==='kind'&&!['image','audio','model'].includes(v)||type==='fit'&&!['contain','cover'].includes(v))fail(row.id+' 的 '+k+' 选项无效');
     if(type==='date'&&(!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))))fail(row.id+' 的日期需要时区，例如 2026-11-01T00:00:00+09:00');
     if(type==='path'&&!pathOK(v))fail('素材路径不合法：'+v);
    }
   }
  }
  for(const id of ['shopEnabled','tasksEnabled','eventsEnabled','growthEnabled','showBadges'])if(typeof c.settings[id]!=='boolean')fail('设置开关无效：'+id);
  if(!Number.isInteger(c.settings.tileColumns)||c.settings.tileColumns<1||c.settings.tileColumns>6)fail('商品列数应为 1～6');
  if(!Number.isInteger(c.settings.cardRadius)||c.settings.cardRadius<0||c.settings.cardRadius>32)fail('圆角应为 0～32');
  if(!Number.isSafeInteger(c.settings.advanceCost)||c.settings.advanceCost<0)fail('进阶费用不正确');
  if(!c.currencies.some(x=>x.id==='coins'))fail('必须保留原游戏金币');
  const assets=new Map(c.assets.map(x=>[x.id,x]));const paths=new Set();
  for(const a of c.assets){if(paths.has(a.path))fail('素材路径重复：'+a.path);paths.add(a.path);const ext=a.path.split('.').pop().toLowerCase();if(!(a.kind==='image'?['png','jpg','jpeg','webp']:a.kind==='audio'?['mp3','wav','ogg']:['glb']).includes(ext))fail(a.id+' 的素材类型和扩展名不一致');}
  const checkAsset=(id,kind)=>{if(id&&(!assets.has(id)||assets.get(id).kind!==kind))fail('素材引用不存在或类型错误：'+id);};
  const checkCurrency=id=>{if(!c.currencies.some(x=>x.id===id))fail('货币不存在：'+id);};
  checkAsset(c.settings.shopBanner,'image');checkAsset(c.settings.growthAsset,'image');checkCurrency(c.settings.advanceCurrency);
  for(const r of c.products){checkAsset(r.asset,'image');checkAsset(r.modelAsset,'model');checkAsset(r.audioAsset,'audio');checkCurrency(r.currencyA);checkCurrency(r.currencyB);reward(r.reward,c,refs);}
  for(const r of [...c.tasks,...c.events]){checkAsset(r.asset,'image');reward(r.reward,c,refs);}
  for(const r of c.events)if(Date.parse(r.startsAt)>=Date.parse(r.endsAt))fail(r.id+' 的结束时间必须晚于开始时间');
  for(const r of c.growth){checkAsset(r.asset,'image');reward(r.freeReward,c,refs);reward(r.advancedReward,c,refs);}
  return c;
 }
 function day(t=Date.now()){const d=new Date(t);return[d.getFullYear(),d.getMonth()+1,d.getDate()].join('-');}
 function period(scope,t=Date.now()){if(scope==='once')return'once';if(scope==='weekly'){const d=new Date(t);d.setDate(d.getDate()-(d.getDay()+6)%7);return'w:'+day(+d);}return'd:'+day(t);}
 function state(s,c){if(!s.content9)s.content9={wallet:Object.fromEntries(c.currencies.filter(x=>x.id!=='coins').map(x=>[x.id,x.initial])),counters:{},events:{},claims:{},purchases:{},items:{},points:0,advanced:false};
  const d=s.content9;for(const id of ['wallet','counters','events','claims','purchases','items'])d[id]||={};return d;
 }
 const eventKey=r=>r.id+'@'+Date.parse(r.startsAt)+'@'+Date.parse(r.endsAt);
 const eventStatus=(r,t=Date.now())=>t<Date.parse(r.startsAt)?'upcoming':t>=Date.parse(r.endsAt)?'ended':'active';
 function increment(s,c,metric,n=1,t=Date.now()){
  if(!metrics.includes(metric)||!Number.isSafeInteger(n)||n<=0)return;
  const d=state(s,c);
  for(const scope of ['daily','weekly','once']){const key=period(scope,t);d.counters[key]||={};d.counters[key][metric]=(d.counters[key][metric]||0)+n;}
  for(const e of c.events)if(e.enabled&&e.metric===metric&&eventStatus(e,t)==='active'){const k=eventKey(e);d.events[k]=(d.events[k]||0)+n;}
 }
 function progress(s,c,r,t=Date.now()){return Math.min(r.target,state(s,c).counters[period(r.scope,t)]?.[r.metric]||0);}
 function balance(s,c,id){return id==='coins'?s.coins:state(s,c).wallet[id]||0;}
 function addWallet(s,c,id,n){if(id==='coins'){s.coins+=n;if(n>0)s.stats.earned+=n;}else{const d=state(s,c);d.wallet[id]=(d.wallet[id]||0)+n;}}
 function grant(s,c,str){const d=state(s,c);for(const{key,n}of reward(str,c)){if(key==='growth')d.points+=n;else if(c.currencies.some(x=>x.id===key))addWallet(s,c,key,n);else{const[k,id]=key.split('.');const bag=k==='seed'?s.seeds:k==='inv'?s.inv:d.items;bag[id]=(bag[id]||0)+n;}}}
 function purchase(s,c,id,which){
  if(!c.settings.shopEnabled)fail('商城已关闭');const p=c.products.find(x=>x.id===id&&x.enabled);if(!p)fail('商品不存在或已下架');if(!['A','B'].includes(which))fail('价格选项不存在');
  const d=state(s,c);if(p.limit&&d.purchases[id]>=p.limit)fail('已经达到兑换上限');
  const cur=p['currency'+which],price=p['price'+which];if(balance(s,c,cur)<price)fail('余额不足');
  addWallet(s,c,cur,-price);grant(s,c,p.reward);d.purchases[id]=(d.purchases[id]||0)+1;return p;
 }
 const claimKey=(r,t)=>'task:'+r.id+':'+period(r.scope,t);
 function claimTask(s,c,id,t=Date.now()){
  if(!c.settings.tasksEnabled)fail('任务已关闭');const r=c.tasks.find(x=>x.id===id&&x.enabled);if(!r)fail('任务不存在');const d=state(s,c),k=claimKey(r,t);
  if(d.claims[k]||progress(s,c,r,t)<r.target)return false;d.claims[k]=true;grant(s,c,r.reward);return true;
 }
 function claimEvent(s,c,id,t=Date.now()){
  if(!c.settings.eventsEnabled)fail('活动已关闭');const r=c.events.find(x=>x.id===id&&x.enabled);if(!r||eventStatus(r,t)!=='active')fail('活动不在进行中');const d=state(s,c),k=eventKey(r);
  if(d.claims['event:'+k]||(d.events[k]||0)<r.target)return false;d.claims['event:'+k]=true;grant(s,c,r.reward);return true;
 }
 function claimGrowth(s,c,id,lane){
  if(!c.settings.growthEnabled)fail('成长奖励已关闭');if(!['free','advanced'].includes(lane))fail('奖励栏不存在');const r=c.growth.find(x=>x.id===id&&x.enabled);if(!r)fail('奖励不存在');const d=state(s,c),k='growth:'+id+':'+lane;
  if(d.claims[k]||d.points<r.points||lane==='advanced'&&!d.advanced)return false;d.claims[k]=true;grant(s,c,r[lane+'Reward']);return true;
 }
 function unlock(s,c){const d=state(s,c),cur=c.settings.advanceCurrency,n=c.settings.advanceCost;if(d.advanced)return false;if(balance(s,c,cur)<n)fail('余额不足');addWallet(s,c,cur,-n);d.advanced=true;return true;}
 return{...schema,clone,validate,reward,pathOK,day,period,state,eventKey,eventStatus,increment,progress,balance,grant,purchase,claimTask,claimEvent,claimGrowth,unlock,claimKey};
})();
