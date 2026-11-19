import * as THREE from 'three';
import { HEX_RADIUS } from '../game/hexMath';
import type { HexTile, TerrainType } from '../game/types';
import type { ProceduralTextureSet } from './textures';

function makeSeededRng(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function createHexPrismGeometry(
  radius: number,
  depth: number,
  bevel = 0.04,
  bevelSegments = 3,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
  });
  geo.rotateX(Math.PI / 2);
  return geo;
}

export interface TerrainElevationProfile {
  /** Height of the primary sculpted biome base layer */
  baseDepth: number;
  /** Radius multiplier & thickness of the middle stepped contour stratum */
  midLayerScale: number;
  midLayerHeight: number;
  /** Radius multiplier & thickness of the upper summit/mesa stratum (0 if none) */
  upperLayerScale: number;
  upperLayerHeight: number;
  /** Amplitude of organic procedural vertex displacement across the top plateau */
  reliefAmplitude: number;
  /** Seated world Y for the center number token disc once tile is revealed */
  revealedTokenY: number;
  /** Relief generator style */
  reliefStyle: 'ridges' | 'dunes' | 'meadow' | 'terraced' | 'furrows' | 'forest_rise';
}

export const DEFAULT_TERRAIN_ELEVATION_PROFILES: Record<
  TerrainType,
  TerrainElevationProfile
> = {
  mountains: {
    baseDepth: 0.16,
    midLayerScale: 0.78,
    midLayerHeight: 0.085,
    upperLayerScale: 0.56,
    upperLayerHeight: 0.095,
    reliefAmplitude: 0.09,
    revealedTokenY: 0.48,
    reliefStyle: 'ridges',
  },
  hills: {
    baseDepth: 0.16,
    midLayerScale: 0.76,
    midLayerHeight: 0.075,
    upperLayerScale: 0.54,
    upperLayerHeight: 0.068,
    reliefAmplitude: 0.048,
    revealedTokenY: 0.445,
    reliefStyle: 'terraced',
  },
  forest: {
    baseDepth: 0.16,
    midLayerScale: 0.74,
    midLayerHeight: 0.06,
    upperLayerScale: 0.52,
    upperLayerHeight: 0.045,
    reliefAmplitude: 0.04,
    revealedTokenY: 0.415,
    reliefStyle: 'forest_rise',
  },
  pasture: {
    baseDepth: 0.16,
    midLayerScale: 0.8,
    midLayerHeight: 0.042,
    upperLayerScale: 0,
    upperLayerHeight: 0,
    reliefAmplitude: 0.075,
    revealedTokenY: 0.375,
    reliefStyle: 'meadow',
  },
  fields: {
    baseDepth: 0.16,
    midLayerScale: 0.72,
    midLayerHeight: 0.048,
    upperLayerScale: 0,
    upperLayerHeight: 0,
    reliefAmplitude: 0.032,
    revealedTokenY: 0.382,
    reliefStyle: 'furrows',
  },
  desert: {
    baseDepth: 0.15,
    midLayerScale: 0.78,
    midLayerHeight: 0.035,
    upperLayerScale: 0,
    upperLayerHeight: 0,
    reliefAmplitude: 0.085,
    revealedTokenY: 0.37,
    reliefStyle: 'dunes',
  },
};

export interface TerrainMeshFidelityConfig {
  subdivisionRings: number;
  secondaryNoiseWeight: number;
  perTileElevationVariance: number;
  cliffSkirtSteps: number;
  vertexColorVariation: number;
}

export const DEFAULT_TERRAIN_MESH_FIDELITY: TerrainMeshFidelityConfig = {
  subdivisionRings: 10,
  secondaryNoiseWeight: 0.36,
  perTileElevationVariance: 0.045,
  cliffSkirtSteps: 2,
  vertexColorVariation: 0.16,
};

/**
 * Generates a high-density subdivided hexagonal relief surface mesh with
 * multi-octave procedural elevation contours, per-tile height variance, and
 * subtle crevice/crest vertex shading while keeping edges & token centers flush.
 */
function createSculptedHexReliefGeometry(
  radius: number,
  profile: TerrainElevationProfile,
  seedStr: string,
  fidelity: TerrainMeshFidelityConfig = DEFAULT_TERRAIN_MESH_FIDELITY,
): THREE.BufferGeometry {
  const rng = makeSeededRng(seedStr);
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const phaseC = rng() * Math.PI * 2;
  const tileLift = (rng() - 0.35) * fidelity.perTileElevationVariance;
  const rings = Math.max(6, Math.min(14, Math.round(fidelity.subdivisionRings)));
  const sectors = 6;

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const evalHeight = (x: number, z: number, normR: number): { y: number; shade: number } => {
    // Taper displacement smoothly to 0 at outer hex edge and keep center token pedestal flat
    const edgeFade = Math.max(0, Math.min(1, (1 - normR) * 3.4));
    const centerSeat = normR < 0.34 ? 0.05 : Math.min(1, (normR - 0.34) / 0.24);
    const mask = edgeFade * centerSeat;
    const amp = profile.reliefAmplitude * mask;

    // 2nd-octave geological micro-ridge variation for handcrafted tactile detail
    const oct2 =
      (Math.sin(x * 7.2 + z * 5.4 + phaseC) * 0.5 +
        Math.cos(z * 8.1 - x * 6.3 + phaseA) * 0.5) *
      0.5 +
      0.5;
    const secWeight = fidelity.secondaryNoiseWeight;
    let primary = 0.5;

    if (profile.reliefStyle === 'dunes') {
      const wave =
        Math.sin(x * 3.8 + z * 1.6 + phaseA) * 0.58 +
        Math.cos(x * 2.1 - z * 3.4 + phaseB) * 0.42;
      const windCrest = Math.pow(Math.max(0, wave * 0.5 + 0.55), 1.25);
      primary = windCrest;
    } else if (profile.reliefStyle === 'meadow') {
      const swell =
        Math.sin(x * 2.5 + phaseA) * Math.cos(z * 2.4 + phaseB) * 0.65 +
        Math.sin((x + z) * 3.3 + phaseC) * 0.35;
      primary = Math.max(0, swell * 0.5 + 0.52);
    } else if (profile.reliefStyle === 'ridges') {
      const ridge =
        Math.abs(Math.sin(x * 3.2 + z * 2.2 + phaseA)) * 0.62 +
        Math.abs(Math.cos(z * 4.0 - x * 1.7 + phaseB)) * 0.38;
      primary = ridge * 1.05;
    } else if (profile.reliefStyle === 'terraced') {
      const raw =
        Math.sin(x * 2.3 + phaseA) * 0.48 +
        Math.cos(z * 2.6 + phaseB) * 0.48 +
        (1 - normR) * 0.72;
      const stepped = Math.round(raw * 4.0) / 4.0;
      primary = Math.max(0, stepped);
    } else if (profile.reliefStyle === 'furrows') {
      const furrow = Math.sin(z * 12.2 + x * 0.8) * 0.5 + 0.5;
      primary = furrow;
    } else {
      // forest_rise
      const knoll =
        Math.sin(x * 2.8 + phaseA) * 0.42 +
        Math.cos(z * 3.0 + phaseB) * 0.42 +
        0.58;
      primary = Math.max(0, knoll);
    }

    const combined = primary * (1 - secWeight * 0.4) + oct2 * secWeight;
    const height = Math.max(0, combined * amp + Math.max(-0.01, tileLift) * mask);
    const colorDelta = (combined - 0.55) * fidelity.vertexColorVariation;
    const shade = Math.max(0.78, Math.min(1.16, 1 + colorDelta));
    return { y: height, shade };
  };

  // Center vertex (0)
  const centerSample = evalHeight(0, 0, 0);
  positions.push(0, centerSample.y, 0);
  uvs.push(0.5, 0.5);
  colors.push(centerSample.shade, centerSample.shade, centerSample.shade);

  const ringStartIdx: number[] = [];
  for (let r = 1; r <= rings; r++) {
    ringStartIdx.push(positions.length / 3);
    const t = r / rings;
    const rad = radius * t;
    const ptsInRing = sectors * r;

    for (let s = 0; s < sectors; s++) {
      const a0 = (Math.PI / 180) * (60 * s - 30);
      const a1 = (Math.PI / 180) * (60 * ((s + 1) % 6) - 30);
      const x0 = rad * Math.cos(a0);
      const z0 = rad * Math.sin(a0);
      const x1 = rad * Math.cos(a1);
      const z1 = rad * Math.sin(a1);

      for (let sub = 0; sub < r; sub++) {
        const f = sub / r;
        const px = x0 + (x1 - x0) * f;
        const pz = z0 + (z1 - z0) * f;
        const sample = evalHeight(px, pz, t);
        positions.push(px, sample.y, pz);
        uvs.push(0.5 + px / (radius * 2.2), 0.5 + pz / (radius * 2.2));
        colors.push(sample.shade, sample.shade, sample.shade);
      }
    }
    void ptsInRing;
  }

  // Inner fan triangles (center -> ring 1)
  const r1Start = ringStartIdx[0];
  for (let s = 0; s < sectors; s++) {
    const next = (s + 1) % sectors;
    indices.push(0, r1Start + next, r1Start + s);
  }

  // Stitch concentric rings (r to r+1)
  for (let r = 1; r < rings; r++) {
    const innerStart = ringStartIdx[r - 1];
    const outerStart = ringStartIdx[r];
    const innerCount = sectors * r;
    const outerCount = sectors * (r + 1);

    for (let s = 0; s < sectors; s++) {
      for (let k = 0; k < r; k++) {
        const i0 = innerStart + ((s * r + k) % innerCount);
        const i1 = innerStart + ((s * r + k + 1) % innerCount);
        const o0 = outerStart + ((s * (r + 1) + k) % outerCount);
        const o1 = outerStart + ((s * (r + 1) + k + 1) % outerCount);
        indices.push(i0, o1, o0);
        indices.push(i0, i1, o1);
      }
      // Corner triangle at end of sector
      const iCorner = innerStart + (((s + 1) * r) % innerCount);
      const oA = outerStart + ((s * (r + 1) + r) % outerCount);
      const oB = outerStart + (((s + 1) * (r + 1)) % outerCount);
      indices.push(iCorner, oB, oA);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface TerrainTileBuildResult {
  hexId: string;
  revealed: boolean;
  group: THREE.Group;
  flipPivot: THREE.Group;
  biomeGroup: THREE.Group;
  plainBackGroup: THREE.Group;
  tokenMountGroup: THREE.Group;
  unrevealedTokenY: number;
  revealedTokenY: number;
  swayTrees: THREE.Object3D[];
  windmills: THREE.Object3D[];
  disposeCustomGeometries: () => void;
}

export interface TerrainAssets {
  baseGeo: THREE.ExtrudeGeometry;
  rimGeo: THREE.ExtrudeGeometry;
  terraceGeo: THREE.ExtrudeGeometry;
  upperTerraceGeo: THREE.ExtrudeGeometry;
  plainBackGeo: THREE.ExtrudeGeometry;
  plainTrimGeo: THREE.RingGeometry;
  furrowGeo: THREE.BoxGeometry;
  tokenGeo: THREE.CylinderGeometry;
  tokenFaceGeo: THREE.CircleGeometry;
  treeTrunkGeo: THREE.CylinderGeometry;
  treeConeGeo: THREE.ConeGeometry;
  fernGeo: THREE.ConeGeometry;
  flowerGeo: THREE.SphereGeometry;
  wheatStalkGeo: THREE.CylinderGeometry;
  wheatHeadGeo: THREE.ConeGeometry;
  boulderGeo: THREE.DodecahedronGeometry;
  brickGeo: THREE.BoxGeometry;
  fencePostGeo: THREE.BoxGeometry;
  fenceRailGeo: THREE.BoxGeometry;
  materials: {
    rimEarth: THREE.MeshStandardMaterial;
    plainTileBack: THREE.MeshStandardMaterial;
    plainTileTrim: THREE.MeshStandardMaterial;
    terrainTop: Record<TerrainType, THREE.MeshStandardMaterial>;
    terrainRelief: Record<TerrainType, THREE.MeshStandardMaterial>;
    bark: THREE.MeshStandardMaterial;
    pineLeaves: THREE.MeshStandardMaterial[];
    fernGreen: THREE.MeshStandardMaterial;
    rockGrey: THREE.MeshStandardMaterial;
    rockDark: THREE.MeshStandardMaterial;
    snowCap: THREE.MeshStandardMaterial;
    oreVein: THREE.MeshStandardMaterial;
    clayRed: THREE.MeshStandardMaterial;
    clayBrick: THREE.MeshStandardMaterial;
    wheatGold: THREE.MeshStandardMaterial;
    wheatEar: THREE.MeshStandardMaterial;
    wheatBarn: THREE.MeshStandardMaterial;
    windmillSail: THREE.MeshStandardMaterial;
    sheepWool: THREE.MeshStandardMaterial;
    sheepFace: THREE.MeshStandardMaterial;
    fenceWood: THREE.MeshStandardMaterial;
    flowerYellow: THREE.MeshStandardMaterial;
    flowerWhite: THREE.MeshStandardMaterial;
    sandDune: THREE.MeshStandardMaterial;
    cactusGreen: THREE.MeshStandardMaterial;
    oasisWater: THREE.MeshStandardMaterial;
    tokenBrass: THREE.MeshStandardMaterial;
    tilledSoil: THREE.MeshStandardMaterial;
    coastalShelf: THREE.MeshStandardMaterial;
  };
  dispose: () => void;
}

export function createTerrainAssets(textures: ProceduralTextureSet): TerrainAssets {
  const baseGeo = createHexPrismGeometry(HEX_RADIUS * 0.905, 0.14, 0.048, 3);
  const rimGeo = createHexPrismGeometry(HEX_RADIUS * 0.985, 0.36, 0.045, 3);
  const terraceGeo = createHexPrismGeometry(HEX_RADIUS * 0.74, 0.052, 0.032, 2);
  const upperTerraceGeo = createHexPrismGeometry(HEX_RADIUS * 0.52, 0.05, 0.026, 2);
  const plainBackGeo = createHexPrismGeometry(HEX_RADIUS * 0.905, 0.068, 0.032, 3);
  const plainTrimGeo = new THREE.RingGeometry(HEX_RADIUS * 0.69, HEX_RADIUS * 0.74, 6);
  plainTrimGeo.rotateX(Math.PI / 2);
  const furrowGeo = new THREE.BoxGeometry(1.32, 0.028, 0.105);
  const tokenGeo = new THREE.CylinderGeometry(0.425, 0.445, 0.072, 28);
  const tokenFaceGeo = new THREE.CircleGeometry(0.39, 28);
  const treeTrunkGeo = new THREE.CylinderGeometry(0.03, 0.072, 0.28, 7);
  const treeConeGeo = new THREE.ConeGeometry(0.22, 0.24, 7);
  const fernGeo = new THREE.ConeGeometry(0.085, 0.09, 5);
  const flowerGeo = new THREE.SphereGeometry(0.028, 6, 5);
  const wheatStalkGeo = new THREE.CylinderGeometry(0.015, 0.022, 0.24, 5);
  const wheatHeadGeo = new THREE.ConeGeometry(0.042, 0.12, 5);
  const boulderGeo = new THREE.DodecahedronGeometry(0.095, 0);
  const brickGeo = new THREE.BoxGeometry(0.11, 0.055, 0.065);
  const fencePostGeo = new THREE.BoxGeometry(0.035, 0.14, 0.035);
  const fenceRailGeo = new THREE.BoxGeometry(0.54, 0.024, 0.02);

  const terrainTop = {} as Record<TerrainType, THREE.MeshStandardMaterial>;
  const terrainRelief = {} as Record<TerrainType, THREE.MeshStandardMaterial>;
  (['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert'] as TerrainType[]).forEach(
    (t) => {
      terrainTop[t] = new THREE.MeshStandardMaterial({
        map: textures.terrainMaps[t],
        normalMap: textures.terrainNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: textures.terrainRoughness,
        roughness: t === 'desert' ? 0.92 : 0.84,
        metalness: 0.03,
      });
      terrainRelief[t] = new THREE.MeshStandardMaterial({
        map: textures.terrainMaps[t],
        normalMap: textures.terrainNormal,
        normalScale: new THREE.Vector2(0.92, 0.92),
        roughnessMap: textures.terrainRoughness,
        roughness: t === 'desert' ? 0.92 : 0.84,
        metalness: 0.03,
        vertexColors: true,
      });
    },
  );

  const materials = {
    rimEarth: new THREE.MeshStandardMaterial({
      color: 0x5c4b3c,
      map: textures.stoneMasonry,
      roughness: 0.9,
      metalness: 0.04,
      normalMap: textures.stoneMasonryNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
    }),
    plainTileBack: new THREE.MeshStandardMaterial({
      color: 0xdacdb2,
      map: textures.plainTileBack,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.82,
      metalness: 0.03,
    }),
    plainTileTrim: new THREE.MeshStandardMaterial({
      color: 0x8f744c,
      roughness: 0.72,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    terrainTop,
    terrainRelief,
    bark: new THREE.MeshStandardMaterial({
      color: 0x4d311f,
      roughness: 0.9,
      normalMap: textures.woodMahoganyNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
    }),
    pineLeaves: [
      new THREE.MeshStandardMaterial({ color: 0x244d28, roughness: 0.78 }),
      new THREE.MeshStandardMaterial({ color: 0x316232, roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: 0x1b3d20, roughness: 0.82 }),
    ],
    fernGreen: new THREE.MeshStandardMaterial({ color: 0x427536, roughness: 0.76 }),
    rockGrey: new THREE.MeshStandardMaterial({
      color: 0x747b82,
      roughness: 0.86,
      metalness: 0.08,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      flatShading: true,
    }),
    rockDark: new THREE.MeshStandardMaterial({
      color: 0x4a5057,
      roughness: 0.88,
      metalness: 0.14,
      flatShading: true,
    }),
    snowCap: new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      roughness: 0.4,
      metalness: 0.04,
      flatShading: true,
    }),
    oreVein: new THREE.MeshStandardMaterial({
      color: 0x44566c,
      roughness: 0.28,
      metalness: 0.74,
      flatShading: true,
    }),
    clayRed: new THREE.MeshStandardMaterial({
      color: 0xa64a30,
      roughness: 0.84,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(0.75, 0.75),
      flatShading: true,
    }),
    clayBrick: new THREE.MeshStandardMaterial({
      color: 0xc75c3d,
      roughness: 0.76,
    }),
    wheatGold: new THREE.MeshStandardMaterial({
      color: 0xdfb042,
      roughness: 0.74,
    }),
    wheatEar: new THREE.MeshStandardMaterial({
      color: 0xf0c95e,
      roughness: 0.68,
    }),
    wheatBarn: new THREE.MeshStandardMaterial({
      color: 0x8f3728,
      roughness: 0.74,
    }),
    windmillSail: new THREE.MeshStandardMaterial({
      color: 0xf4ead3,
      roughness: 0.78,
    }),
    sheepWool: new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.92 }),
    sheepFace: new THREE.MeshStandardMaterial({ color: 0x2f2924, roughness: 0.8 }),
    fenceWood: new THREE.MeshStandardMaterial({
      color: 0x735235,
      roughness: 0.85,
      normalMap: textures.woodMahoganyNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
    }),
    flowerYellow: new THREE.MeshStandardMaterial({ color: 0xf5d256, roughness: 0.58 }),
    flowerWhite: new THREE.MeshStandardMaterial({ color: 0xfcf8ee, roughness: 0.58 }),
    sandDune: new THREE.MeshStandardMaterial({
      color: 0xdcb977,
      roughness: 0.92,
      flatShading: true,
    }),
    cactusGreen: new THREE.MeshStandardMaterial({ color: 0x4b7743, roughness: 0.74 }),
    oasisWater: new THREE.MeshStandardMaterial({
      color: 0x2c8da1,
      roughness: 0.16,
      metalness: 0.15,
    }),
    tokenBrass: new THREE.MeshStandardMaterial({
      color: 0xc2994c,
      roughness: 0.28,
      metalness: 0.82,
    }),
    tilledSoil: new THREE.MeshStandardMaterial({
      color: 0x9e712c,
      roughness: 0.94,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
    }),
    coastalShelf: new THREE.MeshStandardMaterial({
      color: 0x7c7467,
      roughness: 0.92,
      normalMap: textures.stoneMasonryNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      flatShading: true,
    }),
  };

  return {
    baseGeo,
    rimGeo,
    terraceGeo,
    upperTerraceGeo,
    plainBackGeo,
    plainTrimGeo,
    furrowGeo,
    tokenGeo,
    tokenFaceGeo,
    treeTrunkGeo,
    treeConeGeo,
    fernGeo,
    flowerGeo,
    wheatStalkGeo,
    wheatHeadGeo,
    boulderGeo,
    brickGeo,
    fencePostGeo,
    fenceRailGeo,
    materials,
    dispose: () => {
      baseGeo.dispose();
      rimGeo.dispose();
      terraceGeo.dispose();
      upperTerraceGeo.dispose();
      plainBackGeo.dispose();
      plainTrimGeo.dispose();
      furrowGeo.dispose();
      tokenGeo.dispose();
      tokenFaceGeo.dispose();
      treeTrunkGeo.dispose();
      treeConeGeo.dispose();
      fernGeo.dispose();
      flowerGeo.dispose();
      wheatStalkGeo.dispose();
      wheatHeadGeo.dispose();
      boulderGeo.dispose();
      brickGeo.dispose();
      fencePostGeo.dispose();
      fenceRailGeo.dispose();
      Object.values(terrainTop).forEach((m) => m.dispose());
      Object.values(terrainRelief).forEach((m) => m.dispose());
      materials.rimEarth.dispose();
      materials.plainTileBack.dispose();
      materials.plainTileTrim.dispose();
      materials.bark.dispose();
      materials.pineLeaves.forEach((m) => m.dispose());
      materials.fernGreen.dispose();
      materials.rockGrey.dispose();
      materials.rockDark.dispose();
      materials.snowCap.dispose();
      materials.oreVein.dispose();
      materials.clayRed.dispose();
      materials.clayBrick.dispose();
      materials.wheatGold.dispose();
      materials.wheatEar.dispose();
      materials.wheatBarn.dispose();
      materials.windmillSail.dispose();
      materials.sheepWool.dispose();
      materials.sheepFace.dispose();
      materials.fenceWood.dispose();
      materials.flowerYellow.dispose();
      materials.flowerWhite.dispose();
      materials.sandDune.dispose();
      materials.cactusGreen.dispose();
      materials.oasisWater.dispose();
      materials.tokenBrass.dispose();
      materials.tilledSoil.dispose();
      materials.coastalShelf.dispose();
    },
  };
}

function addMultiSpeciesPineTree(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  scale: number,
  species: 'spruce' | 'cedar',
  assets: TerrainAssets,
  rng: () => number,
): THREE.Group {
  const tree = new THREE.Group();
  tree.position.set(x, y, z);
  tree.scale.setScalar(scale);

  // Tapered bark trunk + flared root buttresses
  const trunk = new THREE.Mesh(assets.treeTrunkGeo, assets.materials.bark);
  trunk.position.y = 0.13;
  trunk.castShadow = true;
  tree.add(trunk);

  const leafMat =
    assets.materials.pineLeaves[Math.floor(rng() * assets.materials.pineLeaves.length)];

  const tiers =
    species === 'spruce'
      ? [
          { r: 0.95, h: 0.95, y: 0.25 },
          { r: 0.8, h: 0.92, y: 0.39 },
          { r: 0.62, h: 0.86, y: 0.52 },
          { r: 0.42, h: 0.78, y: 0.65 },
        ]
      : [
          { r: 1.15, h: 0.75, y: 0.24 },
          { r: 0.92, h: 0.72, y: 0.36 },
          { r: 0.65, h: 0.68, y: 0.48 },
        ];

  tiers.forEach((t, idx) => {
    const tier = new THREE.Mesh(assets.treeConeGeo, leafMat);
    tier.scale.set(t.r, t.h, t.r * (0.9 + rng() * 0.18));
    tier.position.set((rng() - 0.5) * 0.025, t.y, (rng() - 0.5) * 0.025);
    tier.rotation.y = idx * 0.65 + rng() * 0.7;
    tier.castShadow = true;
    tier.receiveShadow = true;
    tree.add(tier);
  });

  tree.userData.swayPhase = rng() * Math.PI * 2;
  parent.add(tree);
  return tree;
}

function addGrazingSheep(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  yaw: number,
  assets: TerrainAssets,
) {
  const sheep = new THREE.Group();
  sheep.position.set(x, y, z);
  sheep.rotation.y = yaw;

  const body = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.11, 0),
    assets.materials.sheepWool,
  );
  body.scale.set(1.32, 0.96, 0.96);
  body.position.y = 0.12;
  body.castShadow = true;
  sheep.add(body);

  const tuft = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.082, 0),
    assets.materials.sheepWool,
  );
  tuft.position.set(-0.04, 0.16, 0.02);
  sheep.add(tuft);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.082, 0.078, 0.078),
    assets.materials.sheepFace,
  );
  head.position.set(0.13, 0.15, 0);
  head.rotation.z = -0.28;
  sheep.add(head);

  const earGeo = new THREE.BoxGeometry(0.02, 0.02, 0.04);
  for (const ez of [-0.045, 0.045]) {
    const ear = new THREE.Mesh(earGeo, assets.materials.sheepFace);
    ear.position.set(0.12, 0.175, ez);
    sheep.add(ear);
  }

  const legGeo = new THREE.CylinderGeometry(0.014, 0.012, 0.09, 5);
  for (const [lx, lz] of [
    [-0.07, -0.05],
    [-0.07, 0.05],
    [0.07, -0.05],
    [0.07, 0.05],
  ] as const) {
    const leg = new THREE.Mesh(legGeo, assets.materials.sheepFace);
    leg.position.set(lx, 0.045, lz);
    sheep.add(leg);
  }

  parent.add(sheep);
}

function addMountainPeak(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  assets: TerrainAssets,
  rng: () => number,
) {
  const peak = new THREE.Group();
  peak.position.set(x, y, z);

  // Sculpted jagged crag by displacing cone vertices radially
  const cragGeo = new THREE.ConeGeometry(radius, height, 7, 4);
  const pos = cragGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vy = pos.getY(i);
    if (vy < height * 0.45 && vy > -height * 0.45) {
      const n = 0.76 + rng() * 0.46;
      pos.setX(i, pos.getX(i) * n);
      pos.setZ(i, pos.getZ(i) * n);
    }
  }
  cragGeo.computeVertexNormals();

  const crag = new THREE.Mesh(
    cragGeo,
    rng() > 0.35 ? assets.materials.rockGrey : assets.materials.rockDark,
  );
  crag.position.y = height * 0.45;
  crag.castShadow = true;
  crag.receiveShadow = true;
  peak.add(crag);

  if (height > 0.62) {
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.43, height * 0.36, 7),
      assets.materials.snowCap,
    );
    cap.position.y = height * 0.77;
    cap.castShadow = true;
    peak.add(cap);
  }

  const shoulder = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius * 0.44, 0),
    assets.materials.rockDark,
  );
  shoulder.scale.set(1.25, 0.85, 0.92);
  shoulder.position.set(radius * 0.42, height * 0.14, (rng() - 0.5) * 0.25);
  shoulder.castShadow = true;
  peak.add(shoulder);

  parent.add(peak);
}

const _dummyObj = new THREE.Object3D();

/**
 * Builds a complete, handcrafted 3D hexagonal terrain tile Group with multi-layered
 * procedural elevation strata, sculpted relief surface, plain flip-back face,
 * instanced biome flora, and brass/parchment number token disc.
 */
export function buildHexTileGroup(
  hex: HexTile,
  assets: TerrainAssets,
  textures: ProceduralTextureSet,
  elevationProfiles: Record<TerrainType, TerrainElevationProfile> = DEFAULT_TERRAIN_ELEVATION_PROFILES,
  meshFidelity: TerrainMeshFidelityConfig = DEFAULT_TERRAIN_MESH_FIDELITY,
): TerrainTileBuildResult {
  const group = new THREE.Group();
  const tileElevationJitter =
    (makeSeededRng(`${hex.id}_plinth`)() - 0.45) * meshFidelity.perTileElevationVariance * 0.45;
  group.position.set(hex.x, 0, hex.z);
  const rng = makeSeededRng(`${hex.id}_${hex.terrain}`);
  const swayTrees: THREE.Object3D[] = [];
  const windmills: THREE.Object3D[] = [];
  const customGeometries: THREE.BufferGeometry[] = [];
  const customMaterials: THREE.Material[] = [];
  const profile = elevationProfiles[hex.terrain] ?? DEFAULT_TERRAIN_ELEVATION_PROFILES[hex.terrain];

  // 1. Stationary carved stone/earth island plinth rising out of ocean
  const rim = new THREE.Mesh(assets.rimGeo, assets.materials.rimEarth);
  rim.position.y = 0.2 + tileElevationJitter * 0.5;
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  // Coastal shoal ledges around the outer perimeter hexes for grounded cliff-to-sea silhouette
  const isCoastal =
    Math.abs(hex.q) === 2 || Math.abs(hex.r) === 2 || Math.abs(hex.q + hex.r) === 2;
  if (isCoastal) {
    const outAng = Math.atan2(hex.z, hex.x);
    for (const offset of [-0.26, 0.26]) {
      const shoal = new THREE.Mesh(assets.boulderGeo, assets.materials.coastalShelf);
      shoal.position.set(
        Math.cos(outAng + offset) * (HEX_RADIUS * 0.95),
        -0.01,
        Math.sin(outAng + offset) * (HEX_RADIUS * 0.95),
      );
      shoal.scale.set(2.6, 0.28, 1.35);
      shoal.rotation.y = outAng + offset;
      shoal.receiveShadow = true;
      group.add(shoal);
    }
  }

  // 2. Flip Pivot containing both the plain tabletop tile-back and the sculpted elevated biome
  const flipPivot = new THREE.Group();
  flipPivot.position.y = 0.285;
  flipPivot.rotation.x = hex.revealed ? 0 : Math.PI;
  group.add(flipPivot);

  // 2a. Plain upside-down tabletop tile back (faces +Y when flipPivot.rotation.x === Math.PI)
  const plainBackGroup = new THREE.Group();
  const backSlab = new THREE.Mesh(assets.plainBackGeo, assets.materials.plainTileBack);
  backSlab.rotation.x = Math.PI;
  backSlab.position.y = -0.025;
  backSlab.castShadow = true;
  backSlab.receiveShadow = true;
  plainBackGroup.add(backSlab);

  const backTrim = new THREE.Mesh(assets.plainTrimGeo, assets.materials.plainTileTrim);
  backTrim.position.y = -0.0585;
  backTrim.receiveShadow = true;
  plainBackGroup.add(backTrim);
  flipPivot.add(plainBackGroup);

  // 2b. Right-side-up Elevated Biome Assembly (hidden while flipped upside-down)
  const biomeGroup = new THREE.Group();
  biomeGroup.position.y = tileElevationJitter;
  biomeGroup.visible = hex.revealed;
  flipPivot.add(biomeGroup);

  // Layer 1: Chamfered primary biome base shelf + secondary geological cliff skirt
  const topCap = new THREE.Mesh(assets.baseGeo, assets.materials.terrainTop[hex.terrain]);
  topCap.position.y = -0.015;
  topCap.castShadow = true;
  topCap.receiveShadow = true;
  biomeGroup.add(topCap);

  if (meshFidelity.cliffSkirtSteps >= 2) {
    const skirtShelf = new THREE.Mesh(assets.terraceGeo, assets.materials.rimEarth);
    skirtShelf.position.y = -0.028;
    skirtShelf.scale.set(1.16, 0.58, 1.16);
    skirtShelf.receiveShadow = true;
    biomeGroup.add(skirtShelf);
  }

  // Layer 2: High-density procedural sculpted height-relief surface mesh across the hex plateau
  const reliefGeo = createSculptedHexReliefGeometry(
    HEX_RADIUS * 0.895,
    profile,
    `${hex.id}_${hex.terrain}_relief`,
    meshFidelity,
  );
  customGeometries.push(reliefGeo);
  const reliefMesh = new THREE.Mesh(reliefGeo, assets.materials.terrainRelief[hex.terrain]);
  reliefMesh.position.y = 0.032;
  reliefMesh.castShadow = true;
  reliefMesh.receiveShadow = true;
  biomeGroup.add(reliefMesh);

  // Local Y inside flipPivot (world Y = 0.285 + localY when upright)
  const baseSurfaceY = 0.035;

  const ringAngles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (i) => (i / 10) * Math.PI * 2 + rng() * 0.24,
  );

  if (hex.terrain === 'forest') {
    // Mid woodland humus rise + upper mossy grove terrace
    const midTerrace = new THREE.Mesh(
      assets.terraceGeo,
      assets.materials.terrainTop.forest,
    );
    midTerrace.position.y = baseSurfaceY + 0.028;
    midTerrace.scale.set(
      profile.midLayerScale / 0.74,
      profile.midLayerHeight / 0.052,
      profile.midLayerScale / 0.74,
    );
    midTerrace.receiveShadow = true;
    midTerrace.castShadow = true;
    biomeGroup.add(midTerrace);

    const upperGrove = new THREE.Mesh(
      assets.upperTerraceGeo,
      assets.materials.terrainTop.forest,
    );
    upperGrove.position.y = baseSurfaceY + 0.068;
    upperGrove.castShadow = true;
    upperGrove.receiveShadow = true;
    biomeGroup.add(upperGrove);

    const treeSurfaceY = baseSurfaceY + 0.058;
    ringAngles.forEach((ang, i) => {
      const dist = i % 2 === 0 ? 0.84 + rng() * 0.18 : 0.62 + rng() * 0.16;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      const tree = addMultiSpeciesPineTree(
        biomeGroup,
        tx,
        dist < 0.72 ? treeSurfaceY + 0.028 : treeSurfaceY,
        tz,
        0.78 + rng() * 0.48,
        i % 3 === 0 ? 'cedar' : 'spruce',
        assets,
        rng,
      );
      swayTrees.push(tree);
    });

    // Fallen moss-covered timber log
    const log = new THREE.Mesh(assets.treeTrunkGeo, assets.materials.bark);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rng() * Math.PI;
    log.scale.set(1.2, 1.4, 1.2);
    log.position.set(-0.52, treeSurfaceY + 0.04, 0.56);
    log.castShadow = true;
    biomeGroup.add(log);

    // Instanced forest undergrowth ferns + boulders
    const fernCount = 18;
    const ferns = new THREE.InstancedMesh(
      assets.fernGeo,
      assets.materials.fernGreen,
      fernCount,
    );
    for (let i = 0; i < fernCount; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 0.52 + rng() * 0.64;
      _dummyObj.position.set(
        Math.cos(ang) * d,
        treeSurfaceY + (d < 0.72 ? 0.05 : 0.025),
        Math.sin(ang) * d,
      );
      _dummyObj.rotation.set(0, rng() * Math.PI * 2, 0);
      _dummyObj.scale.setScalar(0.8 + rng() * 0.65);
      _dummyObj.updateMatrix();
      ferns.setMatrixAt(i, _dummyObj.matrix);
    }
    ferns.instanceMatrix.needsUpdate = true;
    biomeGroup.add(ferns);

    for (let i = 0; i < 4; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 0.58 + rng() * 0.55;
      const rock = new THREE.Mesh(assets.boulderGeo, assets.materials.rockGrey);
      rock.position.set(Math.cos(ang) * d, baseSurfaceY + 0.04, Math.sin(ang) * d);
      rock.scale.set(0.8 + rng() * 0.5, 0.55, 0.8 + rng() * 0.5);
      biomeGroup.add(rock);
    }
  } else if (hex.terrain === 'pasture') {
    // Raised central grassy meadow shelf on top of the sculpted undulating swells
    const meadowShelf = new THREE.Mesh(
      assets.terraceGeo,
      assets.materials.terrainTop.pasture,
    );
    meadowShelf.position.y = baseSurfaceY + 0.018;
    meadowShelf.scale.set(0.95, 0.78, 0.95);
    meadowShelf.receiveShadow = true;
    meadowShelf.castShadow = true;
    biomeGroup.add(meadowShelf);

    [0.45, 2.35, 4.35].forEach((ang) => {
      addGrazingSheep(
        biomeGroup,
        Math.cos(ang) * 0.8,
        baseSurfaceY + 0.032,
        Math.sin(ang) * 0.8,
        rng() * Math.PI * 2,
        assets,
      );
    });

    // Split-rail pasture fence
    const fence = new THREE.Group();
    fence.position.set(-0.72, baseSurfaceY + 0.02, 0.55);
    fence.rotation.y = 0.6;
    for (const fx of [-0.25, 0, 0.25]) {
      const post = new THREE.Mesh(assets.fencePostGeo, assets.materials.fenceWood);
      post.position.set(fx, 0.07, 0);
      fence.add(post);
    }
    for (const ry of [0.05, 0.11]) {
      const rail = new THREE.Mesh(assets.fenceRailGeo, assets.materials.fenceWood);
      rail.position.set(0, ry, 0);
      fence.add(rail);
    }
    biomeGroup.add(fence);

    // Instanced meadow wildflowers (yellow & white)
    const countPerColor = 12;
    const yellowFlowers = new THREE.InstancedMesh(
      assets.flowerGeo,
      assets.materials.flowerYellow,
      countPerColor,
    );
    const whiteFlowers = new THREE.InstancedMesh(
      assets.flowerGeo,
      assets.materials.flowerWhite,
      countPerColor,
    );
    for (let i = 0; i < countPerColor; i++) {
      for (const mesh of [yellowFlowers, whiteFlowers]) {
        const ang = rng() * Math.PI * 2;
        const d = 0.5 + rng() * 0.68;
        _dummyObj.position.set(
          Math.cos(ang) * d,
          baseSurfaceY + 0.042,
          Math.sin(ang) * d,
        );
        _dummyObj.rotation.set(0, 0, 0);
        _dummyObj.scale.setScalar(0.85 + rng() * 0.5);
        _dummyObj.updateMatrix();
        mesh.setMatrixAt(i, _dummyObj.matrix);
      }
    }
    yellowFlowers.instanceMatrix.needsUpdate = true;
    whiteFlowers.instanceMatrix.needsUpdate = true;
    biomeGroup.add(yellowFlowers, whiteFlowers);
  } else if (hex.terrain === 'fields') {
    // Raised farmland terrace + sculpted earthen plow-furrow ridges
    const farmTerrace = new THREE.Mesh(
      assets.terraceGeo,
      assets.materials.terrainTop.fields,
    );
    farmTerrace.position.y = baseSurfaceY + 0.022;
    farmTerrace.scale.set(0.98, 0.85, 0.98);
    farmTerrace.receiveShadow = true;
    farmTerrace.castShadow = true;
    biomeGroup.add(farmTerrace);

    for (const fz of [-0.72, -0.44, 0.44, 0.72]) {
      const furrow = new THREE.Mesh(assets.furrowGeo, assets.materials.tilledSoil);
      furrow.position.set(0, baseSurfaceY + 0.036, fz);
      furrow.receiveShadow = true;
      biomeGroup.add(furrow);
    }

    // High-density instanced golden wheat stalks & ears
    const stalkCount = 54;
    const stalks = new THREE.InstancedMesh(
      assets.wheatStalkGeo,
      assets.materials.wheatGold,
      stalkCount,
    );
    const heads = new THREE.InstancedMesh(
      assets.wheatHeadGeo,
      assets.materials.wheatEar,
      stalkCount,
    );
    stalks.castShadow = true;
    heads.castShadow = true;

    let idx = 0;
    for (let row = 0; row < 9; row++) {
      const ang = (row / 9) * Math.PI * 2;
      const cx = Math.cos(ang) * 0.82;
      const cz = Math.sin(ang) * 0.82;
      for (let s = 0; s < 6; s++) {
        const sx = cx + (rng() - 0.5) * 0.34;
        const sz = cz + (rng() - 0.5) * 0.34;
        const tiltX = (rng() - 0.5) * 0.22;
        const tiltZ = (rng() - 0.5) * 0.22;

        _dummyObj.position.set(sx, baseSurfaceY + 0.145, sz);
        _dummyObj.rotation.set(tiltX, rng() * Math.PI, tiltZ);
        _dummyObj.scale.setScalar(0.88 + rng() * 0.32);
        _dummyObj.updateMatrix();
        stalks.setMatrixAt(idx, _dummyObj.matrix);

        _dummyObj.position.set(sx - tiltZ * 0.12, baseSurfaceY + 0.275, sz + tiltX * 0.12);
        _dummyObj.updateMatrix();
        heads.setMatrixAt(idx, _dummyObj.matrix);
        idx++;
      }
    }
    stalks.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    biomeGroup.add(stalks, heads);

    // Miniature red farm granary barn + stone-base windmill with rotating sails
    const barn = new THREE.Group();
    barn.position.set(0.75, baseSurfaceY + 0.02, -0.56);
    barn.rotation.y = -0.5;
    const bBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.19),
      assets.materials.wheatBarn,
    );
    bBody.position.y = 0.08;
    bBody.castShadow = true;
    const bRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.13, 4),
      assets.materials.fenceWood,
    );
    bRoof.rotation.y = Math.PI / 4;
    bRoof.position.y = 0.22;
    bRoof.castShadow = true;
    customGeometries.push(bBody.geometry, bRoof.geometry);
    barn.add(bBody, bRoof);
    biomeGroup.add(barn);

    const mill = new THREE.Group();
    mill.position.set(-0.74, baseSurfaceY + 0.02, 0.52);
    mill.rotation.y = 0.7;
    const millTower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.105, 0.28, 8),
      assets.materials.rockGrey,
    );
    millTower.position.y = 0.14;
    millTower.castShadow = true;
    const millRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.084, 0.095, 8),
      assets.materials.wheatBarn,
    );
    millRoof.position.y = 0.32;
    const bladesHub = new THREE.Group();
    bladesHub.position.set(0, 0.25, 0.085);
    const bladeGeo = new THREE.BoxGeometry(0.038, 0.3, 0.01);
    const b1 = new THREE.Mesh(bladeGeo, assets.materials.windmillSail);
    const b2 = new THREE.Mesh(bladeGeo, assets.materials.windmillSail);
    b2.rotation.z = Math.PI / 2;
    customGeometries.push(millTower.geometry, millRoof.geometry, bladeGeo);
    bladesHub.add(b1, b2);
    mill.add(millTower, millRoof, bladesHub);
    biomeGroup.add(mill);
    windmills.push(bladesHub);
  } else if (hex.terrain === 'hills') {
    // Dual-stepped terracotta quarry mesa strata
    const quarryMid = new THREE.Mesh(
      assets.terraceGeo,
      assets.materials.terrainTop.hills,
    );
    quarryMid.position.y = baseSurfaceY + 0.034;
    quarryMid.scale.set(
      profile.midLayerScale / 0.74,
      profile.midLayerHeight / 0.052,
      profile.midLayerScale / 0.74,
    );
    quarryMid.castShadow = true;
    quarryMid.receiveShadow = true;
    biomeGroup.add(quarryMid);

    const quarryUpper = new THREE.Mesh(
      assets.upperTerraceGeo,
      assets.materials.clayRed,
    );
    quarryUpper.position.y = baseSurfaceY + 0.092;
    quarryUpper.castShadow = true;
    quarryUpper.receiveShadow = true;
    biomeGroup.add(quarryUpper);

    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.2;
      const dist = 0.76 + rng() * 0.2;
      const h = 0.22 + rng() * 0.26;
      const slabGeo = new THREE.CylinderGeometry(0.24, 0.39, h, 6);
      customGeometries.push(slabGeo);
      const slab = new THREE.Mesh(slabGeo, assets.materials.clayRed);
      slab.position.set(Math.cos(ang) * dist, baseSurfaceY + 0.02 + h * 0.48, Math.sin(ang) * dist);
      slab.rotation.y = rng() * Math.PI;
      slab.castShadow = true;
      slab.receiveShadow = true;
      biomeGroup.add(slab);
    }

    // Stacked kiln-fired clay quarry bricks
    for (let b = 0; b < 6; b++) {
      const brick = new THREE.Mesh(assets.brickGeo, assets.materials.clayBrick);
      brick.position.set(
        -0.75 + (b % 2) * 0.125,
        baseSurfaceY + 0.07 + Math.floor(b / 2) * 0.058,
        0.52,
      );
      brick.rotation.y = 0.4 + (rng() - 0.5) * 0.18;
      brick.castShadow = true;
      biomeGroup.add(brick);
    }
  } else if (hex.terrain === 'mountains') {
    // 2-step alpine granite massif terraces beneath craggy summits
    const lowerMassif = new THREE.Mesh(
      assets.terraceGeo,
      assets.materials.rockDark,
    );
    lowerMassif.position.y = baseSurfaceY + 0.042;
    lowerMassif.scale.set(
      profile.midLayerScale / 0.74,
      profile.midLayerHeight / 0.052,
      profile.midLayerScale / 0.74,
    );
    lowerMassif.castShadow = true;
    lowerMassif.receiveShadow = true;
    biomeGroup.add(lowerMassif);

    const upperRidge = new THREE.Mesh(
      assets.upperTerraceGeo,
      assets.materials.rockGrey,
    );
    upperRidge.position.y = baseSurfaceY + 0.128;
    upperRidge.scale.set(1.06, 1.35, 1.06);
    upperRidge.castShadow = true;
    upperRidge.receiveShadow = true;
    biomeGroup.add(upperRidge);

    const peakConfigs = [
      { ang: 0.3, d: 0.78, r: 0.5, h: 1.08 },
      { ang: 1.5, d: 0.72, r: 0.44, h: 0.9 },
      { ang: 2.7, d: 0.8, r: 0.4, h: 0.74 },
      { ang: 3.9, d: 0.74, r: 0.48, h: 1.0 },
      { ang: 5.1, d: 0.78, r: 0.38, h: 0.68 },
    ];
    for (const cfg of peakConfigs) {
      addMountainPeak(
        biomeGroup,
        Math.cos(cfg.ang) * cfg.d,
        baseSurfaceY + 0.05,
        Math.sin(cfg.ang) * cfg.d,
        cfg.r,
        cfg.h,
        assets,
        rng,
      );
    }
    for (let i = 0; i < 4; i++) {
      const ang = rng() * Math.PI * 2;
      const oreGeo = new THREE.OctahedronGeometry(0.115, 0);
      customGeometries.push(oreGeo);
      const ore = new THREE.Mesh(oreGeo, assets.materials.oreVein);
      ore.position.set(Math.cos(ang) * 0.58, baseSurfaceY + 0.11, Math.sin(ang) * 0.58);
      ore.castShadow = true;
      biomeGroup.add(ore);
    }
  } else if (hex.terrain === 'desert') {
    const duneShelf = new THREE.Mesh(
      assets.terraceGeo,
      assets.materials.terrainTop.desert,
    );
    duneShelf.position.y = baseSurfaceY + 0.016;
    duneShelf.scale.set(0.95, 0.72, 0.95);
    duneShelf.receiveShadow = true;
    biomeGroup.add(duneShelf);

    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.5;
      const duneGeo = new THREE.SphereGeometry(0.62, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      customGeometries.push(duneGeo);
      const dune = new THREE.Mesh(duneGeo, assets.materials.sandDune);
      dune.scale.set(1.42, 0.28, 0.72);
      dune.rotation.y = ang + 1.1;
      dune.position.set(Math.cos(ang) * 0.7, baseSurfaceY + 0.01, Math.sin(ang) * 0.7);
      dune.castShadow = true;
      dune.receiveShadow = true;
      biomeGroup.add(dune);
    }

    // Sunken desert oasis pool with stone rim + oasis palm tree
    const oasisRimGeo = new THREE.TorusGeometry(0.24, 0.05, 6, 16).rotateX(Math.PI / 2);
    const oasisPoolGeo = new THREE.CircleGeometry(0.22, 16).rotateX(-Math.PI / 2);
    const palmGeo = new THREE.CylinderGeometry(0.022, 0.036, 0.34, 6);
    customGeometries.push(oasisRimGeo, oasisPoolGeo, palmGeo);

    const oasisRim = new THREE.Mesh(oasisRimGeo, assets.materials.rockGrey);
    oasisRim.position.set(-0.62, baseSurfaceY + 0.04, -0.58);
    const oasisPool = new THREE.Mesh(oasisPoolGeo, assets.materials.oasisWater);
    oasisPool.position.set(-0.62, baseSurfaceY + 0.045, -0.58);
    biomeGroup.add(oasisRim, oasisPool);

    const palmTrunk = new THREE.Mesh(palmGeo, assets.materials.bark);
    palmTrunk.position.set(-0.84, baseSurfaceY + 0.18, -0.44);
    palmTrunk.rotation.z = -0.18;
    palmTrunk.castShadow = true;
    biomeGroup.add(palmTrunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(assets.fernGeo, assets.materials.pineLeaves[1]);
      const fa = (f / 5) * Math.PI * 2;
      frond.position.set(-0.81 + Math.cos(fa) * 0.1, baseSurfaceY + 0.35, -0.44 + Math.sin(fa) * 0.1);
      frond.rotation.z = Math.PI / 2.2;
      frond.rotation.y = -fa;
      frond.scale.set(1.1, 1.8, 0.65);
      biomeGroup.add(frond);
    }

    for (const [cx, cz] of [
      [0.85, -0.52],
      [-0.78, 0.62],
    ] as const) {
      const cactus = new THREE.Group();
      cactus.position.set(cx, baseSurfaceY + 0.02, cz);
      const stemGeo = new THREE.CapsuleGeometry(0.035, 0.18, 4, 7);
      const armGeo = new THREE.CapsuleGeometry(0.025, 0.08, 4, 6);
      customGeometries.push(stemGeo, armGeo);
      const stem = new THREE.Mesh(stemGeo, assets.materials.cactusGreen);
      stem.position.y = 0.11;
      const arm = new THREE.Mesh(armGeo, assets.materials.cactusGreen);
      arm.position.set(0.05, 0.14, 0);
      arm.rotation.z = -0.7;
      cactus.add(stem, arm);
      biomeGroup.add(cactus);
    }
  }

  // 3. Number token mount (stays upright outside flipPivot so numbers remain legible face-down & face-up)
  const unrevealedTokenY = 0.378;
  const revealedTokenY = profile.revealedTokenY + tileElevationJitter;
  const tokenMountGroup = new THREE.Group();
  tokenMountGroup.position.set(0, hex.revealed ? revealedTokenY : unrevealedTokenY, 0);

  if (hex.numberToken !== null) {
    const tokenFaceTex = textures.numberTokens.get(hex.numberToken);
    if (tokenFaceTex) {
      const tokenGroup = new THREE.Group();

      const brassDisc = new THREE.Mesh(assets.tokenGeo, assets.materials.tokenBrass);
      brassDisc.castShadow = true;
      brassDisc.receiveShadow = true;
      tokenGroup.add(brassDisc);

      const faceMat = new THREE.MeshStandardMaterial({
        map: tokenFaceTex,
        roughness: 0.45,
        metalness: 0.04,
      });
      customMaterials.push(faceMat);
      const faceDisc = new THREE.Mesh(assets.tokenFaceGeo, faceMat);
      faceDisc.rotation.x = -Math.PI / 2;
      faceDisc.position.y = 0.038;
      tokenGroup.add(faceDisc);

      tokenMountGroup.add(tokenGroup);
    }
  }
  group.add(tokenMountGroup);

  return {
    hexId: hex.id,
    revealed: hex.revealed,
    group,
    flipPivot,
    biomeGroup,
    plainBackGroup,
    tokenMountGroup,
    unrevealedTokenY,
    revealedTokenY,
    swayTrees,
    windmills,
    disposeCustomGeometries: () => {
      customGeometries.forEach((g) => g.dispose());
      customMaterials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Builds a miniature roaming coastal merchant schooner for the sea channel.
 */
export function createCoastalShipMesh(textures: ProceduralTextureSet): THREE.Group {
  const ship = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x5c3a22,
    normalMap: textures.woodMahoganyNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.7,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xf6edd9,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });

  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0.44);
  hullShape.quadraticCurveTo(0.18, 0.15, 0.14, -0.34);
  hullShape.lineTo(-0.14, -0.34);
  hullShape.quadraticCurveTo(-0.18, 0.15, 0, 0.44);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.08;
  hull.castShadow = true;
  ship.add(hull);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.74, 8),
    hullMat,
  );
  mast.position.y = 0.42;
  mast.castShadow = true;
  ship.add(mast);

  const mainSail = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.48), sailMat);
  mainSail.position.set(0, 0.46, 0.04);
  mainSail.castShadow = true;
  ship.add(mainSail);

  const jibSail = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.34), sailMat);
  jibSail.rotation.y = Math.PI / 2;
  jibSail.position.set(0, 0.34, 0.25);
  ship.add(jibSail);

  return ship;
}

/**
 * Builds the carved mahogany tabletop, brass brackets, walled felt dice tray,
 * sea stacks, and multi-frequency animated PBR ocean basin.
 */
export function createTabletopAndOcean(textures: ProceduralTextureSet) {
  const group = new THREE.Group();

  // Outer studio wooden table surface (planar box avoids radial cylinder cap UV distortion)
  const tableMat = new THREE.MeshStandardMaterial({
    color: 0xa68d7a,
    map: textures.woodMahogany,
    normalMap: textures.woodMahoganyNormal,
    normalScale: new THREE.Vector2(0.24, 0.24),
    roughnessMap: textures.woodRoughness,
    roughness: 0.86,
    metalness: 0.02,
    envMapIntensity: 0.32,
  });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(58, 0.6, 58), tableMat);
  tableTop.position.y = -0.68;
  tableTop.receiveShadow = true;
  group.add(tableTop);

  // Carved hexagonal mahogany board frame cradling the island ocean
  const frameMat = new THREE.MeshStandardMaterial({
    map: textures.woodMahogany,
    normalMap: textures.woodMahoganyNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: textures.woodRoughness,
    roughness: 0.44,
    metalness: 0.12,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd1a450,
    roughness: 0.24,
    metalness: 0.88,
  });

  const outerRadius = 11.85;
  const innerRadius = 10.05;
  const frameShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = outerRadius * Math.cos(a);
    const y = outerRadius * Math.sin(a);
    if (i === 0) frameShape.moveTo(x, y);
    else frameShape.lineTo(x, y);
  }
  frameShape.closePath();

  const hole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = innerRadius * Math.cos(a);
    const y = innerRadius * Math.sin(a);
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  frameShape.holes.push(hole);

  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.09,
    bevelSegments: 3,
  });
  frameGeo.rotateX(Math.PI / 2);

  const boardFrame = new THREE.Mesh(frameGeo, frameMat);
  boardFrame.position.y = 0.28;
  boardFrame.castShadow = true;
  boardFrame.receiveShadow = true;
  group.add(boardFrame);

  // Brass corner medallions + thin inner brass trim ring
  const bracketGeo = new THREE.CylinderGeometry(0.21, 0.25, 0.14, 6);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const corner = new THREE.Mesh(bracketGeo, brassMat);
    corner.position.set(
      (outerRadius - 0.34) * Math.cos(a),
      0.34,
      (outerRadius - 0.34) * Math.sin(a),
    );
    corner.rotation.y = -a;
    group.add(corner);
  }

  // Dedicated walled felt-lined wooden dice tray resting cleanly along the right mahogany rail
  const trayGroup = new THREE.Group();
  trayGroup.position.set(9.3, 0.36, 2.35);
  trayGroup.rotation.y = -0.22;

  const trayBase = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.14, 1.84), frameMat);
  trayBase.castShadow = true;
  trayBase.receiveShadow = true;
  trayGroup.add(trayBase);

  const feltMat = new THREE.MeshStandardMaterial({
    color: 0x183829,
    roughness: 0.95,
    metalness: 0.02,
  });
  const trayFelt = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.04, 1.58), feltMat);
  trayFelt.position.y = 0.08;
  trayFelt.receiveShadow = true;
  trayGroup.add(trayFelt);

  // Raised wooden dice tray walls
  const wallFB = new THREE.BoxGeometry(2.14, 0.16, 0.13);
  const wallLR = new THREE.BoxGeometry(0.13, 0.16, 1.84);
  for (const wz of [-0.855, 0.855]) {
    const w = new THREE.Mesh(wallFB, frameMat);
    w.position.set(0, 0.14, wz);
    w.castShadow = true;
    trayGroup.add(w);
  }
  for (const wx of [-1.005, 1.005]) {
    const w = new THREE.Mesh(wallLR, frameMat);
    w.position.set(wx, 0.14, 0);
    w.castShadow = true;
    trayGroup.add(w);
  }
  group.add(trayGroup);

  // Sculpted coastal basalt sea-stack clusters with surf halos
  const reefMat = new THREE.MeshStandardMaterial({
    color: 0x525a63,
    roughness: 0.88,
    flatShading: true,
  });
  const reefFoamMat = new THREE.MeshBasicMaterial({
    color: 0xd8eef7,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
  });
  const stackGeo = new THREE.ConeGeometry(0.18, 0.38, 6);
  const foamRingGeo = new THREE.RingGeometry(0.22, 0.38, 16);
  foamRingGeo.rotateX(-Math.PI / 2);

  for (const [rx, rz, s] of [
    [-7.6, -4.4, 1.05],
    [7.8, -3.9, 0.95],
    [-6.6, 5.9, 1.0],
    [4.4, -7.8, 0.9],
  ] as const) {
    const cluster = new THREE.Group();
    cluster.position.set(rx, 0.02, rz);
    cluster.rotation.y = rx * 0.6;

    const mainStack = new THREE.Mesh(stackGeo, reefMat);
    mainStack.position.set(0, 0.14 * s, 0);
    mainStack.scale.set(s * 1.15, s, s * 1.05);
    mainStack.castShadow = true;
    cluster.add(mainStack);

    const sideStack = new THREE.Mesh(stackGeo, reefMat);
    sideStack.position.set(0.18 * s, 0.07 * s, 0.1 * s);
    sideStack.scale.set(s * 0.72, s * 0.58, s * 0.72);
    sideStack.rotation.y = 0.8;
    cluster.add(sideStack);

    const lowRock = new THREE.Mesh(stackGeo, reefMat);
    lowRock.position.set(-0.15 * s, 0.05 * s, -0.1 * s);
    lowRock.scale.set(s * 0.65, s * 0.45, s * 0.68);
    cluster.add(lowRock);

    const foam = new THREE.Mesh(foamRingGeo, reefFoamMat);
    foam.position.y = 0.025;
    foam.scale.setScalar(s * 1.15);
    cluster.add(foam);

    group.add(cluster);
  }

  // Animated Deep Sapphire-to-Lagoon Ocean Basin inside the mahogany frame
  const oceanGeo = new THREE.CylinderGeometry(10.12, 10.12, 0.16, 54, 26);
  const oceanUniforms = { uTime: { value: 0 } };
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x165b7d,
    roughness: 0.38,
    metalness: 0.06,
    envMapIntensity: 0.42,
    normalMap: textures.oceanNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
  });

  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\nvarying vec3 vWorldPos;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float wave = sin(position.x * 0.95 + uTime * 1.35) * 0.026 +
                   cos(position.z * 1.15 - uTime * 1.05) * 0.022;
      transformed.y += wave;
      vWorldPos = position;
      `,
    );
    shader.fragmentShader =
      `uniform float uTime;\nvarying vec3 vWorldPos;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float distFromCenter = length(vWorldPos.xz);
      float shoreBand = smoothstep(8.2, 5.2, distFromCenter);
      float organicPhase = sin(vWorldPos.x * 0.85) * 0.6 + cos(vWorldPos.z * 0.92) * 0.6;
      float foamRipple = sin(distFromCenter * 4.2 - uTime * 1.85 + organicPhase) * 0.5 + 0.5;
      float shimmer = sin(vWorldPos.x * 1.3 + vWorldPos.z * 0.9 + uTime * 0.9) * 0.5 + 0.5;
      vec3 shallowTeal = vec3(0.12, 0.44, 0.55);
      vec3 deepSapphire = vec3(0.05, 0.21, 0.35);
      diffuseColor.rgb = mix(deepSapphire, shallowTeal, shoreBand * 0.82);
      diffuseColor.rgb += vec3(0.02, 0.04, 0.05) * shimmer * shoreBand;
      diffuseColor.rgb += vec3(0.24, 0.32, 0.35) * pow(foamRipple, 8.0) * shoreBand * 0.24;
      `,
    );
  };

  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = -0.05;
  ocean.receiveShadow = true;
  group.add(ocean);

  return { group, oceanUniforms };
}
