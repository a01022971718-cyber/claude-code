// 地面高度的共享入口：旧画面里地块顶面是平的（TOP），高画质地形有起伏。
// 小人、地标、装饰、补给箱都从这里取高度，由当前的画面实现（view）负责填写。
import { TOP } from './config.js';

export const GROUND = {
  top: TOP,                         // 点击拾取用的参考平面高度
  y: (x, z) => TOP,                 // (x,z) 处的地表高度
  water: null,                      // (x,z) => 海面高度；为空时用简单的正弦起伏
};
