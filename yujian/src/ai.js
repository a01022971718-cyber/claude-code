// 大模型接入：Claude 走官方 SDK（@anthropic-ai/sdk）；其他服务商（OpenAI、DeepSeek、通义千问、智谱、Kimi、豆包、Gemini、
// OpenRouter、本机 Ollama、任何 OpenAI 兼容接口）走通用的 chat/completions 请求。
// 配置在「设置 → AI」：API 密钥只存在这台设备的浏览器存档里；也可以只填“代理地址”——正式上线或国内网络时，
// 请求先到自己的服务器，由服务器带上密钥转发给 Claude API，密钥不进客户端。
// 功能：
//  - AI 造岛：一句话描述 → 模型返回岛的布局（结构化输出，按 JSON 结构约束，保证能直接用）→ 生成一座新岛。
//  - 岛民说话：点一下村民，他按此刻在干什么、几点说一句话；没配置 AI 时用内置台词。
// 默认模型 claude-opus-5-5；开启了服务端兜底（模型因安全原因拒绝时，自动换一个模型重试同一个请求）。
import Anthropic from '@anthropic-ai/sdk';
import { ITEMS } from './catalog.js';
import { sopPrompt, snap, shade, FORMS, CHECKLIST } from './artsop.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/** 服务商。kind: 'anthropic' 走官方 SDK；'openai' 走 OpenAI 兼容接口（POST {地址}/chat/completions，绝大多数厂商和本地模型都支持）。
 *  base / model 是默认值，设置里可以改；“自定义”用来接任何兼容接口（自建网关、中转、本地模型）。 */
export const PROVIDERS = [
  { id: 'anthropic', name: 'Claude（Anthropic）', kind: 'anthropic', base: '', model: DEFAULT_MODEL },
  { id: 'openai', name: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', model: '' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问（阿里云百炼）', kind: 'openai', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'zhipu', name: '智谱 GLM', kind: 'openai', base: 'https://open.bigmodel.cn/api/paas/v4', model: '' },
  { id: 'moonshot', name: 'Kimi（月之暗面）', kind: 'openai', base: 'https://api.moonshot.cn/v1', model: '' },
  { id: 'doubao', name: '豆包（火山方舟）', kind: 'openai', base: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  { id: 'gemini', name: 'Gemini（Google）', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '' },
  { id: 'openrouter', name: 'OpenRouter（聚合）', kind: 'openai', base: 'https://openrouter.ai/api/v1', model: '' },
  { id: 'ollama', name: 'Ollama（本机模型）', kind: 'openai', base: 'http://localhost:11434/v1', model: '', noKey: true },
  { id: 'custom', name: '自定义（OpenAI 兼容接口）', kind: 'openai', base: '', model: '' },
];
/** 非 SDK 请求的错误（带 HTTP 状态码） */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
// 支持服务端兜底参数的模型（其余模型不带这个参数，否则请求会被拒绝）
const FALLBACK_OK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5']);

// 地块和物件：既可以是游戏原有的，也可以是这次（或以前）AI 新造的（用名字引用）
const BASE_TILES = ITEMS.land.filter((x) => !x.ai).map((x) => x.id);
const BASE_PROPS = ['lighthouse', 'windmill', 'belltower', 'hut', 'campfire', 'woodpile', 'fence', 'signpost', 'boat', 'buoy', 'pine', 'oak', 'sakura', 'maple', 'bush', 'palm', 'reed', 'boulder', 'deer', 'sheep', 'rabbit', 'crab'];
const HEX = { type: 'string', description: '颜色，#rrggbb' };
const ISLAND_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '岛的名字，2–6 个汉字' },
    note: { type: 'string', description: '一句话介绍这座岛（30 字以内）' },
    biomes: {
      type: 'array', description: '这次新创造的生态（地块类型），0–3 种',
      items: { type: 'object', additionalProperties: false, required: ['name', 'colors', 'height', 'roughness', 'grass', 'grassColor', 'flowers', 'flowerColors', 'plants'],
        properties: { name: { type: 'string' }, colors: { type: 'array', items: HEX, description: '地面三种颜色：主色、暗斑、亮斑' }, height: { type: 'number', description: '地面高度 0.36（低洼）–0.5（高地），普通草地 0.45' }, roughness: { type: 'number', description: '起伏 0–1' },
          grass: { type: 'number', description: '草的密度 0–1' }, grassColor: HEX, flowers: { type: 'number', description: '花的密度 0–1' }, flowerColors: { type: 'array', items: HEX },
          plants: { type: 'array', description: '这个生态里长的植物（用植物名字，可以是这次新造的）', items: { type: 'object', additionalProperties: false, required: ['name', 'density'], properties: { name: { type: 'string' }, density: { type: 'number', description: '0–1' } } } } } },
    },
    plants: {
      type: 'array', description: '这次新创造的植物，0–6 种',
      items: { type: 'object', additionalProperties: false, required: ['name', 'form', 'height', 'trunkColor', 'trunkThickness', 'bend', 'crownShape', 'crownColor', 'crownColor2', 'crownSize', 'accent', 'accentColor'],
        properties: { name: { type: 'string' }, form: { type: 'string', enum: ['tree', 'conifer', 'palm', 'bush', 'mushroom', 'flower', 'cactus', 'crystal', 'reed'] }, height: { type: 'number', description: '高度，按 SOP 里每种形态的范围（普通树 0.85，灌木 0.2）' },
          trunkColor: HEX, trunkThickness: { type: 'number', description: '0–1' }, bend: { type: 'number', description: '树干弯曲 0–1' }, crownShape: { type: 'string', enum: ['round', 'tall', 'wide', 'droop'], description: '轮廓：round 原样、tall 高瘦、wide 矮宽、droop 垂枝' },
          crownColor: HEX, crownColor2: HEX, crownSize: { type: 'number', description: '0.15–1.2' }, accent: { type: 'string', enum: ['none', 'fruit', 'flower', 'spots', 'glow'] }, accentColor: HEX } },
    },
    creatures: {
      type: 'array', description: '这次新创造的动物，0–5 种',
      items: { type: 'object', additionalProperties: false, required: ['name', 'shape', 'size', 'color', 'color2', 'legs', 'head', 'eyes', 'ears', 'horns', 'tail', 'wings', 'pattern', 'move', 'habitat', 'count'],
        properties: { name: { type: 'string' }, shape: { type: 'string', enum: ['round', 'long', 'box', 'flat'] }, size: { type: 'number', description: '身长 0.04（小虫）–0.16，鹿约 0.15，兔子 0.05' },
          color: HEX, color2: HEX, legs: { type: 'integer', enum: [0, 2, 4, 6] }, head: { type: 'number', description: '头和身子的比例 0.2–0.8' }, eyes: { type: 'string', enum: ['big', 'small'] },
          ears: { type: 'string', enum: ['none', 'round', 'long', 'pointy'] }, horns: { type: 'string', enum: ['none', 'small', 'antlers'] }, tail: { type: 'string', enum: ['none', 'short', 'long', 'fluffy', 'fin'] },
          wings: { type: 'boolean' }, pattern: { type: 'string', enum: ['none', 'spots', 'stripes', 'belly'] }, move: { type: 'string', enum: ['walk', 'hop', 'fly', 'swim', 'slither'] },
          habitat: { type: 'string', description: '住在哪：某种地块的名字（可以是新生态）、land（任意陆地）或 sea（近岸海面）' }, count: { type: 'integer', description: '岛上住几只 1–8' } } },
    },
    tiles: {
      type: 'array', description: '地块，六边形轴坐标 (q, r)，相邻地块坐标差为 (±1,0)、(0,±1)、(+1,-1)、(-1,+1)。t 是地块类型：原有类型的英文 id，或新生态的名字',
      items: { type: 'object', properties: { q: { type: 'integer' }, r: { type: 'integer' }, t: { type: 'string' } }, required: ['q', 'r', 't'], additionalProperties: false },
    },
    items: {
      type: 'array', description: '摆在地块上的物件，q/r 是所在地块；k 是原有物件的英文 id，或新植物、新动物的名字；boat 和 buoy 要放在紧挨岛的海面格子上',
      items: { type: 'object', properties: { k: { type: 'string' }, q: { type: 'integer' }, r: { type: 'integer' } }, required: ['k', 'q', 'r'], additionalProperties: false },
    },
    sea: { type: 'string', enum: ['clear', 'jade', 'deep'] },
    hour: { type: 'number', description: '展示时的钟点 0–24' },
  },
  required: ['name', 'note', 'biomes', 'plants', 'creatures', 'tiles', 'items', 'sea', 'hour'],
  additionalProperties: false,
};
// 造物台的「生态」：和 AI 造岛里的新生态同一个结构；精修多一句修改说明
const BIOME_SCHEMA = ISLAND_SCHEMA.properties.biomes.items;
const BIOME_REFINE_SCHEMA = { ...BIOME_SCHEMA, required: [...BIOME_SCHEMA.required, 'notes'], properties: { ...BIOME_SCHEMA.properties, notes: { type: 'string', description: '60 字以内中文：看出的主要问题和改了什么' } } };
const BIOME_SYSTEM = `你是一款治愈系体素海岛游戏的美术设计师，负责设计“生态”——一种六边形地块：地面三种颜色（主色、暗斑、亮斑，同一色相、暗斑暗一点、亮斑亮一点）、起伏、地势高低、草和花的多少与颜色、长哪些植物各多少。
好的生态一眼能认出是什么地方（比如“秋天的林间空地”“月光下的蓝色苔原”），颜色和谐、和游戏原有的草地、森林、花田放在一起不突兀；草色要和地面搭，花色 2–4 种；植物 1–4 种，密度 0–1（0.1 稀疏点缀，0.4 成片，0.8 茂密）。名字 2–6 个汉字。`;
const stripBiome = (b) => ({ name: b.name, colors: b.colors, height: b.height, roughness: b.roughness, grass: b.grass, grassColor: b.grassColor, flowers: b.flowers, flowerColors: b.flowerColors, plants: (b.plants || []).map((p) => ({ name: p.name, density: p.density })) });
const REVIEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['score', 'notes', 'biomes', 'plants', 'creatures'],
  properties: { score: { type: 'integer', description: '1–10' }, notes: { type: 'string', description: '最重要的问题，60 字以内' }, biomes: ISLAND_SCHEMA.properties.biomes, plants: ISLAND_SCHEMA.properties.plants, creatures: ISLAND_SCHEMA.properties.creatures } };
const V3 = { type: 'array', items: { type: 'number' }, description: '[x, y, z]' };
const MAKE_SCHEMA = { type: 'object', additionalProperties: false, required: ['name', 'use', 'behavior', 'size', 'parts'],
  properties: {
    name: { type: 'string', description: '2–6 个汉字' }, use: { type: 'string', enum: ['creature', 'plant', 'prop'] }, behavior: { type: 'string', enum: ['walk', 'hop', 'fly', 'swim', 'float', 'still'] }, size: { type: 'number', description: '在岛上的缩放，0.3–4，一般 1；建筑 1.5–3' },
    parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'pivot', 'motion', 'axis', 'amp', 'speed', 'phase', 'boxes'],
      properties: { name: { type: 'string' }, pivot: V3, motion: { type: 'string', enum: ['none', 'walk', 'swing', 'flap', 'spin', 'bob', 'sway', 'pulse'] }, axis: { type: 'string', enum: ['x', 'y', 'z'] }, amp: { type: 'number' }, speed: { type: 'number' }, phase: { type: 'number', description: '0–1，成对的腿 / 翅膀错开 0.5' },
        boxes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['p', 's', 'r', 'c', 'shade'], properties: { p: V3, s: V3, r: V3, c: { type: 'string', description: '#rrggbb' }, shade: { type: 'boolean', description: '大面积（毛、叶、石）开，小点缀关' } } } } } } },
  },
};
/** 精修：在造物的结构上多一句修改说明 */
const REFINE_SCHEMA = { ...MAKE_SCHEMA, required: [...MAKE_SCHEMA.required, 'notes'], properties: { ...MAKE_SCHEMA.properties, notes: { type: 'string', description: '60 字以内中文：看出的主要问题和改了什么' } } };
const MAKE_SYSTEM = `你是一款治愈系体素海岛游戏的造物师。玩家描述（或给一张图）想要的东西，你用“部件 + 长方块”把它搭出来，游戏会自动加圆角、底部压暗、深浅交错的原版手感。
坐标和单位：1 小格；y 向上，脚底 / 底面在 y = 0；正面朝 +z；左右对称的东西以 x = 0 为中线。p 是长方块中心，s 是长宽高（可以是小数，最小 0.5），r 是旋转角度（度）。
尺寸参考：一只羊约高 17、长 16；兔子约高 9；一棵树约高 30–40；小屋约宽 16 高 18（建筑把 size 设成 1.5–3）。
部件：会动的部位各成一个部件（腿、头、尾巴、翅膀、树冠、花头……），pivot 是关节点，放在连接处（腿顶、翅根、脖子、树干顶）；不动的部件 motion 用 none。走的动物腿用 walk，左右、前后成对错开 phase 0.5；翅膀 flap 绕 z 轴；树冠 sway。
总块数 10–90 块：大块定体型，中块做四肢和结构，小块做眼睛、鼻子、斑点、果子、窗户。不要用一堆一样大的小方块堆形状。
颜色任意（不必限于色板），但每个部位一组颜色、整体 3–5 种主色，不要整只一个颜色；眼睛一般用深色加一点白高光。
用中文起名。`;
const stripMake = (m) => ({ name: m.name, use: m.use, behavior: m.behavior, size: m.size, parts: m.parts.map((p) => ({ name: p.name, pivot: p.pivot, motion: p.motion, axis: p.axis, amp: p.amp, speed: p.speed, phase: p.phase, boxes: p.boxes.map((b) => ({ p: b.p, s: b.s, r: b.r, c: b.c, shade: !!b.shade })) })) });
const ISLAND_SYSTEM = `你是一款治愈系六边形海岛游戏的美术设计师兼关卡设计师。你不只是用现有素材搭岛，更要**创造游戏里原本没有的新东西**：
新的生态（地块类型：自己的地面颜色、起伏、草和花、长什么植物）、新的植物（按形态和配色设计）、新的动物（按体型、腿、头、耳、角、尾、翅膀、花纹、颜色、习性设计）。
游戏会按你给的配方现场生成 3D 模型。
规则：
- 默认每次都要创造：至少 1 种新生态、2–4 种新植物、1–3 种新动物，并把它们放进岛里（新生态的地块、新植物和新动物的物件）。玩家明确说“只用现有的”时才不创造。
- 新东西要有想象力，但必须严格按下面的美术标准（SOP）设计，和游戏原有素材是同一个风格；名字是 2–6 个汉字，不和原有的重名。
- 新生态的植物列表里引用新植物或原有植物的名字；新动物的 habitat 写它住的地块类型（可以是新生态的名字）、land 或 sea。
- 原有地块类型（英文 id）：meadow 草地、flowers 花田、forest 森林、mountain 岩山、quarry 采石场、field 菜地、wheat 麦田、beach 沙滩、camp 营地、stream 溪流、pond 池塘、islet 小离岛草地。
- 原有物件（英文 id）：lighthouse 灯塔、windmill 风车、belltower 钟楼、hut 茅屋、campfire 营火、woodpile 柴堆、fence 篱笆、signpost 路牌、boat 小船、buoy 浮标、pine 松树、oak 阔叶树、sakura 樱花树、maple 秋叶树、bush 灌木、palm 椰子树、reed 芦苇、boulder 巨石、deer 鹿、sheep 羊、rabbit 兔子、crab 螃蟹。
- 新岛的地块 12–40 块（改造现有的岛时按需要增减），连成一片（可以另有 1–2 个小离岛），岛的中心在 (0,0) 附近。
- 要像真实的地方：同类地块成片，沙滩在岸边，溪流连成一条线流向海边；新生态和相邻的地块要过渡自然。
- 物件 8–30 个，每块地最多 2 个。
- 用中文起名字和写介绍。

` + sopPrompt();

export class AIService {
  constructor(settings) { this.st = settings; }
  get cfg() { return this.st.ai || {}; }
  get prov() { return PROVIDERS.find((p) => p.id === this.cfg.provider) || PROVIDERS[0]; }
  /** 可用：Claude 要密钥或代理地址；其他服务商要密钥（本机模型不用）和模型名 */
  get ready() { const p = this.prov; return p.kind === 'anthropic' ? !!(this.cfg.key || this.cfg.baseURL) : !!((this.cfg.key || p.noKey || this.cfg.baseURL) && (this.cfg.baseURL || p.base) && this.model); }
  get model() { return (this.cfg.model || this.prov.model || '').trim(); }
  client() {
    const c = this.cfg, sig = (c.key || '') + '|' + (c.baseURL || '');
    if (!this._c || this._sig !== sig) {
      // 浏览器里直连需要显式允许；密钥是玩家自己填的、只存在本机。只填代理地址时由代理补密钥，这里放一个占位
      this._c = new Anthropic({ apiKey: c.key || 'via-proxy', baseURL: c.baseURL || undefined, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120000 });
      this._sig = sig;
    }
    return this._c;
  }
  /** OpenAI 兼容接口：一次 chat/completions 请求。json=true 时要求返回 JSON（并把结构说明放进提示词，因为各家对结构化输出的支持不一样） */
  async _askCompat({ system, user, json, max }) {
    const base = (this.cfg.baseURL || this.prov.base).replace(/\/+$/, ''), headers = { 'Content-Type': 'application/json' };
    if (this.cfg.key) headers.Authorization = 'Bearer ' + this.cfg.key;
    const body = { model: this.model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }], max_tokens: max, ...(json ? { response_format: { type: 'json_object' } } : {}) };
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
    let res;
    try { res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal }); }
    catch (e) { throw new HttpError(0, ctl.signal.aborted ? '请求超时' : '连不上服务器（网络不通、地址不对，或这家服务商不允许从浏览器直接访问，需要走代理地址）'); }
    finally { clearTimeout(timer); }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new HttpError(res.status, data?.error?.message || data?.message || `服务器返回 ${res.status}`);
    const msg = data?.choices?.[0]?.message, text = typeof msg?.content === 'string' ? msg.content : Array.isArray(msg?.content) ? msg.content.map((c) => c.text || '').join('') : '';
    if (!text) throw new HttpError(res.status, '模型没有返回内容');
    return { text, res: { model: data.model || this.model } };
  }
  /** 公共请求。Claude：带上兜底参数（模型支持时），检查拒绝和截断；其他服务商：转成 OpenAI 兼容请求 */
  async _ask(params) {
    if (this.prov.kind !== 'anthropic') {
      const schema = params.output_config?.format?.schema;
      const c = params.messages[0].content, user = typeof c === 'string' ? c : c.map((b) => (b.type === 'image' ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } } : b));
      return this._askCompat({ system: (params.system || '') + (schema ? '\n只输出一个 JSON 对象，不要任何解释或代码块标记。JSON 必须符合这个结构（JSON Schema）：\n' + JSON.stringify(schema) : ''), user, json: !!schema, max: Math.min(params.max_tokens, 8000) });
    }
    const model = this.model, fb = FALLBACK_OK.has(model);
    const res = await this.client().beta.messages.create({
      model, ...params,
      ...(fb ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
    if (res.stop_reason === 'refusal') throw new Error('模型拒绝了这个请求' + (res.stop_details?.explanation ? '：' + res.stop_details.explanation : ''));
    if (res.stop_reason === 'max_tokens') throw new Error('回答太长被截断了，换一句短一点的描述试试');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { res, text };
  }
  /** 测试连接：让模型回一句话 */
  async ping() {
    const { text, res } = await this._ask({ max_tokens: 2000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: '用一句不超过 15 个字的中文跟玩家打个招呼。' }] });
    return { text: text.trim(), model: res.model };
  }
  /** AI 造岛：返回 { name, note, tiles:[[q,r,t]], items:[{k,q,r}], sea, hour } */
  /** AI 造岛 / 造物。base：现在的岛（改造模式），known：以前造过的东西的名字（可以直接引用） */
  async island(prompt, base = null, known = null) {
    const ref = known && (known.biomes.length || known.plants.length || known.creatures.length) ? `\n\n以前已经创造过、可以直接用名字引用的：生态 ${known.biomes.join('、') || '无'}；植物 ${known.plants.join('、') || '无'}；动物 ${known.creatures.join('、') || '无'}。` : '';
    const content = (base ? `现在的岛（JSON）：${JSON.stringify(base)}\n\n玩家的要求：${prompt}\n\n请在现在这座岛的基础上按要求修改：没提到的地块和物件尽量原样保留，坐标不要整体平移。返回改完后的完整布局（全部地块和物件），以及这次新创造的生态、植物、动物。` : prompt) + ref;
    const { text } = await this._ask({
      max_tokens: 16000,
      system: ISLAND_SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ISLAND_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    let data; try { data = JSON.parse(text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('模型返回的布局读不出来，再试一次'); }
    return sanitizeIsland(data, known);
  }
  /** AI 审图：把“原有素材 + 新素材”同比例并排的渲染图给视觉模型，按 SOP 检查清单打分，返回意见和改好的配方。
   *  image：data:image/jpeg;base64,...；labels：图里从左到右每个东西的名字；design：{ biomes, plants, creatures } */
  async review(image, labels, design) {
    const [head, data] = image.split(','), media = head.slice(5, head.indexOf(';'));
    const text = `这张图是游戏里并排渲染的素材，上排是生态和植物、下排是动物，每排内部同一比例，从左到右依次是：${labels.join('、')}。标“原有”的是游戏原有素材（风格标准），其余是这次新设计的。
新设计的配方（JSON）：${JSON.stringify(design)}
请按美术标准的审图清单逐条检查新素材：${CHECKLIST.map((c, i) => `(${i + 1}) ${c}`).join(' ')}
给 1–10 分，用 60 字以内中文写出最重要的问题；然后返回修改后的全部配方（名字不变，字段和原来一样；觉得没问题的照原样返回）。`;
    const { text: out } = await this._ask({
      max_tokens: 16000, system: sopPrompt(),
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data } }, { type: 'text', text }] }],
    });
    let d; try { d = JSON.parse(out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('审图结果读不出来'); }
    const fixed = sanitizeDesign(d);
    // 只接受同名的修改，没返回的保留原样
    const keep = (a, b) => a.map((x) => b.find((y) => y.name === x.name) || x);
    return { score: Math.round(num(d.score, 1, 10, 6)), notes: String(d.notes || '').slice(0, 80), biomes: keep(design.biomes, fixed.biomes), plants: keep(design.plants, fixed.plants), creatures: keep(design.creatures, fixed.creatures) };
  }
  /** AI 造物：一句话（可附一张参考图、可在现有造物上改）→ 造物台格式的造物（部件 + 任意大小的长方块 + 颜色 + 动作）。
   *  image：data:image/...;base64,...（可选）；base：要修改的现有造物（可选） */
  async make(prompt, image = null, base = null) {
    // 不给固定范例（给了范例，模型会照着做出差不多的东西）；只给规则、尺寸参考和美术圣经，造型全由模型自己想
    let text = '';
    if (base) text += `现在的造物（JSON）：${JSON.stringify(stripMake(base))}\n请在它的基础上按要求修改，没提到的地方保留：${prompt}`;
    else text += `请创造：${prompt}`;
    if (image) text += '\n参考附带的图片：抓住它的整体形状、部位和配色，用体素长方块重新搭出来（不需要还原细节）。';
    const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.slice(5, image.indexOf(';')), data: image.split(',')[1] } }, { type: 'text', text }] : text;
    const { text: out } = await this._ask({
      max_tokens: 16000, system: MAKE_SYSTEM + '\n\n' + sopPrompt(),
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: MAKE_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    let d; try { d = JSON.parse(out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('模型返回的造物读不出来，再试一次'); }
    return sanitizeMake(d);
  }
  /** ✦ 精修：AI 看着造物的渲染图（斜前方 + 正侧面），按美术圣经的审图清单检查，自己改一轮。
   *  image：渲染图 data URL（可为空：只看 JSON）；wish：玩家额外的要求（可选）。返回 { make, notes } */
  async refine(make, image = null, wish = '') {
    let text = `${image ? '图里是造物「' + make.name + '」的渲染：左边斜前方、右边正侧面（正面朝左边那张图的左下方向）。' : ''}它的 JSON：${JSON.stringify(stripMake(make))}
请像美术组长审稿一样逐条检查：${CHECKLIST.map((c, i) => `(${i + 1}) ${c}`).join(' ')}；另外看：有没有悬空、离谱穿插的块；该左右对称的地方是否对称；关节点是否在连接处、动作是否合理；眼睛等小细节有没有、看不看得见。
然后返回改好的完整造物：保留它是什么、名字、用途和整体设计，只修正问题、补上缺的细节和深浅层次；没问题的地方原样保留。notes 用 60 字以内中文说看出了什么问题、改了什么。`;
    if (wish) text += `\n玩家另外的要求：${wish}`;
    const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.slice(5, image.indexOf(';')), data: image.split(',')[1] } }, { type: 'text', text }] : text;
    const { text: out } = await this._ask({
      max_tokens: 16000, system: MAKE_SYSTEM + '\n\n' + sopPrompt(),
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: REFINE_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    let d; try { d = JSON.parse(out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('精修结果读不出来，再试一次'); }
    return { make: sanitizeMake(d), notes: String(d.notes || '').slice(0, 80) };
  }
  /** 造物台的生态：一句话 → 生态配方（植物只能从 plantNames 里选）。base：要修改的现有生态（可选）。返回未清洗的数据，由 biome.js 的 sanitizeBiome 对上植物 */
  async biome(prompt, plantNames, base = null) {
    let text = `可以长的植物（只能用这些名字）：${plantNames.join('、')}。\n`;
    text += base ? `现在的生态（JSON）：${JSON.stringify(stripBiome(base))}\n请在它的基础上按要求修改，没提到的地方保留：${prompt}` : `请设计：${prompt}`;
    const { text: out } = await this._ask({ max_tokens: 4000, system: BIOME_SYSTEM + '\n\n' + sopPrompt(), output_config: { effort: 'medium', format: { type: 'json_schema', schema: BIOME_SCHEMA } }, messages: [{ role: 'user', content: text }] });
    try { return JSON.parse(out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('模型返回的生态读不出来，再试一次'); }
  }
  /** ✦ 精修生态：看着预览图（一块地的样子）检查后改一轮。返回 { data（未清洗）, notes } */
  async refineBiome(b, image, plantNames, wish = '') {
    let text = `${image ? '图里是生态「' + b.name + '」的预览：一块六边形地，上面的草、花、植物和岛上一块地一样多。' : ''}它的配方（JSON）：${JSON.stringify(stripBiome(b))}
可以长的植物（只能用这些名字）：${plantNames.join('、')}。
请像美术组长审稿一样检查：地面三种颜色是否同一色相、深浅合适；草色和地面搭不搭；花色是否和谐、多少合适；植物的种类和疏密是否像这个地方；整体和游戏原有的草地、森林放在一起会不会突兀。然后返回改好的完整配方（名字和整体设想保留，只修正问题）；notes 用 60 字以内中文说看出了什么、改了什么。`;
    if (wish) text += `\n玩家另外的要求：${wish}`;
    const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.slice(5, image.indexOf(';')), data: image.split(',')[1] } }, { type: 'text', text }] : text;
    const { text: out } = await this._ask({ max_tokens: 4000, system: BIOME_SYSTEM + '\n\n' + sopPrompt(), output_config: { effort: 'medium', format: { type: 'json_schema', schema: BIOME_REFINE_SCHEMA } }, messages: [{ role: 'user', content }] });
    let d; try { d = JSON.parse(out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('精修结果读不出来，再试一次'); }
    return { data: d, notes: String(d.notes || '').slice(0, 80) };
  }
  // ---------------- AI 自主代理（工具调用循环） ----------------
  // 给模型一组“游戏权限”（工具）。每一步：模型想 → 调工具 → 游戏执行、把结果（文字 + 截图）交回 → 模型再想……直到它不再调工具（做完了）。
  // 对话历史按服务商各存一份原样格式（Claude：内容块原样追加，不改不删；兼容接口：assistant.tool_calls + tool 消息）。
  /** 开一局：system 是这局的规则，goal 是玩家的心愿 */
  agentInit(system, goal) {
    const st = this.prov.kind === 'anthropic' ? { kind: 'anthropic', system, msgs: [] } : { kind: 'openai', msgs: [{ role: 'system', content: system }], noImages: false };
    this.agentSay(st, goal); return st;
  }
  /** 玩家说一句（goal 是文字，或 { text, image }：附一张参考图） */
  agentSay(st, goal) {
    const text = typeof goal === 'string' ? goal : goal.text, img = typeof goal === 'string' ? null : goal.image;
    if (!img) { st.msgs.push({ role: 'user', content: text }); return; }
    st.msgs.push({ role: 'user', content: st.kind === 'anthropic' ? [{ type: 'image', source: { type: 'base64', media_type: img.slice(5, img.indexOf(';')), data: img.split(',')[1] } }, { type: 'text', text: text + '\n（附了一张参考图）' }]
      : [{ type: 'text', text: text + '\n（附了一张参考图）' }, { type: 'image_url', image_url: { url: img } }] });
  }
  /** 走一步：返回 { text（模型说的话）, calls:[{ id, name, input }] }；calls 为空 = 模型认为做完了 */
  async agentStep(st, tools, signal) {
    if (st.kind === 'anthropic') {
      const model = this.model, fb = FALLBACK_OK.has(model);
      const res = await this.client().beta.messages.create({
        model, max_tokens: 16000, system: st.system, tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })), messages: st.msgs,
        output_config: { effort: 'medium' }, cache_control: { type: 'ephemeral' },   // 自动缓存：每一步只为新增的内容付全价
        ...(fb ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      }, { signal });
      if (res.stop_reason === 'refusal') throw new Error('模型拒绝了这个请求' + (res.stop_details?.explanation ? '：' + res.stop_details.explanation : ''));
      if (res.stop_reason === 'max_tokens') throw new Error('模型这一步写得太长被截断了，换个说法或分几次让它做');
      st.msgs.push({ role: 'assistant', content: res.content });   // 原样追加（包括思考块），历史不改不删
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return { text, calls: res.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} })) };
    }
    const base = (this.cfg.baseURL || this.prov.base).replace(/\/+$/, ''), headers = { 'Content-Type': 'application/json' };
    if (this.cfg.key) headers.Authorization = 'Bearer ' + this.cfg.key;
    const send = async () => {
      const body = { model: this.model, messages: st.msgs, tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })), tool_choice: 'auto', max_tokens: 8000 };
      let res; try { res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal }); }
      catch (e) { if (signal?.aborted) throw e; throw new HttpError(0, '连不上服务器（网络不通、地址不对，或这家服务商不允许从浏览器直接访问，需要走代理地址）'); }
      const data = await res.json().catch(() => null);
      return { res, data };
    };
    let { res, data } = await send();
    // 看不了图的模型：把截图去掉再试一次，之后这局都不发图
    if (!res.ok && !st.noImages && st.msgs.some((m) => Array.isArray(m.content))) { st.noImages = true; st.msgs = st.msgs.map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '（截图略）' } : m)); ({ res, data } = await send()); }
    if (!res.ok) throw new HttpError(res.status, data?.error?.message || data?.message || `服务器返回 ${res.status}`);
    const msg = data?.choices?.[0]?.message || {}, calls = (msg.tool_calls || []).map((c) => { let input = {}; try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = { _bad: c.function?.arguments }; } return { id: c.id, name: c.function?.name, input }; });
    st.msgs.push({ role: 'assistant', content: msg.content || '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    return { text: typeof msg.content === 'string' ? msg.content.trim() : '', calls };
  }
  /** 把这一步所有工具的结果交回（同一条消息里）。r: { id, ok, text, image?（data URL） } */
  agentResults(st, results) {
    if (st.kind === 'anthropic') {
      st.msgs.push({ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, ...(r.ok ? {} : { is_error: true }),
        content: r.image ? [{ type: 'image', source: { type: 'base64', media_type: r.image.slice(5, r.image.indexOf(';')), data: r.image.split(',')[1] } }, { type: 'text', text: r.text }] : r.text })) });
      return;
    }
    for (const r of results) st.msgs.push({ role: 'tool', tool_call_id: r.id, content: (r.ok ? '' : '出错：') + r.text });
    const imgs = st.noImages ? [] : results.filter((r) => r.image);
    if (imgs.length) st.msgs.push({ role: 'user', content: [{ type: 'text', text: '上面工具返回的画面：' }, ...imgs.map((r) => ({ type: 'image_url', image_url: { url: r.image } }))] });
  }
  /** 岛民说话：ctx = { name, doing, hour, weather } → 一句话 */
  async villagerLine(ctx) {
    const { text } = await this._ask({
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: '你在扮演一座治愈系小岛上的岛民（一只圆滚滚的小精灵“屿灵”）。用口语说一句话（不超过 25 个字），符合你此刻在做的事和时间，温暖、具体、不说教，不加引号和表情。',
      messages: [{ role: 'user', content: `你是${ctx.name}，现在是${ctx.hour}，你正在${ctx.doing}。有人走过来看你。` }],
    });
    return text.trim().replace(/^["“]|["”]$/g, '');
  }
}

/** 把 SDK 的错误翻成玩家看得懂的话（按错误类型判断，不匹配错误文字） */
export function aiError(e) {
  if (e instanceof HttpError) return e.status === 401 || e.status === 403 ? '密钥不对或没有权限，检查一下 API 密钥' : e.status === 404 ? '接口地址或模型名称不对' : e.status === 429 ? '请求太频繁或额度用完了' : e.message;
  if (e instanceof Anthropic.AuthenticationError) return '密钥不对，检查一下 API 密钥';
  if (e instanceof Anthropic.PermissionDeniedError) return '这个密钥没有权限用这个模型';
  if (e instanceof Anthropic.NotFoundError) return '找不到这个模型，检查一下模型名称';
  if (e instanceof Anthropic.RateLimitError) return '请求太频繁了，等一会儿再试';
  if (e instanceof Anthropic.BadRequestError) return '请求被拒绝：' + (e.error?.error?.message || e.message);
  if (e instanceof Anthropic.APIConnectionError) return '连不上服务器（网络不通，或者代理地址不对）';
  if (e instanceof Anthropic.APIError) return `服务器出错了（${e.status ?? '未知'}），稍后再试`;
  return e?.message || String(e);
}

/** 模型的布局做一遍清洗：去重、限量、地块必须连在岛上（离岛除外）、物件必须落在地块上 */
const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const hexOk = (v, def) => snap(v, def);   // 任何颜色都吸到 SOP 色板上
const pick = (v, list, def) => (list.includes(v) ? v : def);
const nm = (v, def) => String(v || def).replace(/[\s"'<>]/g, '').slice(0, 8) || def;
/** 模型给的结果做一遍清洗：造物配方的数值夹在合理范围里、颜色和枚举都合法；布局去重、限量、物件必须落在地块上。
 *  known：以前造过的东西的名字，布局里可以引用 */
/** AI 造物清洗：数值夹在合理范围、颜色合法、块数限量（不吸色板，颜色由 AI 自由配） */
export function sanitizeMake(d) {
  const v3 = (a, lo, hi, def) => [0, 1, 2].map((i) => num(Array.isArray(a) ? a[i] : NaN, lo, hi, def[i]));
  const hex = (c) => (typeof c === 'string' && /^#?[0-9a-fA-F]{6}$/.test(c.trim()) ? '#' + c.trim().replace('#', '') : '#c9a07a');
  let total = 0;
  const parts = (d.parts || []).slice(0, 14).map((p, i) => ({
    name: String(p.name || '部件' + (i + 1)).slice(0, 8), pivot: v3(p.pivot, -60, 120, [0, 0, 0]), motion: pick(p.motion, ['none', 'walk', 'swing', 'flap', 'spin', 'bob', 'sway', 'pulse'], 'none'), axis: pick(p.axis, ['x', 'y', 'z'], 'x'),
    amp: num(p.amp, 0.1, 2, 1), speed: num(p.speed, 0.1, 3, 1), phase: num(p.phase, 0, 1, 0), seed: i,
    boxes: (p.boxes || []).filter(() => total++ < 160).map((b) => ({ p: v3(b.p, -60, 120, [0, 2, 0]), s: v3(b.s, 0.5, 60, [2, 2, 2]), r: v3(b.r, -180, 180, [0, 0, 0]), c: hex(b.c), shade: b.shade ? 1 : 0 })),
  })).filter((p) => p.boxes.length);
  if (!parts.length) throw new Error('模型没有给出任何方块，再试一次');
  return { name: String(d.name || 'AI造物').slice(0, 10), use: pick(d.use, ['creature', 'plant', 'prop'], 'prop'), behavior: pick(d.behavior, ['walk', 'hop', 'fly', 'swim', 'float', 'still'], 'still'), size: num(d.size, 0.3, 4, 1), parts };
}
export function sanitizeDesign(d) {
  const biomes = (d.biomes || []).slice(0, 3).map((b, i) => ({ name: nm(b.name, '新生态' + (i + 1)), colors: ((m) => [m, shade(m, -0.07), shade(m, 0.07)])(hexOk((b.colors || [])[0], '#8cc043')), height: num(b.height, 0.36, 0.5, 0.45), roughness: num(b.roughness, 0, 1, 0.3),
    grass: num(b.grass, 0, 1, 0.6), grassColor: hexOk(b.grassColor, '#8cc043'), flowers: num(b.flowers, 0, 1, 0.2), flowerColors: (b.flowerColors || []).slice(0, 5).map((c) => hexOk(c, '#f2c45a')), plants: (b.plants || []).slice(0, 5).map((p) => ({ name: nm(p.name, ''), density: num(p.density, 0, 1, 0.5) })) }));
  const plants = (d.plants || []).slice(0, 6).map((p, i) => { const form = pick(p.form, Object.keys(FORMS), 'tree'), [h0, h1] = FORMS[form].h; return { name: nm(p.name, '新植物' + (i + 1)), form, height: num(p.height, h0, h1, (h0 + h1) / 2),
    trunkColor: hexOk(p.trunkColor, '#6b4a32'), trunkThickness: num(p.trunkThickness, 0, 1, 0.5), bend: num(p.bend, 0, 1, 0.1), crownShape: pick(p.crownShape, ['round', 'tall', 'wide', 'droop'], 'round'),
    crownColor: hexOk(p.crownColor, '#4f8a3a'), crownColor2: hexOk(p.crownColor2, '#8fc050'), crownSize: num(p.crownSize, 0.15, 1.2, 0.6), accent: pick(p.accent, ['none', 'fruit', 'flower', 'spots', 'glow'], 'none'), accentColor: hexOk(p.accentColor, '#e04a3a') }; });
  const creatures = (d.creatures || []).slice(0, 5).map((c, i) => ({ name: nm(c.name, '新动物' + (i + 1)), shape: pick(c.shape, ['round', 'long', 'box', 'flat'], 'round'), size: num(c.size, 0.04, 0.16, 0.08), color: hexOk(c.color, '#c98a4a'), color2: hexOk(c.color2, '#f0e2c8'),
    legs: [0, 2, 4, 6].includes(+c.legs) ? +c.legs : 4, head: num(c.head, 0.2, 0.8, 0.45), eyes: pick(c.eyes, ['big', 'small'], 'big'), ears: pick(c.ears, ['none', 'round', 'long', 'pointy'], 'none'), horns: pick(c.horns, ['none', 'small', 'antlers'], 'none'),
    tail: pick(c.tail, ['none', 'short', 'long', 'fluffy', 'fin'], 'short'), wings: !!c.wings, pattern: pick(c.pattern, ['none', 'spots', 'stripes', 'belly'], 'none'), move: pick(c.move, ['walk', 'hop', 'fly', 'swim', 'slither'], 'walk'), habitat: nm(c.habitat, 'land'), count: Math.round(num(c.count, 1, 8, 3)) }));
  return { biomes, plants, creatures };
}
export function sanitizeIsland(d, known = null) {
  const { biomes, plants, creatures } = sanitizeDesign(d);
  const tileOk = new Set([...BASE_TILES, ...biomes.map((b) => b.name), ...(known?.biomes || [])]), propOk = new Set([...BASE_PROPS, ...plants.map((p) => p.name), ...creatures.map((c) => c.name), ...(known?.plants || []), ...(known?.creatures || [])]);
  const seen = new Set(), tiles = [];
  for (const t of d.tiles || []) { const k = t.q + ',' + t.r; if (seen.has(k) || !tileOk.has(t.t) || Math.abs(t.q) > 30 || Math.abs(t.r) > 30) continue; seen.add(k); tiles.push([t.q, t.r, t.t]); if (tiles.length >= 220) break; }
  if (tiles.length < 3) throw new Error('模型给的地块太少，再试一次');
  const land = new Set(tiles.map(([q, r]) => q + ',' + r)), water = new Set(['boat', 'buoy', ...creatures.filter((c) => c.habitat === 'sea').map((c) => c.name)]), count = new Map(), items = [];
  const nearLand = (q, r) => [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].some(([a, b]) => land.has((q + a) + ',' + (r + b)));
  for (const it of d.items || []) {
    if (!propOk.has(it.k)) continue;
    const k = it.q + ',' + it.r, onLand = land.has(k);
    if (water.has(it.k) ? onLand || !nearLand(it.q, it.r) : !onLand) continue;
    if ((count.get(k) || 0) >= 2) continue; count.set(k, (count.get(k) || 0) + 1);
    items.push({ k: it.k, q: it.q, r: it.r }); if (items.length >= 120) break;
  }
  return { name: String(d.name || 'AI 小岛').slice(0, 12), note: String(d.note || '').slice(0, 60), biomes, plants, creatures, tiles, items, sea: ['clear', 'jade', 'deep'].includes(d.sea) ? d.sea : 'clear', hour: Math.max(0, Math.min(23.9, Number(d.hour) || 15)) };
}

/** 没配置 AI 时，村民说的话（按在干什么挑） */
export const CANNED = {
  work: ['今年的菜长得真好。', '再翻完这一垄就歇会儿。', '海风一吹，干活都不累。', '你也来帮把手？'],
  walk: ['去地里看看。', '小路又被踩宽了一点。', '早上好呀！'],
  sit: ['火边最暖和了。', '今天的晚霞真好看。', '明天也是好天气吧。'],
  idle: ['睡得真香。', '先伸个懒腰。', '今天干点什么好呢？'],
};

// 给 AI 自主代理用：造物、生态的数据格式和规则
export { MAKE_SCHEMA, BIOME_SCHEMA, MAKE_SYSTEM, BIOME_SYSTEM, stripMake };
