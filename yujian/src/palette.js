// 《屿见》游戏调色板。所有内置模型只用这里的颜色，玩家素材的风格检查也以它为基准。
export const PAL = {
  // 地表
  grass: 0x9ad36a, grassDeep: 0x7fc25c, grassDry: 0xc3d76b, forestFloor: 0x62b060,
  sand: 0xf1dfb0, sandWet: 0xd9c592,
  soil: 0x9b6a45, soilDark: 0x7d5236,
  // 植被
  pine: 0x2f8f6b, pineDark: 0x1f6f5c, pineLight: 0x49a97c,
  leaf: 0x7ccf6c, leafDark: 0x58b05a, leafWarm: 0xf2b84b, blossom: 0xf59aa6, blossomLight: 0xfbc4cb,
  // 木材
  trunk: 0x8a5a3c, wood: 0xb9824f, woodDark: 0x7a5236, woodLight: 0xd9a66b,
  // 岩石
  rock: 0x9aa3ad, rockDark: 0x6f7985, rockWarm: 0xb8a79a, slate: 0x8d99ae, slateDark: 0x6b778d,
  cliffA: 0xc9b089, cliffB: 0xa98f6f, cliffC: 0x8d7a66,
  snow: 0xf4f8fb,
  // 作物
  wheat: 0xf0c24a, wheatDark: 0xd9a233, straw: 0xe6cf7a,
  cabbage: 0x8fd67a, cabbageDark: 0x5fb35e, pumpkin: 0xf08a3c,
  // 建筑
  roof: 0xe8674f, roofDark: 0xc9503c, roofBlue: 0x4a7fb5, roofTeal: 0x2f9d8f,
  wall: 0xf6ecd8, wallShade: 0xe2d3b5, stone: 0xcfc8bb, stoneDark: 0xa9a294,
  // 点缀
  white: 0xffffff, cream: 0xfff6e0, ink: 0x2b3a4a, gold: 0xf7c948, lampGlow: 0xffe08a,
  red: 0xe5484d, pink: 0xff8fa3, yellow: 0xffd166, purple: 0xb79cf2, blue: 0x5aa9e6, teal: 0x3fbfad,
  cloth: 0x4f7cac, skin: 0xf2c6a0, skinDark: 0xc98f6b,
};

// 花色
export const FLOWER_COLORS = [PAL.pink, PAL.yellow, PAL.white, PAL.purple];

// 给玩家看的调色板色卡（素材规范面板里展示，风格检查也用它）
export const STYLE_SWATCHES = [
  ['草绿', PAL.grass], ['深草', PAL.grassDeep], ['松绿', PAL.pine], ['深松', PAL.pineDark], ['嫩叶', PAL.leaf],
  ['暖叶', PAL.leafWarm], ['花粉', PAL.blossom], ['树干', PAL.trunk], ['原木', PAL.wood], ['浅木', PAL.woodLight],
  ['深木', PAL.woodDark], ['岩灰', PAL.rock], ['深岩', PAL.rockDark], ['板岩', PAL.slate], ['砂岩', PAL.cliffA],
  ['雪白', PAL.snow], ['沙色', PAL.sand], ['土色', PAL.soil], ['麦金', PAL.wheat], ['南瓜', PAL.pumpkin],
  ['瓦红', PAL.roof], ['瓦蓝', PAL.roofBlue], ['青瓦', PAL.roofTeal], ['墙白', PAL.wall], ['石白', PAL.stone],
  ['墨色', PAL.ink], ['金色', PAL.gold], ['正红', PAL.red], ['天蓝', PAL.blue], ['紫藤', PAL.purple],
];
