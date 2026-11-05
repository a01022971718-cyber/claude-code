'use strict';
const C9FieldNames={id:'编号',name:'名称',initial:'初始演示余额',category:'分类',description:'说明',asset:'图片素材编号',modelAsset:'静态模型编号',audioAsset:'音频素材编号',priceA:'价格 A',currencyA:'货币 A',priceB:'价格 B',currencyB:'货币 B',reward:'奖励',limit:'每人兑换上限（0=不限）',tag:'标签文字',tagEnabled:'显示标签',enabled:'启用',featured:'主推商品',sort:'排序',metric:'统计动作',target:'目标次数',scope:'刷新周期',route:'前往页面',startsAt:'开始时间（含时区）',endsAt:'结束时间（含时区）',x:'横向位置 %',y:'纵向位置 %',rotation:'旋转角度',shareEnabled:'显示活动卡导出',points:'所需成长点',freeReward:'免费奖励',advancedReward:'进阶奖励',path:'资源相对路径',kind:'资源类型',width:'设计宽度',height:'设计高度',fit:'图片适配',anchorX:'横向锚点 %',anchorY:'纵向锚点 %',shopEnabled:'开启商城',tasksEnabled:'开启任务',eventsEnabled:'开启活动',growthEnabled:'开启成长',showBadges:'显示商品标签',tileColumns:'横屏商品列数',cardRadius:'卡片圆角',shopBanner:'商城主图编号',growthAsset:'成长主图编号',advanceCurrency:'进阶解锁货币',advanceCost:'进阶解锁费用'};
const C9ValueNames={visit:'每日进入',harvest:'收获',cook:'做菜',serve:'接待',speak:'跟读',learn:'课程',review:'复习',care:'照料',plant:'播种',daily:'每日',weekly:'每周',once:'长期',farm:'农场',kitchen:'厨房',diner:'小馆',words:'学习',shop:'商城',tasks:'任务',events:'活动',growth:'成长',image:'图片',audio:'音频',model:'静态GLB',contain:'完整显示',cover:'填满裁切'};
function c9Picker(accept,handler){
 const input=document.createElement('input');input.type='file';input.accept=accept;input.style.display='none';document.body.append(input);let tid=setTimeout(()=>input.remove(),180000);
 input.onchange=async()=>{clearTimeout(tid);const f=input.files[0];input.remove();if(f)try{await handler(f);}catch(e){toast(e.message||'文件读取失败');}};input.click();
}
function c9OpenEditor(){
 if(!feat('dev'))return toast('这个客户端未开启内容编辑');
 if(!C9.ready)return toast('正在读取内容');
 const p=c9Panel(c9T('editor'),'content-editor9');
 const E={draft:C9Core.clone(C9.config),assets:{...C9.assets},tab:'products',index:0,busy:false,dirty:false};
 const tools=h('<div class="c9-editor-tools"></div>');p.node.querySelector('.c9-header').after(tools);
 const status=h('<p class="c9-edit-status" role="status"></p>');p.node.append(status);
 const setStatus=text=>{status.textContent=text;};
 const guarded=fn=>async(...args)=>{if(E.busy)return;E.busy=true;setStatus('正在处理…');try{await fn(...args);}catch(e){setStatus(e.message||'操作失败');toast(e.message);}finally{E.busy=false;}};
 const validate=()=>C9Core.validate(E.draft,{seeds:CROP_IDS,items:Object.keys(ITEMS)});
 tools.append(c9Button(c9T('import'),()=>c9Picker('.zip,.json,.xlsx',guarded(async file=>{
  const pack=await C9IO.importFile(file,E.draft);E.draft=C9Core.validate(pack.config,{seeds:CROP_IDS,items:Object.keys(ITEMS)});E.assets={...E.assets,...pack.assets};E.dirty=true;E.index=0;draw();setStatus('已读入草稿；预览确认后点“保存并生效”');
 }))));
 tools.append(c9Button(c9T('export'),guarded(async()=>{await C9IO.download(await C9IO.exportPack(validate(),E.assets),'生而向星_内容资源包.zip');setStatus('已导出配置和本机替换素材');})));
 tools.append(c9Button(c9T('excel'),guarded(async()=>{await C9IO.download(await C9IO.exportExcel(validate()),'生而向星_配置表.xlsx');setStatus('已导出 Excel 配置表');})));
 tools.append(c9Button(c9T('preview'),()=>{c9Try(()=>c9Open('shop',validate(),E.assets));}));
 tools.append(c9Button(c9T('rollback'),guarded(async()=>{const record=await C9IO.rollback();C9.config=record.config;C9.assets=record.assets;C9.record=record;E.draft=C9Core.clone(record.config);E.assets={...record.assets};E.dirty=false;draw();c9UpdateEntry();setStatus('已恢复上一版');})));
 tools.append(c9Button(c9T('save'),guarded(async()=>{
  const config=validate(),assets={};let total=0;
  for(const a of config.assets)if(E.assets[a.path]){assets[a.path]=E.assets[a.path];total+=assets[a.path].size;}
  if(total>C9IO.maxTotal)throw Error('本机素材总大小超过 100MB，请精简后保存');
  await C9IO.install({config,assets,savedAt:Date.now()});
  C9.config=config;C9.assets=assets;C9.record={config,assets};E.dirty=false;E.draft=C9Core.clone(config);E.assets={...assets};c9UpdateEntry();c9DrawHub();setStatus('已保存，立即生效；重新启动也会保留');toast('内容配置已生效');
 }),false,'c9-primary'));
 p.node.querySelector('.c9-header').insertBefore(tools.lastElementChild,p.node.querySelector('.c9-close'));
 const tabs=h('<nav class="c9-editor-tabs" aria-label="配置分类"></nav>');p.body.append(tabs);const work=h('<div class="c9-editor-work"></div>');p.body.append(work);
 const selects={metric:()=>C9Core.metrics,route:()=>C9Core.routes,scope:()=>['daily','weekly','once'],kind:()=>['image','audio','model'],fit:()=>['contain','cover'],currency:()=>E.draft.currencies.map(r=>r.id),asset:()=>['',...E.draft.assets.map(r=>r.id)]};
 function control(row,k,type){
  const lab=h('<label class="c9-field"><span></span></label>');lab.firstChild.textContent=C9FieldNames[k]||k;let input;
  if(selects[type]){input=document.createElement('select');for(const value of selects[type]()){const o=document.createElement('option');o.value=value;o.textContent=C9ValueNames[value]||E.draft.currencies.find(c=>c.id===value)?.name||value||'无';input.append(o);}}
  else if(type==='boolean'){input=document.createElement('input');input.type='checkbox';}
  else if(type==='long'){input=document.createElement('textarea');input.rows=3;}
  else{input=document.createElement('input');input.type=['number','positive','percent','rotation'].includes(type)?'number':'text';}
  input.dataset.field9=k;if(type==='boolean')input.checked=row[k];else input.value=row[k]??'';
  input.oninput=()=>{row[k]=type==='boolean'?input.checked:input.type==='number'?(input.value===''?null:Number(input.value)):input.value;E.dirty=true;setStatus('草稿有改动，尚未保存');};
  lab.append(input);if(type==='reward'){const tip=h('<small></small>');tip.textContent='例 coins:20|stardust:10|seed.lettuce:2|item.badge:1';lab.append(tip);}
  if(type==='date'){const tip=h('<small></small>');tip.textContent='例 2026-11-01T00:00:00+09:00';lab.append(tip);}
  return lab;
 }
 function draw(){
  tabs.replaceChildren();for(const tab of [...Object.keys(C9IO.tabs),'guide']){
   const b=c9Button(C9IO.tabs[tab]||'说明',()=>{E.tab=tab;E.index=0;draw();});b.dataset.editTab9=tab;b.setAttribute('aria-pressed',String(E.tab===tab));tabs.append(b);
  }
  work.replaceChildren();
  if(E.tab==='guide'){
   work.innerHTML='<div class="c9-guide"><p>1. 选“商品”，改价格或文字；点“预览草稿”查看，再保存。</p><p>2. 选“素材”，按编号替换图片、音频或静态 GLB。设计尺寸和锚点可单独调。</p><p>3. Excel 的商品表价格列改为 888，保存为 .xlsx 后导入。也可导入 content.json。</p><p>4. 导出 ZIP 后，把同名文件放进 Resources 对应目录，再导入 ZIP。手机无法直接访问应用私有文件夹，所以使用文件选择器。</p><p>5. 导入先进入草稿。内容检查通过后整包保存，失败保留当前配置。恢复上一版可以撤销最近一次保存。</p><p>6. 时间按设备时钟计算。星币是本机演示货币；在线支付、共享销量、邀请码验证需要另接服务。</p><p>7. 奖励、兑换记录写入玩家存档；配置与上传素材由资源包单独导出备份。</p><p>8. 每张配置表可新增条目，上限 2000 行是导入容量保护。改名称保留编号；改编号会被视为新内容。</p></div>';return;
  }
  if(['labels','settings'].includes(E.tab)){
   const form=h('<div class="c9-form"></div>');for(const k of Object.keys(E.draft[E.tab])){
    const v=E.draft[E.tab][k];let type=typeof v==='boolean'?'boolean':typeof v==='number'?'number':'text';if(k==='advanceCurrency')type='currency';if(['shopBanner','growthAsset'].includes(k))type='asset';
    form.append(control(E.draft[E.tab],k,type));
   }work.append(form);return;
  }
  const rows=E.draft[E.tab],toolbar=h('<div class="c9-toolbar"></div>'),select=document.createElement('select');select.setAttribute('aria-label','选择条目');select.dataset.rowSelect9='';
  if(E.index>=rows.length)E.index=Math.max(0,rows.length-1);
  rows.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(r.name||r.id)+' · '+r.id;o.selected=i===E.index;select.append(o);});
  select.onchange=()=>{E.index=+select.value;draw();};toolbar.append(select);
  toolbar.append(c9Button(c9T('add'),()=>{rows.push(newRow(E.tab));E.index=rows.length-1;E.dirty=true;draw();}));
  const current=rows[E.index];
  if(current){toolbar.append(c9Button(c9T('duplicate'),()=>{const r=C9Core.clone(current);r.id='copy_'+Date.now();rows.push(r);E.index=rows.length-1;E.dirty=true;draw();}));toolbar.append(c9Button(c9T('remove'),()=>{rows.splice(E.index,1);E.index=0;E.dirty=true;draw();}));}
  work.append(toolbar);if(!current){c9Empty(work);return;}
  if(E.tab==='assets'){
   const area=h('<div class="c9-asset-editor"></div>');if(current.kind==='image')area.append(c9Art(current.id,current.id,E.draft,E.assets));
   const desc=h('<p class="c9-note"></p>');desc.textContent=current.path;area.append(desc);
   area.append(c9Button(c9T('chooseImage'),()=>c9Picker(current.kind==='image'?'.png,.jpg,.jpeg,.webp':current.kind==='audio'?'.wav,.mp3,.ogg':'.glb',async file=>{
    E.assets[current.path]=await C9IO.checkedAsset(file,current);E.dirty=true;draw();setStatus('素材已读入草稿，保存后生效');
   })));work.append(area);
  }
  const form=h('<div class="c9-form"></div>');for(const[k,type]of Object.entries(C9Core.fields[E.tab]).filter(([k])=>E.tab!=='events'||!['x','y','rotation'].includes(k)))form.append(control(current,k,type));work.append(form);
 }
 function newRow(tab){
  const row={};for(const[k,type]of Object.entries(C9Core.fields[tab])){
   row[k]=type==='boolean'?['enabled'].includes(k):['number','percent','rotation'].includes(type)?0:type==='positive'?1:type==='reward'?'coins:10':type==='scope'?'daily':type==='route'?'farm':type==='metric'?'visit':type==='currency'?E.draft.currencies[0].id:type==='kind'?'image':type==='fit'?'contain':type==='date'?new Date(Date.now()+(k==='endsAt'?86400000:0)).toISOString():'';
  }row.id='new_'+Date.now();if('name'in row)row.name='新条目';if('path'in row)row.path='Resources/Custom/'+row.id+'.png';return row;
 }
 draw();setStatus('修改先保存在草稿，点击保存后生效');p.editor=E;return p;
}
