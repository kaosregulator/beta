import * as THREE from 'three';
import type { HarborKind, TerrainType } from '../game/types';

export interface ProceduralTextureSet {
  woodMahogany: THREE.CanvasTexture;
  woodMahoganyNormal: THREE.CanvasTexture;
  woodRoughness: THREE.CanvasTexture;
  stoneMasonry: THREE.CanvasTexture;
  stoneMasonryNormal: THREE.CanvasTexture;
  roofSlateNormal: THREE.CanvasTexture;
  oceanNormal: THREE.CanvasTexture;
  terrainMaps: Record<TerrainType, THREE.CanvasTexture>;
  terrainNormal: THREE.CanvasTexture;
  terrainRoughness: THREE.CanvasTexture;
  plainTileBack: THREE.CanvasTexture;
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

/**
 * Converts a grayscale height canvas into a tangent-space RGB normal map via Sobel filter.
 */
function heightCanvasToNormalTexture(
  srcCanvas: HTMLCanvasElement,
  strength: number,
  aniso: number,
  repeat = 1,
): THREE.CanvasTexture {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const { canvas: outCanvas, ctx: outCtx } = makeCanvas(w, h);
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return srcData[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = tr + 2 * r + br - (tl + 2 * l + bl);
      const dy = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return configureTexture(new THREE.CanvasTexture(outCanvas), false, aniso, repeat);
}

function createWoodHeightAndColor(aniso: number) {
  const { canvas: colorC, ctx: colorCtx } = makeCanvas(512, 512);
  const { canvas: heightC, ctx: heightCtx } = makeCanvas(512, 512);
  const { canvas: roughC, ctx: roughCtx } = makeCanvas(512, 512);

  colorCtx.fillStyle = '#4a2517';
  colorCtx.fillRect(0, 0, 512, 512);
  heightCtx.fillStyle = '#808080';
  heightCtx.fillRect(0, 0, 512, 512);
  roughCtx.fillStyle = '#888888';
  roughCtx.fillRect(0, 0, 512, 512);

  // Subtle plank bands + knots + swirling wood grain
  for (let i = 0; i < 220; i++) {
    const y = (i / 220) * 512;
    const isHighlight = i % 4 === 0;
    const alpha = 0.14 + (i % 6) * 0.035;
    const lw = 1 + (i % 3);

    const drawWave = (ctx: CanvasRenderingContext2D, stroke: string, a: number) => {
      ctx.strokeStyle = stroke;
      ctx.globalAlpha = a;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 24) {
        const wave =
          Math.sin(x * 0.014 + i * 0.35) * 5.5 +
          Math.cos(i * 0.8 + x * 0.008) * 2.5;
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    };

    drawWave(colorCtx, isHighlight ? '#6a3925' : '#261008', alpha);
    drawWave(heightCtx, isHighlight ? '#b4b4b4' : '#4a4a4a', alpha * 1.4);
    drawWave(roughCtx, isHighlight ? '#6e6e6e' : '#a8a8a8', alpha * 1.1);
  }

  // Plank seam lines
  colorCtx.globalAlpha = 0.35;
  colorCtx.strokeStyle = '#1d0b05';
  colorCtx.lineWidth = 2.5;
  heightCtx.globalAlpha = 0.7;
  heightCtx.strokeStyle = '#242424';
  heightCtx.lineWidth = 3;
  for (const py of [128, 256, 384]) {
    colorCtx.beginPath();
    colorCtx.moveTo(0, py);
    colorCtx.lineTo(512, py);
    colorCtx.stroke();

    heightCtx.beginPath();
    heightCtx.moveTo(0, py);
    heightCtx.lineTo(512, py);
    heightCtx.stroke();
  }

  colorCtx.globalAlpha = 1;
  heightCtx.globalAlpha = 1;
  roughCtx.globalAlpha = 1;

  return {
    woodMahogany: configureTexture(new THREE.CanvasTexture(colorC), true, aniso, 2),
    woodMahoganyNormal: heightCanvasToNormalTexture(heightC, 2.2, aniso, 2),
    woodRoughness: configureTexture(new THREE.CanvasTexture(roughC), false, aniso, 2),
  };
}

function createStoneMasonryTextures(aniso: number) {
  const { canvas: colorC, ctx: colorCtx } = makeCanvas(256, 256);
  const { canvas: heightC, ctx: heightCtx } = makeCanvas(256, 256);

  // Mortar background
  colorCtx.fillStyle = '#5c5850';
  colorCtx.fillRect(0, 0, 256, 256);
  heightCtx.fillStyle = '#383838';
  heightCtx.fillRect(0, 0, 256, 256);

  const rows = 8;
  const rowH = 256 / rows;
  const cols = 4;
  const colW = 256 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset + 2;
      const y = r * rowH + 2;
      const w = colW - 4;
      const h = rowH - 4;

      const shade = ((r * 7 + c * 13) & 3) * 8;
      colorCtx.fillStyle = `rgb(${128 + shade}, ${124 + shade}, ${116 + shade})`;
      colorCtx.fillRect(x, y, w, h);

      // Subtle bevel highlight inside block
      colorCtx.fillStyle = 'rgba(255,255,255,0.08)';
      colorCtx.fillRect(x, y, w, 3);

      heightCtx.fillStyle = `rgb(${180 + shade}, ${180 + shade}, ${180 + shade})`;
      heightCtx.fillRect(x, y, w, h);
    }
  }

  return {
    stoneMasonry: configureTexture(new THREE.CanvasTexture(colorC), true, aniso, 2),
    stoneMasonryNormal: heightCanvasToNormalTexture(heightC, 2.6, aniso, 2),
  };
}

function createRoofSlateNormal(aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#585858';
  ctx.fillRect(0, 0, 256, 256);

  const rows = 10;
  const rowH = 256 / rows;
  const cols = 8;
  const colW = 256 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset + 1;
      const y = r * rowH + 1;
      const grad = ctx.createLinearGradient(0, y, 0, y + rowH);
      grad.addColorStop(0, '#787878');
      grad.addColorStop(0.82, '#d8d8d8');
      grad.addColorStop(1, '#323232');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, colW - 2, rowH - 1);
    }
  }

  return heightCanvasToNormalTexture(canvas, 2.5, aniso, 2);
}

function createTerrainAlbedo(terrain: TerrainType, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);

  const palettes: Record<TerrainType, [string, string, string, string]> = {
    forest: ['#284825', '#1a3319', '#3e632f', '#3d2e1e'],
    pasture: ['#5b8e3d', '#47762f', '#7cb352', '#95c465'],
    fields: ['#caa039', '#99711e', '#ecc663', '#6b4f1b'],
    hills: ['#a34e33', '#7a331d', '#c56b49', '#613426'],
    mountains: ['#6d747c', '#4c5259', '#9299a1', '#383d42'],
    desert: ['#dab978', '#b99552', '#f0d79f', '#9c7d43'],
  };

  const [base, dark, light, accent] = palettes[terrain];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // Multi-scale organic mottled detail
  for (let i = 0; i < 1200; i++) {
    const x = (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * 512;
    const y = (((Math.sin(i * 78.233) * 24634.6345) % 1) + 1) % 1 * 512;
    const r = 3 + (i % 18);
    ctx.fillStyle = i % 5 === 0 ? accent : i % 2 === 0 ? dark : light;
    ctx.globalAlpha = i % 5 === 0 ? 0.1 : 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (terrain === 'fields') {
    // Rich plowed crop furrow strips with soil seams
    for (let y = 10; y < 512; y += 22) {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();

      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = light;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y + 9);
      ctx.lineTo(512, y + 9);
      ctx.stroke();
    }
  } else if (terrain === 'hills') {
    // Sedimentary clay strata contours
    for (let y = 16; y < 512; y += 36) {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = light;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 24) {
        ctx.lineTo(x, y + Math.sin(x * 0.03 + y * 0.1) * 7);
      }
      ctx.stroke();
    }
  } else if (terrain === 'mountains') {
    // Fractured alpine scree & slate veins
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 73) % 512);
      const sy = ((i * 137) % 512);
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = i % 2 === 0 ? dark : light;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 28, sy + (i % 3 === 0 ? 18 : -16));
      ctx.lineTo(sx + 54, sy + 6);
      ctx.stroke();
    }
  } else if (terrain === 'desert') {
    // Crisp wind-swept dune crests
    for (let y = 14; y < 512; y += 28) {
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = light;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 24) {
        ctx.lineTo(x, y + Math.sin(x * 0.038 + y * 0.08) * 6);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y + 6);
      for (let x = 0; x <= 512; x += 24) {
        ctx.lineTo(x, y + 6 + Math.sin(x * 0.038 + y * 0.08) * 6);
      }
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  return configureTexture(new THREE.CanvasTexture(canvas), true, aniso, 1);
}

function createTerrainHeightMaps(aniso: number) {
  const { canvas: heightC, ctx: heightCtx } = makeCanvas(256, 256);
  const { canvas: roughC, ctx: roughCtx } = makeCanvas(256, 256);
  const hImg = heightCtx.createImageData(256, 256);
  const rImg = roughCtx.createImageData(256, 256);

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n1 = Math.sin(x * 0.12) * Math.cos(y * 0.12);
      const n2 = Math.sin(x * 0.31 + y * 0.19) * 0.5;
      const n3 = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const hVal = Math.max(
        0,
        Math.min(255, Math.floor(128 + n1 * 42 + n2 * 28 + (n3 - 0.5) * 40)),
      );
      const rVal = Math.max(150, Math.min(248, Math.floor(205 + n1 * 24 + (n3 - 0.5) * 20)));
      const idx = (y * 256 + x) * 4;
      hImg.data[idx] = hVal;
      hImg.data[idx + 1] = hVal;
      hImg.data[idx + 2] = hVal;
      hImg.data[idx + 3] = 255;

      rImg.data[idx] = rVal;
      rImg.data[idx + 1] = rVal;
      rImg.data[idx + 2] = rVal;
      rImg.data[idx + 3] = 255;
    }
  }
  heightCtx.putImageData(hImg, 0, 0);
  roughCtx.putImageData(rImg, 0, 0);

  return {
    terrainNormal: heightCanvasToNormalTexture(heightC, 1.8, aniso, 2),
    terrainRoughness: configureTexture(new THREE.CanvasTexture(roughC), false, aniso, 2),
  };
}

function createPlainTileBackTexture(aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  // Warm plain parchment-birch cardboard tabletop tile back
  const grad = ctx.createRadialGradient(256, 256, 24, 256, 256, 320);
  grad.addColorStop(0, '#ddd2ba');
  grad.addColorStop(0.7, '#cfc1a4');
  grad.addColorStop(1, '#b8a684');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle linen/paper fiber grain
  for (let i = 0; i < 650; i++) {
    const x = (((Math.sin(i * 19.31) * 43758.5453) % 1) + 1) % 1 * 512;
    const y = (((Math.sin(i * 91.77) * 24634.6345) % 1) + 1) % 1 * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(110, 88, 56, 0.055)' : 'rgba(255, 252, 244, 0.08)';
    ctx.fillRect(x, y, 2 + (i % 5), 1.5);
  }

  // Faint engraved compass-ring motif around the center token seat
  ctx.strokeStyle = 'rgba(105, 82, 50, 0.22)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 256, 178, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(105, 82, 50, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(256, 256, 160, 0, Math.PI * 2);
  ctx.stroke();

  return configureTexture(new THREE.CanvasTexture(canvas), true, aniso, 1);
}

function createOceanNormalMap(aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = (x / 256) * Math.PI * 2;
      const v = (y / 256) * Math.PI * 2;
      const w =
        Math.sin(u * 2 + v * 1) * 0.45 +
        Math.cos(u * 3 - v * 2) * 0.35 +
        Math.sin(u * 1 - v * 4) * 0.2;
      const val = Math.max(0, Math.min(255, Math.floor(128 + w * 46)));
      const idx = (y * 256 + x) * 4;
      img.data[idx] = val;
      img.data[idx + 1] = val;
      img.data[idx + 2] = val;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return heightCanvasToNormalTexture(canvas, 0.55, aniso, 2.5);
}

function createNumberTokenTexture(num: number, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);

  // Aged ivory parchment disc
  const grad = ctx.createRadialGradient(128, 114, 14, 128, 128, 126);
  grad.addColorStop(0, '#fcf7ea');
  grad.addColorStop(0.75, '#ebe0c5');
  grad.addColorStop(1, '#c3b086');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle parchment fleck grain
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(95, 72, 42, 0.08)' : 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.arc((i * 47) % 256, (i * 89) % 256, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  // Engraved antique brass double ring
  ctx.strokeStyle = '#5c4119';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 114, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#d1a450';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 99, 0, Math.PI * 2);
  ctx.stroke();

  const isHot = num === 6 || num === 8;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 118px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 129, 114);

  ctx.fillStyle = isHot ? '#b41919' : '#140e0a';
  ctx.fillText(String(num), 128, 112);

  // Probability pips
  const dots = 6 - Math.abs(7 - num);
  const spacing = 19;
  const startX = 128 - ((dots - 1) * spacing) / 2;
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * spacing, 185, 6.4, 0, Math.PI * 2);
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

  // Stitched warm canvas sailcloth gradient
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 165);
  grad.addColorStop(0, '#f8f0dc');
  grad.addColorStop(1, '#ddd0b2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle vertical sailcloth seam lines
  ctx.strokeStyle = 'rgba(120, 95, 65, 0.14)';
  ctx.lineWidth = 2;
  for (let x = 32; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const colors: Record<HarborKind, string> = {
    generic_3_1: '#2e4459',
    timber: '#255a30',
    wool: '#5c8832',
    grain: '#bf8418',
    brick: '#a33c23',
    ore: '#424d5c',
  };
  const labels: Record<HarborKind, string> = {
    generic_3_1: 'ANY HARBOR',
    timber: 'TIMBER',
    wool: 'WOOL',
    grain: 'GRAIN',
    brick: 'BRICK',
    ore: 'ORE',
  };

  // Hem border & corner grommets
  ctx.strokeStyle = colors[kind];
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.strokeStyle = '#9c7e47';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, 216, 216);

  // Emblem diamond backing
  ctx.fillStyle = colors[kind];
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.arc(128, 118, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors[kind];
  ctx.font = 'bold 84px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(kind === 'generic_3_1' ? '3:1' : '2:1', 128, 106);

  ctx.font = 'bold 28px Plus Jakarta Sans, sans-serif';
  ctx.fillText(labels[kind], 128, 182);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function createDieFaceTexture(value: number, aniso: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 175);
  grad.addColorStop(0, '#fdf9ee');
  grad.addColorStop(0.78, '#ede0c4');
  grad.addColorStop(1, '#d1bf9a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#b9a37b';
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
    const r = value === 1 ? 27 : 20;
    // Recessed pip lip highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = value === 1 ? '#962222' : '#241a13';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(10, 8, 6, 0.58)');
  grad.addColorStop(0.55, 'rgba(10, 8, 6, 0.24)');
  grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
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

  const { woodMahogany, woodMahoganyNormal, woodRoughness } =
    createWoodHeightAndColor(aniso);
  const { stoneMasonry, stoneMasonryNormal } = createStoneMasonryTextures(aniso);
  const roofSlateNormal = createRoofSlateNormal(aniso);
  const oceanNormal = createOceanNormalMap(aniso);
  const { terrainNormal, terrainRoughness } = createTerrainHeightMaps(aniso);
  const plainTileBack = createPlainTileBackTexture(aniso);

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
    woodMahoganyNormal,
    woodRoughness,
    stoneMasonry,
    stoneMasonryNormal,
    roofSlateNormal,
    oceanNormal,
    terrainMaps,
    terrainNormal,
    terrainRoughness,
    plainTileBack,
    numberTokens,
    harborSigns,
    diceFaces,
    contactShadow,
    dispose: () => {
      woodMahogany.dispose();
      woodMahoganyNormal.dispose();
      woodRoughness.dispose();
      stoneMasonry.dispose();
      stoneMasonryNormal.dispose();
      roofSlateNormal.dispose();
      oceanNormal.dispose();
      terrainNormal.dispose();
      terrainRoughness.dispose();
      plainTileBack.dispose();
      Object.values(terrainMaps).forEach((t) => t.dispose());
      numberTokens.forEach((t) => t.dispose());
      harborSigns.forEach((t) => t.dispose());
      diceFaces.forEach((t) => t.dispose());
      contactShadow.dispose();
    },
  };
}
