'use strict';
// Presentation revision 12: existing transactions, assets and saves remain authoritative.
const E12={ready:false,config:null,shopSelected:null,bagTab:'inv',bagSelected:null,notice:null};
const e12Text=k=>E12.config?.labels[k]||k;
const e12Button=(text,action,primary=false)=>{const b=UIComponents11.button(text,()=>c9Try(action),{variant:primary?'primary':'secondary'});b.classList.add('e12-control');return b;};
function e12Top(){return [...document.querySelectorAll('.layer')].filter(l=>!l.dataset.closing).at(-1);}
function e12Page(title,kind){
 const node=h('<section class="e12-page"><header class="e12-page-head"><button type="button" data-back12></button><h2></h2><div class="e12-page-meta"></div></header><div class="e12-page-body"></div></section>');
 node.querySelector('h2').textContent=title;const L=openLayer(node,{full:true});L.classList.add('experience-page12');L.dataset.page12=kind;
 const back=node.querySelector('[data-back12]');back.innerHTML=svg6('back');back.setAttribute('aria-label',e12Text('back'));back.onclick=()=>L.close();
 return {L,node,body:node.querySelector('.e12-page-body'),meta:node.querySelector('.e12-page-meta')};
}
function e12AfterClose(L,fn){L.afterClose.push(fn);L.close();}
function e12AssetHTML(id,label){
 const product=C9.config?.products.find(p=>p.asset===id),part=product?.reward.split('|')[0].split(':')[0].split('.');
 if(part?.[0]==='seed'&&CROPS[part[1]])return itemImg(part[1],4);
 if(part?.[0]==='inv'&&ITEMS[part[1]])return itemImg(part[1],4);
 return artIcon(E12.config?.assetIcons[id]||'star',80);
}
const e12OriginalArt=c9Art;
c9Art=function(id,label='',config=C9.config,assets=C9.assets){
 const el=e12OriginalArt(id,label,config,assets),fallback=el.querySelector('.c9-placeholder'),im=el.querySelector('img');
 const restore=()=>{fallback.replaceChildren(h(e12AssetHTML(id,label)));fallback.setAttribute('aria-hidden','true');};restore();
 if(im)im.addEventListener('error',restore);el.classList.add('e12-art');return el;
};
function e12ProductDetail(target,id){
 for(const el of target.querySelectorAll('.c9-model'))el._dispose?.();for(const audio of target.querySelectorAll('audio')){audio.pause();audio.src='';}target.replaceChildren();const c=C9.config,r=c.products.find(p=>p.id===id&&p.enabled);if(!r){target.textContent=e12Text('chooseProduct');return;}
 target.dataset.productDetail12=id;const info=h('<div class="e12-product-info"></div>');target.append(info);info.append(c9Art(r.asset,r.name));
 const title=document.createElement('h3');title.textContent=r.name;info.append(title);
 const desc=document.createElement('p');desc.textContent=r.description.includes('同路径')?c9TextReward(r.reward):r.description;info.append(desc);
 const reward=h('<p class="e12-subtle"></p>');reward.textContent=c9T('reward')+'：'+c9TextReward(r.reward);info.append(reward);
 if(r.modelAsset){const box=h('<div class="c9-model"></div>');info.append(box);if(window.C9Model)C9Model.mount(box,c.assets.find(a=>a.id===r.modelAsset),C9.assets).then(dispose=>{if(!box.isConnected)dispose();else{box._dispose=dispose;const L=box.closest('.layer');L?.afterClose.push(dispose);}}).catch(()=>{box.textContent=e12Text('mediaFailed');});}
 if(r.audioAsset){const a=c.assets.find(a=>a.id===r.audioAsset);if(a){const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=c9AssetURL(a);info.append(audio);target.closest('.layer')?.afterClose.push(()=>{audio.pause();audio.src='';});}}
 const note=h('<p class="e12-subtle"></p>');note.textContent=c9T('priceChoice');info.append(note);
 const methods=h('<div class="e12-buy-methods"></div>');target.append(methods);
 for(const which of ['A','B']){
  const cur=r['currency'+which],price=r['price'+which],limited=r.limit&&(c9State().purchases[r.id]||0)>=r.limit;
  const b=e12Button(limited?c9T('soldOut'):c9T('buy')+' · '+price+' '+c9Money(cur),()=>{
   if(b.disabled||C9.preview)return;b.disabled=true;
   try{c9Commit(s=>C9Core.purchase(s,c,r.id,which));toast(c9T('reward')+'：'+c9TextReward(r.reward));}finally{if(target.isConnected)e12ProductDetail(target,id);}
   c9DrawHub();
  },true);b.dataset.buy9=which;b.disabled=!!limited||C9Core.balance(S,c,cur)<price||C9.preview;methods.append(b);
 }
 if(C9.preview)note.textContent=e12Text('previewNoCharge');
}
c9Product=function(id){const r=C9.config.products.find(p=>p.id===id&&p.enabled);if(!r)return;const p=e12Page(r.name,'product');p.body.classList.add('e12-product-page');e12ProductDetail(p.body,id);};
c9DrawShop=function(body){
 const c=C9.config,products=c9Sorted(c.products),cats=['',...new Set(products.map(r=>r.category))];
 if(!cats.includes(C9.category))C9.category='';
 body.classList.add('e12-market');body.insertAdjacentHTML('beforeend',c9Wallet());
 const layout=h('<div class="e12-commerce"><nav class="e12-categories" aria-label="商品分类"></nav><section class="e12-shelves"><div class="e12-featured"><span></span><b></b></div><div class="e12-product-grid"></div></section><aside class="e12-product-detail" aria-label="商品详情"></aside></div>');body.append(layout);
 const nav=layout.querySelector('nav'),grid=layout.querySelector('.e12-product-grid'),detail=layout.querySelector('aside');
 for(const cat of cats){const b=e12Button(cat||c9T('all'),()=>{C9.category=cat;E12.shopSelected=null;c9DrawHub();});b.setAttribute('aria-pressed',String(cat===C9.category));b.dataset.category12=cat;nav.append(b);}
 nav.append(e12Button(e12Text('seedShop'),e12SeedShop));
 const visible=products.filter(r=>!C9.category||r.category===C9.category);
 if(!visible.some(p=>p.id===E12.shopSelected))E12.shopSelected=visible[0]?.id||null;
 const featured=visible.find(p=>p.featured)||visible[0],banner=layout.querySelector('.e12-featured');banner.querySelector('span').textContent=c9T('featured');banner.querySelector('b').textContent=featured?.name||e12Text('market');
 for(const r of visible){
  const b=h('<button type="button" class="e12-product"><div class="e12-product-art"></div><b></b><small class="e12-product-tag"></small><span class="e12-price"></span></button>');
  b.dataset.product9=r.id;b.setAttribute('aria-pressed',String(r.id===E12.shopSelected));b.querySelector('.e12-product-art').append(c9Art(r.asset,r.name));b.querySelector('b').textContent=r.name;
  const tag=b.querySelector('.e12-product-tag');tag.textContent=c.settings.showBadges&&r.tagEnabled?r.tag:'';tag.hidden=!tag.textContent;
  b.querySelector('.e12-price').textContent=r.priceA+' '+c9Money(r.currencyA)+' / '+r.priceB+' '+c9Money(r.currencyB);
  b.onclick=()=>{E12.shopSelected=r.id;for(const card of grid.children)card.setAttribute('aria-pressed',String(card===b));if(matchMedia('(orientation:portrait)').matches)c9Product(r.id);else e12ProductDetail(detail,r.id);};grid.append(b);
 }
 if(!visible.length)c9Empty(grid);e12ProductDetail(detail,E12.shopSelected);
};
const e12Hub=c9DrawHub;c9DrawHub=function(){
 const old=C9.hub,grid=old?.node.querySelector('.e12-shelves'),scroll=grid?.scrollTop||0,oldPage=old?.node.dataset.page12;
 for(const el of old?.node.querySelectorAll('.c9-model')||[])el._dispose?.();
 e12Hub();const p=C9.hub;if(!p?.node.isConnected)return;
 p.L.classList.add('experience-page12');p.L.dataset.page12='hub';p.node.dataset.page12=C9.page;
 const close=p.node.querySelector('.c9-close');close.innerHTML=svg6('back');close.setAttribute('aria-label',e12Text('back'));
 p.nav.hidden=C9.page==='shop';if(C9.page==='shop'&&oldPage==='shop')p.node.querySelector('.e12-shelves').scrollTop=scroll;
 if(C9.page!=='shop'){
  p.nav.querySelector('[data-farm-tasks11]')?.remove();
  const note=e12Button(e12Text('announcements'),e12Announcements);note.dataset.notices12='';p.nav.append(note);
 }
};
function e12SeedShop(){
 c9OriginalShop();const L=e12Top(),sheet=L?.querySelector('.sheet'),node=sheet?.querySelector(':scope>.list');if(!node)return;
 const page=h('<section class="e12-page"><header class="e12-page-head"><button type="button" data-back12></button><h2></h2></header><div class="e12-page-body"></div></section>');
 page.querySelector('h2').textContent=e12Text('seedShop');const back=page.querySelector('[data-back12]');back.innerHTML=svg6('back');back.setAttribute('aria-label',e12Text('back'));back.onclick=()=>L.close();
 node.querySelector('h3')?.remove();const close=node.querySelector('[data-a=x]');if(close)close.closest('.row').hidden=true;page.querySelector('.e12-page-body').append(node);sheet.replaceChildren(page);L.classList.add('experience-page12');L.dataset.page12='seed-shop';
}
const e12Events=c9DrawEvents;c9DrawEvents=function(body){
 e12Events(body);const d=c9State();for(const card of body.querySelectorAll('[data-event9]')){
  const r=C9.config.events.find(r=>r.id===card.dataset.event9);if(!r)continue;const n=Math.min(r.target,d.events[C9Core.eventKey(r)]||0),progress=h('<progress></progress>');progress.max=r.target;progress.value=n;progress.setAttribute('aria-label',n+' / '+r.target);
  const text=h('<small class="e12-subtle"></small>');text.textContent=n+' / '+r.target+' · '+c9TextReward(r.reward);card.append(progress,text);
 }
};
function e12BagRows(tab){
 if(tab==='seeds')return CROP_IDS.filter(id=>!CROPS[id].off&&(S.seeds[id]||0)>0).map(id=>({id,name:CROPS[id].zh+e12Text('seed'),n:S.seeds[id],art:itemImg(id,4),desc:CROPS[id].en}));
 if(tab==='inv')return Object.keys(ITEMS).filter(id=>S.inv[id]>0).map(id=>({id,name:ITEMS[id].zh,n:S.inv[id],art:itemImg(id,4),desc:ITEMS[id].en}));
 if(tab==='dishes'){const counts={};for(const d of S.dishes){if(!RECIPE[d.id])continue;const row=counts[d.id]||(counts[d.id]={id:d.id,name:RECIPE[d.id].zh,n:0,art:dishImg(d.id,4),q:0,desc:RECIPE[d.id].en});row.n++;row.q=Math.max(row.q,d.q);}return Object.values(counts);}
 return [...bgList().map(id=>({id:'bg:'+id,name:bgOf(id).zh,n:1,art:'<img src="'+esc(bgUrl(bgOf(id).locked||bgOf(id).open)||'')+'" alt="">',desc:e12Text('sceneBackground'),bg:id})),...SKINS.filter(s=>SLOT[s.slot]?.kind==='prop').map(s=>({id:'skin:'+s.id,name:s.zh,n:1,art:'<img src="'+esc(s.src||s.data)+'" alt="">',desc:e12Text('sceneDecor'),skin:s}))];
}
openBag=function(tab){
 if(tab)E12.bagTab=tab;const p=e12Page(e12Text('bag'),'bag');p.body.classList.add('e12-bag');
 const nav=h('<nav class="e12-categories" aria-label="物品分类"></nav>'),grid=h('<section class="e12-inventory-grid" aria-label="物品列表"></section>'),detail=h('<aside class="e12-inventory-detail" aria-label="物品详情"></aside>');p.body.append(nav,grid,detail);
 const draw=()=>{
  const y=grid.scrollTop;nav.replaceChildren();grid.replaceChildren();detail.replaceChildren();
  for(const [id,label]of E12.config.bagCategories){const b=e12Button(label,()=>{E12.bagTab=id;E12.bagSelected=null;grid.scrollTop=0;draw();});b.setAttribute('aria-pressed',String(E12.bagTab===id));b.dataset.bagCategory12=id;nav.append(b);}
  const rows=e12BagRows(E12.bagTab);if(!rows.some(r=>r.id===E12.bagSelected))E12.bagSelected=rows[0]?.id;
  for(const row of rows){const b=h('<button class="e12-item" type="button"><span class="e12-item-art"></span><b></b><small></small></button>');b.dataset.item12=row.id;b.querySelector('span').innerHTML=row.art;b.querySelector('b').textContent=row.name;b.querySelector('small').textContent='×'+row.n;b.setAttribute('aria-pressed',String(row.id===E12.bagSelected));b.onclick=()=>{E12.bagSelected=row.id;draw();};grid.append(b);}
  grid.scrollTop=y;const row=rows.find(r=>r.id===E12.bagSelected);if(!row){detail.innerHTML='<p>'+esc(e12Text('bagEmpty'))+'</p>';detail.append(e12Button(e12Text('goFarm'),()=>e12AfterClose(p.L,()=>go('farm'))));return;}
  detail.innerHTML='<div class="e12-item-info"><div class="e12-detail-art">'+row.art+'</div><h3>'+esc(row.name)+'</h3><p class="e12-subtle">'+esc(row.desc)+'</p><p>'+esc(e12Text('quantity'))+' '+row.n+'</p></div><div class="e12-item-actions"></div>';const itemInfo=detail.querySelector('.e12-item-info'),itemActions=detail.querySelector('.e12-item-actions');
  const action=(label,fn,primary=true)=>{const b=e12Button(label,fn,primary);itemActions.append(b);return b;};
  if(E12.bagTab==='inv'){
   action(e12Text('sellOne')+' · '+ITEMS[row.id].sell+' '+e12Text('coins'),()=>{if(!(S.inv[row.id]>0))return;addTo(S.inv,row.id,-1);gainCoins(ITEMS[row.id].sell);save();refreshHUD();SFX.coin();draw();}).dataset.sell12=row.id;
   action(e12Text('goKitchen'),()=>e12AfterClose(p.L,()=>go('kitchen')),false);
  }else if(E12.bagTab==='seeds')action(e12Text('plant'),()=>e12AfterClose(p.L,()=>{go('farm');setCabOpen(false);SEEDHAND=row.id;syncSeedHand();syncFarmUI(true);}));
  else if(E12.bagTab==='dishes'){const info=document.createElement('p');info.textContent=e12Text('bestStars')+' '+row.q+' ★';itemInfo.append(info);action(e12Text('goDiner'),()=>e12AfterClose(p.L,()=>go('diner')));}
  else{
   const active=row.bg?curBg().id===row.bg:skinOn(row.skin.slot)===row.skin.id;
   action(active?e12Text('using'):e12Text('useDecor'),()=>{if(row.bg){S.cfg.bg=row.bg;setFarmBg();}else{S.cfg.skins=S.cfg.skins||{};S.cfg.skins[row.skin.slot]=row.skin.id;}save();refresh();syncFarmUI(true);draw();}).disabled=active;
   action(e12Text('manageDecor'),()=>openWardrobe(),false);
  }
 };draw();return p;
};
function e12Order(c){
 const r=RECIPE[c.dish],k=CRITTERS[c.who],n=dishCount(c.dish),node=h('<section class="e12-order"><h3></h3><div class="e12-order-art"></div><p></p><small></small><div class="e12-order-actions"></div></section>');
 node.querySelector('h3').textContent=k.name;node.querySelector('.e12-order-art').innerHTML=critImg(c.who,3)+dishImg(c.dish,3);node.querySelector('p').textContent=e12Text('wants')+' '+r.zh;node.querySelector('small').textContent=e12Text('stock')+' '+n;
 const L=openLayer(node,{center:true});L.classList.add('order-layer12');node.querySelector('.e12-order-actions').append(e12Button(n?e12Text('serve'):e12Text('goCook'),()=>e12AfterClose(L,()=>{if(n)serve(c.id);else{SCENE8.recipe=c.dish;go('kitchen');renderKitchen();}}),true));
}
onDinerTap=function(e){
 const r=dinerCv.getBoundingClientRect(),lx=(e.clientX-r.left)*DINER.w/r.width-DINER.ox,ly=(e.clientY-r.top)*(DINER.viewH||DINER.h)/r.height-(DINER.yOffset||0);
 if(ly<28||ly>84)return;const index=dinerSlots().findIndex(x=>Math.abs(lx-x)<13),c=S.cust[index];if(c){ac();unlockVoice();e12Order(c);}
};
fitDiner=function(){
 if(!dinerCv)return;const host=dinerCv.parentElement,w=host.clientWidth||innerWidth,hh=host.clientHeight||innerHeight,scale=Math.min(w/160,hh/104),d=Math.min(3,devicePixelRatio||1);
 DINER.w=w/scale;DINER.viewH=hh/scale;DINER.yOffset=(DINER.viewH-104)/2;DINER.ox=(DINER.w-160)/2;
 dinerCv.width=Math.ceil(DINER.w*d);dinerCv.height=Math.ceil(DINER.viewH*d);dinerCv.style.width=w+'px';dinerCv.style.height=hh+'px';DGc=dinerCv.getContext('2d');DGc.setTransform(d,0,0,d,0,0);DGc.imageSmoothingEnabled=false;
};
const e12DrawDiner=drawDiner;drawDiner=function(t){if(!DGc)return;DGc.fillStyle=PAL.w1;DGc.fillRect(0,0,DINER.w,DINER.viewH||104);DGc.save();DGc.translate(0,DINER.yOffset||0);e12DrawDiner(t);DGc.restore();};
function e12Task(L){
 if(!L.classList.contains('live-task8')||L.dataset.experience12)return;L.dataset.experience12='task';
 const sheet=L.querySelector('.sheet'),body=sheet.querySelector('.fl-body'),foot=sheet.querySelector('.fl-foot');if(!body||!foot)return;
 const instructions=h('<section class="e12-instructions" aria-label="当前内容和操作"></section>');body.parentElement.append(instructions);instructions.append(body,foot);
 const act=body.querySelector('.act');if(act){const observer=new MutationObserver(()=>{body.scrollTop=0;});observer.observe(act,{childList:true});L.afterClose.push(()=>observer.disconnect());}
}
const e12Layer=openLayer;openLayer=function(node,options={}){const L=e12Layer(node,options);e12Task(L);return L;};
const e12ShowStep=showStep;showStep=function(){e12ShowStep();const head=COOK?.node.querySelector('.fl-head');if(head){head.querySelector('.t').textContent=COOK.r.zh;head.querySelector('.s').textContent=(COOK.i+1)+' / '+COOK.r.steps.length+' · '+COOK.r.en;COOK.node.querySelector('.fl-body').scrollTop=0;}};
const e12Toast=toast;let e12LastToast='',e12LastToastAt=0;toast=function(msg){const now=Date.now();if(msg===e12LastToast&&now-e12LastToastAt<1500)return;e12LastToast=msg;e12LastToastAt=now;e12Toast(msg);};
function e12MapLabels(){
 if(!MV.node?.isConnected)return;const labels=[...MV.items.querySelectorAll('.bd-lb')],map=MV.map.getBoundingClientRect(),occupied=[];
 for(const hit of MV.items.querySelectorAll('.bd-hit')){const p=placeOf(hit.dataset.id);hit.setAttribute('role','button');hit.setAttribute('tabindex','0');hit.setAttribute('aria-label',p?.name||'');hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tapPlace(hit.dataset.id);}};}
 for(const lb of labels)lb.classList.remove('e12-name-visible');
 if(!S.cfg.mapNames6||MV.edit)return;
 const places=placesOn(MV.bid),limit=MV.z<1.5?8:MV.z<2?16:Infinity;
 const ranked=labels.slice().sort((a,b)=>(a.dataset.id===MV.sel?-1:b.dataset.id===MV.sel?1:0));
 for(const lb of ranked){if(occupied.length>=limit)break;const p=places.find(p=>p.id===lb.dataset.id);if(!p)continue;lb.classList.add('e12-name-visible');const r=lb.getBoundingClientRect(),v=MV.view.getBoundingClientRect();
  if(r.left<v.left+8||r.right>v.right-8||r.top<v.top+80||r.bottom>v.bottom-88||occupied.some(b=>r.left<b.right+8&&r.right>b.left-8&&r.top<b.bottom+8&&r.bottom>b.top-8))lb.classList.remove('e12-name-visible');else occupied.push(r);
 }
}
const e12Items=mvItems;mvItems=function(){e12Items();requestAnimationFrame(e12MapLabels);};
const e12Names=refreshMapNames6;refreshMapNames6=function(){e12Names();requestAnimationFrame(e12MapLabels);};
const e12MapStyle=styleMap6;styleMap6=function(L){
 e12MapStyle(L);L.classList.add('map-layout12');const node=MV.node;if(!node||node.querySelector('.e12-map-tools'))return;
 const tools=h('<nav class="e12-map-tools" aria-label="地图工具"></nav>'),back=node.querySelector('[data-a=back]'),edit=node.querySelector('[data-a=edit]'),names=node.querySelector('[data-names6]');
 tools.append(back,names,edit,...node.querySelectorAll('[data-z]'));node.querySelector('.bd-wrap').append(tools);if(!G10.allowed()||!G10.activated)edit.hidden=true;
 MV.view.addEventListener('scroll',()=>requestAnimationFrame(e12MapLabels),{passive:true});
};
tapPlace=function(id,ev){const p=placeOf(id);if(!p)return;MV.sel=id;mvItems();mvFoot();placeTap(p,ev);if(p.en)say(p.en);};
function e12SettingsPage(L,id,label){const p=h('<section class="settings-content8" role="tabpanel"></section>');p.id='settings8-'+id;p.setAttribute('aria-label',label);L.querySelector('.settings-pages8').append(p);return p;}
const e12Settings=openSettings;openSettings=function(page='play'){
 e12Settings(page);const L=e12Top();if(!L?.classList.contains('settings8'))return;L.classList.add('settings-layout12');
 const nav=L.querySelector('.settings-nav8'),voice=L.querySelector('#settings8-voice'),play=L.querySelector('#settings8-play'),display=e12SettingsPage(L,'display',e12Text('display')),assist=e12SettingsPage(L,'assist',e12Text('assist'));
 const sfx=play.querySelector('[data-t=sfx]')?.closest('.li');if(sfx)voice.prepend(sfx);
 for(const id of ['zh','talk']){const row=play.querySelector('[data-t='+id+']')?.closest('.li');if(row)assist.append(row);}
 const labels=play.querySelector('[data-ui-labels11]');if(labels)display.append(labels);
 const music=h('<div class="e12-setting-row"><label></label><button type="button" role="switch" data-music12></button></div>');music.querySelector('label').textContent=e12Text('music');const toggle=music.querySelector('button');
 const drawMusic=()=>{toggle.setAttribute('aria-checked',String(!!S.cfg.bgmOn));toggle.textContent=S.cfg.bgmOn?e12Text('on'):e12Text('off');};toggle.onclick=()=>{S.cfg.bgmOn=!S.cfg.bgmOn;save();BGM.cur=null;bgmSet();drawMusic();};drawMusic();if(feat('bgm'))voice.prepend(music);
 const vol=h('<label class="e12-setting-row"><span></span><input type="range" min="0" max="2" step="1" data-volume12><output></output></label>');vol.querySelector('span').textContent=e12Text('musicVolume');vol.querySelector('input').value=S.cfg.bgmVol??1;
 const setVol=()=>{const value=+vol.querySelector('input').value;vol.querySelector('output').textContent=E12.config.volumeLabels[value];};setVol();vol.querySelector('input').oninput=()=>{S.cfg.bgmVol=+vol.querySelector('input').value;save(false);BGM.cur=null;bgmSet();setVol();};if(feat('bgm'))voice.append(vol);
 const size=h('<label class="e12-setting-row"><span></span><select data-font12></select></label>');size.querySelector('span').textContent=e12Text('textSize');for(const [n,label]of E12.config.fontSizes){const op=document.createElement('option');op.value=n;op.textContent=label;size.querySelector('select').append(op);}size.querySelector('select').value=S.cfg.textSize12||14;size.querySelector('select').onchange=e=>{S.cfg.textSize12=+e.target.value;save(false);e12ApplyPreferences();};display.append(size);
 const motion=h('<div class="e12-setting-row"><span></span><button type="button" role="switch" data-motion12></button></div>');motion.querySelector('span').textContent=e12Text('reducedMotion');const mb=motion.querySelector('button');const drawMotion=()=>{mb.setAttribute('aria-checked',String(!!S.cfg.reducedMotion12));mb.textContent=S.cfg.reducedMotion12?e12Text('on'):e12Text('off');};mb.onclick=()=>{S.cfg.reducedMotion12=!S.cfg.reducedMotion12;save(false);drawMotion();e12ApplyPreferences();};drawMotion();assist.append(motion);
 const vb=L.querySelector('[data-voice7]'),vs=L.querySelector('[data-voice-status7]');if(vs)voice.append(vs);if(vb)voice.append(vb);
 nav.replaceChildren();const select=id=>{const pages=[...L.querySelectorAll('.settings-pages8>.settings-content8')];if(!pages.some(p=>p.id==='settings8-'+id))id='play';for(const p of pages)p.hidden=p.id!=='settings8-'+id;for(const b of nav.children)b.setAttribute('aria-selected',String(b.dataset.settings8===id));};
 for(const [id,label]of E12.config.settingsCategories){if(id==='edit'&&(!G10.allowed()||!G10.activated))continue;const b=e12Button(label,()=>select(id));b.dataset.settings8=id;b.setAttribute('role','tab');b.setAttribute('aria-controls','settings8-'+id);nav.append(b);}
 for(const b of L.querySelectorAll('[data-t]')){const sync=()=>{b.setAttribute('role','switch');b.setAttribute('aria-checked',String(!!S.cfg[b.dataset.t]));};sync();b.addEventListener('click',()=>queueMicrotask(sync));}
 select(page);UIComponents11.decorate(L);
};
function e12ApplyPreferences(){document.documentElement.style.setProperty('--ui-font',(S.cfg.textSize12||14)+'px');document.body.classList.toggle('reduced-motion12',!!S.cfg.reducedMotion12);}
function e12Announcements(){
 const p=e12Page(e12Text('announcements'),'announcements');p.body.classList.add('e12-announcements');const nav=h('<nav class="e12-categories" aria-label="公告分类"></nav>'),article=h('<article class="e12-reading"></article>');p.body.append(nav,article);
 const draw=id=>{const r=E12.config.announcements.find(r=>r.id===id)||E12.config.announcements[0];if(!r)return;E12.notice=r.id;article.replaceChildren();const title=document.createElement('h3');title.textContent=r.title;article.append(title);for(const text of r.paragraphs){const t=document.createElement('p');t.textContent=text;article.append(t);}for(const b of nav.children)b.setAttribute('aria-pressed',String(b.dataset.notice12===r.id));article.scrollTop=0;};
 for(const r of E12.config.announcements){const b=e12Button(r.title,()=>draw(r.id));b.dataset.notice12=r.id;nav.append(b);}draw(E12.notice);return p;
}
async function initExperience12(){
 try{const r=await fetch('content/interface12.json');if(!r.ok)throw Error('interface configuration');E12.config=await r.json();document.body.classList.add('experience12');
  if(!S.cfg.experience12){S.cfg.experience12=1;S.cfg.mapNames6=false;save(false);}e12ApplyPreferences();
  const bag=document.querySelector('[data-cab=crops]');bag.innerHTML=artIcon('bag',32)+'<span>'+esc(e12Text('bag'))+'</span>';bag.setAttribute('aria-label',e12Text('bag'));bag.setAttribute('aria-haspopup','dialog');bag.onclick=e=>{e.stopPropagation();setCabOpen(false);openBag();};
  for(const id of ['decor','land'])document.querySelector('[data-cab='+id+']').hidden=true;
  const fold=document.querySelector('#v-diner .scene-fold8');fold.hidden=true;document.querySelector('#v-diner .vhead p').textContent=e12Text('tapGuest');
  document.getElementById('bContent9')?.setAttribute('aria-label',e12Text('activities'));
  E12.ready=true;UIComponents11.decorate();fitDiner();ui11Measure();
 }catch(e){console.error('experience12',e);toast('界面配置未能载入，请重新打开游戏');}
}
