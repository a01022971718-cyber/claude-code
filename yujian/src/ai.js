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

const TILE_IDS = ITEMS.land.map((x) => x.id);
const PROP_IDS = ['lighthouse', 'windmill', 'belltower', 'hut', 'campfire', 'woodpile', 'fence', 'signpost', 'boat', 'buoy', 'pine', 'oak', 'sakura', 'maple', 'bush', 'palm', 'reed', 'boulder', 'deer', 'sheep', 'rabbit', 'crab'];
const ISLAND_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '岛的名字，2–6 个汉字' },
    note: { type: 'string', description: '一句话介绍这座岛（30 字以内）' },
    tiles: {
      type: 'array', description: '地块，六边形轴坐标 (q, r)，相邻地块坐标差为 (±1,0)、(0,±1)、(+1,-1)、(-1,+1)',
      items: { type: 'object', properties: { q: { type: 'integer' }, r: { type: 'integer' }, t: { type: 'string', enum: TILE_IDS } }, required: ['q', 'r', 't'], additionalProperties: false },
    },
    items: {
      type: 'array', description: '摆在地块上的物件（建筑、植物、动物），q/r 是所在地块；boat 和 buoy 要放在紧挨岛的海面格子上',
      items: { type: 'object', properties: { k: { type: 'string', enum: PROP_IDS }, q: { type: 'integer' }, r: { type: 'integer' } }, required: ['k', 'q', 'r'], additionalProperties: false },
    },
    sea: { type: 'string', enum: ['clear', 'jade', 'deep'] },
    hour: { type: 'number', description: '展示时的钟点 0–24' },
  },
  required: ['name', 'note', 'tiles', 'items', 'sea', 'hour'],
  additionalProperties: false,
};
const ISLAND_SYSTEM = `你是一款治愈系六边形海岛游戏的关卡设计师。根据玩家的一句话描述，设计一座岛的布局。
规则：
- 地块 12–40 块，连成一片（可以另有 1–2 个小离岛），用六边形轴坐标 (q, r)，岛的中心在 (0,0) 附近。
- 地块类型：meadow 草地、flowers 花田、forest 森林、mountain 岩山、quarry 采石场、field 菜地、wheat 麦田、beach 沙滩、camp 营地、stream 溪流、pond 池塘、islet 小离岛的草地。
- 要像真实的地方：森林和岩山成片，沙滩在岸边，营地附近有菜地、麦田和水，溪流连成一条线流向海边，池塘挨着溪流或草地。
- 物件不要太多（8–20 个），每块地最多 2 个；营地上可以有 hut、campfire、woodpile；灯塔放在岸边或离岛上。
- 用中文起名字和写介绍。`;

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
      return this._askCompat({ system: (params.system || '') + (schema ? '\n只输出一个 JSON 对象，不要任何解释或代码块标记。JSON 必须符合这个结构（JSON Schema）：\n' + JSON.stringify(schema) : ''), user: params.messages[0].content, json: !!schema, max: Math.min(params.max_tokens, 8000) });
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
  async island(prompt) {
    const { text } = await this._ask({
      max_tokens: 16000,
      system: ISLAND_SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ISLAND_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    });
    let data; try { data = JSON.parse(text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')); } catch { throw new Error('模型返回的布局读不出来，再试一次'); }
    return sanitizeIsland(data);
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
export function sanitizeIsland(d) {
  const seen = new Set(), tiles = [];
  for (const t of d.tiles || []) { const k = t.q + ',' + t.r; if (seen.has(k) || !TILE_IDS.includes(t.t) || Math.abs(t.q) > 12 || Math.abs(t.r) > 12) continue; seen.add(k); tiles.push([t.q, t.r, t.t]); if (tiles.length >= 60) break; }
  if (tiles.length < 3) throw new Error('模型给的地块太少，再试一次');
  const land = new Set(tiles.map(([q, r]) => q + ',' + r)), water = new Set(['boat', 'buoy']), count = new Map(), items = [];
  const nearLand = (q, r) => [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].some(([a, b]) => land.has((q + a) + ',' + (r + b)));
  for (const it of d.items || []) {
    if (!PROP_IDS.includes(it.k)) continue;
    const k = it.q + ',' + it.r, onLand = land.has(k);
    if (water.has(it.k) ? onLand || !nearLand(it.q, it.r) : !onLand) continue;
    if ((count.get(k) || 0) >= 2) continue; count.set(k, (count.get(k) || 0) + 1);
    items.push({ k: it.k, q: it.q, r: it.r }); if (items.length >= 30) break;
  }
  return { name: String(d.name || 'AI 小岛').slice(0, 12), note: String(d.note || '').slice(0, 60), tiles, items, sea: ['clear', 'jade', 'deep'].includes(d.sea) ? d.sea : 'clear', hour: Math.max(0, Math.min(23.9, Number(d.hour) || 15)) };
}

/** 没配置 AI 时，村民说的话（按在干什么挑） */
export const CANNED = {
  work: ['今年的菜长得真好。', '再翻完这一垄就歇会儿。', '海风一吹，干活都不累。', '你也来帮把手？'],
  walk: ['去地里看看。', '小路又被踩宽了一点。', '早上好呀！'],
  sit: ['火边最暖和了。', '今天的晚霞真好看。', '明天也是好天气吧。'],
  idle: ['睡得真香。', '先伸个懒腰。', '今天干点什么好呢？'],
};
