import * as THREE from 'three';
import { FACTION_META, type FactionColor, type HarborKind } from '../game/types';
import type { ProceduralTextureSet } from './textures';

export interface PieceMaterials {
  factionMain: Record<FactionColor, THREE.MeshStandardMaterial>;
  factionTrim: Record<FactionColor, THREE.MeshStandardMaterial>;
  stoneFoundation: THREE.MeshStandardMaterial;
  timberBeam: THREE.MeshStandardMaterial;
  chimneyBrick: THREE.MeshStandardMaterial;
  warmWindow: THREE.MeshStandardMaterial;
  brassAccent: THREE.MeshStandardMaterial;
  robberCloak: THREE.MeshStandardMaterial;
  ghostValid: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function createPieceMaterials(textures: ProceduralTextureSet): PieceMaterials {
  const factionMain = {} as Record<FactionColor, THREE.MeshStandardMaterial>;
  const factionTrim = {} as Record<FactionColor, THREE.MeshStandardMaterial>;

  (Object.keys(FACTION_META) as FactionColor[]).forEach((color) => {
    const meta = FACTION_META[color];
    factionMain[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.hex),
      roughness: 0.42,
      metalness: 0.08,
      bumpMap: textures.woodGrainBump,
      bumpScale: 0.015,
    });
    factionTrim[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.dark),
      roughness: 0.62,
      metalness: 0.1,
    });
  });

  const stoneFoundation = new THREE.MeshStandardMaterial({
    color: 0x7c7b74,
    roughness: 0.88,
    metalness: 0.04,
    bumpMap: textures.terrainBump,
    bumpScale: 0.02,
  });

  const timberBeam = new THREE.MeshStandardMaterial({
    color: 0x5c3c24,
    roughness: 0.72,
    metalness: 0.05,
    bumpMap: textures.woodGrainBump,
    bumpScale: 0.02,
  });

  const chimneyBrick = new THREE.MeshStandardMaterial({
    color: 0x8f4733,
    roughness: 0.85,
    metalness: 0.02,
  });

  const warmWindow = new THREE.MeshStandardMaterial({
    color: 0xf7cf74,
    emissive: 0xd18824,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.1,
  });

  const brassAccent = new THREE.MeshStandardMaterial({
    color: 0xd4aa54,
    roughness: 0.26,
    metalness: 0.85,
  });

  const robberCloak = new THREE.MeshStandardMaterial({
    color: 0x222026,
    roughness: 0.78,
    metalness: 0.12,
  });

  const ghostValid = new THREE.MeshStandardMaterial({
    color: 0xf5c85c,
    emissive: 0xd99626,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.65,
    roughness: 0.35,
  });

  return {
    factionMain,
    factionTrim,
    stoneFoundation,
    timberBeam,
    chimneyBrick,
    warmWindow,
    brassAccent,
    robberCloak,
    ghostValid,
    dispose: () => {
      Object.values(factionMain).forEach((m) => m.dispose());
      Object.values(factionTrim).forEach((m) => m.dispose());
      stoneFoundation.dispose();
      timberBeam.dispose();
      chimneyBrick.dispose();
      warmWindow.dispose();
      brassAccent.dispose();
      robberCloak.dispose();
      ghostValid.dispose();
    },
  };
}

/**
 * Miniature beveled wooden road with tapered end-caps, top ridge, and brass pins.
 * Bottom-center pivot at y = 0. Length oriented along X axis (~1.16 units).
 */
export function createRoadMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const mainMat = color === 'ghost' ? mats.ghostValid : mats.factionMain[color];
  const trimMat = color === 'ghost' ? mats.ghostValid : mats.factionTrim[color];

  // Beveled trapezoidal cross-section extruded along road length
  const profile = new THREE.Shape();
  profile.moveTo(-0.12, 0);
  profile.lineTo(0.12, 0);
  profile.lineTo(0.09, 0.11);
  profile.lineTo(0.03, 0.14);
  profile.lineTo(-0.03, 0.14);
  profile.lineTo(-0.09, 0.11);
  profile.closePath();

  const plankGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.06,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  plankGeo.center();
  plankGeo.rotateY(Math.PI / 2);

  const plank = new THREE.Mesh(plankGeo, mainMat);
  plank.position.y = 0.075;
  plank.castShadow = true;
  plank.receiveShadow = true;
  group.add(plank);

  // Dark center timber spine
  const spineGeo = new THREE.BoxGeometry(0.92, 0.03, 0.075);
  const spine = new THREE.Mesh(spineGeo, trimMat);
  spine.position.y = 0.145;
  spine.castShadow = true;
  group.add(spine);

  // Two end-cap cross sleepers
  const sleeperGeo = new THREE.BoxGeometry(0.08, 0.06, 0.25);
  for (const sx of [-0.42, 0.42]) {
    const sleeper = new THREE.Mesh(sleeperGeo, trimMat);
    sleeper.position.set(sx, 0.035, 0);
    sleeper.castShadow = true;
    group.add(sleeper);
  }

  return group;
}

/**
 * Miniature medieval settlement house (8+ distinct parts):
 * Stone plinth, timber-framed body, gabled pitched roof, chimney, door, and windows.
 */
export function createSettlementMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const mainMat = color === 'ghost' ? mats.ghostValid : mats.factionMain[color];
  const trimMat = color === 'ghost' ? mats.ghostValid : mats.factionTrim[color];
  const isGhost = color === 'ghost';

  // 1. Stone foundation plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.07, 0.38),
    isGhost ? mainMat : mats.stoneFoundation,
  );
  plinth.position.y = 0.035;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Main house body (painted faction timber walls)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.32), mainMat);
  body.position.y = 0.19;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 3. Corner timber beams
  const beamGeo = new THREE.BoxGeometry(0.04, 0.25, 0.04);
  for (const bx of [-0.185, 0.185]) {
    for (const bz of [-0.155, 0.155]) {
      const beam = new THREE.Mesh(beamGeo, isGhost ? trimMat : mats.timberBeam);
      beam.position.set(bx, 0.19, bz);
      group.add(beam);
    }
  }

  // 4. Extruded pitched gable roof with eaves overhang
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.21, 0);
  roofShape.lineTo(0, 0.2);
  roofShape.lineTo(0.21, 0);
  roofShape.lineTo(0.17, -0.025);
  roofShape.lineTo(0, 0.14);
  roofShape.lineTo(-0.17, -0.025);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  roofGeo.center();
  roofGeo.rotateY(Math.PI / 2);

  const roof = new THREE.Mesh(roofGeo, trimMat);
  roof.position.y = 0.39;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Solid gable fill prism under the roof
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-0.16, 0);
  gableShape.lineTo(0, 0.155);
  gableShape.lineTo(0.16, 0);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.36,
    bevelEnabled: false,
  });
  gableGeo.center();
  gableGeo.rotateY(Math.PI / 2);
  const gable = new THREE.Mesh(gableGeo, mainMat);
  gable.position.y = 0.37;
  group.add(gable);

  // 5. Chimney + brick cap
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.19, 0.08),
    isGhost ? mainMat : mats.chimneyBrick,
  );
  chimney.position.set(0.1, 0.44, -0.08);
  chimney.castShadow = true;
  group.add(chimney);

  const chimneyCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.03, 0.1),
    isGhost ? trimMat : mats.stoneFoundation,
  );
  chimneyCap.position.set(0.1, 0.54, -0.08);
  group.add(chimneyCap);

  if (!isGhost) {
    // 6. Recessed wooden front door
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.025),
      mats.timberBeam,
    );
    door.position.set(0, 0.14, 0.162);
    group.add(door);

    // 7. Side glowing mullioned windows
    const winGeo = new THREE.BoxGeometry(0.022, 0.075, 0.075);
    for (const wx of [-0.192, 0.192]) {
      const win = new THREE.Mesh(winGeo, mats.warmWindow);
      win.position.set(wx, 0.21, 0);
      group.add(win);
    }
  }

  return group;
}

/**
 * Miniature medieval City Citadel (12+ distinct parts):
 * Terraced stone courtyard, Great Hall, tall crenellated Watchtower, spire cap,
 * side wing, arched gatehouse, warm glowing windows, and faction pennant banner.
 */
export function createCityMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const mainMat = color === 'ghost' ? mats.ghostValid : mats.factionMain[color];
  const trimMat = color === 'ghost' ? mats.ghostValid : mats.factionTrim[color];
  const isGhost = color === 'ghost';
  const stone = isGhost ? mainMat : mats.stoneFoundation;

  // 1. Terraced stone citadel base
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.52), stone);
  base.position.y = 0.045;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Great Hall body
  const hall = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.4), mainMat);
  hall.position.set(-0.08, 0.24, 0.02);
  hall.castShadow = true;
  hall.receiveShadow = true;
  group.add(hall);

  // 3. Great Hall steep gabled roof
  const hallRoofShape = new THREE.Shape();
  hallRoofShape.moveTo(-0.23, 0);
  hallRoofShape.lineTo(0, 0.22);
  hallRoofShape.lineTo(0.23, 0);
  hallRoofShape.closePath();
  const hallRoofGeo = new THREE.ExtrudeGeometry(hallRoofShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  hallRoofGeo.center();
  hallRoofGeo.rotateY(Math.PI / 2);
  const hallRoof = new THREE.Mesh(hallRoofGeo, trimMat);
  hallRoof.position.set(-0.08, 0.48, 0.02);
  hallRoof.castShadow = true;
  group.add(hallRoof);

  // 4. Tall Stone Watchtower Keep
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.24), stone);
  tower.position.set(0.18, 0.4, -0.06);
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // 5. Tower crenellated crown collar + battlements
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.28), stone);
  collar.position.set(0.18, 0.72, -0.06);
  collar.castShadow = true;
  group.add(collar);

  const merlonGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  for (const mx of [-0.1, 0.1]) {
    for (const mz of [-0.1, 0.1]) {
      const merlon = new THREE.Mesh(merlonGeo, stone);
      merlon.position.set(0.18 + mx, 0.78, -0.06 + mz);
      group.add(merlon);
    }
  }

  // 6. Tower pointed pyramidal spire
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.26, 4), trimMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0.18, 0.88, -0.06);
  spire.castShadow = true;
  group.add(spire);

  // 7. Brass flagpole + faction pennant banner
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8),
    isGhost ? trimMat : mats.brassAccent,
  );
  pole.position.set(0.18, 1.07, -0.06);
  group.add(pole);

  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.015),
    mainMat,
  );
  banner.position.set(0.26, 1.12, -0.06);
  group.add(banner);

  // 8. Side annex wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), mainMat);
  wing.position.set(0.16, 0.19, 0.14);
  wing.castShadow = true;
  group.add(wing);

  const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.15, 4), trimMat);
  wingRoof.rotation.y = Math.PI / 4;
  wingRoof.position.set(0.16, 0.36, 0.14);
  wingRoof.castShadow = true;
  group.add(wingRoof);

  if (!isGhost) {
    // 9. Arched gatehouse door & glowing windows
    const gate = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.16, 0.03),
      mats.timberBeam,
    );
    gate.position.set(-0.08, 0.16, 0.22);
    group.add(gate);

    const winGeo = new THREE.BoxGeometry(0.045, 0.08, 0.025);
    for (const [wx, wy, wz] of [
      [-0.16, 0.28, 0.225],
      [0.0, 0.28, 0.225],
      [0.18, 0.56, 0.065],
      [0.18, 0.42, 0.065],
    ] as const) {
      const win = new THREE.Mesh(winGeo, mats.warmWindow);
      win.position.set(wx, wy, wz);
      group.add(win);
    }

    // 10. Chimney on great hall
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.22, 0.07),
      mats.chimneyBrick,
    );
    chimney.position.set(-0.18, 0.56, -0.08);
    group.add(chimney);
  }

  return group;
}

/**
 * Carved hooded Robber Pawn with brass pedestal ring and lathe-turned cloak.
 */
export function createRobberMesh(mats: PieceMaterials): THREE.Group {
  const group = new THREE.Group();

  // Weighted brass base ring
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.27, 0.07, 20),
    mats.brassAccent,
  );
  base.position.y = 0.035;
  base.castShadow = true;
  group.add(base);

  // Lathe-turned cloak silhouette
  const pts = [
    new THREE.Vector2(0, 0.07),
    new THREE.Vector2(0.22, 0.07),
    new THREE.Vector2(0.19, 0.25),
    new THREE.Vector2(0.13, 0.52),
    new THREE.Vector2(0.16, 0.62),
    new THREE.Vector2(0.11, 0.72),
    new THREE.Vector2(0, 0.74),
  ];
  const cloak = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mats.robberCloak);
  cloak.castShadow = true;
  cloak.receiveShadow = true;
  group.add(cloak);

  // Hooded head cowl tilted slightly forward
  const hood = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.26, 14),
    mats.robberCloak,
  );
  hood.position.set(0, 0.8, 0.02);
  hood.rotation.x = 0.22;
  hood.castShadow = true;
  group.add(hood);

  return group;
}

/**
 * Miniature wooden harbor pier + merchant ship with trade-ratio sail sign.
 */
export function createHarborMesh(
  kind: HarborKind,
  textures: ProceduralTextureSet,
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();

  // Wooden dock pier extending from island edge toward ship
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.05, 0.22),
    mats.timberBeam,
  );
  pierDeck.position.set(-0.34, 0.08, 0);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  group.add(pierDeck);

  // Dock pilings
  const pilingGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.34, 8);
  for (const px of [-0.54, -0.34, -0.14]) {
    for (const pz of [-0.085, 0.085]) {
      const piling = new THREE.Mesh(pilingGeo, mats.timberBeam);
      piling.position.set(px, -0.03, pz);
      group.add(piling);
    }
  }

  // Merchant Ship Cog floating near pier
  const shipGroup = new THREE.Group();
  shipGroup.position.set(0.1, 0.02, 0);
  shipGroup.rotation.y = Math.PI / 2;

  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0.34);
  hullShape.quadraticCurveTo(0.17, 0.12, 0.14, -0.26);
  hullShape.lineTo(-0.14, -0.26);
  hullShape.quadraticCurveTo(-0.17, 0.12, 0, 0.34);

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, mats.timberBeam);
  hull.position.y = 0.08;
  hull.castShadow = true;
  shipGroup.add(hull);

  // Mast & yardarm
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.56, 8),
    mats.timberBeam,
  );
  mast.position.y = 0.34;
  mast.castShadow = true;
  shipGroup.add(mast);

  // Billowing Sail bearing the harbor sign texture
  const sailMat = new THREE.MeshStandardMaterial({
    map: textures.harborSigns.get(kind)!,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), sailMat);
  sail.position.set(0, 0.4, 0.04);
  sail.castShadow = true;
  shipGroup.add(sail);

  group.add(shipGroup);
  return group;
}

/**
 * Creates a rounded-edge 3D wooden/ivory die mesh with 6 face materials mapped 1..6.
 */
export function createDieMesh(textures: ProceduralTextureSet): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.56, 0.56, 0.56, 2, 2, 2);
  // Subtle rounded-corner puff
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length();
    v.normalize().multiplyScalar(THREE.MathUtils.lerp(len, 0.44, 0.25));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // Three.js BoxGeometry material order: +X(3), -X(4), +Y(1), -Y(6), +Z(2), -Z(5)
  const faceOrder = [3, 4, 1, 6, 2, 5];
  const materials = faceOrder.map(
    (num) =>
      new THREE.MeshStandardMaterial({
        map: textures.diceFaces[num - 1],
        roughness: 0.32,
        metalness: 0.05,
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
