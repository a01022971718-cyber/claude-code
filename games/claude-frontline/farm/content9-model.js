'use strict';
// Static GLB 2 meshes only: no executable loaders, external buffers, skins or compressed geometry.
window.C9Model=(()=>{
 const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 function mm(a,b){const c=Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)c[j*4+i]+=a[k*4+i]*b[j*4+k];return c;}
 function trs(n){if(n.matrix)return n.matrix;const[x,y,z,w]=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0];return[(1-2*y*y-2*z*z)*s[0],(2*x*y+2*w*z)*s[0],(2*x*z-2*w*y)*s[0],0,(2*x*y-2*w*z)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*w*x)*s[1],0,(2*x*z+2*w*y)*s[2],(2*y*z-2*w*x)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1];}
 const pt=(m,v)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
 async function parse(bytes){
  const dv=new DataView(bytes);if(dv.byteLength<20||dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==bytes.byteLength)throw Error('GLB 文件损坏');
  let doc,bin;for(let p=12;p+8<=bytes.byteLength;){const n=dv.getUint32(p,true),t=dv.getUint32(p+4,true);p+=8;if(p+n>bytes.byteLength)throw Error('GLB 分块不完整');if(t===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(bytes.slice(p,p+n)));if(t===0x004e4942)bin=bytes.slice(p,p+n);p+=n;}
  if(!doc||!bin||doc.buffers?.some(b=>b.uri)||doc.extensionsRequired?.length)throw Error('请使用内嵌资源、未压缩的静态 GLB');
  const bd=new DataView(bin),sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  function acc(id){const a=doc.accessors?.[id],v=doc.bufferViews?.[a?.bufferView];if(!a||!v||a.sparse||v.buffer!==0||!sizes[a.componentType]||!types[a.type]||a.count>1000000)throw Error('模型使用了暂不支持的顶点格式');
   const nc=types[a.type],sz=sizes[a.componentType],stride=v.byteStride||nc*sz,offset=(v.byteOffset||0)+(a.byteOffset||0);if(offset+(a.count-1)*stride+nc*sz>bd.byteLength)throw Error('模型顶点数据越界');
   return{count:a.count,get:i=>{if(i<0||i>=a.count)throw Error('模型索引越界');return Array.from({length:nc},(_,k)=>{const at=offset+i*stride+k*sz;let n=a.componentType===5126?bd.getFloat32(at,true):a.componentType===5125?bd.getUint32(at,true):a.componentType===5123?bd.getUint16(at,true):a.componentType===5122?bd.getInt16(at,true):a.componentType===5121?bd.getUint8(at):bd.getInt8(at);if(a.normalized&&a.componentType!==5126)n/=a.componentType===5121?255:a.componentType===5123?65535:a.componentType===5120?127:32767;if(!Number.isFinite(n))throw Error('模型包含无效坐标');return n;});}};
  }
  const batches=[],bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];let count=0;
  function node(id,parent,seen){if(seen.has(id))throw Error('模型节点存在循环');const n=doc.nodes?.[id];if(!n)return;if(n.skin!==undefined)throw Error('当前模型插槽支持静态模型，请先导出无骨骼版本');const m=mm(parent,trs(n)),next=new Set(seen);next.add(id);
   if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){
    if((p.mode??4)!==4||p.targets)throw Error('当前支持静态三角面模型');const pos=acc(p.attributes.POSITION),idx=p.indices===undefined?null:acc(p.indices),uv=p.attributes.TEXCOORD_0===undefined?null:acc(p.attributes.TEXCOORD_0),N=idx?idx.count:pos.count;
    count+=N;if(count>1500000||N%3)throw Error('模型顶点过多或三角面不完整');const data=new Float32Array(N*8);
    for(let j=0;j<N;j+=3){const vs=[0,1,2].map(k=>pt(m,pos.get(idx?idx.get(j+k)[0]:j+k))),a=vs[1].map((x,k)=>x-vs[0][k]),b=vs[2].map((x,k)=>x-vs[0][k]),norm=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=Math.hypot(...norm)||1;
     for(let k=0;k<3;k++){const xyz=vs[k],tx=uv?uv.get(idx?idx.get(j+k)[0]:j+k):[0,0];data.set([...xyz,...norm.map(x=>x/len),...tx],(j+k)*8);for(let ax=0;ax<3;ax++){bounds[ax]=Math.min(bounds[ax],xyz[ax]);bounds[ax+3]=Math.max(bounds[ax+3],xyz[ax]);}}
    }
    const mat=doc.materials?.[p.material]?.pbrMetallicRoughness||{};batches.push({data,N,color:mat.baseColorFactor||[.8,.7,.5,1],texture:mat.baseColorTexture?.index});
   }
   for(const child of n.children||[])node(child,m,next);
  }
  const scene=doc.scenes?.[doc.scene||0];if(!scene)throw Error('模型缺少场景');for(const id of scene.nodes||[])node(id,I(),new Set());if(!batches.length)throw Error('模型没有可显示的网格');
  const center=[0,1,2].map(i=>(bounds[i]+bounds[i+3])/2),scale=2/Math.max(...[0,1,2].map(i=>bounds[i+3]-bounds[i]),.001);
  for(const batch of batches)for(let i=0;i<batch.N;i++)for(let k=0;k<3;k++)batch.data[i*8+k]=(batch.data[i*8+k]-center[k])*scale;
  const images={};for(const batch of batches)if(batch.texture!==undefined&&!images[batch.texture]){
   const image=doc.images?.[doc.textures?.[batch.texture]?.source],view=doc.bufferViews?.[image?.bufferView];if(!view)throw Error('模型贴图需要嵌入 GLB 文件');
   images[batch.texture]=await createImageBitmap(new Blob([bin.slice(view.byteOffset||0,(view.byteOffset||0)+view.byteLength)],{type:image.mimeType}));
  }return{batches,images};
 }
 async function mount(target,a,assets){
  if(!a)throw Error('模型素材未登记');target.textContent='模型加载中…';const bytes=assets[a.path]?await assets[a.path].arrayBuffer():await fetch(a.path).then(r=>{if(!r.ok)throw Error('模型占位：请导入 '+a.path);return r.arrayBuffer();}),model=await parse(bytes);
  if(!target.isConnected){Object.values(model.images).forEach(x=>x.close());return()=>{};}
  target.replaceChildren();const cv=document.createElement('canvas');target.append(cv);const gl=cv.getContext('webgl',{alpha:true,antialias:true});if(!gl)throw Error('此设备暂时无法预览三维模型');
  const prog=gl.createProgram(),shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('模型预览初始化失败');gl.attachShader(prog,s);gl.deleteShader(s);};
  shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;attribute vec2 uv;uniform mat4 m;uniform mat4 pr;varying float light;varying vec2 tx;void main(){vec3 no=mat3(m)*n;light=.5+.5*max(0.,dot(normalize(no),normalize(vec3(-.4,.8,1.))));tx=uv;gl_Position=pr*m*vec4(p,1.);}');
  shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform vec4 color;uniform sampler2D tex;uniform bool textured;varying float light;varying vec2 tx;void main(){vec4 c=color;if(textured)c*=texture2D(tex,tx);gl_FragColor=vec4(c.rgb*light,c.a);}');
  gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('模型预览初始化失败');gl.useProgram(prog);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  const textures={};for(const[k,im]of Object.entries(model.images)){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);textures[k]=t;im.close();}
  const buffers=model.batches.map(b=>{const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,b.data,gl.STATIC_DRAW);return buf;});
  const loc={};for(const k of ['p','n','uv'])loc[k]=gl.getAttribLocation(prog,k);for(const k of ['m','pr','color','tex','textured'])loc[k]=gl.getUniformLocation(prog,k);
  let yaw=.35,pitch=.15,zoom=1;const pointers=new Map();let dist=0;
  function draw(){if(!target.isConnected)return;const w=Math.max(1,cv.clientWidth),h=Math.max(1,cv.clientHeight),dpr=Math.min(devicePixelRatio||1,2);cv.width=w*dpr;cv.height=h*dpr;gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const ca=Math.cos(yaw),sa=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),rot=mm([ca,0,-sa,0,0,1,0,0,sa,0,ca,0,0,0,-3.8/zoom,1],[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1]),f=1/Math.tan(.38),aspect=w/h,near=.1,far=100,pr=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];gl.uniformMatrix4fv(loc.m,false,rot);gl.uniformMatrix4fv(loc.pr,false,pr);
   model.batches.forEach((b,i)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);for(const[k,size,off]of[['p',3,0],['n',3,12],['uv',2,24]]){gl.enableVertexAttribArray(loc[k]);gl.vertexAttribPointer(loc[k],size,gl.FLOAT,false,32,off);}gl.uniform4fv(loc.color,b.color);gl.uniform1i(loc.textured,b.texture!==undefined);if(b.texture!==undefined){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[b.texture]);gl.uniform1i(loc.tex,0);}gl.drawArrays(gl.TRIANGLES,0,b.N);});
  }
  cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);dist=0;};
  cv.onpointermove=e=>{const old=pointers.get(e.pointerId);if(!old)return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1){yaw+=(e.clientX-old[0])*.012;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-old[1])*.01));}else if(pointers.size===2){const [a,b]=[...pointers.values()],n=Math.hypot(a[0]-b[0],a[1]-b[1]);if(dist)zoom=Math.max(.5,Math.min(2.5,zoom*n/dist));dist=n;}draw();};
  cv.onpointerup=cv.onpointercancel=e=>{pointers.delete(e.pointerId);dist=0;};const note=document.createElement('p');note.className='c9-note';note.textContent='单指旋转 · 双指缩放 · 静态模型';target.append(note);
  const ro=new ResizeObserver(draw);ro.observe(cv);draw();
  return()=>{ro.disconnect();buffers.forEach(b=>gl.deleteBuffer(b));Object.values(textures).forEach(t=>gl.deleteTexture(t));gl.deleteProgram(prog);gl.getExtension('WEBGL_lose_context')?.loseContext();cv.remove();};
 }
 return{mount,parse};
})();
