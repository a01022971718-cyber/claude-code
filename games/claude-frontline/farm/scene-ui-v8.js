'use strict';
// Scene layout owns presentation only. The original inventory, lesson, speech and save actions remain authoritative.
const SCENE8={ready:false,recipe:null};
// A missing recording must not interrupt a lesson or hide the world. Download remains in Settings > Sound.
voxAsk=function(){if(!feat('voicepack')||VOX.asked||!voxCan()||S.cfg.vox||VOX.st==='loading')return;VOX.asked=true;toast('先用手机朗读；语音包可在设置「声音」中下载');};
const layer8=openLayer;
openLayer=function(node,options={}){
 const L=layer8(node,options);
 if(node.querySelector('.fl-head')&&!node.querySelector('.bd-wrap')){
  L.classList.add('live-task8');L.querySelector('.sheet').classList.remove('task-card6');
  L.dataset.task=node.matches('.cook')?'cook':node.querySelector('.chat')?'serve':node.querySelector('.ex-body')?'exam':'practice';
  if(L.dataset.task==='serve'){
   const history=h('<aside class="conversation8" aria-label="客人的话"></aside>');
   history.append(node.querySelector('.chat'));node.append(history);
   const head=node.querySelector('.fl-head'),layout=()=>{
    if(matchMedia('(orientation:portrait)').matches)history.style.removeProperty('top');
    else history.style.top=Math.ceil(head.getBoundingClientRect().bottom-L.getBoundingClientRect().top+12)+'px';
   };
   const observer=new ResizeObserver(layout);observer.observe(head);observer.observe(L);
   L.afterClose.push(()=>observer.disconnect());requestAnimationFrame(layout);
  }
 }else if(!node.querySelector('.bd-wrap'))L.classList.add('system-page8');
 syncSceneLayers8();return L;
};
function syncSceneLayers8(){const top=[...document.querySelectorAll('.layer')].filter(l=>!l.dataset.closing).at(-1);document.body.classList.toggle('has-live8',!!top?.classList.contains('live-task8'));}
new MutationObserver(syncSceneLayers8).observe(document.getElementById('layers'),{childList:true,subtree:false});

const init8=initFarmUI;initFarmUI=function(){init8();document.body.classList.add('scene-layout8');
 for(const id of ['kitchen','diner','words']){
  const root=$('#v-'+id),title=root.querySelector('.vhead');title.classList.add('scene-title8');
  const toggle=h(`<button class="scene-fold8" type="button" aria-label="隐藏侧边内容" aria-pressed="false">${svg6('eye')}</button>`);
  toggle.onclick=()=>{const hidden=root.classList.toggle('content-hidden8');toggle.setAttribute('aria-pressed',String(hidden));toggle.setAttribute('aria-label',hidden?'显示侧边内容':'隐藏侧边内容');};root.append(toggle);
 }
 const detail=h('<aside id="recipeDetail8" class="edge-paper8 recipe-detail8" aria-label="菜谱详情"></aside>');$('#v-kitchen').append(detail);
 $('#recipes').setAttribute('aria-label','选择菜谱');$('#recipes').addEventListener('click',e=>{const b=e.target.closest('[data-recipe8]');if(!b)return;SCENE8.recipe=b.dataset.recipe8;renderKitchen();});
 const stock=$('#stock').closest('section');stock.classList.add('diner-stock8');$('#v-diner').append(stock);
 const book=h(`<div class="learning-world8" aria-hidden="true"><div class="book-cover8"><div class="book-page8"><small>生而向星</small><strong>每天一点<br>慢慢长大</strong><span class="book-star8">✧</span></div><div class="book-page8">${im('learning-bean8',ddSpr('farm',0),4)}<span class="book-leaf8">${artIcon('farm',42)}</span></div></div><span class="book-shadow8"></span></div>`);$('#v-words').prepend(book);
 const words=$('.word-scroll6');words.removeAttribute('open');$('#v-words').append(words);words.querySelector('summary').textContent='词本 · 复习';
 SCENE8.ready=true;renderKitchen();renderLearn();paintKitchen8();
 document.addEventListener('click',e=>{if(words.open&&!e.target.closest('.word-scroll6'))words.open=false;},true);
};
function paintKitchen8(){const cv=$('#kitchenScene6');if(!cv)return;cv.width=200;cv.height=84;const g=cv.getContext('2d');g.drawImage(kitchenBg('day',200,20),0,0);g.drawImage(ddSpr('chef',0),82,36);g.drawImage(kitchenFront(200,20),0,0);kBowl(g,124,58,32,PAL.n0,PAL.g4);g.drawImage(itemSpr('lettuce'),112,41);}
renderKitchen=function(){
 const list=$('#recipes');if(!SCENE8.ready)return;
 const all=RECIPES.filter(r=>!r.off);if(!all.some(r=>r.id===SCENE8.recipe))SCENE8.recipe=all[0]?.id;
 list.innerHTML=all.map(r=>`<button class="recipe-row8" type="button" data-recipe8="${esc(r.id)}" aria-pressed="${r.id===SCENE8.recipe}">${dishImg(r.id,2)}<span><b>${esc(r.zh)}</b><small>${r.lv>S.lv?'等级 '+r.lv+' 解锁':canCook(r)?'食材齐了':r.steps.length+' 个步骤'}</small></span></button>`).join('');
 const r=RECIPE[SCENE8.recipe],detail=$('#recipeDetail8');if(!r){detail.innerHTML='<p>还没有菜谱，可在开发者模式添加。</p>';return;}
 const locked=r.lv>S.lv,ok=canCook(r);detail.innerHTML=`<div class="detail-art8">${dishImg(r.id,4)}</div><p class="eyebrow">今日料理 · ${r.steps.length} 步</p><h2>${esc(r.zh)}</h2><p class="en" lang="en">${esc(r.en)}</p><div class="recipe-needs8">${Object.entries(r.need).map(([k,n])=>`<div>${itemImg(k,2)}<span>${esc(ITEMS[k].zh)}</span><small class="${(S.inv[k]||0)<n?'need':''}">${Math.min(S.inv[k]||0,n)} / ${n}</small></div>`).join('')}</div><p class="recipe-price8">${coinHTML(r.price)} <small>基础售价</small></p>${locked?`<p class="meta">等级 ${r.lv} 后可以制作</p>`:ok?`<button class="btn green" type="button" data-cook="${r.id}">开始做菜</button>`:'<button class="btn ghost" type="button" data-return-farm8>去农场收菜</button>'}`;
 detail.querySelector('[data-return-farm8]')?.addEventListener('click',()=>go('farm'));
};
const learn8=renderLearn;renderLearn=function(){learn8();if(!SCENE8.ready)return;const el=$('#learn'),left=h('<aside class="lesson-list8" aria-label="课程选择"></aside>'),right=h('<aside class="lesson-detail8 edge-paper8" aria-label="学习进度"></aside>');
 for(const child of [...el.children]){if(child.matches('.lv-head,.lv-acts,.lv-note'))right.append(child);else left.append(child);}
 if(!LRN().start){right.innerHTML=`<p class="eyebrow">从适合自己的地方开始</p><h3>选一个等级</h3><p>每天一小课。听一听，跟着豆豆开口说。</p><p class="meta">完成本级考试，再去下一站。</p>`;}
 el.append(left,right);
};
const settings8=openSettings;openSettings=function(page='play'){
 settings8();const L=[...document.querySelectorAll('.layer')].filter(l=>!l.dataset.closing).at(-1),sheet=L?.querySelector('.sheet'),node=sheet?.querySelector(':scope>.list');if(!node)return;
 L.classList.add('settings8');node.classList.add('settings-shell8');
 const groups=[['play','游戏'],['voice','声音'],['save','存档'],['edit','编辑'],['update','更新']],pages={};
 const header=h('<header class="settings-title8"><h3>设置</h3><small>生而向星</small></header>'),nav=h('<nav class="settings-nav8" role="tablist" aria-label="设置分类"></nav>'),body=h('<div class="settings-pages8"></div>');
 for(const[id,label]of groups){pages[id]=h(`<section class="settings-content8" id="settings8-${id}" role="tabpanel" aria-label="${label}"></section>`);body.append(pages[id]);const b=h(`<button type="button" role="tab" data-settings8="${id}" aria-controls="settings8-${id}">${label}</button>`);b.onclick=()=>select(id);nav.append(b);}
 let current='play';for(const child of [...node.children]){
  if(child.matches('h3')){child.remove();continue;}
  if(child.matches('.sec'))current=({'玩法':'play','存档':'save','版本':'update'})[child.textContent.trim()]||current;
  const id=child.matches('[data-fsec=voicepack],[data-learn]')&&child.querySelector('[data-mode]')?'voice':child.matches('[data-fsec]')?({voicepack:'voice',dev:'edit',backup:'save'})[child.dataset.fsec]||current:current;
  if(child.querySelector('[data-a=x]')&&child.children.length===1){child.remove();continue;}
  pages[id].append(child);
 }
 // Move existing nodes, retaining their original listeners, subscriptions and feature gates.
 for(const child of [...sheet.children]){
  if(child===node||child.matches('.panel-dismiss'))continue;
  if(child.matches('[data-installed-release]')){header.append(child);continue;}
  if(child.querySelector('[data-check7]'))pages.update.prepend(child);else pages.edit.append(child);
 }
 node.replaceChildren(header,nav,body);
 function select(id){if(!pages[id])id='play';for(const b of nav.children)b.setAttribute('aria-selected',String(b.dataset.settings8===id));for(const[k,p]of Object.entries(pages))p.hidden=k!==id;}
 select(page);
};
// The save entry on the player sheet should land on its actual category.
document.addEventListener('click',e=>{if(e.target.closest('[data-profile=save]'))requestAnimationFrame(()=>document.querySelector('[data-settings8=save]')?.click());});
