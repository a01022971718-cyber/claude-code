'use strict';
// On-device authoring. The native debuggable flag, never a save-file switch, gates entry.
window.GodEditor10={
 ready:false,activated:false,session:null,records:new Map(),urls:new Map(),timer:0,observer:null,
 allowed(){try{if(window.AndroidFiles)return typeof AndroidFiles.isEditorBuild==='function'&&AndroidFiles.isEditorBuild()===true;return ['127.0.0.1','localhost','[::1]'].includes(location.hostname);}catch(_){return false;}}
};
const G10=GodEditor10;
const G10_TARGETS=[
 ['map','#bMap','地图','utility'],['shop','#bShop','商店','utility'],['guide','#bGuide','指南','utility'],['settings','#bSet','设置','header'],['content','#bContent9','活动大厅','activity'],
 ['tab-farm','#tabs [data-v=farm]','农场标签','navigation'],['tab-kitchen','#tabs [data-v=kitchen]','厨房标签','navigation'],['tab-diner','#tabs [data-v=diner]','小馆标签','navigation'],['tab-words','#tabs [data-v=words]','学习标签','navigation'],
 ['fold-kitchen','#v-kitchen .scene-fold8','厨房收展','scene'],['fold-diner','#v-diner .scene-fold8','小馆收展','scene'],['fold-words','#v-words .scene-fold8','学习收展','scene']
];
const G10_SLOT_NAMES={header:'顶部 · 基础设置',utility:'左侧 · 基础功能区',activity:'右侧 · 活动区',navigation:'底部 · 场景导航',scene:'场景 · 侧栏标题'};
const g10Copy=x=>JSON.parse(JSON.stringify(x));
const g10Clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Keep coordinate units stable while the phone keyboard temporarily reduces the viewport.
const g10Viewport=()=>G10.session?.inputViewport||{w:innerWidth,h:innerHeight};
const g10Orientation=()=>g10Viewport().w>=g10Viewport().h?'landscape':'portrait';
const g10Empty=()=>({v:2,layouts:{landscape:{}},backgrounds:{}});
function g10Valid(raw){
 const d=g10Copy(raw),obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 if(!obj(d)||![1,2].includes(d.v)||!obj(d.layouts)||!obj(d.backgrounds))throw Error('编辑配置格式不正确');
 for(const[ori,map]of Object.entries(d.layouts)){
  if(!['landscape','portrait'].includes(ori)||!obj(map))throw Error('界面方向不正确');
  for(const[key,p]of Object.entries(map)){
   const t=G10_TARGETS.find(t=>t[0]===key);if(!t){delete map[key];continue;}
   if(!obj(p)||p.image&&!/^asset10_[\w-]+$/.test(p.image))throw Error('按钮素材不正确');
   if(d.v===1){map[key]={slot:t[3],order:g10DefaultPlacement(key).order,iconScale:g10Clamp(p.scale||1,.5,1.25),...(p.image?{image:p.image}:{})};}
   else if(p.slot!==t[3]||!Number.isInteger(p.order)||p.order<0||p.order>100||!Number.isFinite(p.iconScale)||p.iconScale<.5||p.iconScale>1.25)throw Error('按钮必须使用已登记槽位');
  }
 }
 for(const[id,asset]of Object.entries(d.backgrounds))if(!/^[\w-]{1,100}$/.test(id)||!/^asset10_[\w-]+$/.test(asset))throw Error('背景配置不正确');
 d.v=2;return d;
}
function g10Data(){return G10.session?.draft||S?.cfg.god10||g10Empty();}
function g10Layout(d=g10Data()){return d.layouts[g10Orientation()]||d.layouts.landscape||{};}
function g10URL(id){
 if(!id||!G10.records.has(id))return null;if(!G10.urls.has(id))G10.urls.set(id,URL.createObjectURL(G10.records.get(id).blob));return G10.urls.get(id);
}
let g10DBPromise;
function g10DB(){return g10DBPromise||=(new Promise((resolve,reject)=>{
 const r=indexedDB.open('xingxing-editor-assets10'+NS,1);r.onupgradeneeded=()=>r.result.createObjectStore('images',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
}));}
async function g10ReadAssets(){const db=await g10DB();return new Promise((resolve,reject)=>{const r=db.transaction('images').objectStore('images').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function g10WriteAssets(add=[],remove=[]){
 const db=await g10DB();return new Promise((resolve,reject)=>{const t=db.transaction('images','readwrite'),st=t.objectStore('images');for(const id of remove)st.delete(id);for(const r of add)st.put(r);t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(t.error||Error('素材没有存下，请清理空间后重试'));});
}
function g10Referenced(){
 const refs=new Set(),walk=v=>{if(typeof v==='string'&&v.startsWith('asset10_'))refs.add(v);else if(v&&typeof v==='object')for(const x of Object.values(v))walk(x);};
 walk(S);if(G10.session){walk(G10.session.draft);walk(G10.session.history);walk(G10.session.redo);}return refs;
}
async function g10Cleanup(automatic=false){
 const refs=g10Referenced(),cutoff=Date.now()-7*86400000,ids=[...G10.records.values()].filter(r=>!refs.has(r.id)&&(!automatic||r.t<cutoff)).map(r=>r.id);
 if(!ids.length)return 0;await g10WriteAssets([],ids);
 for(const id of ids){const url=G10.urls.get(id);if(url){if(typeof FS!=='undefined'&&FS?.textures?.exists('bg:'+url)&&FS.bgImg?.texture.key!=='bg:'+url)FS.textures.remove('bg:'+url);if(typeof BGIMG!=='undefined')delete BGIMG[url];URL.revokeObjectURL(url);}G10.urls.delete(id);const thumb=G10.urls.get(id+':thumb');if(thumb)URL.revokeObjectURL(thumb);G10.urls.delete(id+':thumb');G10.records.delete(id);delete IMG_URL[id];}
 return ids.length;
}
function g10Haptic(){const now=performance.now();if(now-(G10.hapticAt||0)<100)return;G10.hapticAt=now;try{if(window.AndroidFiles?.editorHaptic)AndroidFiles.editorHaptic();else navigator.vibrate?.(12);}catch(_){}}
async function g10ImageDimensions(file){
 // Inspect headers before decoding; a small compressed photo can otherwise exhaust phone memory.
 const b=new Uint8Array(await file.slice(0,1048576).arrayBuffer()),v=new DataView(b.buffer),u24=p=>b[p]+b[p+1]*256+b[p+2]*65536;
 if(b.length>=24&&v.getUint32(0)===0x89504e47&&v.getUint32(4)===0x0d0a1a0a)return[v.getUint32(16),v.getUint32(20)];
 if(b.length>=30&&v.getUint32(0)===0x52494646&&v.getUint32(8)===0x57454250){
  if(v.getUint32(12)===0x56503858)return[u24(24)+1,u24(27)+1];
  if(v.getUint32(12)===0x56503820&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return[v.getUint16(26,true)&16383,v.getUint16(28,true)&16383];
  if(v.getUint32(12)===0x5650384c&&b[20]===0x2f)return[1+b[21]+((b[22]&63)<<8),1+(b[22]>>6)+(b[23]<<2)+((b[24]&15)<<10)];
 }
 if(b.length>4&&b[0]===255&&b[1]===216){
  for(let p=2;p+4<b.length;){if(b[p++]!==255)break;while(b[p]===255)p++;const mark=b[p++];if(mark===217||mark===218)break;if(mark===1||(mark>=208&&mark<=215))continue;
   const n=v.getUint16(p);if(n<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(mark)&&p+7<b.length)return[v.getUint16(p+5),v.getUint16(p+3)];p+=n;
  }
 }
 throw Error('无法确认图片尺寸，请重新导出为 PNG、JPG 或 WebP');
}
async function g10Compress(file,kind){
 if(!G10.allowed())throw Error('当前版本没有编辑权限');
 if(file.size>16*1024*1024||!file.size)throw Error('图片请小于 16MB');
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('请选择 PNG、JPG 或 WebP 图片');
 const [sourceW,sourceH]=await g10ImageDimensions(file);if(!sourceW||!sourceH||sourceW>8192||sourceH>8192||sourceW*sourceH>32000000)throw Error('原图请控制在 8192 边长、3200 万像素以内');
 const im=await createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>{throw Error('图片无法读取');});
 try{
  if(im.width>8192||im.height>8192||im.width*im.height>32000000)throw Error('原图像素过大，请缩小后再导入');
  const cv=document.createElement('canvas');if(kind==='background'){cv.width=2048;cv.height=1152;}else{const k=Math.min(1,1024/Math.max(im.width,im.height));cv.width=Math.max(1,Math.round(im.width*k));cv.height=Math.max(1,Math.round(im.height*k));}
  const g=cv.getContext('2d');g.imageSmoothingEnabled=kind!=='icon';g.imageSmoothingQuality='high';
  const k=kind==='background'?Math.max(cv.width/im.width,cv.height/im.height):cv.width/im.width;
  g.drawImage(im,(cv.width-im.width*k)/2,(cv.height-im.height*k)/2,im.width*k,im.height*k);
  let blob;for(const quality of [.92,.8,.65]){blob=await new Promise(resolve=>cv.toBlob(resolve,'image/webp',quality));if(blob&&blob.size<=3*1024*1024)break;}
  if(!blob)throw Error('图片压缩失败');if(blob.size>3*1024*1024)throw Error('图片压缩后仍超过 3MB，请减少图片细节');
  const thumbCanvas=document.createElement('canvas');thumbCanvas.width=160;thumbCanvas.height=100;const tg=thumbCanvas.getContext('2d'),tk=Math.min(160/cv.width,100/cv.height);tg.drawImage(cv,(160-cv.width*tk)/2,(100-cv.height*tk)/2,cv.width*tk,cv.height*tk);const thumb=await new Promise(resolve=>thumbCanvas.toBlob(resolve,'image/webp',.75));
  return{blob,thumb,w:cv.width,h:cv.height,kind,t:Date.now(),name:file.name.replace(/\.[^.]+$/,'').slice(0,40)||'图片'};
 }finally{im.close();}
}
async function g10Import(file,kind){
 const rec=await g10Compress(file,kind);await g10Cleanup(true);
 const total=[...G10.records.values()].reduce((n,r)=>n+r.blob.size+(r.thumb?.size||0),0);
 if(G10.records.size>=80||total+rec.blob.size+(rec.thumb?.size||0)>32*1024*1024)throw Error('素材库已满，请先清理未使用图片');
 rec.id='asset10_'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
 await g10WriteAssets([rec]);G10.records.set(rec.id,rec);IMG_URL[rec.id]=g10URL(rec.id);return rec;
}
function g10Pick(kind,callback){
 if(!G10.allowed())return;
 const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;document.body.append(input);
 const timer=setTimeout(()=>input.remove(),180000);input.oncancel=()=>{clearTimeout(timer);input.remove();};
 input.onchange=async()=>{clearTimeout(timer);const file=input.files?.[0];input.remove();if(!file)return;const s=G10.session;if(!s||s.busy)return;s.busy=true;g10Status('正在压缩并保存素材…');g10Controls();
  try{const r=await g10Import(file,kind);if(G10.session===s){callback(r);g10Status('已替换预览；点保存后生效');}}
  catch(e){g10Status(e.message);toast(e.message);}
  finally{if(G10.session===s){s.busy=false;g10Controls();}}
 };input.click();
}
const G10_ORIGINAL_STYLES=new WeakMap();
function g10OriginalStyle(el){
 if(!G10_ORIGINAL_STYLES.has(el))G10_ORIGINAL_STYLES.set(el,{translate:el.style.translate,scale:el.style.scale,transformOrigin:el.style.transformOrigin,position:el.style.position});
 return G10_ORIGINAL_STYLES.get(el);
}
function g10BaseRect(el){
 const original=g10OriginalStyle(el);el.style.translate=original.translate;el.style.scale=original.scale;el.style.transformOrigin=original.transformOrigin;el.style.position=original.position;return el.getBoundingClientRect();
}
function g10Visible(el){return !!el&&!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[inert]')&&el.getBoundingClientRect().width>0;}
function g10Target(key){const t=G10_TARGETS.find(t=>t[0]===key);return t&&document.querySelector(t[1]);}
function g10ApplyLayout(){
 if(!G10.ready||!S)return;const map=g10Layout();
 for(const[key,selector,name,slot]of G10_TARGETS){
  const el=document.querySelector(selector);if(!el)continue;const p=map[key],original=g10OriginalStyle(el);
  el.style.translate=original.translate;el.style.scale=original.scale;el.style.transformOrigin=original.transformOrigin;el.style.position=original.position;
  el.style.order=String(p?.order??g10DefaultPlacement(key).order);
  el.style.setProperty('--g10-icon-scale',String(p?.iconScale||1));
  let art=el.querySelector(':scope>.g10-art');const url=p?.image&&g10URL(p.image);
  if(url){el.classList.add('g10-custom-image');if(getComputedStyle(el).position==='static')el.style.position='relative';if(!art){art=document.createElement('img');art.className='g10-art';art.alt='';art.draggable=false;el.append(art);}if(art.src!==url)art.src=url;}
  else{el.classList.remove('g10-custom-image');art?.remove();}
 }
 if(G10.session)g10DrawFrame();g10LockReleaseUI();if(typeof ui11Queue==='function')ui11Queue();
}
function g10Queue(){clearTimeout(G10.timer);G10.timer=setTimeout(g10ApplyLayout,60);}
const G10_BASE_BG=bgOf;bgOf=function(id){
 const bg=G10_BASE_BG(id),asset=g10Data().backgrounds?.[id],url=asset&&g10URL(asset);
 if(bg&&url){IMG_URL[asset]=url;return{...bg,open:asset,locked:undefined};}return bg;
};
function g10Status(text){const el=document.querySelector('#g10-status');if(el)el.textContent=text;}
function g10EnsureMap(){const s=G10.session,ori=g10Orientation();if(!s.draft.layouts[ori])s.draft.layouts[ori]=g10Copy(s.draft.layouts.landscape||{});return s.draft.layouts[ori];}
function g10Remember(){const s=G10.session;s.history.push(g10Copy(s.draft));if(s.history.length>40)s.history.shift();s.redo=[];}
function g10Changed(background=false){g10ApplyLayout();if(background)setFarmBg();g10Controls();}
function g10Undo(redo=false){
 const s=G10.session;if(!s||s.busy)return;const from=redo?s.redo:s.history,to=redo?s.history:s.redo;if(!from.length)return;to.push(g10Copy(s.draft));s.draft=from.pop();g10Changed(true);g10Status(redo?'已重做':'已撤销');
}
function g10SetBackground(assetId){
 if(!G10.session||!G10.records.has(assetId))return;g10Remember();G10.session.draft.backgrounds[curBg().id]=assetId;g10Changed(true);
}
function g10SetImage(assetId){const s=G10.session,el=s&&g10Target(s.selected);if(!el||!G10.records.has(assetId))return;
 g10Remember();const map=g10EnsureMap(),p=map[s.selected]||g10DefaultPlacement(s.selected);p.image=assetId;map[s.selected]=p;g10Changed();
}
function g10ResetSelected(){const s=G10.session;if(!s?.selected)return;g10Remember();delete g10EnsureMap()[s.selected];g10Changed();g10Status('这一个按钮已恢复默认顺序和图标');}
function g10ClearBackground(){const s=G10.session;if(!s?.draft.backgrounds[curBg().id])return;g10Remember();delete s.draft.backgrounds[curBg().id];g10Changed(true);}
function g10Save(){
 const s=G10.session;if(!s||s.busy||!G10.allowed())return;
 try{
  const data=g10Valid(s.draft);for(const id of g10IDs(data))if(!G10.records.has(id))throw Error('素材还没有存下，无法保存');
  const order=g10Ordered('tab-farm').map(k=>k.slice(4)),uiEdit={...S.cfg.uiEdit,order},t=Date.now(),next={...S,t,cfg:{...S.cfg,god10:data,uiEdit}};localStorage.setItem(SAVE_KEY,JSON.stringify(next));S.cfg.god10=data;S.cfg.uiEdit=uiEdit;S.t=t;
  g10Close(true);toast('按钮槽位和背景已保存');
 }catch(e){g10Status('没有保存：'+e.message);toast('保存失败，改动仍在预览中');}
}
function g10IDs(data){const set=new Set();for(const map of Object.values(data.layouts||{}))for(const p of Object.values(map))if(p.image)set.add(p.image);for(const id of Object.values(data.backgrounds||{}))if(id)set.add(id);return set;}
function g10Close(saved=false){
 const s=G10.session;if(!s)return;if(s.busy&&!saved)return g10Status('素材处理中，请稍候');
 G10.session=null;s.root.remove();document.body.classList.remove('god-editing10');g10ApplyLayout();setFarmBg();FARM.noClick=performance.now();G10.suppressUntil=performance.now()+400;g10Queue();
}
function g10Open(){
 if(!G10.allowed()||!G10.activated)return false;if(G10.session)return true;if(!G10.ready)return toast('素材库正在读取，请稍候');
 if(document.querySelector('.layer')||FARM.adjust||CAB_OPEN)return toast('先收起当前面板');
 const root=h('<div id="god-editor10" role="region" aria-label="游戏内编辑模式"><div class="g10-grid"></div><div class="g10-guide g10-guide-x"></div><div class="g10-guide g10-guide-y"></div><div class="g10-frame"><span></span></div><canvas class="g10-loupe" width="160" height="112" aria-label="定位放大镜"></canvas><div class="g10-toolbar"><strong>开发编辑</strong><button data-g10="components">组件</button><button data-g10="library">素材</button><button data-g10="background">换背景</button><button data-g10="undo">撤销</button><button data-g10="redo">重做</button><button data-g10="cancel">取消</button><button class="g10-primary" data-g10="save">保存</button></div><aside class="g10-inspector"><div class="g10-inspector-title"><strong>点选或拖动一个按钮</strong><button data-g10="fold" aria-label="收起属性">⌄</button></div><div class="g10-fields" hidden><p class="g10-anchor"></p><div class="g10-row"><button data-g10="earlier">前一格</button><button data-g10="later">后一格</button></div><label class="g10-scale">图案 <input type="number" data-axis10="scale" min="50" max="125" step="25">%</label><div class="g10-row"><button data-g10="image">换图标</button><button data-g10="reset">还原此项</button></div></div><p class="g10-rules">8px网格 · 槽位自动对齐 · 热区统一</p><p id="g10-status" role="status">拖动按钮在本区排序；双指调整图案，热区保持一致。</p></aside></div>');
 document.body.append(root);document.body.classList.add('god-editing10');if(typeof UIComponents11!=='undefined')UIComponents11.decorate(root);
 G10.session={root,draft:g10Copy(S.cfg.god10||g10Empty()),selected:null,history:[],redo:[],pointers:new Map(),gesture:null,grid:true,snap:true,busy:false,folded:false};
 root.querySelector('.g10-loupe').hidden=true;
 root.addEventListener('pointerdown',g10PointerDown);root.addEventListener('pointermove',g10PointerMove);root.addEventListener('pointerup',g10PointerUp);root.addEventListener('pointercancel',g10PointerCancel);root.addEventListener('lostpointercapture',e=>{if(G10.session?.pointers.has(e.pointerId))g10PointerCancel(e);});
 root.addEventListener('click',g10Click);
 for(const input of root.querySelectorAll('[data-axis10]'))input.addEventListener('change',g10Exact);
 root.addEventListener('focusin',e=>{if(e.target.matches('[data-axis10]')&&!G10.session.inputViewport)G10.session.inputViewport={w:innerWidth,h:innerHeight};});
 root.addEventListener('focusout',()=>setTimeout(()=>{if(G10.session===sForFocus&&!document.activeElement?.matches('[data-axis10]')){delete sForFocus.inputViewport;g10Queue();}},400));
 const sForFocus=G10.session;
 g10Controls();g10Haptic();return true;
}
G10.open=g10Open;G10.close=g10Close;
function g10Controls(){
 const s=G10.session;if(!s)return;
 for(const b of s.root.querySelectorAll('.g10-toolbar button'))b.disabled=s.busy;
 s.root.querySelector('[data-g10=undo]').disabled=s.busy||!s.history.length;s.root.querySelector('[data-g10=redo]').disabled=s.busy||!s.redo.length;
 s.root.querySelector('.g10-fields').hidden=!s.selected||s.folded;g10DrawFrame();
}
function g10DrawFrame(){
 const s=G10.session;if(!s)return;const el=g10Target(s.selected),frame=s.root.querySelector('.g10-frame'),fields=s.root.querySelector('.g10-fields');
 if(!g10Visible(el)){frame.hidden=true;fields.hidden=true;return;}
 frame.hidden=false;const r=el.getBoundingClientRect();frame.style.left=(r.x-4)+'px';frame.style.top=(r.y-4)+'px';frame.style.width=(r.width+8)+'px';frame.style.height=(r.height+8)+'px';
 const label=G10_TARGETS.find(t=>t[0]===s.selected)[2];frame.firstChild.textContent=label;s.root.querySelector('.g10-inspector-title strong').textContent=label;
 const active=document.activeElement,p=g10Layout()[s.selected]||g10DefaultPlacement(s.selected);
 const scaleInput=s.root.querySelector('[data-axis10=scale]');if(scaleInput!==active)scaleInput.value=Math.round(p.iconScale*100);
 s.root.querySelector('.g10-anchor').textContent='锚点：'+G10_SLOT_NAMES[p.slot];
 const group=g10Ordered(s.selected);s.root.querySelector('[data-g10=earlier]').disabled=group.indexOf(s.selected)<=0;s.root.querySelector('[data-g10=later]').disabled=group.indexOf(s.selected)>=group.length-1;

 fields.hidden=s.folded;
}
function g10Choose(key){
 const s=G10.session;if(!s||!g10Visible(g10Target(key)))return;s.selected=key;s.folded=false;g10Controls();g10Status('本区拖动排序；锚点和8px间距自动保持');
}
function g10Hit(x,y){
 const s=G10.session;s.root.style.pointerEvents='none';const hit=document.elementFromPoint(x,y);s.root.style.pointerEvents='';
 for(const[key,selector]of G10_TARGETS){const el=document.querySelector(selector);if(g10Visible(el)&&(hit===el||el.contains(hit)))return key;}
 return null;
}
function g10DefaultPlacement(key){const t=G10_TARGETS.find(t=>t[0]===key);return{slot:t[3],order:t[3]==='navigation'?configUI4().order.indexOf(key.slice(4)):G10_TARGETS.filter(x=>x[3]===t[3]).findIndex(x=>x[0]===key),iconScale:1};}
function g10Ordered(key){const slot=G10_TARGETS.find(t=>t[0]===key)[3],map=g10Layout();return G10_TARGETS.filter(t=>t[3]===slot&&g10Visible(g10Target(t[0]))).map(t=>t[0]).sort((a,b)=>(map[a]?.order??g10DefaultPlacement(a).order)-(map[b]?.order??g10DefaultPlacement(b).order));}
function g10Reorder(keys){const map=g10EnsureMap();keys.forEach((key,order)=>map[key]={...(map[key]||g10DefaultPlacement(key)),order});g10ApplyLayout();g10Haptic();}
function g10Step(dir){const s=G10.session,keys=s?.selected&&g10Ordered(s.selected);if(!keys)return;const i=keys.indexOf(s.selected),j=i+dir;if(j<0||j>=keys.length)return;g10Remember();[keys[i],keys[j]]=[keys[j],keys[i]];g10Reorder(keys);g10Controls();}
function g10PointerDown(e){
 const s=G10.session;if(!s||s.busy||e.target.closest('.g10-toolbar,.g10-inspector,.g10-dialog-shade'))return;e.preventDefault();e.stopPropagation();
 if(!s.pointers.size){const hit=g10Hit(e.clientX,e.clientY);if(!hit){s.selected=null;s.root.querySelector('.g10-inspector-title strong').textContent='点选或拖动一个按钮';g10Controls();return;}g10Choose(hit);
  s.gesture={base:g10Copy(s.draft),history:s.history.slice(),redo:s.redo.slice(),x:e.clientX,y:e.clientY,scale:(g10Layout()[hit]||g10DefaultPlacement(hit)).iconScale,moved:false,ended:false,pinch:false};
 }
 if(!s.gesture||s.gesture.ended)return;s.pointers.set(e.pointerId,[e.clientX,e.clientY]);s.root.setPointerCapture(e.pointerId);
 if(s.pointers.size===2){const[a,b]=[...s.pointers.values()];Object.assign(s.gesture,{pinch:true,distance:Math.hypot(a[0]-b[0],a[1]-b[1])||1,scale:(g10Layout()[s.selected]||g10DefaultPlacement(s.selected)).iconScale});}
}
function g10PointerMove(e){
 const s=G10.session,g=s?.gesture;if(!s||!g||g.ended||!s.pointers.has(e.pointerId))return;e.preventDefault();s.pointers.set(e.pointerId,[e.clientX,e.clientY]);
 if(s.pointers.size===2){const[a,b]=[...s.pointers.values()],scale=g10Clamp(Math.round(g.scale*Math.hypot(a[0]-b[0],a[1]-b[1])/g.distance*4)/4,.5,1.25);if(!g.moved){g10Remember();g.moved=true;}const map=g10EnsureMap();map[s.selected]={...(map[s.selected]||g10DefaultPlacement(s.selected)),iconScale:scale};g10ApplyLayout();}
 else{if(g.pinch||Math.hypot(e.clientX-g.x,e.clientY-g.y)<8&&!g.moved)return;
  const keys=g10Ordered(s.selected),nearest=keys.filter(k=>k!==s.selected).map(k=>{const r=g10Target(k).getBoundingClientRect();return{key:k,d:Math.hypot(e.clientX-r.x-r.width/2,e.clientY-r.y-r.height/2)};}).sort((a,b)=>a.d-b.d)[0];
  if(nearest&&nearest.d<=36){const i=keys.indexOf(s.selected),j=keys.indexOf(nearest.key);if(!g.moved){g10Remember();g.moved=true;}keys.splice(i,1);keys.splice(j,0,s.selected);g10Reorder(keys);}
 }
 g10Loupe();g10Controls();
}
function g10Finish(){const s=G10.session;if(!s)return;s.gesture=null;s.pointers.clear();s.root.querySelector('.g10-loupe').hidden=true;g10DrawFrame();}
function g10PointerUp(e){const s=G10.session;if(!s?.pointers.has(e.pointerId))return;e.preventDefault();s.pointers.delete(e.pointerId);if(s.gesture)s.gesture.ended=true;if(!s.pointers.size)g10Finish();}
function g10PointerCancel(){const s=G10.session;if(!s?.gesture)return;if(s.gesture.moved){s.draft=s.gesture.base;s.history=s.gesture.history;s.redo=s.gesture.redo;g10ApplyLayout();}g10Finish();g10Controls();}
function g10Exact(e){const s=G10.session;if(!s?.selected)return;const value=Number(e.target.value);if(!Number.isFinite(value))return g10Status('请输入有效比例');g10Remember();const map=g10EnsureMap();map[s.selected]={...(map[s.selected]||g10DefaultPlacement(s.selected)),iconScale:g10Clamp(Math.round(value/25)/4,.5,1.25)};g10Changed();}
function g10Loupe(){
 const s=G10.session,cv=s.root.querySelector('.g10-loupe'),g=cv.getContext('2d'),el=g10Target(s.selected),r=el.getBoundingClientRect();cv.hidden=false;
 cv.classList.toggle('g10-loupe-left',r.x>innerWidth/2);g.fillStyle='#FAF3CA';g.fillRect(0,0,160,112);const im=el.querySelector('.g10-art')||el.querySelector('img');if(im?.complete&&im.naturalWidth)g.drawImage(im,40,8,80,80);g.fillStyle='#623012';g.font='12px sans-serif';g.fillText('槽位吸附 · 8px网格',12,104);
}
function g10Dialog(title){
 const s=G10.session;if(!s)return;s.dialog?.close();
 const shade=h('<div class="g10-dialog-shade"><section class="g10-dialog" role="dialog" aria-modal="true"><header><h3></h3><button type="button" data-close10>收起</button></header><div class="g10-dialog-body"></div></section></div>');
 shade.querySelector('h3').textContent=title;s.root.append(shade);if(typeof UIComponents11!=='undefined')UIComponents11.decorate(shade);const body=shade.querySelector('.g10-dialog-body'),previous=document.activeElement;
 const close=()=>{if(!shade.isConnected)return;shade.remove();if(s.dialog?.shade===shade)s.dialog=null;previous?.isConnected&&previous.focus({preventScroll:true});};
 shade.querySelector('[data-close10]').onclick=close;shade.onclick=e=>{if(e.target===shade)close();};s.dialog={shade,close};
 shade.querySelector('button').focus({preventScroll:true});return{body,close,shade};
}
function g10Components(){
 const p=g10Dialog('组件搜索与工作场景');if(!p)return;
 const scenes=h('<div class="g10-row"></div>');for(const[id,name]of[['farm','农场'],['kitchen','厨房'],['diner','小馆'],['words','学习']]){
  const b=document.createElement('button');b.type='button';b.textContent=name;b.disabled=(id==='kitchen'&&!feat('kitchen'))||(id==='diner'&&!feat('diner'))||(id==='words'&&!feat('learn'));
  b.onclick=()=>{go(id);G10.session.selected=null;p.close();g10Queue();g10Controls();};scenes.append(b);
 }p.body.append(scenes);
 const input=document.createElement('input');input.type='search';input.placeholder='搜索按钮名称，例如 地图、厨房';input.setAttribute('aria-label','搜索组件');p.body.append(input);
 const list=document.createElement('div');list.className='g10-component-list';p.body.append(list);
 const draw=()=>{list.replaceChildren();for(const[key,sel,name]of G10_TARGETS){if(!name.includes(input.value.trim())&&!key.includes(input.value.trim()))continue;
  const el=document.querySelector(sel),visible=g10Visible(el),b=document.createElement('button');b.type='button';b.textContent=name+(visible?'':' · 当前场景未显示');b.disabled=!visible;b.dataset.component10=key;b.onclick=()=>{p.close();g10Choose(key);};list.append(b);
 }};input.oninput=draw;draw();
}
async function g10UseRecord(id,mode){
 const s=G10.session,rec=G10.records.get(id);if(!s||!rec||s.busy)return;
 if(mode==='image'&&!s.selected)return g10Status('先选中一个按钮，再从素材库替换图标');
 s.busy=true;g10Controls();
 try{
  let use=rec;
  if(mode==='background'&&(rec.w!==2048||rec.h!==1152)){use=await g10Import(new File([rec.blob],rec.name+'.webp',{type:rec.blob.type}), 'background');}
  if(G10.session!==s)return;
  s.dialog?.close();if(mode==='background')g10SetBackground(use.id);else g10SetImage(use.id);g10Status('已替换预览，点保存后记住');
 }catch(e){g10Status(e.message);toast(e.message);}
 finally{if(G10.session===s){s.busy=false;g10Controls();}}
}
function g10Library(mode='browse'){
 const p=g10Dialog(mode==='background'?'选择农场背景':mode==='image'?'选择按钮图标':'游戏内素材库');if(!p)return;
 const toolbar=h('<div class="g10-row"></div>'),upload=document.createElement('button');upload.type='button';upload.textContent='从相册或文件导入';
 upload.onclick=()=>g10Pick(mode==='background'?'background':'icon',r=>{if(mode==='background'){p.close();g10SetBackground(r.id);}else if(mode==='image'){p.close();g10SetImage(r.id);}else draw();});toolbar.append(upload);
 const clean=document.createElement('button');clean.type='button';clean.textContent='清理未用图片';clean.onclick=()=>{
  const refs=g10Referenced(),ids=[...G10.records.keys()].filter(id=>!refs.has(id)),confirm=g10Dialog('清理未使用图片');const t=document.createElement('p');t.textContent='将删除 '+ids.length+' 张未被当前存档、预览或撤销记录引用的图片。';confirm.body.append(t);
  const b=document.createElement('button');b.type='button';b.textContent='确认清理';b.disabled=!ids.length;b.onclick=async()=>{try{const n=await g10Cleanup();confirm.close();g10Library(mode);g10Status('已清理 '+n+' 张图片');}catch(e){toast(e.message);}};confirm.body.append(b);
 };toolbar.append(clean);p.body.append(toolbar);
 const desc=document.createElement('p');desc.className='g10-note';desc.textContent='仅本机保存。背景会居中裁切为 16:9；按钮图标保留透明和比例。';p.body.append(desc);
 const list=document.createElement('div');list.className='g10-asset-grid';p.body.append(list);const pages=h('<div class="g10-row"></div>');p.body.append(pages);let page=0;
 function draw(){
  list.replaceChildren();pages.replaceChildren();const all=[...G10.records.values()].sort((a,b)=>b.t-a.t),slice=all.slice(page*12,page*12+12),used=g10Referenced();
  for(const r of slice){
   const card=h('<article class="g10-asset-card"><img alt=""><b></b><small></small><div class="g10-row"></div></article>');
   card.querySelector('img').src=g10ThumbURL(r);card.querySelector('b').textContent=r.name;
   card.querySelector('small').textContent=r.w+' × '+r.h+' · '+Math.ceil(r.blob.size/1024)+' KB'+(used.has(r.id)?' · 已引用':'');
   const row=card.querySelector('.g10-row');
   for(const[k,label]of mode==='browse'?[['background','用作背景'],['image','用作图标']]:[[mode,'使用这张']]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=k==='image'&&!G10.session?.selected;b.onclick=()=>g10UseRecord(r.id,k);row.append(b);
   }list.append(card);
  }
  if(!all.length){const empty=document.createElement('p');empty.textContent='还没有上传图片。';list.append(empty);}
  if(all.length>12){for(const[dir,label]of[[-1,'上一页'],[1,'下一页']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=dir<0?page===0:(page+1)*12>=all.length;b.onclick=()=>{page+=dir;draw();};pages.append(b);}}
 }
 draw();
}
function g10ThumbURL(rec){
 const key=rec.id+':thumb';if(!G10.urls.has(key))G10.urls.set(key,URL.createObjectURL(rec.thumb||rec.blob));return G10.urls.get(key);
}
function g10Click(e){
 const b=e.target.closest('[data-g10]');if(!b||!G10.session||G10.session.busy)return;
 const action=b.dataset.g10,s=G10.session;
 if(action==='components')g10Components();if(action==='library')g10Library();if(action==='background'){
  if(VIEW!=='farm'){g10Status('背景替换用于农场，请在“组件”里先切到农场');return;}g10Pick('background',r=>g10SetBackground(r.id));
 }
 if(action==='image'&&s.selected)g10Pick('icon',r=>g10SetImage(r.id));
 if(action==='earlier')g10Step(-1);if(action==='later')g10Step(1);if(action==='reset')g10ResetSelected();if(action==='undo')g10Undo();if(action==='redo')g10Undo(true);if(action==='save')g10Save();if(action==='cancel')g10Close();
 if(action==='fold'){s.folded=!s.folded;s.root.querySelector('[data-g10=fold]').textContent=s.folded?'⌃':'⌄';g10Controls();}
}
const G10_BACK=handleAndroidBack;handleAndroidBack=function(){
 if(G10.session){if(G10.session.dialog)G10.session.dialog.close();else g10Close();return true;}
 return G10_BACK();
};
function g10LockReleaseUI(){
 if(G10.allowed())return;
 for(const el of document.querySelectorAll('#bEditWorld,#bTool,[data-edit-world6],[data-open-ui4],[data-content-editor9],[data-tool=content9],[data-tool=ward],[data-tool=mods],[data-tool=spots],[data-tool=map],[data-tool=units]'))if(!el.hidden)el.hidden=true;
 for(const el of document.querySelectorAll('.layer [data-up],.layer [data-adj],.layer [data-del],.layer [data-ren],.layer [data-bgdel],.layer [data-bgren],.layer [data-tdel],.layer [data-tren],.layer [data-a=saveth],.layer [data-a=bgup],.layer [data-a=bgfield],.layer [data-a=bgspots],.layer [data-a=bgunlock],.layer [data-a=bglock]'))if(!el.hidden)el.hidden=true;
}
for(const name of ['openDev','openUIEditor4','openFieldEditor4','openEditMenu4','openBgTool','openToolkit','c9OpenEditor']){
 const fn=window[name];if(typeof fn==='function')window[name]=function(...args){if(!G10.allowed()||!G10.activated)return false;return fn(...args);};
}
function g10ActivateFromSettings(){
 if(!G10.allowed())return;G10.activated=true;for(const L of [...document.querySelectorAll('.layer')].reverse())L.close?.();setTimeout(()=>g10Open(),200);
}
const G10_SETTINGS=openSettings;openSettings=function(page='play'){
 G10_SETTINGS(page);g10LockReleaseUI();if(!G10.allowed())return;
 const L=[...document.querySelectorAll('.layer')].filter(l=>!l.dataset.closing).at(-1),title=L?.querySelector('.settings-title8 h3');if(!title)return;
 title.dataset.editorTrigger11='';title.setAttribute('role','button');title.tabIndex=0;title.setAttribute('aria-label','设置');
 let taps=0,first=0;const tap=()=>{const now=performance.now();if(!taps||now-first>1800){first=now;taps=0;}if(++taps===3){taps=0;g10ActivateFromSettings();}};
 title.addEventListener('click',tap);title.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tap();}});
 L.addEventListener('click',e=>{if(!title.contains(e.target)){taps=0;first=0;}});
};
const G10_GO=go;go=function(v){G10_GO(v);g10Queue();};
async function initGodEditor10(){
 try{
  for(const rec of await g10ReadAssets()){G10.records.set(rec.id,rec);IMG_URL[rec.id]=g10URL(rec.id);}
  if(S.cfg.god10)try{if(S.cfg.god10.v===1&&!S.cfg.god10BeforeSlots11)S.cfg.god10BeforeSlots11=g10Copy(S.cfg.god10);S.cfg.god10=g10Valid(S.cfg.god10);}catch(e){toast('已保存的界面配置无法读取，本次使用原布局');S.cfg.god10=g10Empty();}
  G10.ready=true;g10ApplyLayout();setFarmBg();
  G10.observer=new MutationObserver(g10Queue);G10.observer.observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert']});
  const layers=new MutationObserver(g10LockReleaseUI);layers.observe(document.querySelector('#layers'),{subtree:true,childList:true});
  window.addEventListener('resize',()=>{if(G10.session?.gesture)g10PointerCancel({});g10Queue();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&G10.session){e.preventDefault();e.stopImmediatePropagation();handleAndroidBack();}},true);
  await g10Cleanup(true);g10LockReleaseUI();
 }catch(e){G10.ready=false;console.error('editor10',e);if(G10.allowed())toast('编辑素材库暂不可用，原游戏仍可使用');}
}
