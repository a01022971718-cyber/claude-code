'use strict';
window.C9IO=(()=>{
 let dbPromise;const maxFile=24*1024*1024,maxTotal=100*1024*1024;
 function db(){return dbPromise||=(new Promise((resolve,reject)=>{const r=indexedDB.open('xingxing-content9'+NS,1);r.onupgradeneeded=()=>r.result.createObjectStore('packs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
 async function read(key='active'){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('packs'),r=t.objectStore('packs').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function install(record){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('packs','readwrite'),st=t.objectStore('packs'),r=st.get('active');r.onsuccess=()=>{if(r.result)st.put(r.result,'previous');st.put(record,'active');};t.oncomplete=()=>resolve(record);t.onabort=t.onerror=()=>reject(t.error||Error('保存失败'));});}
 async function rollback(){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('packs','readwrite'),st=t.objectStore('packs'),a=st.get('active'),p=st.get('previous');let result; p.onsuccess=()=>{if(!p.result){t.abort();return;}result=p.result;st.put(p.result,'active');if(a.result)st.put(a.result,'previous');};t.oncomplete=()=>resolve(result);t.onabort=t.onerror=()=>reject(Error('还没有可恢复的上一版'));});}
 async function unzip(file){if(file.size>80*1024*1024)throw Error('压缩包请小于 80MB');const z=await JSZip.loadAsync(file);const entries=Object.values(z.files).filter(f=>!f.dir);if(entries.length>500)throw Error('压缩包文件过多');let total=0;for(const f of entries){const n=f._data?.uncompressedSize||0;total+=n;if(n>maxFile||total>maxTotal||f.name.includes('..')||f.name.startsWith('/')||f.name.includes('\\'))throw Error('资源包路径或展开大小不正确');}return z;}
 async function checkedAsset(blob,a){
  if(blob.size>maxFile||blob.size===0)throw Error('素材为空或超过 24MB');
  const ext=a.path.split('.').pop().toLowerCase();
  if(a.kind==='image'){
   const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[ext],typed=new Blob([blob],{type:mime});
   const im=await createImageBitmap(typed).catch(()=>{throw Error(a.id+' 不是有效图片');});if(im.width>8192||im.height>8192){im.close();throw Error('图片边长请小于 8192');}im.close();return typed;
  }
  if(a.kind==='model'){const b=new DataView(await blob.slice(0,12).arrayBuffer());if(b.byteLength<12||b.getUint32(0,true)!==0x46546c67||b.getUint32(4,true)!==2)throw Error('模型需要 GLB 2.0 格式');return new Blob([blob],{type:'model/gltf-binary'});}
  const head=new Uint8Array(await blob.slice(0,12).arrayBuffer()),sig=String.fromCharCode(...head);
  if(!(ext==='wav'&&sig.startsWith('RIFF')&&sig.slice(8)==='WAVE'||ext==='ogg'&&sig.startsWith('OggS')||ext==='mp3'&&(sig.startsWith('ID3')||head[0]===255&&(head[1]&224)===224)))throw Error('音频格式和文件名不一致');
  return new Blob([blob],{type:{wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg'}[ext]});
 }
 const tabs={products:'商品',tasks:'任务',events:'活动',growth:'成长',assets:'素材',currencies:'货币',labels:'文字',settings:'设置'};
 function tableRows(c,tab){if(['labels','settings'].includes(tab))return Object.entries(c[tab]).map(([key,value])=>({key,value}));return c[tab];}
 function xml(str){if(/<!DOCTYPE|<!ENTITY/i.test(str))throw Error('表格包含不支持的外部定义');const doc=new DOMParser().parseFromString(str,'application/xml');if(doc.querySelector('parsererror'))throw Error('表格 XML 损坏');return doc;}
 async function fromExcel(file,base){
  const z=await unzip(file),get=async path=>{if(!z.file(path))throw Error('缺少表格文件 '+path);return xml(await z.file(path).async('string'));};
  const wb=await get('xl/workbook.xml'),rels=await get('xl/_rels/workbook.xml.rels'),mapping={};for(const n of rels.querySelectorAll('Relationship'))mapping[n.getAttribute('Id')]=n.getAttribute('Target');
  let shared=[];if(z.file('xl/sharedStrings.xml'))shared=[...(await get('xl/sharedStrings.xml')).querySelectorAll('si')].map(n=>[...n.querySelectorAll('t')].map(t=>t.textContent).join(''));
  const c=C9Core.clone(base);let found=0;
  for(const sheet of wb.querySelectorAll('sheet')){
   const tab=Object.keys(tabs).find(k=>tabs[k]===sheet.getAttribute('name'));if(!tab)continue;
   let target=mapping[sheet.getAttribute('r:id')];if(!target||target.includes('..')||/https?:/.test(target))throw Error('表格引用不正确');
   target=target.startsWith('/')?target.slice(1):'xl/'+target;
   const doc=await get(target);if(doc.querySelector('f'))throw Error('配置表不支持公式，请粘贴为数值');
   const rows=[...doc.querySelectorAll('sheetData>row')].map(row=>{const cols=[];for(const cell of row.querySelectorAll('c')){
    const letters=(cell.getAttribute('r')||'A1').match(/^[A-Z]+/)[0];let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;
    const t=cell.getAttribute('t'),v=cell.querySelector('v')?.textContent;let value=t==='s'?shared[+v]:t==='inlineStr'?[...cell.querySelectorAll('t')].map(n=>n.textContent).join(''):(t==='str'||t==='d')?v||'':t==='b'?v==='1':v===undefined?'':Number(v);
    cols[col-1]=value;
   }return cols;}).filter(row=>row.some(v=>v!==''&&v!==undefined));
   if(!rows.length)throw Error('配置表没有表头');
   const keys=rows.shift().map(k=>String(k).match(/\((\w+)\)$/)?.[1]||String(k));
   if(['labels','settings'].includes(tab)){
    const obj={};for(const row of rows){const key=row[keys.indexOf('key')],v=row[keys.indexOf('value')];if(!key)continue;if(Object.prototype.hasOwnProperty.call(obj,key))throw Error('键重复：'+key);obj[key]=v;}c[tab]=obj;
   }else{
    c[tab]=rows.map(row=>Object.fromEntries(keys.map((k,i)=>{let v=row[i]??'',type=C9Core.fields[tab][k];if(type==='date'&&typeof v==='number'&&Number.isFinite(v))v=new Date(Math.round((v-25569)*86400000)).toISOString();if(type==='boolean'&&typeof v!=='boolean'){if(['true','是','1'].includes(String(v)))v=true;else if(['false','否','0'].includes(String(v)))v=false;}if(['number','positive','percent','rotation'].includes(type)&&typeof v==='string'&&v.trim()!=='')v=Number(v);return[k,v];})));
   }found++;
  }
  if(!found)throw Error('没有找到 商品、任务、活动 等配置工作表');c.revision='excel-'+new Date().toISOString();return c;
 }
 async function importFile(file,base){
  if(file.name.toLowerCase().endsWith('.xlsx'))return{config:await fromExcel(file,base),assets:{}};
  if(file.name.toLowerCase().endsWith('.json')){if(file.size>2*1024*1024)throw Error('配置表过大');return{config:JSON.parse(await file.text()),assets:{}};}
  const z=await unzip(file);let c=base;
  if(z.file('content.json'))c=JSON.parse(await z.file('content.json').async('string'));
  else if(z.file('配置表.xlsx'))c=await fromExcel(new File([await z.file('配置表.xlsx').async('blob')],'配置表.xlsx'),base);
  const config=C9Core.validate(c,{seeds:CROP_IDS,items:Object.keys(ITEMS)}),assets={};
  for(const f of Object.values(z.files).filter(f=>!f.dir)){
   if(['content.json','配置表.xlsx','说明.md'].includes(f.name))continue;
   const a=config.assets.find(a=>a.path===f.name);if(!a)throw Error('资源未登记：'+f.name);
   assets[f.name]=await checkedAsset(await f.async('blob'),a);
  }
  return{config,assets};
 }
 async function download(blob,name){
  if(window.AndroidFiles&&typeof AndroidFiles.save==='function'){
   const bytes=new Uint8Array(await blob.arrayBuffer());let str='';for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));AndroidFiles.save(btoa(str),name);
  }else{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
 }
 async function exportPack(config,assets){
  const z=new JSZip();z.file('content.json',JSON.stringify(config,null,2));for(const[path,blob]of Object.entries(assets))z.file(path,blob);
  z.file('说明.md','在设置 > 编辑 > 内容工坊导入本 ZIP。Resources 目录内的文件按 content.json 登记的路径替换。配置与素材不包含玩家存档。缺少的图片会显示临时占位。');
  return z.generateAsync({type:'blob',compression:'DEFLATE'});
 }
 const escX=s=>String(s).replace(/[<>&"']/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));
 const colName=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
 async function exportExcel(c){
  const res=await fetch('content/template.xlsx');if(!res.ok)throw Error('配置模板未打包');const z=await JSZip.loadAsync(await res.arrayBuffer());
  let i=0;for(const tab of Object.keys(tabs)){
   i++;const keys=['labels','settings'].includes(tab)?['key','value']:Object.keys(C9Core.fields[tab]),data=[keys,...tableRows(c,tab).map(r=>keys.map(k=>r[k]))];
   const rows=data.map((r,n)=>'<row r="'+(n+1)+'">'+r.map((v,j)=>{const ref=colName(j)+(n+1),type=typeof v;return type==='number'?'<c r="'+ref+'"><v>'+v+'</v></c>':type==='boolean'?'<c r="'+ref+'" t="b"><v>'+(v?1:0)+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+escX(v??'')+'</t></is></c>';}).join('')+'</row>').join('');
   const file='xl/worksheets/sheet'+i+'.xml',source=await z.file(file).async('string');z.file(file,source.replace(/<(?:\w+:)?sheetData[\s\S]*?<\/(?:\w+:)?sheetData>/,'<sheetData xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+rows+'</sheetData>'));
  }return z.generateAsync({type:'blob'});
 }
 return{read,install,rollback,checkedAsset,importFile,exportPack,download,exportExcel,tabs,tableRows,maxTotal};
})();
