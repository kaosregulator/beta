import * as THREE from 'three';
import type { HarborKind, ResourceType, TerrainType } from '../game/types';

export interface ProceduralTextureSet {
  woodMahogany: THREE.CanvasTexture;
  woodGrainBump: THREE.CanvasTexture;
  oceanFoamBump: THREE.CanvasTexture;
  terrainMaps: Record<TerrainType, THREE.CanvasTexture>;
  terrainBump: THREE.CanvasTexture;
  numberTokens: Map<number, THREE.CanvasTexture>;
  harborSigns: Map<HarborKind, THREE.CanvasTexture>;
  diceFaces: THREE.CanvasTexture[]; // index 0..5 => faces 1..6
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function configureTexture(
  tex: THREE.CanvasTexture,
  isColor: boolean,
  maxAnisotropy: number,
  repeat = 1,
) {
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createWoodTexture(
  baseHex: string,
  grainHex: string,
  highlightHex: string,
  aniso: number,
  isColor: boolean,
): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 160; i++) {
    const y = (i / 160) * 512;
    ctx.strokeStyle = i % 3 === 0 ? highlightHex : grainHex;
    ctx.globalAlpha = 0.14 + (i % 5) * 0.04;
    ctx.lineWidth = 1 + (i % 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      const wave = Math.sin(x * 0.015 + i * 0.4) * 5 + Math.cos(i * 0.9) * 2;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return configureTexture(new THREE.CanvasTexture(canvas), isColor, aniso, 2);
}

function createTerrainAlbedo(terrain: TerrainType, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);

  const palettes: Record<TerrainType, [string, string, string]> = {
    forest: ['#294726', '#1d361c', '#3b5c2d'],
    pasture: ['#5b8c3e', '#4b7831', '#75a650'],
    fields: ['#c99e3a', '#a87d24', '#e3bd5b'],
    hills: ['#9e4c32', '#7c3721', '#ba6647'],
    mountains: ['#6b7178', '#4f5459', '#8b9299'],
    desert: ['#d8b97a', '#bd9b59', '#ebd096'],
  };

  const [base, dark, light] = palettes[terrain];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // Organic mottled ground detail
  for (let i = 0; i < 450; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 256;
    const y = (Math.sin(i * 78.233) * 24634.6345 % 1 + 1) % 1 * 256;
    const r = 4 + (i % 14);
    ctx.fillStyle = i % 2 === 0 ? dark : light;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (terrain === 'fields') {
    // Furrow lines
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    for (let y = 8; y < 256; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  } else if (terrain === 'desert') {
    // Wind ripples
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = light;
    ctx.lineWidth = 4;
    for (let y = 10; y < 256; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
      }
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  return configureTexture(new THREE.CanvasTexture(canvas), true, aniso, 1);
}

function createNoiseBump(aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4;
    const v =
      110 +
      Math.floor(
        ((Math.sin(p * 0.17) + Math.cos(p * 0.031)) * 0.5 + 0.5) * 70 +
          Math.random() * 45,
      );
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return configureTexture(new THREE.CanvasTexture(canvas), false, aniso, 2);
}

function createNumberTokenTexture(num: number, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);

  // Aged ivory/parchment disc
  const grad = ctx.createRadialGradient(128, 118, 12, 128, 128, 126);
  grad.addColorStop(0, '#fbf5e6');
  grad.addColorStop(0.8, '#e8dcc0');
  grad.addColorStop(1, '#c8b68e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Brass double ring
  ctx.strokeStyle = '#7c5d2c';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#b48d49';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 128, 98, 0, Math.PI * 2);
  ctx.stroke();

  const isHot = num === 6 || num === 8;
  ctx.fillStyle = isHot ? '#a61818' : '#1b1510';
  ctx.font = 'bold 112px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 128, 114);

  // Probability pips
  const dots = 6 - Math.abs(7 - num);
  const spacing = 18;
  const startX = 128 - ((dots - 1) * spacing) / 2;
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * spacing, 184, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function createHarborSignTexture(kind: HarborKind, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#f2e8cf';
  ctx.fillRect(0, 0, 256, 256);

  const colors: Record<HarborKind, string> = {
    generic_3_1: '#3b4b5c',
    timber: '#2e5d34',
    wool: '#6b9440',
    grain: '#c99322',
    brick: '#a8442a',
    ore: '#505b68',
  };
  const labels: Record<HarborKind, string> = {
    generic_3_1: 'PORT',
    timber: 'TIMBER',
    wool: 'WOOL',
    grain: 'GRAIN',
    brick: 'BRICK',
    ore: 'ORE',
  };

  ctx.strokeStyle = colors[kind];
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 236, 236);

  ctx.fillStyle = colors[kind];
  ctx.font = 'bold 84px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(kind === 'generic_3_1' ? '3:1' : '2:1', 128, 102);

  ctx.font = 'bold 34px Plus Jakarta Sans, sans-serif';
  ctx.fillText(labels[kind], 128, 178);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function createDieFaceTexture(value: number, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 170);
  grad.addColorStop(0, '#fcf7ea');
  grad.addColorStop(1, '#dfd2b5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#b9a681';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 240);

  const pipCoords: Record<number, Array<[number, number]>> = {
    1: [[128, 128]],
    2: [
      [72, 72],
      [184, 184],
    ],
    3: [
      [72, 72],
      [128, 128],
      [184, 184],
    ],
    4: [
      [72, 72],
      [184, 72],
      [72, 184],
      [184, 184],
    ],
    5: [
      [72, 72],
      [184, 72],
      [128, 128],
      [72, 184],
      [184, 184],
    ],
    6: [
      [72, 66],
      [184, 66],
      [72, 128],
      [184, 128],
      [72, 190],
      [184, 190],
    ],
  };

  for (const [x, y] of pipCoords[value]) {
    ctx.fillStyle = value === 1 ? '#8c2222' : '#241b14';
    ctx.beginPath();
    ctx.arc(x, y, value === 1 ? 26 : 20, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(12, 10, 8, 0.55)');
  grad.addColorStop(0.55, 'rgba(12, 10, 8, 0.24)');
  grad.addColorStop(1, 'rgba(12, 10, 8, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextureSet(
  renderer: THREE.WebGLRenderer,
): ProceduralTextureSet {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const woodMahogany = createWoodTexture('#462417', '#2b130a', '#613423', aniso, true);
  const woodGrainBump = createWoodTexture('#808080', '#484848', '#b8b8b8', aniso, false);
  const oceanFoamBump = createNoiseBump(aniso);
  const terrainBump = createNoiseBump(aniso);

  const terrains: TerrainType[] = [
    'forest',
    'pasture',
    'fields',
    'hills',
    'mountains',
    'desert',
  ];
  const terrainMaps = Object.fromEntries(
    terrains.map((t) => [t, createTerrainAlbedo(t, aniso)]),
  ) as Record<TerrainType, THREE.CanvasTexture>;

  const numberTokens = new Map<number, THREE.CanvasTexture>();
  for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
    numberTokens.set(n, createNumberTokenTexture(n, aniso));
  }

  const harborKinds: HarborKind[] = [
    'generic_3_1',
    'timber',
    'wool',
    'grain',
    'brick',
    'ore',
  ];
  const harborSigns = new Map<HarborKind, THREE.CanvasTexture>();
  for (const k of harborKinds) {
    harborSigns.set(k, createHarborSignTexture(k, aniso));
  }

  const diceFaces = [1, 2, 3, 4, 5, 6].map((v) => createDieFaceTexture(v, aniso));
  const contactShadow = createContactShadowTexture();

  return {
    woodMahogany,
    woodGrainBump,
    oceanFoamBump,
    terrainMaps,
    terrainBump,
    numberTokens,
    harborSigns,
    diceFaces,
    contactShadow,
    dispose: () => {
      woodMahogany.dispose();
      woodGrainBump.dispose();
      oceanFoamBump.dispose();
      terrainBump.dispose();
      Object.values(terrainMaps).forEach((t) => t.dispose());
      numberTokens.forEach((t) => t.dispose());
      harborSigns.forEach((t) => t.dispose());
      diceFaces.forEach((t) => t.dispose());
      contactShadow.dispose();
    },
  };
}
