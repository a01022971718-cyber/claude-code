// 高画质材质：基于 PBR（MeshStandardMaterial），在着色器里叠加程序化细节——
// 地表颗粒与斑驳、岩层与裂隙、苔藓、水线湿痕、细节凹凸（不用贴图），以及云影和风。
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_CLOUD } from './noise.js';

export const U = {
  uTime: { value: 0 },
  uCloud: { value: 1 },
  uWind: { value: 1 },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uCaustic: { value: 0.6 },
};

// 水下焦散：两层脊状噪声叠出的光网，随时间流动；越深越淡
export const GLSL_CAUSTIC = /* glsl */`
float caustics(vec3 p, float t){
  if (p.y > 0.03) return 0.0;
  vec2 q = p.xz * 3.4;
  float a = 1.0 - abs(snoise2(q + vec2(t * 0.33, t * 0.21)));
  float b = 1.0 - abs(snoise2(q * 1.37 + vec2(-t * 0.26, t * 0.31) + 5.3));
  float c = pow(a, 8.0) + pow(b, 8.0) + pow(a * b, 4.0) * 0.6;
  return c * (1.0 - smoothstep(0.0, 2.4, -p.y)) * smoothstep(0.03, -0.04, p.y);
}
`;

const VERT_HEAD = /* glsl */`
attribute vec3 surf;
varying vec3 vSurf;
varying vec3 vWP;
varying vec3 vWN;
`;
const FRAG_HEAD = /* glsl */`
uniform float uTime; uniform float uCloud; uniform vec3 uSunCol; uniform float uCaustic;
varying vec3 vSurf; varying vec3 vWP; varying vec3 vWN;
${GLSL_NOISE}
${GLSL_CLOUD}
${GLSL_CAUSTIC}
float gTerrainH;
`;

/** 地形材质：顶面、岩壁、海底共用，按 surf 属性 [草, 岩, 土/湿] 区分 */
export function terrainMaterial({ flat = false, env = 0.75 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: env, flatShading: flat });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          vec3 p = vWP; float grass = vSurf.x, rock = vSurf.y, soil = vSurf.z;
          float steep = 1.0 - smoothstep(0.55, 0.8, vWN.y);
          rock = max(rock, steep * (1.0 - grass * 0.6));
          // 草地：大块明暗斑、黄绿色调变化、细颗粒
          float big = fbm2(p.xz * 1.7) * 0.5 + 0.5;
          float mid = snoise2(p.xz * 7.0) * 0.5 + 0.5;
          float fine = snoise2(p.xz * 34.0) * 0.5 + 0.5;
          vec3 g = diffuseColor.rgb * mix(0.8, 1.15, big) * mix(0.9, 1.08, mid) * mix(0.9, 1.07, fine);
          g = mix(g, g * vec3(1.18, 1.1, 0.62), smoothstep(0.62, 0.9, big) * 0.45);
          // 土：垄沟方向的条纹和土块
          float clods = worley2(p.xz * 22.0);
          vec3 sCol = diffuseColor.rgb * mix(0.78, 1.12, mid) * mix(0.85, 1.1, smoothstep(0.1, 0.5, clods));
          // 岩：层理 + 裂隙 + 苔藓
          float strata = fbm3(vec3(p.x * 1.4, p.y * 11.0, p.z * 1.4));
          float cracks = smoothstep(0.02, 0.12, worley2(vec2(p.x + p.z, p.y * 1.6) * 5.0));
          vec3 r = diffuseColor.rgb * mix(0.72, 1.18, strata * 0.5 + 0.5) * mix(0.55, 1.0, cracks) * mix(0.9, 1.08, fine);
          float moss = smoothstep(0.45, 0.85, vWN.y + fbm3(p * 3.0) * 0.4) * step(0.0, p.y) * (1.0 - smoothstep(0.05, 0.3, -p.y));
          r = mix(r, vec3(0.16, 0.24, 0.07) * mix(0.8, 1.2, fine), moss * 0.7 * rock);
          vec3 c = mix(g, sCol, soil * (1.0 - rock));
          c = mix(c, r, rock);
          // 水线附近的湿痕
          float wet = 1.0 - smoothstep(-0.02, 0.1, p.y);
          c *= 1.0 - wet * 0.35;
          // 云影
          c *= 1.0 - cloudShadow(p.xz, uTime) * 0.22 * uCloud * step(-0.3, p.y);
          diffuseColor.rgb = c;
          gTerrainH = mix(mix(fine * 0.6 + mid * 0.4, clods * 0.8, soil), strata * 0.5 + (1.0 - cracks) * -0.6 + fine * 0.3, rock);
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.82, vSurf.y);
        roughnessFactor = mix(roughnessFactor, 0.38, 1.0 - smoothstep(-0.02, 0.08, vWP.y));`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          // 由程序化高度求导得到的细节凹凸（屏幕空间导数，不需要切线）
          vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
          vec2 dh = vec2(dFdx(gTerrainH), dFdy(gTerrainH)) * mix(0.55, 1.1, vSurf.y);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * caustics(vWP, uTime) * uCaustic * max(vWN.y, 0.25);`);
  };
  m.customProgramCacheKey = () => 'hq-terrain-' + flat;
  return m;
}

/** 植被材质：带风摆、伪透光（逆光时叶片发亮），颜色来自顶点色 + 实例色 */
export function foliageMaterial({ sway = 1, translucency = 0.35, rough = 0.85 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, envMapIntensity: 0.9 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uSway: { value: sway }, uTrans: { value: translucency } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wind;\nuniform float uTime; uniform float uWind; uniform float uSway;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          vec3 wp = (modelMatrix * vec4(ip, 1.0)).xyz;
          float ph = wp.x * 0.7 + wp.z * 0.9;
          float gust = 0.6 + 0.4 * sin(uTime * 0.6 + wp.x * 0.15);
          float w = wind * uSway * uWind * gust;
          transformed.x += (sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.7 + ph * 2.3) * 0.15) * 0.05 * w;
          transformed.z += (cos(uTime * 1.3 + ph * 1.1) * 0.5) * 0.04 * w;
        }`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uCloud; uniform float uTrans;\nvarying vec3 vWP;\nfloat gLeafH;\n' + GLSL_NOISE + GLSL_CLOUD)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float lf = snoise3(vWP * 42.0) * 0.5 + 0.5;
        float cl = smoothstep(0.04, 0.42, worley2(vec2(vWP.x + vWP.y * 0.7, vWP.z - vWP.y * 0.6) * 16.0));
        float cl2 = smoothstep(0.05, 0.4, worley2(vec2(vWP.x - vWP.y * 0.5, vWP.z + vWP.y * 0.8) * 31.0 + 7.0));
        diffuseColor.rgb *= mix(0.62, 1.1, cl * 0.65 + cl2 * 0.35) * mix(0.9, 1.07, lf) * mix(0.92, 1.06, snoise3(vWP * 6.0) * 0.5 + 0.5);
        gLeafH = cl * 0.7 + cl2 * 0.4 + lf * 0.3;
        diffuseColor.rgb *= 1.0 - cloudShadow(vWP.xz, uTime) * 0.22 * uCloud;`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
          vec2 dh = vec2(dFdx(gLeafH), dFdy(gLeafH)) * 1.6;
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
        }`)
      .replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          // 逆光透射：光从叶片背后照来时，叶片边缘发出暖绿色的光
          vec3 L = directionalLights[0].direction;
          vec3 V = normalize(vViewPosition);
          float back = pow(clamp(dot(V, L), 0.0, 1.0), 3.0) * 0.6 + pow(1.0 - abs(dot(normal, normalize(-vViewPosition))), 3.0) * 0.25;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * back * uTrans;
        }
        #endif`);
  };
  m.customProgramCacheKey = () => 'hq-foliage-' + sway + '-' + translucency;
  return m;
}

/** 道具材质：顶点色 + 细微的颜色噪点和云影 */
export function propMaterial({ rough = 0.75, flat = false, env = 0.85 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, flatShading: flat, envMapIntensity: env });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uCloud;\nvarying vec3 vWP;\n' + GLSL_NOISE + GLSL_CLOUD)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.92, 1.06, snoise3(vWP * 14.0) * 0.5 + 0.5);
        diffuseColor.rgb *= 1.0 - cloudShadow(vWP.xz, uTime) * 0.22 * uCloud;`);
  };
  m.customProgramCacheKey = () => 'hq-prop-' + rough + '-' + flat + '-' + env;
  return m;
}
