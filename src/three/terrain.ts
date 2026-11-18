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

function createHexPrismGeometry(radius: number, depth: number, bevel = 0.04): THREE.ExtrudeGeometry {
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
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  return geo;
}

export interface TerrainAssets {
  baseGeo: THREE.ExtrudeGeometry;
  rimGeo: THREE.ExtrudeGeometry;
  tokenGeo: THREE.CylinderGeometry;
  materials: {
    rimEarth: THREE.MeshStandardMaterial;
    terrainTop: Record<TerrainType, THREE.MeshStandardMaterial>;
    bark: THREE.MeshStandardMaterial;
    pineLeaves: THREE.MeshStandardMaterial[];
    rockGrey: THREE.MeshStandardMaterial;
    rockDark: THREE.MeshStandardMaterial;
    snowCap: THREE.MeshStandardMaterial;
    oreVein: THREE.MeshStandardMaterial;
    clayRed: THREE.MeshStandardMaterial;
    clayBrick: THREE.MeshStandardMaterial;
    wheatGold: THREE.MeshStandardMaterial;
    wheatBarn: THREE.MeshStandardMaterial;
    sheepWool: THREE.MeshStandardMaterial;
    sheepFace: THREE.MeshStandardMaterial;
    fenceWood: THREE.MeshStandardMaterial;
    flowerYellow: THREE.MeshStandardMaterial;
    flowerWhite: THREE.MeshStandardMaterial;
    sandDune: THREE.MeshStandardMaterial;
    cactusGreen: THREE.MeshStandardMaterial;
    tokenBrass: THREE.MeshStandardMaterial;
  };
  dispose: () => void;
}

export function createTerrainAssets(textures: ProceduralTextureSet): TerrainAssets {
  const baseGeo = createHexPrismGeometry(HEX_RADIUS * 0.965, 0.22, 0.035);
  const rimGeo = createHexPrismGeometry(HEX_RADIUS * 0.99, 0.28, 0.025);
  const tokenGeo = new THREE.CylinderGeometry(0.42, 0.44, 0.07, 28);

  const terrainTop = {} as Record<TerrainType, THREE.MeshStandardMaterial>;
  (['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert'] as TerrainType[]).forEach(
    (t) => {
      terrainTop[t] = new THREE.MeshStandardMaterial({
        map: textures.terrainMaps[t],
        bumpMap: textures.terrainBump,
        bumpScale: 0.035,
        roughness: t === 'desert' ? 0.9 : 0.82,
        metalness: 0.03,
      });
    },
  );

  const materials = {
    rimEarth: new THREE.MeshStandardMaterial({
      color: 0x5c4b39,
      roughness: 0.9,
      metalness: 0.02,
      bumpMap: textures.terrainBump,
      bumpScale: 0.03,
    }),
    terrainTop,
    bark: new THREE.MeshStandardMaterial({ color: 0x4d3221, roughness: 0.9 }),
    pineLeaves: [
      new THREE.MeshStandardMaterial({ color: 0x264f2a, roughness: 0.78 }),
      new THREE.MeshStandardMaterial({ color: 0x316233, roughness: 0.76 }),
      new THREE.MeshStandardMaterial({ color: 0x1d4023, roughness: 0.82 }),
    ],
    rockGrey: new THREE.MeshStandardMaterial({
      color: 0x71777e,
      roughness: 0.86,
      metalness: 0.08,
      flatShading: true,
    }),
    rockDark: new THREE.MeshStandardMaterial({
      color: 0x4d5259,
      roughness: 0.88,
      metalness: 0.14,
      flatShading: true,
    }),
    snowCap: new THREE.MeshStandardMaterial({
      color: 0xf4f7fa,
      roughness: 0.42,
      metalness: 0.05,
      flatShading: true,
    }),
    oreVein: new THREE.MeshStandardMaterial({
      color: 0x3b4859,
      roughness: 0.35,
      metalness: 0.65,
      flatShading: true,
    }),
    clayRed: new THREE.MeshStandardMaterial({
      color: 0xa84b31,
      roughness: 0.85,
      flatShading: true,
    }),
    clayBrick: new THREE.MeshStandardMaterial({
      color: 0xc25a3c,
      roughness: 0.78,
    }),
    wheatGold: new THREE.MeshStandardMaterial({
      color: 0xe3b448,
      roughness: 0.72,
    }),
    wheatBarn: new THREE.MeshStandardMaterial({
      color: 0x8f3929,
      roughness: 0.74,
    }),
    sheepWool: new THREE.MeshStandardMaterial({ color: 0xf5f0e1, roughness: 0.92 }),
    sheepFace: new THREE.MeshStandardMaterial({ color: 0x332d28, roughness: 0.8 }),
    fenceWood: new THREE.MeshStandardMaterial({ color: 0x735235, roughness: 0.85 }),
    flowerYellow: new THREE.MeshStandardMaterial({ color: 0xf2cf52, roughness: 0.6 }),
    flowerWhite: new THREE.MeshStandardMaterial({ color: 0xfaf6eb, roughness: 0.6 }),
    sandDune: new THREE.MeshStandardMaterial({
      color: 0xdcb977,
      roughness: 0.92,
      flatShading: true,
    }),
    cactusGreen: new THREE.MeshStandardMaterial({ color: 0x4b7543, roughness: 0.75 }),
    tokenBrass: new THREE.MeshStandardMaterial({
      color: 0xb69049,
      roughness: 0.32,
      metalness: 0.75,
    }),
  };

  return {
    baseGeo,
    rimGeo,
    tokenGeo,
    materials,
    dispose: () => {
      baseGeo.dispose();
      rimGeo.dispose();
      tokenGeo.dispose();
      Object.values(terrainTop).forEach((m) => m.dispose());
      materials.rimEarth.dispose();
      materials.bark.dispose();
      materials.pineLeaves.forEach((m) => m.dispose());
      materials.rockGrey.dispose();
      materials.rockDark.dispose();
      materials.snowCap.dispose();
      materials.oreVein.dispose();
      materials.clayRed.dispose();
      materials.clayBrick.dispose();
      materials.wheatGold.dispose();
      materials.wheatBarn.dispose();
      materials.sheepWool.dispose();
      materials.sheepFace.dispose();
      materials.fenceWood.dispose();
      materials.flowerYellow.dispose();
      materials.flowerWhite.dispose();
      materials.sandDune.dispose();
      materials.cactusGreen.dispose();
      materials.tokenBrass.dispose();
    },
  };
}

function addMultiTierPineTree(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  scale: number,
  assets: TerrainAssets,
  rng: () => number,
) {
  const tree = new THREE.Group();
  tree.position.set(x, y, z);
  tree.scale.setScalar(scale);

  // Tapered trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.055, 0.24, 7),
    assets.materials.bark,
  );
  trunk.position.y = 0.12;
  trunk.castShadow = true;
  tree.add(trunk);

  // 4 layered irregular scalloped foliage tiers (not single cones!)
  const leafMat =
    assets.materials.pineLeaves[Math.floor(rng() * assets.materials.pineLeaves.length)];
  const tiers = [
    { r: 0.23, h: 0.24, y: 0.25 },
    { r: 0.19, h: 0.22, y: 0.39 },
    { r: 0.145, h: 0.2, y: 0.52 },
    { r: 0.095, h: 0.18, y: 0.64 },
  ];
  tiers.forEach((t, idx) => {
    const geo = new THREE.ConeGeometry(t.r, t.h, 7);
    const tier = new THREE.Mesh(geo, leafMat);
    tier.position.y = t.y;
    tier.rotation.y = idx * 0.5 + rng() * 0.6;
    tier.castShadow = true;
    tier.receiveShadow = true;
    tree.add(tier);
  });

  parent.add(tree);
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

  // Woolly multi-tuft body
  const body = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.11, 0),
    assets.materials.sheepWool,
  );
  body.scale.set(1.3, 0.95, 0.95);
  body.position.y = 0.12;
  body.castShadow = true;
  sheep.add(body);

  const tuft = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.08, 0),
    assets.materials.sheepWool,
  );
  tuft.position.set(-0.04, 0.16, 0.02);
  sheep.add(tuft);

  // Head + ears
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.08),
    assets.materials.sheepFace,
  );
  head.position.set(0.13, 0.15, 0);
  head.rotation.z = -0.25;
  sheep.add(head);

  // 4 little legs
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
  const cragGeo = new THREE.ConeGeometry(radius, height, 7, 3);
  const pos = cragGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vy = pos.getY(i);
    if (vy < height * 0.45 && vy > -height * 0.45) {
      const n = 0.8 + rng() * 0.4;
      pos.setX(i, pos.getX(i) * n);
      pos.setZ(i, pos.getZ(i) * n);
    }
  }
  cragGeo.computeVertexNormals();

  const crag = new THREE.Mesh(
    cragGeo,
    rng() > 0.4 ? assets.materials.rockGrey : assets.materials.rockDark,
  );
  crag.position.y = height * 0.45;
  crag.castShadow = true;
  crag.receiveShadow = true;
  peak.add(crag);

  // Crisp snow cap on taller peaks
  if (height > 0.62) {
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.42, height * 0.36, 7),
      assets.materials.snowCap,
    );
    cap.position.y = height * 0.77;
    cap.castShadow = true;
    peak.add(cap);
  }

  // Secondary shoulder buttress
  const shoulder = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius * 0.45, 0),
    assets.materials.rockDark,
  );
  shoulder.scale.set(1.2, 0.85, 0.9);
  shoulder.position.set(radius * 0.42, height * 0.14, (rng() - 0.5) * 0.25);
  shoulder.castShadow = true;
  peak.add(shoulder);

  parent.add(peak);
}

/**
 * Builds a complete, handcrafted 3D hexagonal terrain tile Group with biome props
 * and brass/parchment number token disc.
 */
export function buildHexTileGroup(
  hex: HexTile,
  assets: TerrainAssets,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(hex.x, 0, hex.z);
  const rng = makeSeededRng(`${hex.id}_${hex.terrain}`);

  // 1. Stone/earth beveled rim plinth
  const rim = new THREE.Mesh(assets.rimGeo, assets.materials.rimEarth);
  rim.position.y = 0.14;
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  // 2. Biome top cap
  const topCap = new THREE.Mesh(assets.baseGeo, assets.materials.terrainTop[hex.terrain]);
  topCap.position.y = 0.21;
  topCap.receiveShadow = true;
  group.add(topCap);

  const surfaceY = 0.245;

  // Ring positions around central clearing so number token remains clearly legible
  const ringAngles = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) => (i / 8) * Math.PI * 2 + rng() * 0.35,
  );

  if (hex.terrain === 'forest') {
    ringAngles.forEach((ang, i) => {
      const dist = i % 2 === 0 ? 0.84 + rng() * 0.24 : 0.64 + rng() * 0.18;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      addMultiTierPineTree(
        group,
        tx,
        surfaceY,
        tz,
        0.78 + rng() * 0.44,
        assets,
        rng,
      );
    });
    // Mossy forest boulders
    for (let i = 0; i < 4; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 0.6 + rng() * 0.55;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.08 + rng() * 0.05, 0),
        assets.materials.rockGrey,
      );
      rock.position.set(Math.cos(ang) * d, surfaceY + 0.03, Math.sin(ang) * d);
      rock.scale.y = 0.65;
      group.add(rock);
    }
  } else if (hex.terrain === 'pasture') {
    // Rolling grass knolls
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.4;
      const knoll = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        assets.materials.terrainTop.pasture,
      );
      knoll.scale.set(1.1, 0.25, 0.9);
      knoll.position.set(Math.cos(ang) * 0.68, surfaceY - 0.02, Math.sin(ang) * 0.68);
      knoll.receiveShadow = true;
      group.add(knoll);
    }
    // 3 grazing sheep
    [0.5, 2.5, 4.4].forEach((ang) => {
      addGrazingSheep(
        group,
        Math.cos(ang) * 0.8,
        surfaceY + 0.02,
        Math.sin(ang) * 0.8,
        rng() * Math.PI * 2,
        assets,
      );
    });
    // Split-rail wooden fence segment
    const fence = new THREE.Group();
    fence.position.set(-0.72, surfaceY, 0.55);
    fence.rotation.y = 0.6;
    const postGeo = new THREE.BoxGeometry(0.035, 0.14, 0.035);
    for (const fx of [-0.25, 0, 0.25]) {
      const post = new THREE.Mesh(postGeo, assets.materials.fenceWood);
      post.position.set(fx, 0.07, 0);
      fence.add(post);
    }
    const railGeo = new THREE.BoxGeometry(0.54, 0.024, 0.02);
    for (const ry of [0.05, 0.11]) {
      const rail = new THREE.Mesh(railGeo, assets.materials.fenceWood);
      rail.position.set(0, ry, 0);
      fence.add(rail);
    }
    group.add(fence);

    // Wildflower dots
    const flowerGeo = new THREE.SphereGeometry(0.03, 6, 5);
    for (let i = 0; i < 10; i++) {
      const ang = rng() * Math.PI * 2;
      const d = 0.52 + rng() * 0.65;
      const fl = new THREE.Mesh(
        flowerGeo,
        i % 2 === 0 ? assets.materials.flowerYellow : assets.materials.flowerWhite,
      );
      fl.position.set(Math.cos(ang) * d, surfaceY + 0.02, Math.sin(ang) * d);
      group.add(fl);
    }
  } else if (hex.terrain === 'fields') {
    // Harvest crop strips + dense golden wheat sheaves
    const stalkGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.26, 5);
    const headGeo = new THREE.ConeGeometry(0.048, 0.13, 5);
    for (let row = 0; row < 7; row++) {
      const ang = (row / 7) * Math.PI * 2;
      const cx = Math.cos(ang) * 0.82;
      const cz = Math.sin(ang) * 0.82;
      for (let s = 0; s < 6; s++) {
        const sx = cx + (rng() - 0.5) * 0.32;
        const sz = cz + (rng() - 0.5) * 0.32;
        const sheaf = new THREE.Group();
        sheaf.position.set(sx, surfaceY, sz);
        sheaf.rotation.z = (rng() - 0.5) * 0.18;
        const stalk = new THREE.Mesh(stalkGeo, assets.materials.wheatGold);
        stalk.position.y = 0.13;
        stalk.castShadow = true;
        const head = new THREE.Mesh(headGeo, assets.materials.wheatGold);
        head.position.y = 0.27;
        head.castShadow = true;
        sheaf.add(stalk, head);
        group.add(sheaf);
      }
    }
    // Small red farm granary barn
    const barn = new THREE.Group();
    barn.position.set(0.75, surfaceY, -0.58);
    barn.rotation.y = -0.5;
    const bBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.2),
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
    barn.add(bBody, bRoof);
    group.add(barn);
  } else if (hex.terrain === 'hills') {
    // Stepped reddish-brown clay ridges & quarry bricks
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.2;
      const dist = 0.78 + rng() * 0.2;
      const h = 0.16 + rng() * 0.22;
      const slab = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.36, h, 6),
        assets.materials.clayRed,
      );
      slab.position.set(Math.cos(ang) * dist, surfaceY + h * 0.45, Math.sin(ang) * dist);
      slab.rotation.y = rng() * Math.PI;
      slab.castShadow = true;
      slab.receiveShadow = true;
      group.add(slab);
    }
    // Stacked clay quarry bricks
    const brickGeo = new THREE.BoxGeometry(0.11, 0.055, 0.065);
    for (let b = 0; b < 5; b++) {
      const brick = new THREE.Mesh(brickGeo, assets.materials.clayBrick);
      brick.position.set(
        -0.75 + (b % 2) * 0.12,
        surfaceY + 0.03 + Math.floor(b / 2) * 0.058,
        0.52,
      );
      brick.rotation.y = 0.4 + (rng() - 0.5) * 0.2;
      brick.castShadow = true;
      group.add(brick);
    }
  } else if (hex.terrain === 'mountains') {
    // Dramatic multi-peak alpine range around perimeter
    const peakConfigs = [
      { ang: 0.3, d: 0.78, r: 0.48, h: 0.92 },
      { ang: 1.5, d: 0.74, r: 0.42, h: 0.78 },
      { ang: 2.7, d: 0.82, r: 0.38, h: 0.66 },
      { ang: 3.9, d: 0.76, r: 0.46, h: 0.86 },
      { ang: 5.1, d: 0.8, r: 0.36, h: 0.58 },
    ];
    for (const cfg of peakConfigs) {
      addMountainPeak(
        group,
        Math.cos(cfg.ang) * cfg.d,
        surfaceY - 0.02,
        Math.sin(cfg.ang) * cfg.d,
        cfg.r,
        cfg.h,
        assets,
        rng,
      );
    }
    // Exposed metallic ore boulders
    for (let i = 0; i < 4; i++) {
      const ang = rng() * Math.PI * 2;
      const ore = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        assets.materials.oreVein,
      );
      ore.position.set(Math.cos(ang) * 0.58, surfaceY + 0.05, Math.sin(ang) * 0.58);
      ore.castShadow = true;
      group.add(ore);
    }
  } else if (hex.terrain === 'desert') {
    // Sinuous wind-swept sand dunes + sandstone outcrop + desert cacti
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.6;
      const dune = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        assets.materials.sandDune,
      );
      dune.scale.set(1.4, 0.24, 0.7);
      dune.rotation.y = ang + 1.1;
      dune.position.set(Math.cos(ang) * 0.72, surfaceY - 0.03, Math.sin(ang) * 0.72);
      dune.receiveShadow = true;
      group.add(dune);
    }
    // Small desert saguaro
    for (const [cx, cz] of [
      [0.85, -0.52],
      [-0.78, 0.62],
    ] as const) {
      const cactus = new THREE.Group();
      cactus.position.set(cx, surfaceY, cz);
      const stem = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.035, 0.18, 4, 7),
        assets.materials.cactusGreen,
      );
      stem.position.y = 0.11;
      const arm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.025, 0.08, 4, 6),
        assets.materials.cactusGreen,
      );
      arm.position.set(0.05, 0.14, 0);
      arm.rotation.z = -0.7;
      cactus.add(stem, arm);
      group.add(cactus);
    }
  }

  // 3. Number token disc (brass rim + parchment face)
  if (hex.numberToken !== null) {
    const tokenFaceTex = textures.numberTokens.get(hex.numberToken);
    if (tokenFaceTex) {
      const tokenGroup = new THREE.Group();
      tokenGroup.position.set(0, surfaceY + 0.035, 0);

      const brassDisc = new THREE.Mesh(assets.tokenGeo, assets.materials.tokenBrass);
      brassDisc.castShadow = true;
      brassDisc.receiveShadow = true;
      tokenGroup.add(brassDisc);

      const faceMat = new THREE.MeshStandardMaterial({
        map: tokenFaceTex,
        roughness: 0.48,
        metalness: 0.05,
      });
      const faceDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.39, 28),
        faceMat,
      );
      faceDisc.rotation.x = -Math.PI / 2;
      faceDisc.position.y = 0.038;
      tokenGroup.add(faceDisc);

      group.add(tokenGroup);
    }
  }

  return group;
}

/**
 * Builds the carved mahogany tabletop frame + ocean basin with animated PBR waves.
 */
export function createTabletopAndOcean(textures: ProceduralTextureSet) {
  const group = new THREE.Group();

  // Outer studio wooden table surface
  const tableMat = new THREE.MeshStandardMaterial({
    map: textures.woodMahogany,
    bumpMap: textures.woodGrainBump,
    bumpScale: 0.02,
    roughness: 0.56,
    metalness: 0.08,
  });
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.6, 48), tableMat);
  tableTop.position.y = -0.68;
  tableTop.receiveShadow = true;
  group.add(tableTop);

  // Carved octagonal mahogany board frame cradling the island ocean
  const frameMat = new THREE.MeshStandardMaterial({
    map: textures.woodMahogany,
    bumpMap: textures.woodGrainBump,
    bumpScale: 0.03,
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.12,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc99c49,
    roughness: 0.25,
    metalness: 0.86,
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

  // Brass corner inlays on the 6 frame corners
  const bracketGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.14, 6);
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

  // Dedicated felt-lined wooden dice tray resting on the right mahogany ledge
  const trayBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.14, 1.8),
    frameMat,
  );
  trayBase.position.set(9.1, 0.36, 4.95);
  trayBase.rotation.y = -0.45;
  trayBase.castShadow = true;
  trayBase.receiveShadow = true;
  group.add(trayBase);

  const feltMat = new THREE.MeshStandardMaterial({
    color: 0x1b3a2c,
    roughness: 0.94,
    metalness: 0.02,
  });
  const trayFelt = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.04, 1.56), feltMat);
  trayFelt.position.set(9.1, 0.44, 4.95);
  trayFelt.rotation.y = -0.45;
  trayFelt.receiveShadow = true;
  group.add(trayFelt);

  // Animated Ocean Basin inside the mahogany frame
  const oceanGeo = new THREE.CylinderGeometry(10.12, 10.12, 0.16, 48, 24);
  const oceanUniforms = { uTime: { value: 0 } };
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x165b7d,
    roughness: 0.22,
    metalness: 0.15,
    bumpMap: textures.oceanFoamBump,
    bumpScale: 0.025,
  });

  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\nvarying vec3 vWorldPos;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float wave = sin(position.x * 1.15 + uTime * 1.6) * 0.032 +
                   cos(position.z * 1.35 - uTime * 1.25) * 0.026;
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
      float shoreBand = smoothstep(7.2, 5.2, distFromCenter);
      float foamRipple = sin(distFromCenter * 5.0 - uTime * 2.2) * 0.5 + 0.5;
      vec3 shallowTeal = vec3(0.14, 0.49, 0.58);
      vec3 deepNavy = vec3(0.05, 0.21, 0.34);
      diffuseColor.rgb = mix(deepNavy, shallowTeal, shoreBand * 0.75);
      diffuseColor.rgb += vec3(0.28, 0.34, 0.36) * pow(foamRipple, 6.0) * shoreBand * 0.4;
      `,
    );
  };

  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = -0.05;
  ocean.receiveShadow = true;
  group.add(ocean);

  return { group, oceanUniforms };
}
