'use strict';
// One inventory of existing entrances. New entrances require a reviewed slot and a component.
const UI11={ready:false,park:null,pending:false,unknown:new Set(),registry:[
 {key:'profile',id:'hud',name:'个人信息',slot:'status',action:'profile'},
 ...[['seeds','种子','seed-picker'],['crops','仓库','inventory'],['decor','装扮','wardrobe'],['land','土地','land']].map(([id,name,action])=>({key:'drawer-'+id,selector:'#farmDock [data-cab='+id+']',name,slot:'drawer',action})),
 {key:'map',id:'bMap',name:'地图',slot:'utility',action:'map'},
 {key:'shop',id:'bShop',name:'商店',slot:'utility',action:'shop'},
 {key:'guide',id:'bGuide',name:'指南',slot:'utility',action:'guide'},
 {key:'settings',id:'bSet',name:'设置',slot:'header',action:'settings'},
 {key:'content',id:'bContent9',name:'活动大厅',slot:'activity',action:'activity'},
 ...['farm','kitchen','diner','words'].map((id,order)=>({key:'tab-'+id,selector:'#tabs [data-v='+id+']',name:['农场','厨房','小馆','学习'][order],slot:'navigation',action:'scene-'+id})),
 {key:'harvest',id:'bHarvest',name:'收获',slot:'play',action:'harvest'},
 ...['kitchen','diner','words'].map(id=>({key:'fold-'+id,selector:'#v-'+id+' .scene-fold8',name:'侧栏收展',slot:'scene',action:'fold-'+id}))
],retired:['bQuests','bBag','bSkin','bLabels','bPlant','bActions','bTool','bEditWorld']};
const UIComponents11={
 button(label,action,{variant='secondary',name=label}={}){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',name);b.className='ui-button11 ui-'+variant+'11';if(action)b.onclick=action;return b;},
 panel(node){node.classList.add('ui-panel11');return node;},
 decorate(root=document){for(const b of root.querySelectorAll('button,.link,summary')){b.classList.add('ui-button11');if(b.matches('.green,.c9-primary,[data-g10=save]'))b.classList.add('ui-primary11');else if(b.matches('.shortcut,.scene-fold8,.panel-dismiss'))b.classList.add('ui-icon11');else b.classList.add('ui-secondary11');}for(const p of root.querySelectorAll('.sheet,.g10-dialog'))this.panel(p);}
};
function ui11Target(r){return r.id?document.getElementById(r.id):document.querySelector(r.selector);}
function ui11Queue(){if(UI11.pending)return;UI11.pending=true;requestAnimationFrame(()=>{UI11.pending=false;if(!UI11.ready)return;ui11Collect();UIComponents11.decorate();ui11Measure();});}
function ui11Collect(){
 for(const id of UI11.retired){const b=document.getElementById(id);if(b&&b.parentElement!==UI11.park)UI11.park.append(b);}
 const left=document.getElementById('left-rail');for(const r of UI11.registry.filter(x=>x.slot==='utility')){const b=ui11Target(r);if(b&&b.parentElement!==left)left.append(b);if(b)b.setAttribute('aria-label',configUI4().labels[r.id]||r.name);}
 const settings=document.getElementById('bSet'),resources=document.getElementById('resources');if(settings&&resources&&settings.parentElement!==resources)resources.append(settings);
 const hall=document.getElementById('bContent9');if(hall){if(hall.parentElement.id!=='ui-activity11')document.getElementById('ui-activity11').append(hall);hall.setAttribute('aria-label','活动大厅');hall.title='活动大厅';hall.onclick=()=>c9Open(['events','tasks','growth'].find(k=>C9.config.settings[k+'Enabled'])||'events');}
 const harvest=document.getElementById('bHarvest');if(harvest&&harvest.parentElement.id!=='ui-play11')document.getElementById('ui-play11').append(harvest);
 for(const b of document.querySelectorAll('#app>button')){if(UI11.registry.some(r=>r.id===b.id)||UI11.retired.includes(b.id))continue;UI11.unknown.add(b.id||'(无编号)');b.hidden=true;UI11.park.append(b);}
 for(const id of ['top-controls','right-rail']){const node=document.getElementById(id);if(node&&!node.hidden)node.hidden=true;}
}
function ui11Measure(){
 if(S){const format=new Intl.NumberFormat('zh-CN',{notation:'compact',maximumSignificantDigits:3});for(const[id,host,value,label]of [['rCoins','resCoins',S.coins,'金币'],['rSeeds','resSeeds',Object.values(S.seeds).reduce((a,n)=>a+(+n||0),0),'种子'],['rDishes','resDishes',S.dishes.length,'菜品']]){const el=document.getElementById(id),text=format.format(value);if(el&&el.textContent!==text)el.textContent=text;document.getElementById(host)?.setAttribute('aria-label',label+' '+value);}}
 const head=document.getElementById('ui-head11'),footer=document.getElementById('ui-footer11');if(!head||!footer)return;
 const h=Math.ceil(head.getBoundingClientRect().bottom/8)*8,f=Math.ceil((innerHeight-footer.getBoundingClientRect().top)/8)*8;
 document.documentElement.style.setProperty('--ui-head',h+'px');document.documentElement.style.setProperty('--ui-footer',f+'px');
}
function ui11Audit(){
 const visible=r=>{const b=ui11Target(r);if(!b||b.closest('[hidden],[inert]'))return null;const s=getComputedStyle(b),x=b.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&x.width&&x.height?{key:r.key,action:r.action,slot:r.slot,x:x.x,y:x.y,w:x.width,h:x.height}:null;};
 const nodes=UI11.registry.map(visible).filter(Boolean),collisions=[];
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5)collisions.push([a.key,b.key]);}
 return{nodes,collisions,unknown:[...UI11.unknown],small:nodes.filter(x=>x.w<44||x.h<44).map(x=>x.key),outside:nodes.filter(x=>x.x<-.5||x.y<-.5||x.x+x.w>innerWidth+.5||x.y+x.h>innerHeight+.5).map(x=>x.key),duplicateActions:nodes.filter((x,i)=>nodes.findIndex(y=>y.action===x.action)!==i).map(x=>x.action)};
}
function initUILayout11(){
 const app=document.getElementById('app');document.body.classList.add('slots11');
 const overlay=h('<div id="ui-slots11"><div id="ui-head11"><div id="ui-status11"></div><div id="ui-resources11"></div></div><div id="ui-middle11"><div id="ui-utility11"></div><div id="ui-core-clear11" aria-hidden="true"></div><div id="ui-activity11"></div></div><div id="ui-footer11"><div id="ui-context11"></div><div id="ui-dock11"></div><div id="ui-navigation11"></div><div id="ui-play11"></div></div></div>');app.append(overlay);
 UI11.park=h('<div id="ui-park11" hidden inert></div>');app.append(UI11.park);
 for(const[id,host]of[['hud','ui-status11'],['resources','ui-resources11'],['left-rail','ui-utility11'],['farmDock','ui-dock11'],['tabs','ui-navigation11'],['seedHand','ui-context11'],['adjBar','ui-context11']]){const el=document.getElementById(id);if(el)document.getElementById(host).append(el);}
 // One shop entrance; seed purchases remain a secondary action inside the shop.
 document.getElementById('bShop').onclick=()=>C9.ready&&C9.config.settings.shopEnabled?c9Open('shop'):c9OriginalShop();
 // The existing category tabs are the only main entrances to inventory and wardrobe.
 for(const[id,name]of[['crops','仓库'],['decor','装扮'],['land','土地'],['seeds','种子']]){const b=document.querySelector('[data-cab='+id+']');b.setAttribute('aria-label',name);const span=b.querySelector('span');if(span)span.textContent=name;}
 for(const id of ['resCoins','resSeeds','resDishes']){const old=document.getElementById(id),stat=document.createElement('div');for(const a of old.attributes)if(a.name!=='type')stat.setAttribute(a.name,a.value);stat.setAttribute('role','img');stat.replaceChildren(...old.childNodes);old.replaceWith(stat);}
 UI11.ready=true;ui11Collect();UIComponents11.decorate();
 const observer=new MutationObserver(ui11Queue);observer.observe(app,{childList:true,subtree:true});observer.observe(document.getElementById('layers'),{childList:true,subtree:true});UI11.observer=observer;
 const resize=new ResizeObserver(ui11Measure);resize.observe(document.getElementById('ui-head11'));resize.observe(document.getElementById('ui-footer11'));window.addEventListener('resize',ui11Queue);ui11Measure();
}
const ui11Settings=openSettings;openSettings=function(page='play'){
 ui11Settings(page);const layer=[...document.querySelectorAll('.layer')].filter(l=>!l.dataset.closing).at(-1);if(!layer)return;
 const play=layer.querySelector('#settings8-play');if(play&&!play.querySelector('[data-ui-labels11]')){const b=UIComponents11.button('英文标签：'+(S.cfg.labels?'显示':'隐藏'),()=>{document.getElementById('bLabels').click();b.textContent='英文标签：'+(S.cfg.labels?'显示':'隐藏');});b.dataset.uiLabels11='';play.append(b);}
 const edit=layer.querySelector('[data-settings8=edit]');if(edit)edit.hidden=!G10.activated||!G10.allowed();
 if(page==='edit'&&edit?.hidden)layer.querySelector('[data-settings8=play]')?.click();UIComponents11.decorate(layer);
};
// Keep shop and activity navigation separate so each has one primary entrance.
const ui11Hub=c9DrawHub;c9DrawHub=function(){
 ui11Hub();const hub=C9.hub;if(!hub?.node.isConnected||C9.preview)return;
 const shop=C9.page==='shop';hub.node.dataset.uiHub11=shop?'shop':'activity';
 for(const b of hub.nav.querySelectorAll('[data-c9-page]'))if((b.dataset.c9Page==='shop')!==shop)b.remove();
 if(!shop){const b=UIComponents11.button('田园任务',()=>c9OriginalTasks());b.dataset.farmTasks11='';hub.nav.append(b);}
 UIComponents11.decorate(hub.node);
};

const ui11ContentEntry=c9UpdateEntry;c9UpdateEntry=function(){ui11ContentEntry();const b=document.getElementById('bContent9');if(b&&C9.ready){const hidden=!['tasks','events','growth'].some(k=>C9.config.settings[k+'Enabled']);if(b.hidden!==hidden)b.hidden=hidden;b.setAttribute('aria-label','活动大厅');}};

// All legacy modal calls share the same surface and button component contract.
const ui11Layer=openLayer;UIComponents11.dialog=function(node,options={}){const L=ui11Layer(node,options);this.panel(L.querySelector('.sheet'));this.decorate(L);return L;};
openLayer=function(node,options={}){return UIComponents11.dialog(node,options);};
Object.freeze(UI11.registry);UI11.registry.forEach(Object.freeze);

function ui11SyncNavOrder(order){if(!G10.ready||!S.cfg.god10)return;const ori=g10Orientation(),d=S.cfg.god10;if(!d.layouts[ori])d.layouts[ori]=g10Copy(d.layouts.landscape||{});order.forEach((id,index)=>{const key='tab-'+id,p=d.layouts[ori][key]||g10DefaultPlacement(key);d.layouts[ori][key]={...p,order:index};});g10ApplyLayout();}
