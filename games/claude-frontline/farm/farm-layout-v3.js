'use strict';
// Layout v3: profile / resources / edge actions / bottom navigation / explicit seed action.
let UI3_READY=false, PICKED_SEED=null, SEED_GRID_SIG='', UI3_PROFILE=null, UI3_SEQ=0;
const V3_OLD_INIT=initFarmUI, V3_OLD_SYNC=syncFarmUI, V3_OLD_CAB=setCabOpen, V3_OLD_CLICK=cabClick, V3_OLD_GO=go, V3_OLD_SEEDHAND=syncSeedHand;
initFarmUI=function(){V3_OLD_INIT();initLayoutV3();};
function initLayoutV3(){
 const app=$('#app');document.body.classList.add('layout-v3');
 const left=$('#left-rail'),right=$('#right-rail');left.setAttribute('aria-label','系统入口');right.setAttribute('aria-label','农田操作');
 for(const id of ['bMap','bQuests','bGuide','bShop'])left.append($('#'+id));
 const plant=h(`<button class="shortcut" id="bPlant" type="button">${artIcon('farm',40)}<span>播种</span></button>`);plant.onclick=()=>{ac();if(VIEW!=='farm')go('farm');openCab('seeds');};right.prepend(plant);
 for(const id of ['bHarvest','bBag','bSkin'])right.append($('#'+id));
 const overflow=h('<div id="v3-overflow" hidden></div>');overflow.append($('#bTool'),$('#bLabels'));app.append(overflow);
 const resources=h(`<div id="resources" aria-label="资源栏"><button class="res-chip" id="resCoins" type="button" aria-label="金币，打开商店">${artIcon('coin',25)}<span class="res-number" id="rCoins">0</span><small>金币</small></button><button class="res-chip" id="resSeeds" type="button" aria-label="种子，打开种子栏">${artIcon('shop',25)}<span class="res-number" id="rSeeds">0</span><small>种子</small></button><button class="res-chip" id="resDishes" type="button" aria-label="菜品，打开仓库">${artIcon('diner',25)}<span class="res-number" id="rDishes">0</span><small>菜品</small></button></div>`);
 const settings=$('#bSet');resources.append(settings);app.append(resources);$('#top-controls').remove();
 $('#resCoins').onclick=()=>{ac();openShop();};$('#resSeeds').onclick=()=>{ac();if(VIEW!=='farm')go('farm');openCab('seeds');};$('#resDishes').onclick=()=>{ac();openBag();};
 const hud=$('#hud');hud.setAttribute('role','button');hud.setAttribute('tabindex','0');hud.setAttribute('aria-label','打开个人信息');hud.onclick=()=>{ac();openPlayerPanel();};hud.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPlayerPanel();}};
 const hudname=h('<span id="playerName" class="player-name"></span>');hud.querySelector('.lvbox').prepend(hudname);
 $('#coins').hidden=true;
 const dock=$('#farmDock');dock.querySelector('.dock-body').append(h('<div id="seedAction"><span id="seedActionHint">先选择一包种子</span><button class="btn green" id="seedConfirm" type="button" disabled>先选种子</button></div>'));
 dock.append(h(`<aside id="seedDetail" aria-live="polite" hidden></aside>`));$('#seedConfirm').onclick=confirmSeedV3;
 const closePicker=h(`<button class="shortcut" id="pickerExit" type="button" aria-label="关闭物品栏">${artIcon('close',32)}</button>`);closePicker.onclick=()=>setCabOpen(false);dock.append(closePicker);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();handleAndroidBack();return;}if(e.key!=='Tab')return;const l=[...document.querySelectorAll('.layer')].pop();if(!l)return;const els=focusablesV3(l);if(!els.length){e.preventDefault();return;}const a=document.activeElement;if(e.shiftKey&&(a===els[0]||!l.contains(a))){e.preventDefault();els[els.length-1].focus();}else if(!e.shiftKey&&(a===els[els.length-1]||!l.contains(a))){e.preventDefault();els[0].focus();}},true);
 UI3_READY=true;FARM.top=Math.min(24,Math.max(0,192-FARM.h));syncFarmUI(true);syncSeedHand();onResize();
}
syncFarmUI=function(force=false){
 V3_OLD_SYNC(force);if(!UI3_READY||!S)return;
 const seeds=Object.values(S.seeds).reduce((a,n)=>a+(+n||0),0);
 $('#rCoins').textContent=S.coins;$('#rSeeds').textContent=seeds;$('#rDishes').textContent=S.dishes.length;$('#playerName').textContent=S.cfg.playerName||'我的田园';
 $('#hud').setAttribute('aria-label',`${S.cfg.playerName||'我的田园'}，等级${S.lv}，打开个人信息`);
 const mature=ripeKeys().length,hb=$('#bHarvest');hb.hidden=false;hb.disabled=!mature;hb.className='shortcut harvest-action';hb.innerHTML=artIcon('harvest',40)+'<span>收获</span>'+(mature?`<i class="edge-count">${mature}</i>`:'');hb.setAttribute('aria-label',mature?`收获${mature}块成熟作物`:'暂无成熟作物可收获');
 const rewards=S.q?S.q.list.filter(q=>!q.done&&q.n>=q.goal).length:0,qb=$('#bQuests');let badge=qb.querySelector('.edge-count');if(rewards&&!badge){badge=h('<i class="edge-count"></i>');qb.append(badge);}if(badge){badge.hidden=!rewards;badge.textContent=rewards;}
 $('#left-rail').hidden=VIEW!=='farm';$('#right-rail').hidden=VIEW!=='farm';
 document.body.classList.toggle('plant-mode',!!SEEDHAND&&VIEW==='farm');
 $('#cabToggle').setAttribute('aria-expanded',String(CAB_OPEN));
 $('#seedAction').hidden=!(CAB_OPEN&&CAB_TAB==='seeds');$('#seedDetail').hidden=!(CAB_OPEN&&CAB_TAB==='seeds'&&PICKED_SEED);
 if(CAB_OPEN&&CAB_TAB==='seeds')renderSeedPickerV3(force);
 $('#cabHint').textContent=CAB_OPEN?'选择物品后确认操作':'种子 / 作物 / 装扮 / 土地';
};
setCabOpen=function(on){
 if(on&&PICKED_SEED&&!CROPS[PICKED_SEED])PICKED_SEED=null;
 V3_OLD_CAB(on);if(!UI3_READY)return;
 document.body.classList.toggle('picker-open',on);$('#seedDetail').hidden=!(on&&CAB_TAB==='seeds'&&PICKED_SEED);$('#seedAction').hidden=!(on&&CAB_TAB==='seeds');
 if(on){SEED_GRID_SIG='';syncFarmUI(true);}else{SEED_GRID_SIG='';$('#seedDetail').hidden=true;}
};
function renderSeedPickerV3(force){
 const sig=JSON.stringify([PICKED_SEED,S.lv,S.coins,S.seeds,CROP_IDS.map(id=>[id,CROPS[id].lv,CROPS[id].seed,CROPS[id].off])]);
 if(force||sig!==SEED_GRID_SIG){
  SEED_GRID_SIG=sig;const scroll=$('#cabinet').scrollLeft;
  $('#cabinet').innerHTML=CROP_IDS.filter(id=>!CROPS[id].off).map(id=>{const c=CROPS[id],locked=S.lv<c.lv,n=S.seeds[id]||0;return `<button type="button" class="seed-orb${PICKED_SEED===id?' picked':''}${locked?' locked':''}" data-seed="${id}" aria-pressed="${PICKED_SEED===id}" aria-label="查看${esc(c.zh)}种子，库存${n}${locked?'，等级'+c.lv+'解锁':''}"><span class="orb-art">${itemImg(id,4)}</span><span class="orb-count">${n}</span><span class="orb-name">${esc(c.zh)}</span>${locked?'<span class="orb-lock">'+artIcon('lock',17)+'</span>':''}</button>`;}).join('')+`<button type="button" class="seed-orb shop-orb" data-shop aria-label="打开种子商店"><span class="orb-art">${artIcon('shop',48)}</span><span class="orb-name">商店</span></button>`;
  $('#cabinet').scrollLeft=scroll;requestAnimationFrame(cabArrows);
 }
 const b=$('#seedConfirm'),hint=$('#seedActionHint');if(!PICKED_SEED||!CROPS[PICKED_SEED]){hint.textContent='点种子查看时间与库存';b.textContent='先选种子';b.disabled=true;return;}
 const id=PICKED_SEED,c=CROPS[id],n=S.seeds[id]||0,locked=c.lv>S.lv,short=S.coins<c.seed;
 b.disabled=locked||(!n&&short);b.textContent=locked?`等级 ${c.lv} 解锁`:n?'开始种植':short?'金币不足':`购买 1 包 · ${c.seed} 金币`;
 hint.textContent=locked?`当前等级 ${S.lv}`:n?`${c.zh}种子 ×${n} · 确认后点空地`:`单价 ${c.seed} 金币 · 当前 ${S.coins} 金币`;
 $('#seedDetail').innerHTML=`${itemImg(id,3)}<div><h3>${esc(c.zh)}种子</h3><p>成熟 ${fmtT(growMs(id)/1000)} · 收获 ${c.yield} 个</p><small>库存 ${n} 包${locked?' · 等级 '+c.lv+' 解锁':''}</small></div>`;$('#seedDetail').hidden=false;
}
cabClick=function(e){
 if(UI3_READY&&e.target.closest('button[data-seed]')){const b=e.target.closest('button[data-seed]');ac();PICKED_SEED=b.dataset.seed;syncFarmUI(true);return;}
 V3_OLD_CLICK(e);
};
function confirmSeedV3(){
 if(!PICKED_SEED||!CROPS[PICKED_SEED])return;ac();const id=PICKED_SEED,c=CROPS[id];if(S.lv<c.lv)return;
 if(!(S.seeds[id]>0)){if(S.coins<c.seed)return;S.coins-=c.seed;addTo(S.seeds,id,1);SFX.coin();save();refresh();syncFarmUI(true);toast(`已购买 1 包${c.zh}种子，再点“开始种植”`);return;}
 S.cfg.lastSeed=id;save(false);setCabOpen(false);SEEDHAND=id;syncSeedHand();syncFarmUI(true);
}
const V3_OLD_PICK=pickSeed;
pickSeed=function(k){if(!UI3_READY)return V3_OLD_PICK(k);openCab('seeds');toast('先选种子并确认，再点这块空地');};
syncSeedHand=function(){
 V3_OLD_SEEDHAND();if(!UI3_READY||!S)return;document.body.classList.toggle('plant-mode',!!SEEDHAND&&VIEW==='farm');const el=$('#seedHand');if(el.hidden)return;
 el.innerHTML=`${itemImg(SEEDHAND,2)}<span>${esc(CROPS[SEEDHAND].zh)} ×${S.seeds[SEEDHAND]}<small>点击空地播种</small></span><button class="btn ghost" type="button" data-change>换种子</button><button class="btn green" type="button" data-done>完成</button>`;
 el.querySelector('[data-change]').onclick=()=>openCab('seeds');el.querySelector('[data-done]').onclick=()=>{SEEDHAND=null;syncSeedHand();syncFarmUI();};
};
go=function(v){if(UI3_READY){if(CAB_OPEN)setCabOpen(false);if(SEEDHAND){SEEDHAND=null;syncSeedHand();}}V3_OLD_GO(v);};
function focusablesV3(root){return [...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length);}
// One top dialog owns input; closing it restores its parent, then the game.
openLayer=function(node,{full=false,center=false,onClose}={}){
 const prev=document.activeElement, id='dialog-v3-'+(++UI3_SEQ),L=h(`<div class="layer${full?' full':''}${center?' center':''}"><div class="sheet px" role="dialog" aria-modal="true" tabindex="-1"></div></div>`),sheet=L.querySelector('.sheet');sheet.append(node);
 const title=node.querySelector('h3,h2');if(title){if(!title.id)title.id=id;sheet.setAttribute('aria-labelledby',title.id);}else sheet.setAttribute('aria-label','游戏窗口');
 if(!full){const close=h(`<button class="window-close" type="button" aria-label="关闭当前窗口">${artIcon('close',38)}</button>`);close.onclick=()=>L.close();sheet.append(close);}
 for(const old of document.querySelectorAll('.layer'))old.inert=true;
 $('#app').inert=true;$('#layers').append(L);
 L.close=()=>{if(!L.isConnected)return;L.remove();if(onClose)onClose();const top=[...document.querySelectorAll('.layer')].pop();for(const old of document.querySelectorAll('.layer'))old.inert=old!==top;$('#app').inert=!!top;if(prev&&prev.isConnected)try{prev.focus({preventScroll:true});}catch(_){}refresh();};
 L.addEventListener('click',e=>{if(!full&&e.target===L)L.close();});
 requestAnimationFrame(()=>{const f=focusablesV3(sheet)[0];(f||sheet).focus({preventScroll:true});});return L;
};
function openPlayerPanel(){
 if(UI3_PROFILE&&UI3_PROFILE.isConnected)return;
 const a=lvNeed(S.lv-1),b=lvNeed(S.lv),xp=S.xp-a,max=b-a,name=S.cfg.playerName||'田园主人';
 const node=h(`<div class="player-panel"><h3>个人信息</h3><div class="player-banner"><strong>${esc(name)}</strong><span>本机存档</span><button type="button" class="link" data-profile="rename">修改称呼</button></div><div class="player-grid"><div class="player-portrait">${$('#ava').innerHTML}<span>等级 ${S.lv}</span></div><dl><div><dt>等级经验</dt><dd>${xp} / ${max}</dd></div><div><dt>累计收获</dt><dd>${S.stats.harvest||0} 次</dd></div><div><dt>完成菜品</dt><dd>${S.stats.cook||0} 道</dd></div><div><dt>接待客人</dt><dd>${S.stats.serve||0} 位</dd></div></dl></div><div class="profile-actions"><button class="btn green" type="button" data-profile="settings">系统设置</button><button class="btn green" type="button" data-profile="achv">成就</button><button class="btn green" type="button" data-profile="guide">玩法指南</button><button class="btn ghost" type="button" data-profile="tools">工具箱</button><button class="btn ghost" type="button" data-profile="labels" aria-pressed="${!!S.cfg.labels}">标签${S.cfg.labels?'已开':'已关'}</button><button class="btn ghost" type="button" data-profile="save">存档管理</button></div></div>`);
 UI3_PROFILE=openLayer(node,{center:true,onClose:()=>UI3_PROFILE=null});
 node.querySelector('[data-profile=achv]').hidden=!feat('achv');node.querySelector('[data-profile=tools]').hidden=!feat('toolkit');node.querySelector('[data-profile=labels]').hidden=!feat('labels');node.querySelector('[data-profile=save]').hidden=!feat('backup');
 node.addEventListener('click',async e=>{const t=e.target.closest('[data-profile]');if(!t)return;const k=t.dataset.profile;
  if(k==='settings'||k==='save'){openSettings();if(k==='save')requestAnimationFrame(()=>{const l=[...document.querySelectorAll('.layer')].pop(),n=l&&[...l.querySelectorAll('.sec')].find(el=>el.textContent==='备份');if(n)n.scrollIntoView({block:'start'});});}
  else if(k==='achv')openAchv();else if(k==='guide')openFarmGuide();else if(k==='tools')openToolkit();
  else if(k==='labels'){$('#bLabels').click();t.textContent='标签'+(S.cfg.labels?'已开':'已关');t.setAttribute('aria-pressed',String(!!S.cfg.labels));}
  else if(k==='rename'){const v=await askText('修改称呼',S.cfg.playerName||'田园主人',{max:8,hint:'最多 8 个字，保存在本机'});if(v){S.cfg.playerName=v;save();node.querySelector('.player-banner strong').textContent=v;syncFarmUI();}}
 });
}
const V3_OLD_STATUS=renderFarmStatus;
renderFarmStatus=function(){V3_OLD_STATUS();if(UI3_READY)syncFarmUI();};
// A second finger cancels the pending tap; releasing either finger never plants.
(function(){const contacts=new Set();let multi=false;const clear=()=>{contacts.clear();multi=false;FARM.drag=null;};const install=()=>{const cv=$('#farmCv');cv.addEventListener('pointerdown',e=>{contacts.add(e.pointerId);if(contacts.size>1){multi=true;FARM.drag=null;FARM.noClick=performance.now();e.stopImmediatePropagation();}},true);cv.addEventListener('pointermove',e=>{if(multi){FARM.drag=null;FARM.noClick=performance.now();e.stopImmediatePropagation();}},true);const end=e=>{contacts.delete(e.pointerId);if(multi){FARM.noClick=performance.now();FARM.drag=null;e.stopImmediatePropagation();if(!contacts.size)multi=false;}};cv.addEventListener('pointerup',end,true);cv.addEventListener('pointercancel',end,true);window.addEventListener('blur',clear);};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();})();
