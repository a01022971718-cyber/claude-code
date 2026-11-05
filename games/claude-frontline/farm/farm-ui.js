const artIcon=(id,size=36)=>`<img class="game-icon" src="art/ui-v2/${id}.png" width="${size}" height="${size}" alt="">`;
'use strict';
// 只改界面组织与镜头适配；沿用原存档键、图片仓库、作物与任务逻辑。
let CAB_TAB = 'seeds', CAB_OPEN = false, CAB_SIG = '', CAB_L = null;
const BASE_REFRESH_HUD = refreshHUD;
refreshHUD = function(){ BASE_REFRESH_HUD(); if(document.getElementById('cabinet')) syncFarmUI(); };
function initFarmUI(){
 const app=$('#app'), hud=$('#hud'), nav=$('#tabs');
 const top=h('<div id="top-controls" aria-label="常用入口"></div>');
 const task=h('<button class="shortcut" id="bQuests" type="button" aria-label="今日任务"></button>');
 task.innerHTML=icImg('tag',3)+'<span>任务</span>'; top.append(task);
 for(const [id,label] of [['bMap','地图'],['bTool','工具'],['bSet','设置']]){const b=$('#'+id);b.className='shortcut';b.insertAdjacentHTML('beforeend','<span>'+label+'</span>');top.append(b);}
 app.append(top);
 const right=h('<div id="right-rail" aria-label="农场工具"></div>');
 for(const [id,label] of [['bBag','仓库'],['bSkin','装扮'],['bLabels','标签']]){const b=$('#'+id);b.className='shortcut';b.innerHTML=b.innerHTML.replace(/(仓库|装扮|标签)/g,'')+'<span>'+label+'</span>';right.append(b);}
 right.append($('#bHarvest')); app.append(right);
 const left=h('<div id="left-rail"></div>');const shop=$('#bShop');shop.className='shortcut';shop.innerHTML=im('seedbag',seedBagSpr(),3)+'<span>商店</span>';left.append(shop);
 const guide=h('<button class="shortcut" id="bGuide" type="button" aria-label="玩法与口语设置">'+icImg('ques',3)+'<span>指南</span></button>');left.append(guide);app.append(left);
 app.append(h('<div id="farm-notice" role="status"><span>选择种子，再点空地播种</span></div>'));
 const dock=h(`<section id="farmDock" aria-label="农场物品抽屉"><div class="dock-head"><div class="dock-tabs" role="tablist" aria-label="物品分类">
 ${[['seeds','种子',im('seedbag',seedBagSpr(),2)],['crops','作物',itemImg('corn',2)],['decor','装扮',icImg('brush',2)],['land','土地',icImg('empty',2)]].map(([id,n,img])=>`<button class="dock-tab" id="cab-tab-${id}" type="button" data-cab="${id}" role="tab" aria-controls="cabinet" aria-selected="${id==='seeds'}">${img}<span>${n}</span></button>`).join('')}
 </div><span class="dock-title" id="cabHint"></span><button type="button" class="dock-toggle" id="cabToggle" aria-expanded="false" aria-controls="cabinet" aria-label="展开物品栏">⌃</button></div><div class="dock-body"><button class="dock-page prev" type="button" aria-label="上一页">‹</button><div id="cabinet" role="tabpanel" aria-labelledby="cab-tab-seeds"></div><button class="dock-page next" type="button" aria-label="下一页">›</button></div></section>`);
 app.append(dock);
 dock.addEventListener('click',cabClick);$('#cabinet').addEventListener('scroll',cabArrows,{passive:true});
 $('#cabToggle').onclick=()=>setCabOpen(!CAB_OPEN);
 $('#bSkin').onclick=()=>{ac();openCab('decor');};
 $('#bLabels').onclick=()=>{ac();S.cfg.labels=!S.cfg.labels;FARM.labels=!!S.cfg.labels;save();syncFarmUI();};
 task.onclick=()=>{ac();openFarmTasks();};guide.onclick=()=>{ac();openFarmGuide();};
 document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const layers=[...document.querySelectorAll('.layer')];if(layers.length){const l=layers[layers.length-1];if(l.close)l.close();return;}if(CAB_OPEN)setCabOpen(false);else if(SEEDHAND){SEEDHAND=null;syncSeedHand();syncFarmUI();}});
 $('#bShop').onclick=()=>{ac();openShop();};$('#farmDock .prev').innerHTML=artIcon('left',32);$('#farmDock .next').innerHTML=artIcon('right',32);
 applyArtV2();syncFarmUI();onResize();
}
function setCabOpen(on){CAB_OPEN=on;document.body.classList.toggle('cab-open',on);$('#farmDock').classList.toggle('open',on);const b=$('#cabToggle');b.innerHTML=on?artIcon('close',30):'⌃';b.setAttribute('aria-expanded',String(on));b.setAttribute('aria-label',on?'收起物品栏':'展开物品栏');if(on){SEEDHAND=null;syncSeedHand();}syncFarmUI(true);requestAnimationFrame(cabArrows);}
function openCab(id){CAB_TAB=id;$('#cabinet').scrollLeft=0;setCabOpen(true);}
function syncFarmUI(force=false){
 if(!S)return;
 const label=$('#bLabels');if(label)label.setAttribute('aria-pressed',String(!!S.cfg.labels));
 const ripe=ripeKeys().length,needs=S.plots.filter(p=>['bug','weed','dry','dead'].includes(plotNeed(p))).length;
 $('#farm-notice span').textContent=SEEDHAND?`已选${CROPS[SEEDHAND].zh} · 点击空地连续播种`:ripe?`${ripe} 块作物成熟了，点一下就能收获`:needs?`${needs} 块地需要照料 · 点气泡处理`:'选种子播种，点作物查看成长';
 $('#bQuests').hidden=!feat('quests');$('#bSkin').hidden=!feat('wardrobe');
 $('#bQuests').setAttribute('aria-label','今日任务'+(S.q&&S.q.list.some(q=>!q.done&&q.n>=q.goal)?'，有奖励可领':''));
 $('#cabHint').textContent=SEEDHAND?'点击空地连续播种':CAB_OPEN?({seeds:'选一包种子 · 再点空地',crops:'收获的食材 · 点卡片管理',decor:'场景装扮 · 点击切换',land:'扩展农田 · 查看解锁条件'})[CAB_TAB]:'点分类展开物品栏';
 const sig=JSON.stringify([CAB_TAB,CAB_OPEN,SEEDHAND,S.lv,S.coins,S.seeds,S.inv,S.cfg.skins,S.cfg.bg,S.plots.map(p=>p.open),SKINS.length]);
 if(!force&&CAB_SIG===sig)return;CAB_SIG=sig;
 document.querySelectorAll('[data-cab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.cab===CAB_TAB)));
 const panel=$('#cabinet');panel.setAttribute('aria-labelledby','cab-tab-'+CAB_TAB);if(!CAB_OPEN)return;
 const qty=n=>`<span class="cab-qty">×${n}</span>`;
 if(CAB_TAB==='seeds')panel.innerHTML=CROP_IDS.filter(id=>!CROPS[id].off).map(id=>{const c=CROPS[id],locked=c.lv>S.lv,n=S.seeds[id]||0;return `<button class="cab-card${SEEDHAND===id?' selected':''}" type="button" data-seed="${id}" ${locked?'disabled':''} aria-label="${esc(c.zh)}种子，${locked?'等级'+c.lv+'解锁':n?'有'+n+'包，点击选择播种':'购买一包需'+c.seed+'金币'}">${n?qty(n):''}<span class="cab-art">${itemImg(id,3)}</span><span class="cab-name">${esc(c.zh)}种子</span><small>${locked?'Lv '+c.lv+' 解锁':n?'点击播种':'购买 · '+c.seed+' 金币'}</small></button>`;}).join('')+`<button class="cab-card cta" type="button" data-shop><span class="cab-art">＋</span><span>种子商店</span><small>批量购买</small></button>`;
 else if(CAB_TAB==='crops'){const ids=Object.keys(ITEMS).filter(id=>S.inv[id]>0);panel.innerHTML=ids.length?ids.map(id=>`<button class="cab-card" type="button" data-inv="${id}">${qty(S.inv[id])}<span class="cab-art">${itemImg(id,3)}</span><span class="cab-name">${esc(ITEMS[id].zh)}</span><small>出售 · ${ITEMS[id].sell} 金币 / 个</small></button>`).join(''):`<div class="cab-empty">${im('basket',basketSpr(),3)}<span>仓库暂时没有食材<br>收获成熟作物后，会放在这里</span></div>`;}
 else if(CAB_TAB==='decor')panel.innerHTML=bgList().map(id=>{const b=bgOf(id);return `<button class="cab-card${curBg().id===id?' selected':''}" type="button" data-cab-bg="${id}" aria-pressed="${curBg().id===id}"><span class="cab-art"><img src="${esc(bgUrl(b.locked||b.open)||'')}" alt=""></span><span class="cab-name">${esc(b.zh)}场景</span><small>${curBg().id===id?'正在使用':'点击切换'}</small></button>`;}).join('')+SKINS.filter(s=>SLOT[s.slot]&&SLOT[s.slot].kind==='prop').map(s=>`<button class="cab-card${skinOn(s.slot)===s.id?' selected':''}" type="button" data-cab-skin="${s.id}"><span class="cab-art"><img src="${esc(s.src||s.data)}" alt=""></span><span class="cab-name">${esc(s.zh)}</span><small>${skinOn(s.slot)===s.id?'已放置 · 点击移除':'点击放置'}</small></button>`).join('')+`<button class="cab-card cta" type="button" data-wardrobe><span class="cab-art">＋</span><span>全部装扮</span><small>上传 / 调整 / 保存主题</small></button>`;
 else panel.innerHTML=S.plots.map((p,k)=>{const l=PLOT_LOCK[k];return `<button class="cab-card${p.open?' selected':''}" type="button" data-land="${k}" ${p.open?'disabled':''}><span class="cab-art">${p.open?artIcon('farm',36):artIcon('lock',36)}</span><span>第 ${k+1} 块地</span><small>${p.open?'已开垦':l?'Lv '+l.lv+' · '+l.c+' 金币':'尚未开放'}</small></button>`;}).join('');
 requestAnimationFrame(cabArrows);
}
function cabArrows(){const el=$('#cabinet');if(!el)return;$('#farmDock .prev').disabled=el.scrollLeft<=2;$('#farmDock .next').disabled=el.scrollLeft+el.clientWidth>=el.scrollWidth-3;}
function cabClick(e){
 const target=e.target.closest('button');if(!target)return;
 if(target.dataset.cab){ac();SFX.click();openCab(target.dataset.cab);return;}
 if(target.matches('.dock-page')){$('#cabinet').scrollBy({left:(target.classList.contains('prev')?-1:1)*Math.max(140,$('#cabinet').clientWidth-120),behavior:'smooth'});return;}
 if(target.hasAttribute('data-shop')){ac();openShop();return;}
 if(target.hasAttribute('data-wardrobe')){ac();openWardrobe();return;}
 if(target.dataset.seed){ac();const id=target.dataset.seed,c=CROPS[id];if(c.lv>S.lv)return;if(!(S.seeds[id]>0)){if(S.coins<c.seed){toast('金币还不够，先收菜或去小馆卖菜');return;}S.coins-=c.seed;addTo(S.seeds,id,1);save();SFX.coin();}setCabOpen(false);SEEDHAND=id;syncSeedHand();syncFarmUI(true);return;}
 if(target.dataset.inv){ac();openBag();return;}
 if(target.dataset.cabBg){ac();S.cfg.bg=target.dataset.cabBg;setFarmBg();save();refresh();syncFarmUI(true);toast('已切换场景');return;}
 if(target.dataset.cabSkin){ac();const s=SKINS.find(s=>s.id===target.dataset.cabSkin);if(!s)return;S.cfg.skins=S.cfg.skins||{};S.cfg.skins[s.slot]=skinOn(s.slot)===s.id?'none':s.id;save();refresh();syncFarmUI(true);return;}
 if(target.dataset.land!==undefined){const k=+target.dataset.land;if(!S.plots[k].open&&PLOT_LOCK[k])unlockPlot(k);}
}
function openFarmTasks(){renderQuests();const node=h('<div class="stack"><div class="row between"><h3>今日任务</h3><button class="btn ghost" type="button" data-close>关闭</button></div><p class="lead">种菜、做饭、接待客人，完成后点金币领取奖励。</p><div data-task-list></div><button class="btn ghost" type="button" data-guide>玩法与口语设置</button></div>');const l=openLayer(node,{center:true});const draw=()=>{node.querySelector('[data-task-list]').innerHTML=$('#quests').innerHTML;};draw();node.onclick=e=>{const q=e.target.closest('[data-q]');if(q){$('#quests [data-q="'+q.dataset.q+'"]').click();draw();}if(e.target.closest('[data-close]'))l.close();if(e.target.closest('[data-guide]')){l.close();openFarmGuide();}};}
function openFarmGuide(){renderSetup();const node=h('<div class="stack"><div class="row between"><h3>田园指南</h3><button class="btn ghost" type="button" data-close>关闭</button></div><ol class="art-spec"><li>左下物品栏选择种子，点「开始种植」，再点空地播种。</li><li>看气泡照料作物：浇水、除草、捉虫；成熟后点击收获。</li><li>右下导航切到厨房、小馆或学习页。</li><li>左下背包管理食材、菜品和装扮，种子栏用于播种；任务和活动集中在右侧大厅。设置使用右上齿轮。</li></ol>'+(!$('#setup').hidden?'<section class="panel" data-setup>'+$('#setup').innerHTML+'</section>':'')+'</div>');const l=openLayer(node,{center:true});node.onclick=e=>{if(e.target.closest('[data-close]'))l.close();if(e.target.closest('[data-tool]')){l.close();openToolkit();}if(e.target.closest('[data-set]')){l.close();openSettings();}if(e.target.closest('[data-a=setup-go]')){l.close();startSetup();}if(e.target.closest('[data-a=setup-skip]')){S.asrSkip=true;save();l.close();}};}
// 横屏覆盖整个可用画面；保持世界坐标与原画比例，超宽屏裁少量天空，竖屏可左右拖动。
fitFarm=function(){
 const host=farmCv.parentElement,w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;
 const scale=Math.max(w/FARM.world,h/192),W=w/scale,H=h/scale,d=FARM.dpr;
 FARM.zoom=scale;FARM.h=H;FARM.top=Math.max(0,Math.min(192-H,FARM.top||0));FARM.w=W;
 const pw=Math.round(w*d),ph=Math.round(h*d);if(FGAME&&FGAME.isBooted&&(FGAME.scale.width!==pw||FGAME.scale.height!==ph))FGAME.scale.resize(pw,ph);
 farmCv.style.width=w+'px';farmCv.style.height=h+'px';setCam(FARM.cam);
};

function handleAndroidBack(){
 const layers=[...document.querySelectorAll('.layer')];if(layers.length){const l=layers[layers.length-1];if(l.close){l.close();return true;}}
 if(CAB_OPEN){setCabOpen(false);return true;}if(SEEDHAND){SEEDHAND=null;syncSeedHand();syncFarmUI();return true;}
 if(VIEW!=='farm'){go('farm');return true;}return false;
}

function applyArtV2(){
 const icons={bQuests:'quests',bMap:'map',bTool:'tool',bSet:'gear',bBag:'bag',bSkin:'brush',bLabels:'tag',bShop:'shop',bGuide:'guide'};
 for(const [id,icon] of Object.entries(icons)){const el=$('#'+id);if(!el)continue;const im=el.querySelector('img');if(im)im.outerHTML=artIcon(icon);}
 document.querySelectorAll('#tabs [data-v]').forEach(el=>{el.querySelector('img').outerHTML=artIcon(el.dataset.v,40);});
 const cats={seeds:'shop',crops:'harvest',decor:'brush',land:'farm'};
 document.querySelectorAll('[data-cab]').forEach(el=>{el.querySelector('img').outerHTML=artIcon(cats[el.dataset.cab],28);});
}
