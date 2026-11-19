import * as THREE from 'three';
import { FACTION_META, type FactionColor, type HarborKind } from '../game/types';
import type { ProceduralTextureSet } from './textures';

export const BLOOM_LAYER = 1;

export interface PieceMaterials {
  factionMain: Record<FactionColor, THREE.MeshStandardMaterial>;
  factionRoof: Record<FactionColor, THREE.MeshStandardMaterial>;
  factionBanner: Record<FactionColor, THREE.MeshStandardMaterial>;
  stoneFoundation: THREE.MeshStandardMaterial;
  warmPlaster: THREE.MeshStandardMaterial;
  timberBeam: THREE.MeshStandardMaterial;
  chimneyBrick: THREE.MeshStandardMaterial;
  flueClay: THREE.MeshStandardMaterial;
  warmWindow: THREE.MeshStandardMaterial;
  brassAccent: THREE.MeshStandardMaterial;
  robberCloak: THREE.MeshStandardMaterial;
  robberDangerRing: THREE.MeshBasicMaterial;
  ghostValid: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  sharedGeos: THREE.BufferGeometry[];
  dispose: () => void;
}

export type SettlementArchetypeId =
  | 'tudor_cottage'
  | 'hearth_manor'
  | 'jetty_townhouse'
  | 'artisan_hall';

export interface SettlementHouseModuleSpec {
  id: SettlementArchetypeId;
  label: string;
  scale: number;
  roofPitch: number;
  roofOverhang: number;
  tileRows: number;
  tileCols: number;
  hasCrossWing: boolean;
  hasJettyOverhang: boolean;
  hasDormer: boolean;
  hasRearLeanTo: boolean;
  chimneyPlacement: 'roof_slope' | 'exterior_hearth' | 'twin_forge';
  hasBannerPennant: boolean;
}

export type SettlementHouseSetConfig = Record<
  SettlementArchetypeId,
  SettlementHouseModuleSpec
>;

export const SETTLEMENT_ARCHETYPE_ORDER: SettlementArchetypeId[] = [
  'tudor_cottage',
  'hearth_manor',
  'jetty_townhouse',
  'artisan_hall',
];

export const DEFAULT_SETTLEMENT_HOUSE_SET: SettlementHouseSetConfig = {
  tudor_cottage: {
    id: 'tudor_cottage',
    label: 'Tudor Manor Cottage',
    scale: 1.24,
    roofPitch: 0.23,
    roofOverhang: 0.048,
    tileRows: 4,
    tileCols: 6,
    hasCrossWing: false,
    hasJettyOverhang: false,
    hasDormer: false,
    hasRearLeanTo: false,
    chimneyPlacement: 'roof_slope',
    hasBannerPennant: false,
  },
  hearth_manor: {
    id: 'hearth_manor',
    label: 'L-Shaped Hearth Stead',
    scale: 1.24,
    roofPitch: 0.21,
    roofOverhang: 0.045,
    tileRows: 4,
    tileCols: 5,
    hasCrossWing: true,
    hasJettyOverhang: false,
    hasDormer: false,
    hasRearLeanTo: false,
    chimneyPlacement: 'exterior_hearth',
    hasBannerPennant: false,
  },
  jetty_townhouse: {
    id: 'jetty_townhouse',
    label: 'Jetty Guild Townhouse',
    scale: 1.25,
    roofPitch: 0.24,
    roofOverhang: 0.05,
    tileRows: 4,
    tileCols: 6,
    hasCrossWing: false,
    hasJettyOverhang: true,
    hasDormer: true,
    hasRearLeanTo: false,
    chimneyPlacement: 'roof_slope',
    hasBannerPennant: true,
  },
  artisan_hall: {
    id: 'artisan_hall',
    label: 'Timbered Artisan Hall',
    scale: 1.24,
    roofPitch: 0.24,
    roofOverhang: 0.048,
    tileRows: 4,
    tileCols: 6,
    hasCrossWing: false,
    hasJettyOverhang: false,
    hasDormer: true,
    hasRearLeanTo: true,
    chimneyPlacement: 'twin_forge',
    hasBannerPennant: true,
  },
};

function createBillowingSailGeometry(w: number, h: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h, 8, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / (w * 0.5);
    const ny = y / (h * 0.5);
    // Parabolic wind belly peaking at sail center
    const belly = Math.max(0, 1 - nx * nx * 0.65) * Math.max(0, 1 - ny * ny * 0.85) * 0.085;
    pos.setZ(i, belly);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createPieceMaterials(textures: ProceduralTextureSet): PieceMaterials {
  const factionMain = {} as Record<FactionColor, THREE.MeshStandardMaterial>;
  const factionRoof = {} as Record<FactionColor, THREE.MeshStandardMaterial>;
  const factionBanner = {} as Record<FactionColor, THREE.MeshStandardMaterial>;

  (Object.keys(FACTION_META) as FactionColor[]).forEach((color) => {
    const meta = FACTION_META[color];
    factionMain[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.hex),
      roughness: 0.34,
      metalness: 0.08,
      normalMap: textures.woodMahoganyNormal,
      normalScale: new THREE.Vector2(0.32, 0.32),
    });
    factionRoof[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.dark),
      roughness: 0.46,
      metalness: 0.1,
      normalMap: textures.roofSlateNormal,
      normalScale: new THREE.Vector2(1.25, 1.25),
    });
    factionBanner[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.accent),
      roughness: 0.42,
      metalness: 0.06,
    });
  });

  const stoneFoundation = new THREE.MeshStandardMaterial({
    color: 0xa39f95,
    map: textures.stoneMasonry,
    normalMap: textures.stoneMasonryNormal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.85,
    metalness: 0.04,
  });

  const warmPlaster = new THREE.MeshStandardMaterial({
    color: 0xece0c7,
    normalMap: textures.stoneMasonryNormal,
    normalScale: new THREE.Vector2(0.24, 0.24),
    roughness: 0.88,
    metalness: 0.02,
  });

  const timberBeam = new THREE.MeshStandardMaterial({
    color: 0x4f321c,
    roughness: 0.72,
    metalness: 0.04,
    normalMap: textures.woodMahoganyNormal,
    normalScale: new THREE.Vector2(0.58, 0.58),
  });

  const chimneyBrick = new THREE.MeshStandardMaterial({
    color: 0xa24c35,
    normalMap: textures.stoneMasonryNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.82,
    metalness: 0.02,
  });

  const flueClay = new THREE.MeshStandardMaterial({
    color: 0x6e3121,
    roughness: 0.76,
    metalness: 0.03,
  });

  const warmWindow = new THREE.MeshStandardMaterial({
    color: 0xffe6a3,
    emissive: 0xe69524,
    emissiveIntensity: 1.35,
    roughness: 0.18,
    metalness: 0.12,
  });

  const brassAccent = new THREE.MeshStandardMaterial({
    color: 0xe2b75c,
    roughness: 0.2,
    metalness: 0.9,
  });

  const robberCloak = new THREE.MeshStandardMaterial({
    color: 0x1e1c24,
    roughness: 0.72,
    metalness: 0.14,
  });

  const robberDangerRing = new THREE.MeshBasicMaterial({
    color: 0xb82e2e,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
  });

  const ghostValid = new THREE.MeshStandardMaterial({
    color: 0xf5c85c,
    emissive: 0xd99626,
    emissiveIntensity: 0.52,
    transparent: true,
    opacity: 0.68,
    roughness: 0.35,
  });

  const contactShadow = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });

  const sharedGeos: THREE.BufferGeometry[] = [];

  return {
    factionMain,
    factionRoof,
    factionBanner,
    stoneFoundation,
    warmPlaster,
    timberBeam,
    chimneyBrick,
    flueClay,
    warmWindow,
    brassAccent,
    robberCloak,
    robberDangerRing,
    ghostValid,
    contactShadow,
    sharedGeos,
    dispose: () => {
      Object.values(factionMain).forEach((m) => m.dispose());
      Object.values(factionRoof).forEach((m) => m.dispose());
      Object.values(factionBanner).forEach((m) => m.dispose());
      stoneFoundation.dispose();
      warmPlaster.dispose();
      timberBeam.dispose();
      chimneyBrick.dispose();
      flueClay.dispose();
      warmWindow.dispose();
      brassAccent.dispose();
      robberCloak.dispose();
      robberDangerRing.dispose();
      ghostValid.dispose();
      contactShadow.dispose();
      sharedGeos.forEach((g) => g.dispose());
    },
  };
}

function addContactShadow(group: THREE.Group, size: number, mats: PieceMaterials) {
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mats.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  group.add(shadow);
}

/**
 * Collectible carved timber & cobblestone road segment with curb edging,
 * faction painted crown rails, timber sleepers, and brass end rivets.
 */
export function createRoadMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const mainMat = color === 'ghost' ? mats.ghostValid : mats.factionMain[color];
  const roofMat = color === 'ghost' ? mats.ghostValid : mats.factionRoof[color];
  const isGhost = color === 'ghost';

  if (!isGhost) {
    const stoneBed = new THREE.Mesh(
      new THREE.BoxGeometry(1.16, 0.052, 0.3),
      mats.stoneFoundation,
    );
    stoneBed.position.y = 0.026;
    stoneBed.castShadow = true;
    stoneBed.receiveShadow = true;
    group.add(stoneBed);
  }

  // Beveled trapezoidal painted timber plank
  const profile = new THREE.Shape();
  profile.moveTo(-0.125, 0);
  profile.lineTo(0.125, 0);
  profile.lineTo(0.095, 0.125);
  profile.lineTo(0.036, 0.162);
  profile.lineTo(-0.036, 0.162);
  profile.lineTo(-0.095, 0.125);
  profile.closePath();

  const plankGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.06,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  plankGeo.center();
  plankGeo.rotateY(Math.PI / 2);

  const plank = new THREE.Mesh(plankGeo, mainMat);
  plank.position.y = 0.11;
  plank.castShadow = true;
  plank.receiveShadow = true;
  group.add(plank);

  // Dark carved ridge beam along road center
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.034, 0.074), roofMat);
  spine.position.y = 0.19;
  spine.castShadow = true;
  group.add(spine);

  // Three timber cross sleepers + brass end waystones
  const sleeperGeo = new THREE.BoxGeometry(0.08, 0.065, 0.28);
  for (const sx of [-0.42, 0, 0.42]) {
    const sleeper = new THREE.Mesh(sleeperGeo, isGhost ? roofMat : mats.timberBeam);
    sleeper.position.set(sx, 0.06, 0);
    sleeper.castShadow = true;
    group.add(sleeper);
  }

  if (!isGhost) {
    const rivetGeo = new THREE.CylinderGeometry(0.026, 0.03, 0.036, 8);
    for (const rx of [-0.43, 0.43]) {
      const rivet = new THREE.Mesh(rivetGeo, mats.brassAccent);
      rivet.position.set(rx, 0.205, 0);
      group.add(rivet);
    }
  }

  return group;
}

export function selectSettlementArchetype(seed?: string): SettlementArchetypeId {
  if (!seed) return 'tudor_cottage';
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % SETTLEMENT_ARCHETYPE_ORDER.length;
  return SETTLEMENT_ARCHETYPE_ORDER[idx];
}

export function disposePieceGroupGeometries(
  root: THREE.Object3D,
  mats: PieceMaterials,
): void {
  const shared = new Set(mats.sharedGeos);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && !shared.has(mesh.geometry)) {
      mesh.geometry.dispose();
    }
  });
}

/**
 * Modular pitched 3D tiled roof with beveled gable shell, staggered courses of
 * individual sculpted overlapping roof shingle tiles, terracotta/faction ridge caps,
 * carved oak gable bargeboards, and player-colored gable infill.
 */
function addTiledGableRoof(
  parent: THREE.Group,
  opts: {
    x: number;
    y: number;
    z: number;
    halfSpan: number;
    peakHeight: number;
    depth: number;
    rotateY?: number;
    tileRows?: number;
    tileCols?: number;
    mainMat: THREE.Material;
    roofMat: THREE.Material;
    ridgeMat: THREE.Material;
    timberMat: THREE.Material;
  },
) {
  const roofGroup = new THREE.Group();
  roofGroup.position.set(opts.x, opts.y, opts.z);
  if (opts.rotateY) roofGroup.rotation.y = opts.rotateY;

  const { halfSpan, peakHeight, depth } = opts;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-halfSpan, 0);
  roofShape.lineTo(0, peakHeight);
  roofShape.lineTo(halfSpan, 0);
  roofShape.lineTo(halfSpan * 0.85, -0.025);
  roofShape.lineTo(0, peakHeight * 0.76);
  roofShape.lineTo(-halfSpan * 0.85, -0.025);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.013,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  roofGeo.center();
  roofGeo.rotateY(Math.PI / 2);

  const roofMesh = new THREE.Mesh(roofGeo, opts.roofMat);
  roofMesh.position.y = peakHeight * 0.5;
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);

  // Staggered courses of individual beveled 3D overlapping shingle tiles on both slopes
  const slopeLen = Math.hypot(halfSpan, peakHeight);
  const slopeAngle = Math.atan2(peakHeight, halfSpan);
  const rows = Math.max(2, opts.tileRows ?? 4);
  const cols = Math.max(3, opts.tileCols ?? 6);
  const tileW = (depth - 0.01) / cols;
  const tileD = (slopeLen / rows) * 1.12;
  const singleTileGeo = new THREE.BoxGeometry(tileW * 0.9, 0.019, tileD);

  for (const side of [-1, 1] as const) {
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / (rows + 0.15);
      const stagger = r % 2 === 1;
      const colCount = stagger ? cols - 1 : cols;
      const rowSpan = colCount * tileW;
      for (let c = 0; c < colCount; c++) {
        const tx = -rowSpan * 0.5 + (c + 0.5) * tileW;
        const tile = new THREE.Mesh(singleTileGeo, opts.roofMat);
        tile.position.set(
          tx,
          t * peakHeight + 0.014,
          side * (1 - t) * halfSpan,
        );
        // Pitch shingle slightly shallower than roof plane so bottom edge overlaps course below
        tile.rotation.x = side * (slopeAngle - 0.09);
        tile.castShadow = true;
        roofGroup.add(tile);
      }
    }
  }

  // Barrel ridge cap tiles + timber ridge spine
  const ridgeSpine = new THREE.Mesh(
    new THREE.BoxGeometry(depth + 0.045, 0.032, 0.042),
    opts.timberMat,
  );
  ridgeSpine.position.y = peakHeight + 0.012;
  ridgeSpine.castShadow = true;
  roofGroup.add(ridgeSpine);

  const ridgeCapGeo = new THREE.CylinderGeometry(0.022, 0.024, Math.max(0.055, tileW * 0.92), 7);
  ridgeCapGeo.rotateZ(Math.PI / 2);
  const ridgeCapCount = Math.max(3, cols - 1);
  for (let i = 0; i < ridgeCapCount; i++) {
    const rx = -depth * 0.44 + (i / Math.max(1, ridgeCapCount - 1)) * (depth * 0.88);
    const capTile = new THREE.Mesh(ridgeCapGeo, opts.ridgeMat);
    capTile.position.set(rx, peakHeight + 0.026, 0);
    capTile.castShadow = true;
    roofGroup.add(capTile);
  }

  // Carved oak gable bargeboards along front and back eaves
  const bargeGeo = new THREE.BoxGeometry(0.024, 0.028, slopeLen + 0.03);
  for (const gx of [-depth * 0.49, depth * 0.49]) {
    for (const side of [-1, 1] as const) {
      const barge = new THREE.Mesh(bargeGeo, opts.timberMat);
      barge.position.set(gx, peakHeight * 0.5 + 0.008, side * halfSpan * 0.5);
      barge.rotation.x = side * slopeAngle;
      roofGroup.add(barge);
    }
  }

  // Solid player-colored gable end infill
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfSpan * 0.8, 0);
  gableShape.lineTo(0, peakHeight * 0.8);
  gableShape.lineTo(halfSpan * 0.8, 0);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: Math.max(0.08, depth - 0.07),
    bevelEnabled: false,
  });
  gableGeo.center();
  gableGeo.rotateY(Math.PI / 2);
  const gable = new THREE.Mesh(gableGeo, opts.mainMat);
  gable.position.y = peakHeight * 0.4;
  roofGroup.add(gable);

  parent.add(roofGroup);
  return roofGroup;
}

/**
 * Modular brick & stone medieval chimney with corbelled stone hearth breast,
 * weather-flashing collar, red-brick stack, stepped brick crown, and twin clay flue pots.
 */
function addModularChimney(
  parent: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  height: number,
  mats: PieceMaterials,
  fallbackMain: THREE.Material,
  fallbackRoof: THREE.Material,
  isGhost: boolean,
  wideTwin = false,
) {
  const chim = new THREE.Group();
  chim.position.set(x, baseY, z);

  const stoneMat = isGhost ? fallbackMain : mats.stoneFoundation;
  const brickMat = isGhost ? fallbackMain : mats.chimneyBrick;
  const potMat = isGhost ? fallbackRoof : mats.flueClay;
  const collarMat = isGhost ? fallbackRoof : mats.timberBeam;

  const baseW = wideTwin ? 0.145 : 0.118;
  const shaftW = wideTwin ? 0.112 : 0.088;

  // Flared stone hearth breast
  const hearth = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, height * 0.34, 0.12),
    stoneMat,
  );
  hearth.position.y = height * 0.17;
  hearth.castShadow = true;
  hearth.receiveShadow = true;
  chim.add(hearth);

  // Sloped stone shoulder flashing collar
  const flashing = new THREE.Mesh(
    new THREE.BoxGeometry(shaftW + 0.022, 0.028, 0.108),
    stoneMat,
  );
  flashing.position.y = height * 0.35;
  flashing.castShadow = true;
  chim.add(flashing);

  // Red-brick chimney stack
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(shaftW, height * 0.65, 0.088),
    brickMat,
  );
  shaft.position.y = height * 0.66;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  chim.add(shaft);

  // Stepped brick & stone crown molding
  const crownBrick = new THREE.Mesh(
    new THREE.BoxGeometry(shaftW + 0.022, 0.024, 0.106),
    brickMat,
  );
  crownBrick.position.y = height - 0.01;
  crownBrick.castShadow = true;
  chim.add(crownBrick);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(shaftW + 0.032, 0.026, 0.116),
    stoneMat,
  );
  cap.position.y = height + 0.015;
  cap.castShadow = true;
  chim.add(cap);

  // Twin cylindrical clay chimney flue pots + rim rings
  const potGeo = new THREE.CylinderGeometry(0.015, 0.021, 0.052, 8);
  const rimGeo = new THREE.CylinderGeometry(0.02, 0.019, 0.012, 8);
  const potSpread = wideTwin ? 0.032 : 0.024;
  for (const px of [-potSpread, potSpread]) {
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.set(px, height + 0.048, 0);
    pot.castShadow = true;
    chim.add(pot);

    const rim = new THREE.Mesh(rimGeo, collarMat);
    rim.position.set(px, height + 0.072, 0);
    chim.add(rim);
  }

  parent.add(chim);
}

/**
 * Modular half-timbered story: player-colored painted siding/wainscot body,
 * slightly raised warm limewash plaster wall bays, dark oak corner posts,
 * horizontal bressummer beams, and diagonal medieval timber braces.
 */
function addHalfTimberWalls(
  parent: THREE.Group,
  x: number,
  yCenter: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mainMat: THREE.Material,
  plasterMat: THREE.Material,
  timberMat: THREE.Material,
  isGhost: boolean,
) {
  // Bold player-colored structural wall body (vividly visible from overhead & isometric angles)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mainMat);
  body.position.set(x, yCenter, z);
  body.castShadow = true;
  body.receiveShadow = true;
  parent.add(body);

  // Upper warm limewash plaster band framed inside player-colored wainscot below
  if (!isGhost) {
    const plasterH = h * 0.52;
    const plasterY = yCenter + h * 0.14;
    const plasterBand = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.008, plasterH, d - 0.05),
      plasterMat,
    );
    plasterBand.position.set(x, plasterY, z);
    parent.add(plasterBand);

    const plasterSideBand = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.05, plasterH, d + 0.008),
      plasterMat,
    );
    plasterSideBand.position.set(x, plasterY, z);
    parent.add(plasterSideBand);
  }

  // Dark oak vertical corner posts & mid-studs
  const beamGeo = new THREE.BoxGeometry(0.036, h + 0.01, 0.036);
  for (const bx of [-w * 0.48, w * 0.48]) {
    for (const bz of [-d * 0.48, d * 0.48]) {
      const post = new THREE.Mesh(beamGeo, timberMat);
      post.position.set(x + bx, yCenter, z + bz);
      parent.add(post);
    }
  }

  // Horizontal mid-rail & top eave tie-beam framing plaster vs player paint
  const midRail = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.022, 0.024, d + 0.022),
    timberMat,
  );
  midRail.position.set(x, yCenter - h * 0.12, z);
  parent.add(midRail);

  const eaveBeam = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.024, 0.028, d + 0.024),
    timberMat,
  );
  eaveBeam.position.set(x, yCenter + h * 0.46, z);
  parent.add(eaveBeam);

  // Diagonal timber braces on front/back corners
  if (!isGhost) {
    const braceGeo = new THREE.BoxGeometry(0.02, h * 0.5, 0.018);
    for (const bz of [-d * 0.485, d * 0.485]) {
      for (const side of [-1, 1] as const) {
        const brace = new THREE.Mesh(braceGeo, timberMat);
        brace.position.set(x + side * w * 0.34, yCenter + h * 0.15, z + bz);
        brace.rotation.z = side * 0.52;
        parent.add(brace);
      }
    }
  }
}

/**
 * Modular oak front door, stone threshold step, timber porch hood & glowing lantern.
 */
function addEntryPorch(
  parent: THREE.Group,
  x: number,
  baseY: number,
  frontZ: number,
  mats: PieceMaterials,
) {
  const step = new THREE.Mesh(
    new THREE.BoxGeometry(0.145, 0.034, 0.072),
    mats.stoneFoundation,
  );
  step.position.set(x, baseY + 0.017, frontZ + 0.028);
  parent.add(step);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.104, 0.155, 0.02),
    mats.timberBeam,
  );
  frame.position.set(x, baseY + 0.095, frontZ + 0.004);
  parent.add(frame);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.14, 0.026),
    mats.flueClay,
  );
  door.position.set(x, baseY + 0.092, frontZ + 0.008);
  parent.add(door);

  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(0.148, 0.024, 0.072),
    mats.timberBeam,
  );
  hood.position.set(x, baseY + 0.188, frontZ + 0.026);
  hood.rotation.x = 0.22;
  parent.add(hood);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), mats.brassAccent);
  knob.position.set(x + 0.024, baseY + 0.088, frontZ + 0.024);
  parent.add(knob);

  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.034, 0.048, 0.034),
    mats.warmWindow,
  );
  lantern.position.set(x + 0.082, baseY + 0.158, frontZ + 0.02);
  lantern.layers.enable(BLOOM_LAYER);
  parent.add(lantern);
}

/**
 * Shuttered glowing leaded-glass window module with player-colored painted shutters.
 */
function addShutteredWindow(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  facing: 'front' | 'left' | 'right',
  mats: PieceMaterials,
  bannerMat: THREE.Material,
) {
  const wg = new THREE.Group();
  wg.position.set(x, y, z);
  if (facing === 'left') wg.rotation.y = -Math.PI / 2;
  else if (facing === 'right') wg.rotation.y = Math.PI / 2;

  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.03), mats.timberBeam);
  sill.position.set(0, -0.048, 0.008);
  wg.add(sill);

  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.082, 0.022), mats.warmWindow);
  pane.layers.enable(BLOOM_LAYER);
  wg.add(pane);

  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.084, 0.026), mats.timberBeam);
  wg.add(mullion);

  const shutterGeo = new THREE.BoxGeometry(0.024, 0.086, 0.018);
  for (const sx of [-0.056, 0.056]) {
    const shutter = new THREE.Mesh(shutterGeo, bannerMat);
    shutter.position.set(sx, 0, 0.003);
    wg.add(shutter);
  }

  parent.add(wg);
}

/**
 * Modular 3D medieval settlement house set driven by `SettlementHouseSetConfig`:
 *  - `tudor_cottage`: Tudor Manor Cottage (timber framing, limewash plaster, tiled gable roof, chimney, porch)
 *  - `hearth_manor`: L-Shaped Hearth Stead (projecting cross-wing + tall exterior stone-breast chimney)
 *  - `jetty_townhouse`: Jetty Guild Townhouse (stone undercroft, cantilevered upper story, dormer & banner)
 *  - `artisan_hall`: Timbered Artisan Hall (twin-flue forge chimney, dormer + rear bakehouse lean-to)
 */
export function createSettlementMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
  variantSeed?: string,
  houseSet: SettlementHouseSetConfig = DEFAULT_SETTLEMENT_HOUSE_SET,
): THREE.Group {
  const group = new THREE.Group();
  const isGhost = color === 'ghost';
  const mainMat = isGhost ? mats.ghostValid : mats.factionMain[color];
  const roofMat = isGhost ? mats.ghostValid : mats.factionRoof[color];
  const bannerMat = isGhost ? mats.ghostValid : mats.factionBanner[color];
  const ridgeMat = isGhost ? roofMat : mats.flueClay;
  const timberMat = isGhost ? roofMat : mats.timberBeam;
  const stoneMat = isGhost ? mainMat : mats.stoneFoundation;
  const plasterMat = isGhost ? mainMat : mats.warmPlaster;

  const archetypeId = selectSettlementArchetype(variantSeed);
  const spec = houseSet[archetypeId] ?? DEFAULT_SETTLEMENT_HOUSE_SET.tudor_cottage;

  if (!isGhost) {
    addContactShadow(group, 1.06, mats);
  }

  // Shared octagonal carved stone vertex dais + bold player-colored faction curb collar
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(0.37, 0.42, 0.095, 8),
    stoneMat,
  );
  dais.position.y = 0.048;
  dais.castShadow = true;
  dais.receiveShadow = true;
  group.add(dais);

  if (!isGhost) {
    const curb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.382, 0.388, 0.026, 8),
      mainMat,
    );
    curb.position.y = 0.096;
    group.add(curb);
  }

  const house = new THREE.Group();
  house.position.y = 0.104;
  house.scale.setScalar(spec.scale);

  if (spec.hasCrossWing) {
    // --- L-Shaped Hearth Stead with projecting cross-wing & exterior hearth chimney ---
    const mainPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.35), stoneMat);
    mainPlinth.position.set(-0.02, 0.035, -0.02);
    mainPlinth.castShadow = true;
    mainPlinth.receiveShadow = true;
    house.add(mainPlinth);

    const wingPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.25), stoneMat);
    wingPlinth.position.set(0.11, 0.035, 0.11);
    wingPlinth.castShadow = true;
    house.add(wingPlinth);

    addHalfTimberWalls(
      house,
      -0.02,
      0.185,
      -0.02,
      0.39,
      0.23,
      0.3,
      mainMat,
      plasterMat,
      timberMat,
      isGhost,
    );

    addTiledGableRoof(house, {
      x: -0.02,
      y: 0.3,
      z: -0.02,
      halfSpan: 0.15 + spec.roofOverhang,
      peakHeight: spec.roofPitch,
      depth: 0.44,
      tileRows: spec.tileRows,
      tileCols: spec.tileCols,
      mainMat,
      roofMat,
      ridgeMat,
      timberMat,
    });

    addHalfTimberWalls(
      house,
      0.11,
      0.17,
      0.11,
      0.21,
      0.2,
      0.23,
      mainMat,
      plasterMat,
      timberMat,
      isGhost,
    );

    addTiledGableRoof(house, {
      x: 0.11,
      y: 0.27,
      z: 0.11,
      halfSpan: 0.145,
      peakHeight: spec.roofPitch * 0.72,
      depth: 0.26,
      rotateY: Math.PI / 2,
      tileRows: Math.max(2, spec.tileRows - 1),
      tileCols: Math.max(3, spec.tileCols - 2),
      mainMat,
      roofMat,
      ridgeMat,
      timberMat,
    });

    addModularChimney(house, -0.225, 0.06, -0.02, 0.56, mats, mainMat, roofMat, isGhost);

    if (!isGhost) {
      addEntryPorch(house, -0.1, 0.05, 0.13, mats);
      addShutteredWindow(house, 0.11, 0.18, 0.228, 'front', mats, bannerMat);
      addShutteredWindow(house, 0.218, 0.18, 0.11, 'right', mats, bannerMat);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 0.082, 10),
        mats.chimneyBrick,
      );
      barrel.position.set(-0.22, 0.085, 0.14);
      barrel.castShadow = true;
      house.add(barrel);
    }
  } else if (spec.hasJettyOverhang) {
    // --- Jetty Guild Townhouse: stone undercroft, cantilevered upper floor, dormer & guild banner ---
    const undercroft = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.145, 0.32), stoneMat);
    undercroft.position.y = 0.072;
    undercroft.castShadow = true;
    undercroft.receiveShadow = true;
    house.add(undercroft);

    addHalfTimberWalls(
      house,
      0,
      0.23,
      0,
      0.42,
      0.17,
      0.36,
      mainMat,
      plasterMat,
      timberMat,
      isGhost,
    );

    const corbelGeo = new THREE.BoxGeometry(0.032, 0.036, 0.045);
    for (const cx of [-0.14, 0, 0.14]) {
      const corbel = new THREE.Mesh(corbelGeo, timberMat);
      corbel.position.set(cx, 0.138, 0.165);
      house.add(corbel);
    }

    addTiledGableRoof(house, {
      x: 0,
      y: 0.315,
      z: 0,
      halfSpan: 0.18 + spec.roofOverhang,
      peakHeight: spec.roofPitch,
      depth: 0.46,
      tileRows: spec.tileRows,
      tileCols: spec.tileCols,
      mainMat,
      roofMat,
      ridgeMat,
      timberMat,
    });

    if (spec.hasDormer) {
      const dormerBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.12), mainMat);
      dormerBody.position.set(-0.07, 0.405, 0.13);
      dormerBody.castShadow = true;
      house.add(dormerBody);
      addTiledGableRoof(house, {
        x: -0.07,
        y: 0.45,
        z: 0.13,
        halfSpan: 0.075,
        peakHeight: 0.072,
        depth: 0.14,
        rotateY: Math.PI / 2,
        tileRows: 2,
        tileCols: 2,
        mainMat,
        roofMat,
        ridgeMat,
        timberMat,
      });
    }

    addModularChimney(house, 0.11, 0.29, -0.07, 0.35, mats, mainMat, roofMat, isGhost);

    if (!isGhost) {
      addEntryPorch(house, 0.02, 0.02, 0.16, mats);

      const dormerPane = new THREE.Mesh(
        new THREE.BoxGeometry(0.056, 0.056, 0.022),
        mats.warmWindow,
      );
      dormerPane.position.set(-0.07, 0.41, 0.192);
      dormerPane.layers.enable(BLOOM_LAYER);
      house.add(dormerPane);

      addShutteredWindow(house, -0.1, 0.23, 0.182, 'front', mats, bannerMat);
      addShutteredWindow(house, -0.212, 0.23, 0, 'left', mats, bannerMat);
      addShutteredWindow(house, 0.212, 0.23, 0, 'right', mats, bannerMat);

      if (spec.hasBannerPennant) {
        const pennant = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.098, 0.016),
          bannerMat,
        );
        pennant.position.set(-0.105, 0.105, 0.172);
        house.add(pennant);
      }
    }
  } else if (spec.hasRearLeanTo) {
    // --- Timbered Artisan Hall: main timbered hall, rear workshop lean-to, twin-flue forge chimney ---
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.072, 0.42), stoneMat);
    plinth.position.y = 0.036;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    house.add(plinth);

    addHalfTimberWalls(
      house,
      0,
      0.19,
      0.03,
      0.41,
      0.24,
      0.3,
      mainMat,
      plasterMat,
      timberMat,
      isGhost,
    );

    addTiledGableRoof(house, {
      x: 0,
      y: 0.31,
      z: 0.03,
      halfSpan: 0.15 + spec.roofOverhang,
      peakHeight: spec.roofPitch,
      depth: 0.46,
      tileRows: spec.tileRows,
      tileCols: spec.tileCols,
      mainMat,
      roofMat,
      ridgeMat,
      timberMat,
    });

    // Rear artisan workshop / bakehouse lean-to annex
    const leanBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.12), mainMat);
    leanBody.position.set(-0.03, 0.145, -0.16);
    leanBody.castShadow = true;
    house.add(leanBody);

    const leanRoof = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.028, 0.16), roofMat);
    leanRoof.position.set(-0.03, 0.23, -0.165);
    leanRoof.rotation.x = -0.34;
    leanRoof.castShadow = true;
    house.add(leanRoof);

    // Wide twin-flue forge chimney
    addModularChimney(
      house,
      0.13,
      0.07,
      -0.14,
      0.55,
      mats,
      mainMat,
      roofMat,
      isGhost,
      true,
    );

    if (!isGhost) {
      addEntryPorch(house, 0.04, 0.05, 0.18, mats);
      addShutteredWindow(house, -0.11, 0.2, 0.182, 'front', mats, bannerMat);
      addShutteredWindow(house, -0.208, 0.2, 0.03, 'left', mats, bannerMat);
      addShutteredWindow(house, 0.208, 0.2, 0.03, 'right', mats, bannerMat);

      if (spec.hasBannerPennant) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.012, 0.16, 6),
          timberMat,
        );
        pole.position.set(-0.18, 0.52, 0.03);
        house.add(pole);
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.045, 0.012),
          bannerMat,
        );
        flag.position.set(-0.14, 0.56, 0.03);
        house.add(flag);
      }
    }
  } else {
    // --- Tudor Manor Cottage: classic steep tiled gable, limewash half-timbering, chimney & porch ---
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.072, 0.39), stoneMat);
    plinth.position.y = 0.036;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    house.add(plinth);

    addHalfTimberWalls(
      house,
      0,
      0.19,
      0,
      0.41,
      0.24,
      0.34,
      mainMat,
      plasterMat,
      timberMat,
      isGhost,
    );

    addTiledGableRoof(house, {
      x: 0,
      y: 0.31,
      z: 0,
      halfSpan: 0.175 + spec.roofOverhang,
      peakHeight: spec.roofPitch,
      depth: 0.47,
      tileRows: spec.tileRows,
      tileCols: spec.tileCols,
      mainMat,
      roofMat,
      ridgeMat,
      timberMat,
    });

    addModularChimney(house, 0.125, 0.27, -0.09, 0.35, mats, mainMat, roofMat, isGhost);

    if (!isGhost) {
      addEntryPorch(house, 0, 0.05, 0.17, mats);

      const crest = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), mats.brassAccent);
      crest.position.set(0, 0.31 + spec.roofPitch + 0.032, 0);
      house.add(crest);

      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), mats.timberBeam);
      crate.position.set(-0.23, 0.075, 0.13);
      crate.rotation.y = 0.22;
      crate.castShadow = true;
      house.add(crate);

      addShutteredWindow(house, -0.208, 0.2, 0, 'left', mats, bannerMat);
      addShutteredWindow(house, 0.208, 0.2, 0, 'right', mats, bannerMat);
    }
  }

  group.add(house);
  return group;
}

/**
 * Unmistakable multi-building Fortified City Citadel resting on a monumental
 * stepped octagonal stone & brass bastion with 4 corner curtain turrets,
 * Great Hall, arched gatehouse with glowing braziers, towering Watchtower Keep,
 * gilded crown collar, tall slate spire, and waving war-banner.
 */
export function createCityMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const mainMat = color === 'ghost' ? mats.ghostValid : mats.factionMain[color];
  const roofMat = color === 'ghost' ? mats.ghostValid : mats.factionRoof[color];
  const isGhost = color === 'ghost';
  const stone = isGhost ? mainMat : mats.stoneFoundation;

  if (!isGhost) {
    addContactShadow(group, 1.32, mats);
  }

  // 0. Monumental stepped octagonal bastion terrace plinth + brass & faction rim
  const bastion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.49, 0.54, 0.12, 8),
    stone,
  );
  bastion.position.y = 0.06;
  bastion.castShadow = true;
  bastion.receiveShadow = true;
  group.add(bastion);

  if (!isGhost) {
    const brassTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.495, 0.5, 0.026, 8),
      mats.brassAccent,
    );
    brassTrim.position.y = 0.125;
    group.add(brassTrim);
  }

  const citadel = new THREE.Group();
  citadel.position.y = 0.132;
  citadel.scale.setScalar(1.28);

  // 1. Stepped stone courtyard terrace
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.58), stone);
  base.position.y = 0.05;
  base.castShadow = true;
  base.receiveShadow = true;
  citadel.add(base);

  // Perimeter curtain parapet wall + 4 corner bastion turrets
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.048), stone);
  parapet.position.set(0, 0.13, 0.265);
  parapet.castShadow = true;
  citadel.add(parapet);

  const cornerTurretGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.28, 8);
  const cornerCapGeo = new THREE.ConeGeometry(0.078, 0.1, 8);
  for (const [tx, tz] of [
    [-0.31, 0.24],
    [0.31, 0.24],
    [-0.31, -0.24],
  ] as const) {
    const tBody = new THREE.Mesh(cornerTurretGeo, stone);
    tBody.position.set(tx, 0.18, tz);
    tBody.castShadow = true;
    citadel.add(tBody);

    const tCap = new THREE.Mesh(cornerCapGeo, roofMat);
    tCap.position.set(tx, 0.365, tz);
    tCap.castShadow = true;
    citadel.add(tCap);
  }

  // 2. Grand Great Hall body
  const hall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.42), mainMat);
  hall.position.set(-0.09, 0.27, 0.01);
  hall.castShadow = true;
  hall.receiveShadow = true;
  citadel.add(hall);

  // 3. Great Hall steep slate gabled roof + brass ridge crest
  const hallRoofShape = new THREE.Shape();
  hallRoofShape.moveTo(-0.24, 0);
  hallRoofShape.lineTo(0, 0.245);
  hallRoofShape.lineTo(0.24, 0);
  hallRoofShape.closePath();
  const hallRoofGeo = new THREE.ExtrudeGeometry(hallRoofShape, {
    depth: 0.45,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  hallRoofGeo.center();
  hallRoofGeo.rotateY(Math.PI / 2);
  const hallRoof = new THREE.Mesh(hallRoofGeo, roofMat);
  hallRoof.position.set(-0.09, 0.54, 0.01);
  hallRoof.castShadow = true;
  citadel.add(hallRoof);

  // 4. Soaring Octagonal Stone Master Keep Tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.175, 0.74, 8), stone);
  tower.position.set(0.19, 0.465, -0.06);
  tower.castShadow = true;
  tower.receiveShadow = true;
  citadel.add(tower);

  // 5. Corbelled octagonal battlement collar + brass crown band + 8 merlons
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.082, 8), stone);
  collar.position.set(0.19, 0.84, -0.06);
  collar.castShadow = true;
  citadel.add(collar);

  if (!isGhost) {
    const keepBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.178, 0.178, 0.032, 8),
      mats.brassAccent,
    );
    keepBand.position.set(0.19, 0.79, -0.06);
    citadel.add(keepBand);
  }

  const merlonGeo = new THREE.BoxGeometry(0.058, 0.072, 0.058);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const merlon = new THREE.Mesh(merlonGeo, stone);
    merlon.position.set(
      0.19 + Math.cos(a) * 0.16,
      0.905,
      -0.06 + Math.sin(a) * 0.16,
    );
    merlon.rotation.y = -a;
    citadel.add(merlon);
  }

  // 6. Octagonal slate spire + gilded orb
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 8), roofMat);
  spire.position.set(0.19, 1.03, -0.06);
  spire.castShadow = true;
  citadel.add(spire);

  // 7. Brass flagpole + orb + billowing faction war-banner
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.3, 8),
    isGhost ? roofMat : mats.brassAccent,
  );
  pole.position.set(0.19, 1.28, -0.06);
  citadel.add(pole);

  if (!isGhost) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mats.brassAccent);
    orb.position.set(0.19, 1.43, -0.06);
    citadel.add(orb);
  }

  const bannerPivot = new THREE.Group();
  bannerPivot.position.set(0.19, 1.34, -0.06);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.115, 0.018), mainMat);
  banner.position.set(0.14, 0, 0);
  bannerPivot.add(banner);
  citadel.add(bannerPivot);
  group.userData.bannerPivot = bannerPivot;

  // 8. Corner annex bastion wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.24, 0.25), mainMat);
  wing.position.set(0.17, 0.215, 0.15);
  wing.castShadow = true;
  citadel.add(wing);

  const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(0.195, 0.18, 4), roofMat);
  wingRoof.rotation.y = Math.PI / 4;
  wingRoof.position.set(0.17, 0.415, 0.15);
  wingRoof.castShadow = true;
  citadel.add(wingRoof);

  if (!isGhost) {
    // 9. Arched portcullis gatehouse + flanking glowing ember braziers + warm hearth windows
    const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 0.05), stone);
    gateFrame.position.set(-0.09, 0.18, 0.225);
    citadel.add(gateFrame);

    const gateDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.098, 0.15, 0.026),
      mats.timberBeam,
    );
    gateDoor.position.set(-0.09, 0.16, 0.244);
    citadel.add(gateDoor);

    const bowlGeo = new THREE.CylinderGeometry(0.032, 0.02, 0.045, 8);
    const emberGeo = new THREE.SphereGeometry(0.025, 6, 5);
    for (const bx of [-0.195, 0.015]) {
      const bowl = new THREE.Mesh(bowlGeo, mats.brassAccent);
      bowl.position.set(bx, 0.168, 0.275);
      citadel.add(bowl);

      const ember = new THREE.Mesh(emberGeo, mats.warmWindow);
      ember.position.set(bx, 0.198, 0.275);
      ember.layers.enable(BLOOM_LAYER);
      citadel.add(ember);
    }

    const winGeo = new THREE.BoxGeometry(0.05, 0.095, 0.03);
    for (const [wx, wy, wz] of [
      [-0.18, 0.31, 0.222],
      [0.0, 0.31, 0.222],
      [0.19, 0.62, 0.1],
      [0.19, 0.47, 0.1],
      [0.17, 0.235, 0.278],
    ] as const) {
      const win = new THREE.Mesh(winGeo, mats.warmWindow);
      win.position.set(wx, wy, wz);
      win.layers.enable(BLOOM_LAYER);
      citadel.add(win);
    }

    // Brick chimney on Great Hall
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.24, 0.08),
      mats.chimneyBrick,
    );
    chimney.position.set(-0.2, 0.625, -0.09);
    citadel.add(chimney);
  }

  group.add(citadel);
  return group;
}

/**
 * Carved hooded Robber Pawn with brass pedestal ring, dark crimson threat aura ring,
 * lathe-turned cloak silhouette, belt sash, and warm amber lantern.
 */
export function createRobberMesh(mats: PieceMaterials): THREE.Group {
  const group = new THREE.Group();

  // Crimson danger outline ring on hex surface
  const threatRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.35, 24).rotateX(-Math.PI / 2),
    mats.robberDangerRing,
  );
  threatRing.position.y = 0.015;
  group.add(threatRing);

  // Weighted brass base ring
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.27, 0.075, 22),
    mats.brassAccent,
  );
  base.position.y = 0.038;
  base.castShadow = true;
  group.add(base);

  // Lathe-turned cloak silhouette
  const pts = [
    new THREE.Vector2(0, 0.075),
    new THREE.Vector2(0.22, 0.075),
    new THREE.Vector2(0.195, 0.26),
    new THREE.Vector2(0.135, 0.52),
    new THREE.Vector2(0.165, 0.62),
    new THREE.Vector2(0.115, 0.72),
    new THREE.Vector2(0, 0.75),
  ];
  const cloak = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), mats.robberCloak);
  cloak.castShadow = true;
  cloak.receiveShadow = true;
  group.add(cloak);

  // Brass waist belt collar
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.165, 0.018, 6, 18),
    mats.brassAccent,
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.36;
  group.add(belt);

  // Hooded head cowl tilted slightly forward
  const hood = new THREE.Mesh(
    new THREE.ConeGeometry(0.145, 0.27, 16),
    mats.robberCloak,
  );
  hood.position.set(0, 0.81, 0.02);
  hood.rotation.x = 0.24;
  hood.castShadow = true;
  group.add(hood);

  // Miniature hanging brass lantern on right flank
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.03, 0.075, 6),
    mats.warmWindow,
  );
  lantern.position.set(0.18, 0.38, 0.11);
  lantern.layers.enable(BLOOM_LAYER);
  group.add(lantern);

  return group;
}

/**
 * Miniature wooden harbor pier (with cargo crates, bollards, pilings) +
 * merchant cog ship with curved billowing sailcloth bearing the trade-ratio crest.
 */
export function createHarborMesh(
  kind: HarborKind,
  textures: ProceduralTextureSet,
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();

  // Wooden dock pier extending from island edge toward ship
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.052, 0.24),
    mats.timberBeam,
  );
  pierDeck.position.set(-0.34, 0.085, 0);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  group.add(pierDeck);

  // Dock pilings + brass mooring bollards
  const pilingGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.36, 8);
  const bollardGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.06, 8);
  for (const px of [-0.54, -0.34, -0.14]) {
    for (const pz of [-0.092, 0.092]) {
      const piling = new THREE.Mesh(pilingGeo, mats.timberBeam);
      piling.position.set(px, -0.025, pz);
      group.add(piling);
    }
  }
  const bollard = new THREE.Mesh(bollardGeo, mats.brassAccent);
  bollard.position.set(-0.15, 0.135, 0.085);
  group.add(bollard);

  // Small cargo crate & barrel resting on dock pier
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.09), mats.timberBeam);
  crate.position.set(-0.39, 0.15, -0.04);
  crate.rotation.y = 0.25;
  crate.castShadow = true;
  group.add(crate);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.085, 10),
    mats.chimneyBrick,
  );
  barrel.position.set(-0.27, 0.15, -0.05);
  barrel.castShadow = true;
  group.add(barrel);

  // Merchant Ship Cog floating near pier (gently animated via userData.shipGroup)
  const shipGroup = new THREE.Group();
  shipGroup.position.set(0.12, 0.02, 0);
  shipGroup.rotation.y = Math.PI / 2;

  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0.36);
  hullShape.quadraticCurveTo(0.18, 0.12, 0.145, -0.27);
  hullShape.lineTo(-0.145, -0.27);
  hullShape.quadraticCurveTo(-0.18, 0.12, 0, 0.36);

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, mats.timberBeam);
  hull.position.y = 0.085;
  hull.castShadow = true;
  shipGroup.add(hull);

  // Raised stern poop deck + bowsprit
  const stern = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.14), mats.stoneFoundation);
  stern.position.set(0, 0.12, -0.18);
  shipGroup.add(stern);

  const bowsprit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.016, 0.22, 6),
    mats.timberBeam,
  );
  bowsprit.rotation.x = Math.PI * 0.38;
  bowsprit.position.set(0, 0.13, 0.38);
  shipGroup.add(bowsprit);

  // Mast & yardarm
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.62, 8),
    mats.timberBeam,
  );
  mast.position.y = 0.36;
  mast.castShadow = true;
  shipGroup.add(mast);

  const yard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 0.48, 6),
    mats.timberBeam,
  );
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 0.61, 0.02);
  shipGroup.add(yard);

  // Curved Billowing Linen Sail bearing the harbor sign texture
  const sailMat = new THREE.MeshStandardMaterial({
    map: textures.harborSigns.get(kind)!,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const sail = new THREE.Mesh(createBillowingSailGeometry(0.44, 0.42), sailMat);
  sail.position.set(0, 0.4, 0.03);
  sail.castShadow = true;
  shipGroup.add(sail);

  // Top mast pennant
  const pennant = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.038, 0.01),
    mats.brassAccent,
  );
  pennant.position.set(0.055, 0.66, 0);
  shipGroup.add(pennant);

  group.add(shipGroup);
  group.userData.shipGroup = shipGroup;
  return group;
}

/**
 * Creates a rounded-edge 3D ivory/bone die mesh with 6 face materials mapped 1..6.
 */
export function createDieMesh(textures: ProceduralTextureSet): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.56, 0.56, 0.56, 3, 3, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length();
    v.normalize().multiplyScalar(THREE.MathUtils.lerp(len, 0.44, 0.28));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // Three.js BoxGeometry material order: +X(3), -X(4), +Y(1), -Y(6), +Z(2), -Z(5)
  const faceOrder = [3, 4, 1, 6, 2, 5];
  const materials = faceOrder.map(
    (num) =>
      new THREE.MeshStandardMaterial({
        map: textures.diceFaces[num - 1],
        roughness: 0.28,
        metalness: 0.04,
      }),
  );

  const die = new THREE.Mesh(geo, materials);
  die.castShadow = true;
  die.receiveShadow = true;
  return die;
}

/** Returns Euler rotation that places the desired face value (1..6) on +Y (top). */
export function getDieRotationForValue(value: number): THREE.Euler {
  switch (value) {
    case 1:
      return new THREE.Euler(0, 0, 0);
    case 6:
      return new THREE.Euler(Math.PI, 0, 0);
    case 2:
      return new THREE.Euler(-Math.PI / 2, 0, 0);
    case 5:
      return new THREE.Euler(Math.PI / 2, 0, 0);
    case 3:
      return new THREE.Euler(0, 0, Math.PI / 2);
    case 4:
      return new THREE.Euler(0, 0, -Math.PI / 2);
    default:
      return new THREE.Euler(0, 0, 0);
  }
}
