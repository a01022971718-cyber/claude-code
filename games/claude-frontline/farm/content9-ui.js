'use strict';
window.C9={ready:false,config:null,assets:{},urls:new Map(),draft:null,hub:null,page:'shop',category:'',preview:false,record:null};
const c9T=k=>C9.config?.labels[k]||k;
function c9State(s=S,c=C9.config){return C9Core.state(s,c);}
function c9Sorted(rows){return rows.filter(r=>r.enabled!==false).slice().sort((a,b)=>a.sort-b.sort);}
function c9TextReward(str,c=C9.config){return C9Core.reward(str,c).map(({key,n})=>{
 const currency=c.currencies.find(r=>r.id===key);if(currency)return currency.name+' ×'+n;
 if(key==='growth')return c.labels.points+' +'+n;const[k,id]=key.split('.');
 return(k==='seed'?(CROPS[id]?.zh||id)+'种子':k==='inv'?ITEMS[id]?.zh||id:c.products.find(p=>p.reward.split('|').some(x=>x.startsWith(key+':')))?.name||id)+' ×'+n;
}).join(' · ');}
function c9Money(id,c=C9.config){return c.currencies.find(x=>x.id===id)?.name||id;}
function c9AssetURL(a,assets=C9.assets){
 const blob=assets[a.path];if(blob){if(!C9.urls.has(blob))C9.urls.set(blob,URL.createObjectURL(blob));return C9.urls.get(blob);}
 return a.path;
}
function c9Art(id,label='',config=C9.config,assets=C9.assets){
 const a=config.assets.find(x=>x.id===id),el=h('<div class="c9-art"><span class="c9-placeholder"></span></div>'),ph=el.firstChild;
 ph.textContent=(label||id||config.labels.reward)+' · '+config.labels.placeholder;
 if(!a||a.kind!=='image')return el;
 el.style.aspectRatio=a.width+'/'+a.height;el.dataset.assetId=id;const im=new Image();im.alt=label;im.decoding='async';im.style.objectFit=a.fit;im.style.objectPosition=a.anchorX+'% '+a.anchorY+'%';
 const load=()=>{ph.textContent=config.labels.loading;el.classList.add('loading');im.src=c9AssetURL(a,assets);};
 im.onload=()=>{el.classList.remove('loading','failed');ph.hidden=true;im.hidden=false;};
 im.onerror=()=>{el.classList.remove('loading');el.classList.add('failed');im.hidden=true;ph.hidden=false;ph.textContent=(label||id)+' · '+config.labels.placeholder;};
 el.append(im);load();return el;
}
function c9Panel(title,extra=''){
 const node=h('<section class="c9-panel"><header class="c9-header"><h3></h3><button type="button" class="c9-close"></button></header><div class="c9-body"></div></section>');
 node.querySelector('h3').textContent=title;node.querySelector('.c9-close').textContent=c9T('close');
 const L=openLayer(node,{onClose:()=>{node.dispatchEvent(new Event('c9-close'));}});L.classList.add('content-layer9');if(extra)L.classList.add(extra);L.querySelector('.sheet').classList.remove('task-card6');
 node.querySelector('.c9-close').onclick=()=>L.close();return{node,L,body:node.querySelector('.c9-body')};
}
function c9Commit(fn){
 const oldLevel=S.lv;
 if(C9.preview)throw Error('正在预览草稿，不会扣款或发奖');
 const next=C9Core.clone(S),result=fn(next);
 next.t=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(next));S=next;
 if(S.lv>oldLevel)for(let n=oldLevel+1;n<=S.lv;n++)levelUp(n);refresh();syncFarmUI(true);c9UpdateEntry();return result;
}
function c9Try(fn){try{const result=fn();if(result&&typeof result.catch==='function')result.catch(e=>toast(e.message||'操作未完成'));return result;}catch(e){toast(e.message||'操作未完成');return false;}}
function c9Empty(target){const p=document.createElement('p');p.className='c9-empty';p.textContent=c9T('empty');target.append(p);}
function c9Wallet(c=C9.config){return '<div class="c9-wallet">'+c.currencies.map(x=>'<span>'+esc(x.name)+' <b>'+C9Core.balance(S,c,x.id)+'</b></span>').join('')+'</div>';}
function c9Open(page='shop',previewConfig=null,previewAssets=null){
 if(!C9.ready)return toast('内容正在读取，请稍候');
 if(C9.hub?.L.isConnected&&!previewConfig){C9.page=page;c9DrawHub();return;}
 const old={config:C9.config,assets:C9.assets,preview:C9.preview,hub:C9.hub,page:C9.page};
 if(previewConfig){C9.config=previewConfig;C9.assets=previewAssets;C9.preview=true;}
 const p=c9Panel(c9T(page),'content-hub9');C9.hub=p;C9.page=page;C9.category='';
 const nav=h('<nav class="c9-module-nav" aria-label="内容模块"></nav>');p.node.querySelector('.c9-header').after(nav);
 const draw=()=>c9DrawHub();p.nav=nav;p.draw=draw;
 const timer=setInterval(()=>{for(const el of p.node.querySelectorAll('[data-countdown9]')){const r=C9.config.events.find(x=>x.id===el.dataset.countdown9);if(r)el.textContent=c9EventTime(r);}if(p.signature!==c9HubSignature()){draw();}},1000);
 p.node.addEventListener('c9-close',()=>{clearInterval(timer);if(previewConfig){C9.config=old.config;C9.assets=old.assets;C9.preview=old.preview;C9.hub=old.hub;C9.page=old.page;}else if(C9.hub===p)C9.hub=null;});
 draw();return p;
}
function c9HubSignature(){return JSON.stringify([S.content9,S.q,C9.config.events.map(r=>C9Core.eventStatus(r))]);}
function c9DrawHub(){
 const p=C9.hub;if(!p?.node.isConnected)return;const c=C9.config;
 if(!['shop','tasks','events','growth'].includes(C9.page)||!c.settings[C9.page+'Enabled'])C9.page=['shop','tasks','events','growth'].find(k=>c.settings[k+'Enabled'])||'shop';
 p.signature=c9HubSignature();p.node.style.setProperty('--c9-radius',c.settings.cardRadius+'px');p.node.querySelector('h3').textContent=(C9.preview?'草稿预览 · ':'')+c9T(C9.page);p.nav.replaceChildren();
 for(const id of ['shop','tasks','events','growth'])if(c.settings[id+'Enabled']){
  const b=h('<button type="button"></button>');b.textContent=c9T(id);b.setAttribute('aria-pressed',String(C9.page===id));b.dataset.c9Page=id;b.onclick=()=>{C9.page=id;C9.category='';c9DrawHub();};p.nav.append(b);
 }
 p.body.replaceChildren();p.body.className='c9-body c9-page-'+C9.page;
 if(!c.settings[C9.page+'Enabled'])return c9Empty(p.body);
 if(C9.page==='shop')c9DrawShop(p.body);if(C9.page==='tasks')c9DrawTasks(p.body);if(C9.page==='events')c9DrawEvents(p.body);if(C9.page==='growth')c9DrawGrowth(p.body);
}
function c9Button(text,action,disabled=false,cls=''){const b=h('<button type="button" class="c9-btn '+cls+'"></button>');b.textContent=text;b.disabled=disabled;b.onclick=()=>c9Try(action);return b;}
function c9DrawShop(body){
 const c=C9.config,d=c9State();body.insertAdjacentHTML('beforeend',c9Wallet());
 const row=h('<div class="c9-toolbar"></div>');for(const cat of ['',...new Set(c9Sorted(c.products).map(x=>x.category))])row.append(c9Button(cat||c9T('all'),()=>{C9.category=cat;c9DrawHub();},false,cat===C9.category?'selected':''));
 row.append(c9Button(c9T('collection'),c9OpenCollection));row.append(c9Button(c9T('seedShop'),c9OriginalShop));body.append(row);
 const wrap=h('<div class="c9-shop-layout"></div>'),feature=h('<aside class="c9-feature"></aside>'),main=h('<div class="c9-product-grid"></div>');main.style.setProperty('--c9-cols',c.settings.tileColumns);
 feature.append(c9Art(c.settings.shopBanner,c9T('featured')));const fp=c9Sorted(c.products).find(x=>x.featured);if(fp){const b=c9Button(fp.name,()=>c9Product(fp.id),false,'c9-primary');feature.append(b);}const tip=h('<p class="c9-note"></p>');tip.textContent=c9T('demo');feature.append(tip);
 for(const r of c9Sorted(c.products).filter(x=>!C9.category||x.category===C9.category)){
  const b=h('<button class="c9-product" type="button"></button>');b.dataset.product9=r.id;b.append(c9Art(r.asset,r.name));
  const name=h('<b></b>');name.textContent=r.name;b.append(name);
  if(c.settings.showBadges&&r.tagEnabled&&r.tag){const tag=h('<small class="c9-tag"></small>');tag.textContent=r.tag;b.append(tag);}
  const price=h('<small class="c9-price"></small>');price.textContent=r.priceA+' '+c9Money(r.currencyA)+' / '+r.priceB+' '+c9Money(r.currencyB);b.append(price);
  if(r.limit&&d.purchases[r.id]>=r.limit){const st=h('<small></small>');st.textContent=c9T('owned');b.append(st);}
  b.onclick=()=>c9Product(r.id);main.append(b);
 }if(!main.children.length)c9Empty(main);wrap.append(feature,main);body.append(wrap);
}
function c9Product(id){
 const r=C9.config.products.find(x=>x.id===id&&x.enabled);if(!r)return;
 const p=c9Panel(r.name,'content-detail9'),c=C9.config;
 const art=c9Art(r.asset,r.name);p.body.append(art);
 const desc=h('<p></p>');desc.textContent=r.description;p.body.append(desc);
 const reward=h('<p class="c9-note"></p>');reward.textContent=c9T('reward')+'：'+c9TextReward(r.reward);p.body.append(reward);
 if(r.modelAsset){const target=h('<div class="c9-model"></div>');p.body.append(target);if(window.C9Model)C9Model.mount(target,c.assets.find(a=>a.id===r.modelAsset),C9.assets).then(dispose=>{if(!p.node.isConnected)dispose();else p.node.addEventListener('c9-close',dispose);}).catch(e=>{target.textContent=e.message;});}
 if(r.audioAsset){const a=c.assets.find(x=>x.id===r.audioAsset),audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=c9AssetURL(a);p.body.append(audio);p.node.addEventListener('c9-close',()=>{audio.pause();audio.src='';});}
 const methods=h('<div class="c9-methods"></div>');p.body.append(methods);
 const note=h('<p class="c9-note"></p>');note.textContent=c9T('priceChoice');p.body.append(note);
 const draw=()=>{methods.replaceChildren();for(const which of ['A','B']){
  const cur=r['currency'+which],price=r['price'+which],limited=r.limit&&(c9State().purchases[r.id]||0)>=r.limit;
  const b=c9Button((limited?c9T('soldOut'):c9T('buy')+' · '+price+' '+c9Money(cur)),()=>{
   if(!c9Commit(s=>C9Core.purchase(s,c,id,which)))return;toast(c9T('reward')+'：'+c9TextReward(r.reward));draw();c9DrawHub();
  },!!limited||C9Core.balance(S,c,cur)<price||C9.preview,'c9-primary');b.dataset.buy9=which;methods.append(b);
 }if(C9.preview){note.textContent='草稿预览：兑换不扣款、不发奖';}};
 draw();
}
function c9OpenCollection(){const p=c9Panel(c9T('collection'));for(const[id,n]of Object.entries(c9State().items)){
 const product=C9.config.products.find(p=>p.reward.split('|').some(x=>x.startsWith('item.'+id+':'))),row=h('<div class="c9-collection-row"></div>');row.append(c9Art(product?.asset||'',product?.name||id));const name=h('<span></span>');name.textContent=(product?.name||id)+' ×'+n;row.append(name);p.body.append(row);
 }if(!p.body.children.length)c9Empty(p.body);}
function c9Route(route){const p=C9.hub;if(['shop','tasks','events','growth'].includes(route)){C9.page=route;c9DrawHub();return;}if(p)p.L.close();setTimeout(()=>go(route),180);}
function c9TaskClaimed(r){return !!c9State().claims[C9Core.claimKey(r,Date.now())];}
function c9DrawTasks(body){
 const c=C9.config;const list=h('<div class="c9-task-list"></div>');body.append(list);
 for(const r of c9Sorted(c.tasks)){
  const n=C9Core.progress(S,c,r),done=c9TaskClaimed(r),row=h('<article class="c9-task-row"></article>'),text=h('<div></div>');
  const title=h('<b></b>');title.textContent=r.name;const progress=h('<small></small>');progress.textContent=c9T(r.scope)+' · '+n+' / '+r.target;const bar=h('<progress></progress>');bar.max=r.target;bar.value=n;text.append(title,progress,bar);
  const rew=h('<div class="c9-task-reward"></div>');rew.append(c9Art(r.asset,c9T('reward')));const name=h('<small></small>');name.textContent=c9TextReward(r.reward);rew.append(name);
  const b=c9Button(done?c9T('claimed'):n>=r.target?c9T('claim'):c9T('go'),()=>{if(n>=r.target){const ok=c9Commit(s=>C9Core.claimTask(s,c,r.id));if(ok)toast(c9T('claimed'));c9DrawHub();}else c9Route(r.route);},done||C9.preview&&n>=r.target,n>=r.target?'c9-primary':'');
  b.dataset.task9=r.id;row.append(text,rew,b);list.append(row);
 }
 if(S.q?.list?.length){const summary=h('<details class="c9-legacy"><summary></summary></details>');summary.firstChild.textContent=c9T('legacy');
 for(const[r,i]of S.q.list.map((r,i)=>[r,i])){const row=h('<div class="c9-task-row"></div>'),txt=h('<span></span>');txt.textContent=(QDEF[r.id]?.zh||r.id)+' '+r.n+'/'+r.goal+' · '+(10+r.goal*4)+' 金币 + 8经验';row.append(txt);
 row.append(c9Button(r.done?c9T('claimed'):c9T('claim'),()=>{c9Commit(s=>c9ClaimLegacy(s,i));c9DrawHub();},r.done||r.n<r.goal||C9.preview));summary.append(row);}list.append(summary);}
 const count=c.tasks.filter(r=>r.enabled&&!c9TaskClaimed(r)&&C9Core.progress(S,c,r)>=r.target).length+(S.q?.list.filter(r=>!r.done&&r.n>=r.goal).length||0);
 const foot=h('<div class="c9-sticky-actions"></div>');foot.append(c9Button(c9T('claimAll')+' · '+count,()=>{c9Commit(s=>{for(const r of c.tasks.filter(x=>x.enabled))C9Core.claimTask(s,c,r.id);for(let i=0;i<(s.q?.list.length||0);i++)c9ClaimLegacy(s,i);});toast(c9T('claimed'));c9DrawHub();},!count||C9.preview,'c9-primary'));body.append(foot);if(!c.tasks.length)c9Empty(list);
}
function c9ClaimLegacy(s,i){const r=s.q?.list[i];if(!r||r.done||r.n<r.goal)return false;r.done=true;const n=10+r.goal*4;s.coins+=n;s.stats.earned+=n;s.xp+=8;while(s.xp>=lvNeed(s.lv))s.lv++;return true;}
function c9EventTime(r){
 const status=C9Core.eventStatus(r);if(status==='ended')return c9T('ended');const diff=(Date.parse(status==='upcoming'?r.startsAt:r.endsAt)-Date.now())/1000,d=Math.max(0,Math.floor(diff/86400)),h=Math.max(0,Math.floor(diff%86400/3600)),m=Math.max(0,Math.floor(diff%3600/60));
 return c9T(status)+' · '+d+'天 '+h+'时 '+m+'分';
}
function c9DrawEvents(body){
 const board=h('<div class="c9-event-board"></div>');body.append(board);
 for(const r of c9Sorted(C9.config.events)){
  const b=h('<button class="c9-event" type="button"></button>');b.dataset.event9=r.id;b.style.setProperty('--ex',r.x/100);b.style.setProperty('--ey',r.y/100);b.style.setProperty('--er',r.rotation+'deg');b.append(c9Art(r.asset,r.name));
  const name=h('<b></b>');name.textContent=r.name;const tag=h('<small class="c9-status" data-countdown9="'+esc(r.id)+'"></small>');tag.textContent=c9EventTime(r);tag.dataset.status=C9Core.eventStatus(r);b.append(name,tag);b.onclick=()=>c9Event(r.id);board.append(b);
 }if(!board.children.length)c9Empty(board);
}
function c9Event(id){
 const r=C9.config.events.find(x=>x.id===id&&x.enabled);if(!r)return;const p=c9Panel(r.name),c=C9.config;
 p.body.append(c9Art(r.asset,r.name));const text=h('<p></p>');text.textContent=r.description;p.body.append(text);
 const time=h('<p class="c9-note"></p>');time.textContent=r.startsAt+' ～ '+r.endsAt;p.body.append(time);
 const status=h('<p></p>');p.body.append(status);
 const actions=h('<div class="c9-methods"></div>');p.body.append(actions);
 const draw=()=>{if(!p.node.isConnected)return;const d=c9State(),key=C9Core.eventKey(r),n=Math.min(r.target,d.events[key]||0),done=!!d.claims['event:'+key],st=C9Core.eventStatus(r);status.textContent=c9EventTime(r)+' · '+n+'/'+r.target+' · '+c9TextReward(r.reward);actions.replaceChildren();
 actions.append(c9Button(c9T('go'),()=>{p.L.close();c9Route(r.route);},st!=='active'));
 actions.append(c9Button(done?c9T('claimed'):c9T('claim'),()=>{c9Commit(s=>C9Core.claimEvent(s,c,id));draw();c9DrawHub();},st!=='active'||done||n<r.target||C9.preview,'c9-primary'));
 if(r.shareEnabled){actions.append(c9Button(c9T('share'),()=>c9ExportPoster(r)));actions.append(c9Button(c9T('invite'),()=>{},true));}
 };draw();const timer=setInterval(draw,60000);p.node.addEventListener('c9-close',()=>clearInterval(timer));
}
async function c9ExportPoster(r){
 const cv=document.createElement('canvas');cv.width=900;cv.height=600;const g=cv.getContext('2d');g.fillStyle='#FAF3CA';g.fillRect(0,0,900,600);g.strokeStyle='#623012';g.lineWidth=4;g.strokeRect(24,24,852,552);g.fillStyle='#2D211C';g.font='34px sans-serif';g.fillText('生而向星',54,86);g.font='46px sans-serif';g.fillText(r.name.slice(0,15),54,164);g.font='23px sans-serif';g.fillText(r.startsAt.slice(0,10)+' — '+r.endsAt.slice(0,10),54,222);g.fillText(c9EventTime(r),54,266);g.font='20px sans-serif';g.fillText('完成目标：'+r.target+' 次',54,470);g.fillText(c9TextReward(r.reward).slice(0,45),54,512);
 const a=C9.config.assets.find(a=>a.id===r.asset);if(a&&C9.assets[a.path]){const im=await createImageBitmap(C9.assets[a.path]);g.drawImage(im,560,280,240,240);im.close();}
 const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/png'));await C9IO.download(blob,'活动卡_'+r.id+'.png');
}
function c9DrawGrowth(body){
 const c=C9.config,d=c9State(),rows=c9Sorted(c.growth),max=Math.max(1,...rows.map(r=>r.points));
 const layout=h('<div class="c9-growth-layout"></div>'),hero=h('<aside class="c9-growth-hero"></aside>'),list=h('<div class="c9-growth-list"></div>');
 hero.append(c9Art(c.settings.growthAsset,c9T('growth')));const title=h('<strong></strong>');title.textContent=c9T('points')+' '+d.points+' / '+max;const bar=h('<progress></progress>');bar.max=max;bar.value=Math.min(max,d.points);hero.append(title,bar);
 if(!d.advanced)hero.append(c9Button(c9T('unlock')+' · '+c.settings.advanceCost+' '+c9Money(c.settings.advanceCurrency),()=>{c9Commit(s=>C9Core.unlock(s,c));c9DrawHub();},C9.preview||C9Core.balance(S,c,c.settings.advanceCurrency)<c.settings.advanceCost));
 const note=h('<p class="c9-note"></p>');note.textContent=c9T('demo');hero.append(note);
 const head=h('<div class="c9-growth-head"><b></b><b></b></div>');head.children[0].textContent=c9T('free');head.children[1].textContent=c9T('advanced');list.append(head);
 for(const r of rows){
  const row=h('<article class="c9-growth-row"><strong></strong><div class="c9-growth-lanes"></div></article>');row.firstChild.textContent=r.name+' · '+r.points+' '+c9T('points');
  for(const lane of ['free','advanced']){
   const cell=h('<div></div>'),txt=h('<small></small>');txt.textContent=c9TextReward(r[lane+'Reward']);cell.append(txt);
   const done=!!d.claims['growth:'+r.id+':'+lane],locked=d.points<r.points||lane==='advanced'&&!d.advanced;
   const b=c9Button(done?c9T('claimed'):locked?c9T('locked'):c9T('claim'),()=>{c9Commit(s=>C9Core.claimGrowth(s,c,r.id,lane));c9DrawHub();},done||locked||C9.preview,!locked?'c9-primary':'');b.dataset.growth9=r.id+':'+lane;cell.append(b);row.lastChild.append(cell);
  }list.append(row);
 }
 layout.append(hero,list);body.append(layout);
}
function c9UpdateEntry(){
 const b=document.querySelector('#bContent9');if(!b||!C9.ready)return;
 b.hidden=!['shop','tasks','events','growth'].some(k=>C9.config.settings[k+'Enabled']);b.setAttribute('aria-label',c9T('entry'));
}
const c9OriginalPlant=plant;plant=function(k,id){const before=S.seeds[id]||0;c9OriginalPlant(k,id);if(C9.ready&&(S.seeds[id]||0)<before){C9Core.increment(S,C9.config,'plant');save(false);}};
const c9OriginalQuest=quest;quest=function(id,n=1){c9OriginalQuest(id,n);if(C9.ready)C9Core.increment(S,C9.config,id,n);};
const c9OriginalShop=openShop;openShop=function(){return C9.ready?c9Open('shop'):c9OriginalShop();};
const c9OriginalTasks=openFarmTasks;openFarmTasks=function(){return C9.ready&&C9.config.settings.tasksEnabled?c9Open('tasks'):c9OriginalTasks();};
const c9OriginalSettings=openSettings;openSettings=function(page='play'){c9OriginalSettings(page);if(!C9.ready||!feat('dev'))return;
 const section=document.querySelector('.layer:last-child #settings8-edit');if(section){const b=c9Button(c9T('editor'),()=>c9OpenEditor());b.dataset.contentEditor9='';section.prepend(b);}
};
const c9OriginalFeatures=applyFeatures;applyFeatures=function(){c9OriginalFeatures();c9UpdateEntry();};
async function initContent9(){
 try{
  const response=await fetch('content/default.json');if(!response.ok)throw Error('内置内容表未找到');const defaults=C9Core.validate(await response.json(),{seeds:CROP_IDS,items:Object.keys(ITEMS)});C9.defaults=defaults;
  let record;try{record=await C9IO.read();}catch(e){toast('素材存储暂不可用，本次使用内置内容');}
  if(record){try{record.config=C9Core.validate(record.config,{seeds:CROP_IDS,items:Object.keys(ITEMS)});}catch(e){record=null;toast('保存的配置无法读取，使用内置内容；原文件仍保留');}}
  C9.record=record;C9.config=record?.config||defaults;C9.assets=record?.assets||{};C9.ready=true;
  c9Commit(s=>{const d=c9State(s),today=C9Core.day();if(d.visitDay!==today){d.visitDay=today;C9Core.increment(s,C9.config,'visit',1);}});
  const b=h('<button id="bContent9" type="button" class="shortcut" aria-label="更多内容"><span aria-hidden="true">✦</span></button>');b.onclick=()=>c9Open(C9.config.settings.eventsEnabled?'events':'shop');$('#app').append(b);c9UpdateEntry();
 }catch(e){console.error('content9',e);toast('内容模块未能载入，农场可以继续使用');}
}

REG_TOOLS.push(['content9','商城、任务、活动与素材',()=>c9OpenEditor()]);
for(const table of Object.keys(C9Core.fields))CONTENT_TABLES['content9.'+table]='tool:content9';
