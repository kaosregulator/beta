import * as THREE from 'three';
import { FACTION_META, type FactionColor, type HarborKind } from '../game/types';
import type { ProceduralTextureSet } from './textures';

export interface PieceMaterials {
  factionMain: Record<FactionColor, THREE.MeshStandardMaterial>;
  factionRoof: Record<FactionColor, THREE.MeshStandardMaterial>;
  stoneFoundation: THREE.MeshStandardMaterial;
  timberBeam: THREE.MeshStandardMaterial;
  chimneyBrick: THREE.MeshStandardMaterial;
  warmWindow: THREE.MeshStandardMaterial;
  brassAccent: THREE.MeshStandardMaterial;
  robberCloak: THREE.MeshStandardMaterial;
  robberDangerRing: THREE.MeshBasicMaterial;
  ghostValid: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  sharedGeos: THREE.BufferGeometry[];
  dispose: () => void;
}

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

  (Object.keys(FACTION_META) as FactionColor[]).forEach((color) => {
    const meta = FACTION_META[color];
    factionMain[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.hex),
      roughness: 0.45,
      metalness: 0.06,
      normalMap: textures.woodMahoganyNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
    factionRoof[color] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meta.dark),
      roughness: 0.58,
      metalness: 0.1,
      normalMap: textures.roofSlateNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
    });
  });

  const stoneFoundation = new THREE.MeshStandardMaterial({
    color: 0x99958b,
    map: textures.stoneMasonry,
    normalMap: textures.stoneMasonryNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.86,
    metalness: 0.04,
  });

  const timberBeam = new THREE.MeshStandardMaterial({
    color: 0x5c3c24,
    roughness: 0.74,
    metalness: 0.05,
    normalMap: textures.woodMahoganyNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });

  const chimneyBrick = new THREE.MeshStandardMaterial({
    color: 0x8f4733,
    normalMap: textures.stoneMasonryNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.84,
    metalness: 0.02,
  });

  const warmWindow = new THREE.MeshStandardMaterial({
    color: 0xffd984,
    emissive: 0xd98c24,
    emissiveIntensity: 0.72,
    roughness: 0.22,
    metalness: 0.12,
  });

  const brassAccent = new THREE.MeshStandardMaterial({
    color: 0xd9af57,
    roughness: 0.24,
    metalness: 0.88,
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

  return {
    factionMain,
    factionRoof,
    stoneFoundation,
    timberBeam,
    chimneyBrick,
    warmWindow,
    brassAccent,
    robberCloak,
    robberDangerRing,
    ghostValid,
    contactShadow,
    sharedGeos: [],
    dispose: () => {
      Object.values(factionMain).forEach((m) => m.dispose());
      Object.values(factionRoof).forEach((m) => m.dispose());
      stoneFoundation.dispose();
      timberBeam.dispose();
      chimneyBrick.dispose();
      warmWindow.dispose();
      brassAccent.dispose();
      robberCloak.dispose();
      robberDangerRing.dispose();
      ghostValid.dispose();
      contactShadow.dispose();
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
      new THREE.BoxGeometry(1.12, 0.032, 0.27),
      mats.stoneFoundation,
    );
    stoneBed.position.y = 0.016;
    stoneBed.castShadow = true;
    stoneBed.receiveShadow = true;
    group.add(stoneBed);
  }

  // Beveled trapezoidal painted timber plank
  const profile = new THREE.Shape();
  profile.moveTo(-0.115, 0);
  profile.lineTo(0.115, 0);
  profile.lineTo(0.088, 0.11);
  profile.lineTo(0.032, 0.142);
  profile.lineTo(-0.032, 0.142);
  profile.lineTo(-0.088, 0.11);
  profile.closePath();

  const plankGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.04,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  plankGeo.center();
  plankGeo.rotateY(Math.PI / 2);

  const plank = new THREE.Mesh(plankGeo, mainMat);
  plank.position.y = 0.088;
  plank.castShadow = true;
  plank.receiveShadow = true;
  group.add(plank);

  // Dark carved ridge beam along road center
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.068), roofMat);
  spine.position.y = 0.16;
  spine.castShadow = true;
  group.add(spine);

  // Three timber cross sleepers + brass end medallions
  const sleeperGeo = new THREE.BoxGeometry(0.075, 0.055, 0.25);
  for (const sx of [-0.42, 0, 0.42]) {
    const sleeper = new THREE.Mesh(sleeperGeo, isGhost ? roofMat : mats.timberBeam);
    sleeper.position.set(sx, 0.045, 0);
    sleeper.castShadow = true;
    group.add(sleeper);
  }

  if (!isGhost) {
    const rivetGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8);
    for (const rx of [-0.42, 0.42]) {
      const rivet = new THREE.Mesh(rivetGeo, mats.brassAccent);
      rivet.position.set(rx, 0.172, 0);
      group.add(rivet);
    }
  }

  return group;
}

/**
 * Miniature medieval settlement cottage (14+ distinct sculpted details):
 * Ashlar stone plinth, doorstep, painted timber walls, half-timber corner & diagonal
 * braces, overlapping shingled gable roof + ridge beam, brick chimney + flue pot,
 * arched door, warm windows with timber shutters, and contact shadow.
 */
export function createSettlementMesh(
  color: FactionColor | 'ghost',
  mats: PieceMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const mainMat = color === 'ghost' ? mats.ghostValid : mats.factionMain[color];
  const roofMat = color === 'ghost' ? mats.ghostValid : mats.factionRoof[color];
  const isGhost = color === 'ghost';

  if (!isGhost) {
    addContactShadow(group, 0.72, mats);
  }

  // 1. Stone foundation plinth + doorstep
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.075, 0.4),
    isGhost ? mainMat : mats.stoneFoundation,
  );
  plinth.position.y = 0.038;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Cottage body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.25, 0.33), mainMat);
  body.position.y = 0.2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 3. Corner timber posts + horizontal lintel beam
  const beamGeo = new THREE.BoxGeometry(0.042, 0.26, 0.042);
  for (const bx of [-0.19, 0.19]) {
    for (const bz of [-0.16, 0.16]) {
      const beam = new THREE.Mesh(beamGeo, isGhost ? roofMat : mats.timberBeam);
      beam.position.set(bx, 0.2, bz);
      group.add(beam);
    }
  }

  // 4. Shingled pitched gable roof + ridge crest beam
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.225, 0);
  roofShape.lineTo(0, 0.215);
  roofShape.lineTo(0.225, 0);
  roofShape.lineTo(0.185, -0.028);
  roofShape.lineTo(0, 0.155);
  roofShape.lineTo(-0.185, -0.028);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  roofGeo.center();
  roofGeo.rotateY(Math.PI / 2);

  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.405;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.49, 0.034, 0.042),
    isGhost ? roofMat : mats.timberBeam,
  );
  ridge.position.y = 0.51;
  ridge.castShadow = true;
  group.add(ridge);

  // Solid gable fill prism under roof
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-0.165, 0);
  gableShape.lineTo(0, 0.165);
  gableShape.lineTo(0.165, 0);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.37,
    bevelEnabled: false,
  });
  gableGeo.center();
  gableGeo.rotateY(Math.PI / 2);
  const gable = new THREE.Mesh(gableGeo, mainMat);
  gable.position.y = 0.39;
  group.add(gable);

  // 5. Brick chimney + stone cap + terracotta flue pot
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.21, 0.085),
    isGhost ? mainMat : mats.chimneyBrick,
  );
  chimney.position.set(0.11, 0.46, -0.085);
  chimney.castShadow = true;
  group.add(chimney);

  const chimneyCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.028, 0.105),
    isGhost ? roofMat : mats.stoneFoundation,
  );
  chimneyCap.position.set(0.11, 0.57, -0.085);
  group.add(chimneyCap);

  if (!isGhost) {
    // Stone doorstep
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.032, 0.06),
      mats.stoneFoundation,
    );
    step.position.set(0, 0.06, 0.2);
    group.add(step);

    // Oak front door + timber frame + brass knob
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.15, 0.026),
      mats.timberBeam,
    );
    door.position.set(0, 0.145, 0.17);
    group.add(door);

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 6, 5),
      mats.brassAccent,
    );
    knob.position.set(0.025, 0.14, 0.186);
    group.add(knob);

    // Side glowing mullioned windows + wooden shutters
    const winGeo = new THREE.BoxGeometry(0.022, 0.08, 0.08);
    const shutterGeo = new THREE.BoxGeometry(0.018, 0.085, 0.025);
    for (const wx of [-0.198, 0.198]) {
      const win = new THREE.Mesh(winGeo, mats.warmWindow);
      win.position.set(wx, 0.215, 0);
      group.add(win);

      for (const sz of [-0.056, 0.056]) {
        const shutter = new THREE.Mesh(shutterGeo, mats.timberBeam);
        shutter.position.set(wx, 0.215, sz);
        group.add(shutter);
      }
    }
  }

  return group;
}

/**
 * Unmistakable multi-building Fortified City Citadel:
 * Stepped stone terrace courtyard + curtain parapet, arched gatehouse,
 * Great Hall with dormer & chimney, tall octagonal Watchtower Keep with
 * crenellated battlements, slate spire, brass finial, and wind-fluttered banner.
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
    addContactShadow(group, 0.98, mats);
  }

  // 1. Stepped stone courtyard terrace
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.095, 0.56), stone);
  base.position.y = 0.048;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Perimeter low curtain parapet wall on front edge
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.075, 0.045), stone);
  parapet.position.set(0, 0.125, 0.255);
  parapet.castShadow = true;
  group.add(parapet);

  // 2. Great Hall body + timber belt course
  const hall = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.31, 0.4), mainMat);
  hall.position.set(-0.09, 0.25, 0.01);
  hall.castShadow = true;
  hall.receiveShadow = true;
  group.add(hall);

  // 3. Great Hall steep slate gabled roof
  const hallRoofShape = new THREE.Shape();
  hallRoofShape.moveTo(-0.23, 0);
  hallRoofShape.lineTo(0, 0.23);
  hallRoofShape.lineTo(0.23, 0);
  hallRoofShape.closePath();
  const hallRoofGeo = new THREE.ExtrudeGeometry(hallRoofShape, {
    depth: 0.43,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  hallRoofGeo.center();
  hallRoofGeo.rotateY(Math.PI / 2);
  const hallRoof = new THREE.Mesh(hallRoofGeo, roofMat);
  hallRoof.position.set(-0.09, 0.5, 0.01);
  hallRoof.castShadow = true;
  group.add(hallRoof);

  // 4. Tall Octagonal Stone Watchtower Keep
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.16, 0.64, 8), stone);
  tower.position.set(0.19, 0.415, -0.06);
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // 5. Corbelled octagonal battlement collar + 8 merlons
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.15, 0.075, 8), stone);
  collar.position.set(0.19, 0.74, -0.06);
  collar.castShadow = true;
  group.add(collar);

  const merlonGeo = new THREE.BoxGeometry(0.055, 0.065, 0.055);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const merlon = new THREE.Mesh(merlonGeo, stone);
    merlon.position.set(
      0.19 + Math.cos(a) * 0.148,
      0.8,
      -0.06 + Math.sin(a) * 0.148,
    );
    merlon.rotation.y = -a;
    group.add(merlon);
  }

  // 6. Octagonal slate spire + brass finial orb
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.29, 8), roofMat);
  spire.position.set(0.19, 0.91, -0.06);
  spire.castShadow = true;
  group.add(spire);

  // 7. Brass flagpole + billowing faction pennant banner
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.24, 8),
    isGhost ? roofMat : mats.brassAccent,
  );
  pole.position.set(0.19, 1.13, -0.06);
  group.add(pole);

  const bannerPivot = new THREE.Group();
  bannerPivot.position.set(0.19, 1.19, -0.06);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.085, 0.016), mainMat);
  banner.position.set(0.095, 0, 0);
  bannerPivot.add(banner);
  group.add(bannerPivot);
  group.userData.bannerPivot = bannerPivot;

  // 8. Corner annex bastion wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.21, 0.23), mainMat);
  wing.position.set(0.17, 0.2, 0.15);
  wing.castShadow = true;
  group.add(wing);

  const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 4), roofMat);
  wingRoof.rotation.y = Math.PI / 4;
  wingRoof.position.set(0.17, 0.38, 0.15);
  wingRoof.castShadow = true;
  group.add(wingRoof);

  if (!isGhost) {
    // 9. Arched portcullis gatehouse + warm hearth windows
    const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.045), stone);
    gateFrame.position.set(-0.09, 0.17, 0.22);
    group.add(gateFrame);

    const gateDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.145, 0.025),
      mats.timberBeam,
    );
    gateDoor.position.set(-0.09, 0.155, 0.238);
    group.add(gateDoor);

    const winGeo = new THREE.BoxGeometry(0.045, 0.085, 0.026);
    for (const [wx, wy, wz] of [
      [-0.18, 0.29, 0.215],
      [0.0, 0.29, 0.215],
      [0.19, 0.56, 0.09],
      [0.19, 0.42, 0.09],
      [0.17, 0.22, 0.268],
    ] as const) {
      const win = new THREE.Mesh(winGeo, mats.warmWindow);
      win.position.set(wx, wy, wz);
      group.add(win);
    }

    // Brick chimney on Great Hall
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.22, 0.075),
      mats.chimneyBrick,
    );
    chimney.position.set(-0.2, 0.58, -0.09);
    group.add(chimney);
  }

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
