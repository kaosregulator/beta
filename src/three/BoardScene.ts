import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PublicGameState } from '../game/types';
import { generateBoard } from '../game/boardGen';
import {
  createCityMesh,
  createDieMesh,
  createHarborMesh,
  createPieceMaterials,
  createRoadMesh,
  createRobberMesh,
  createSettlementMesh,
  getDieRotationForValue,
  type PieceMaterials,
} from './pieces';
import {
  buildHexTileGroup,
  createCoastalShipMesh,
  createTabletopAndOcean,
  createTerrainAssets,
  type TerrainAssets,
} from './terrain';
import { createProceduralTextureSet, type ProceduralTextureSet } from './textures';
import type { QualityPreset } from '../store/useGameStore';

export interface ValidHighlights {
  vertices: string[];
  edges: string[];
  cities: string[];
  robberHexes: string[];
}

export interface BoardInteractionCallbacks {
  onSelectVertex: (vertexId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectHex: (hexId: string) => void;
}

interface BurstParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  scale: number;
}

const _vec3 = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const MAX_BURST_PARTICLES = 64;
const MOTE_COUNT = 56;

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class BoardSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private textures: ProceduralTextureSet;
  private terrainAssets: TerrainAssets;
  private pieceMats: PieceMaterials;

  private boardGroup = new THREE.Group();
  private hexGroup = new THREE.Group();
  private harborGroup = new THREE.Group();
  private piecesGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();
  private diceGroup = new THREE.Group();

  private oceanUniforms: { uTime: { value: number } };
  private swayTrees: THREE.Object3D[] = [];
  private windmills: THREE.Object3D[] = [];
  private harborShips: THREE.Object3D[] = [];
  private cityBanners: THREE.Object3D[] = [];
  private coastalShip: THREE.Group;

  private ambientMotes: THREE.InstancedMesh;
  private moteOffsets: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];

  private burstMesh: THREE.InstancedMesh;
  private burstParticles: BurstParticle[] = [];

  private robberMesh: THREE.Group;
  private robberTargetPos = new THREE.Vector3(0, 0.25, 0);

  private die1: THREE.Mesh;
  private die2: THREE.Mesh;
  private diceAnimTime = -1;
  private lastDiceSeq = 0;
  private die1TargetRot = new THREE.Euler();
  private die2TargetRot = new THREE.Euler();

  private builtVertices = new Map<
    string,
    { ownerId: string; type: 'settlement' | 'city'; mesh: THREE.Group; spawnAge: number }
  >();
  private builtEdges = new Map<
    string,
    { ownerId: string; mesh: THREE.Group; spawnAge: number }
  >();

  private interactables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private hoveredProxy: THREE.Object3D | null = null;
  private hoverGhost: THREE.Group | null = null;

  private callbacksRef: { current: BoardInteractionCallbacks };
  private mode: 'title' | 'game' = 'title';
  private quality: QualityPreset = 'high';
  private reducedMotion = false;
  private autoCameraFocus = true;
  private currentBoardSignature = '';
  private currentHexesCache: PublicGameState['hexes'] = [];

  private cameraPresetTarget: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private startTimeMs = performance.now();
  private lastTimeMs = performance.now();
  private frameId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private keyLight: THREE.DirectionalLight;

  constructor(
    container: HTMLElement,
    callbacksRef: { current: BoardInteractionCallbacks },
  ) {
    this.container = container;
    this.callbacksRef = callbacksRef;
    this.isSoftwareGl = detectSoftwareGl();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1822);
    this.scene.fog = new THREE.FogExp2(0x0d1822, 0.017);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    this.camera.position.set(0, 14.9, 17.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 7.5;
    this.controls.maxDistance = 28;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.target.set(0, 0.15, 0.65);
    this.controls.addEventListener('start', () => {
      this.cameraPresetTarget = null;
    });

    // Studio warm/cool 3-point lighting rig
    const hemi = new THREE.HemisphereLight(0xb5d3ef, 0x3b2c1e, 0.88);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 2.05);
    this.keyLight.position.set(9, 15, 8);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const d = 10.5;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 36;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0x7eb8e6, 0.78);
    rimLight.position.set(-10, 8, -9);
    this.scene.add(rimLight);

    // Build procedural textures & material libraries
    this.textures = createProceduralTextureSet(this.renderer);
    this.terrainAssets = createTerrainAssets(this.textures);
    this.pieceMats = createPieceMaterials(this.textures);

    const { group: tableGroup, oceanUniforms } = createTabletopAndOcean(this.textures);
    this.oceanUniforms = oceanUniforms;
    this.scene.add(tableGroup);

    this.boardGroup.add(
      this.hexGroup,
      this.harborGroup,
      this.piecesGroup,
      this.highlightGroup,
      this.diceGroup,
    );
    this.scene.add(this.boardGroup);

    // Roaming miniature merchant schooner sailing the outer sea ring
    this.coastalShip = createCoastalShipMesh(this.textures);
    this.coastalShip.position.set(8.6, 0.02, 0);
    this.scene.add(this.coastalShip);

    // Pooled instanced atmospheric pollen / sea-mist motes
    const moteGeo = new THREE.OctahedronGeometry(0.036, 0);
    const moteMat = new THREE.MeshBasicMaterial({
      color: 0xf7e6b2,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.ambientMotes = new THREE.InstancedMesh(moteGeo, moteMat, MOTE_COUNT);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const ang = (i / MOTE_COUNT) * Math.PI * 2 + (i % 5) * 0.4;
      const rad = 1.2 + ((i * 37) % 80) * 0.095;
      this.moteOffsets.push({
        x: Math.cos(ang) * rad,
        y: 0.8 + ((i * 19) % 24) * 0.14,
        z: Math.sin(ang) * rad,
        phase: i * 0.71,
        speed: 0.4 + (i % 4) * 0.15,
      });
    }
    this.scene.add(this.ambientMotes);

    // Pooled instanced sparkle burst particles for yields & city builds
    const burstGeo = new THREE.OctahedronGeometry(0.065, 0);
    const burstMat = new THREE.MeshBasicMaterial({
      color: 0xffd766,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.burstMesh = new THREE.InstancedMesh(burstGeo, burstMat, MAX_BURST_PARTICLES);
    this.burstMesh.count = 0;
    this.scene.add(this.burstMesh);

    this.robberMesh = createRobberMesh(this.pieceMats);
    this.robberMesh.position.copy(this.robberTargetPos);
    this.piecesGroup.add(this.robberMesh);

    // Two 3D dice sitting on the felt-lined wooden dice tray
    this.die1 = createDieMesh(this.textures);
    this.die2 = createDieMesh(this.textures);
    this.die1.position.set(8.98, 0.76, 2.66);
    this.die2.position.set(9.58, 0.76, 2.08);
    this.die1.rotation.copy(getDieRotationForValue(5));
    this.die2.rotation.copy(getDieRotationForValue(6));
    this.diceGroup.add(this.die1, this.die2);

    // Load showcase island immediately for Title Screen
    const showcase = generateBoard('standard');
    this.rebuildTerrain(showcase.hexes, showcase.harbors);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.tick();
  }

  private bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private onContextRestored = () => {
    this.handleResize();
  };

  private handleResize() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private updatePointerNDC(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== 'game' || this.interactables.length === 0) {
      this.clearHover();
      return;
    }
    this.updatePointerNDC(e);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    const hit = hits[0]?.object ?? null;

    if (hit !== this.hoveredProxy) {
      this.clearHover();
      if (hit) {
        this.hoveredProxy = hit;
        this.renderer.domElement.style.cursor = 'pointer';
        const kind = hit.userData.kind as 'vertex' | 'edge' | 'city' | 'hex';
        if (kind === 'vertex') {
          this.hoverGhost = createSettlementMesh('ghost', this.pieceMats);
          this.hoverGhost.position.copy(hit.position);
          this.hoverGhost.position.y = 0.25;
          this.highlightGroup.add(this.hoverGhost);
        } else if (kind === 'city') {
          this.hoverGhost = createCityMesh('ghost', this.pieceMats);
          this.hoverGhost.position.copy(hit.position);
          this.hoverGhost.position.y = 0.25;
          this.highlightGroup.add(this.hoverGhost);
        } else if (kind === 'edge') {
          this.hoverGhost = createRoadMesh('ghost', this.pieceMats);
          this.hoverGhost.position.copy(hit.position);
          this.hoverGhost.position.y = 0.25;
          this.hoverGhost.rotation.y = -(hit.userData.angle ?? 0);
          this.highlightGroup.add(this.hoverGhost);
        }
      }
    }
  };

  private clearHover() {
    if (this.hoverGhost) {
      this.highlightGroup.remove(this.hoverGhost);
      this.hoverGhost = null;
    }
    this.hoveredProxy = null;
    this.renderer.domElement.style.cursor = 'grab';
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.mode !== 'game') return;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    if (dist > 8) return;

    this.updatePointerNDC(e);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    if (hits.length === 0) return;

    const target = hits[0].object;
    const kind = target.userData.kind as 'vertex' | 'edge' | 'city' | 'hex';
    const id = target.userData.id as string;

    if (kind === 'vertex' || kind === 'city') {
      this.callbacksRef.current.onSelectVertex(id);
    } else if (kind === 'edge') {
      this.callbacksRef.current.onSelectEdge(id);
    } else if (kind === 'hex') {
      this.callbacksRef.current.onSelectHex(id);
    }
  };

  private spawnBurst(x: number, y: number, z: number, count: number) {
    if (this.reducedMotion || this.quality === 'reduced') return;
    for (let i = 0; i < count; i++) {
      if (this.burstParticles.length >= MAX_BURST_PARTICLES) {
        this.burstParticles.shift();
      }
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 0.35 + Math.random() * 0.65;
      this.burstParticles.push({
        x,
        y,
        z,
        vx: Math.cos(ang) * spd,
        vy: 1.2 + Math.random() * 0.9,
        vz: Math.sin(ang) * spd,
        age: 0,
        life: 0.75 + Math.random() * 0.35,
        scale: 0.75 + Math.random() * 0.6,
      });
    }
  }

  public setMode(mode: 'title' | 'game') {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'game') {
      if (!this.reducedMotion && !this.isSoftwareGl) {
        // Gentle reveal sweep into isometric table view
        this.camera.position.set(-7.5, 17.5, 18.2);
        this.controls.target.set(0, 0.15, 0);
      }
      this.setCameraPreset('iso');
    }
  }

  public setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.ambientMotes.visible = !reducedMotion && this.quality !== 'reduced';
  }

  public setAutoCameraFocus(autoFocus: boolean) {
    this.autoCameraFocus = autoFocus;
  }

  public setQuality(quality: QualityPreset) {
    this.quality = quality;
    this.ambientMotes.visible = !this.reducedMotion && quality !== 'reduced';
    if (this.isSoftwareGl) return;
    if (quality === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.keyLight.castShadow = true;
    } else if (quality === 'balanced') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.keyLight.castShadow = true;
    } else {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.keyLight.castShadow = false;
    }
  }

  public setCameraPreset(preset: 'reset' | 'top' | 'iso' | 'dice') {
    if (preset === 'top') {
      this.cameraPresetTarget = {
        pos: new THREE.Vector3(0, 20.5, 1.8),
        target: new THREE.Vector3(0, 0.2, 0),
      };
    } else if (preset === 'dice') {
      this.cameraPresetTarget = {
        pos: new THREE.Vector3(11.8, 5.2, 5.8),
        target: new THREE.Vector3(9.3, 0.55, 2.35),
      };
    } else {
      this.cameraPresetTarget = {
        pos: new THREE.Vector3(0, 14.9, 17.5),
        target: new THREE.Vector3(0, 0.15, 0.65),
      };
    }
  }

  private rebuildTerrain(
    hexes: PublicGameState['hexes'],
    harbors: PublicGameState['harbors'],
  ) {
    const sig = hexes.map((h) => `${h.id}:${h.terrain}:${h.numberToken}`).join('|');
    if (sig === this.currentBoardSignature) return;
    this.currentBoardSignature = sig;
    this.currentHexesCache = hexes;

    this.hexGroup.clear();
    this.harborGroup.clear();
    this.swayTrees = [];
    this.windmills = [];
    this.harborShips = [];
    this.cityBanners = [];

    for (const hex of hexes) {
      const built = buildHexTileGroup(hex, this.terrainAssets, this.textures);
      this.hexGroup.add(built.group);
      this.swayTrees.push(...built.swayTrees);
      this.windmills.push(...built.windmills);
    }

    for (const harbor of harbors) {
      const hMesh = createHarborMesh(harbor.kind, this.textures, this.pieceMats);
      hMesh.position.set(harbor.x, 0.02, harbor.z);
      hMesh.rotation.y = -harbor.angle;
      this.harborGroup.add(hMesh);
      if (hMesh.userData.shipGroup) {
        hMesh.userData.shipGroup.userData.bobPhase = harbor.x * 0.7 + harbor.z * 0.5;
        this.harborShips.push(hMesh.userData.shipGroup);
      }
    }

    this.builtVertices.forEach((v) => this.piecesGroup.remove(v.mesh));
    this.builtVertices.clear();
    this.builtEdges.forEach((e) => this.piecesGroup.remove(e.mesh));
    this.builtEdges.clear();
  }

  public syncGameState(
    game: PublicGameState | null,
    highlights: ValidHighlights,
  ) {
    if (!game) {
      this.updateHighlights([], [], [], [], game);
      return;
    }

    this.rebuildTerrain(game.hexes, game.harbors);

    const playerColorById = new Map(game.players.map((p) => [p.id, p.color]));

    // Sync buildings (settlements & city upgrades)
    for (const v of game.vertices) {
      const existing = this.builtVertices.get(v.id);
      if (!v.building) {
        if (existing) {
          this.piecesGroup.remove(existing.mesh);
          this.builtVertices.delete(v.id);
        }
        continue;
      }

      if (
        !existing ||
        existing.ownerId !== v.building.ownerId ||
        existing.type !== v.building.type
      ) {
        const wasUpgrade = Boolean(existing && v.building.type === 'city');
        if (existing) this.piecesGroup.remove(existing.mesh);
        const color = playerColorById.get(v.building.ownerId) ?? 'crimson';
        const mesh =
          v.building.type === 'city'
            ? createCityMesh(color, this.pieceMats)
            : createSettlementMesh(color, this.pieceMats);
        mesh.position.set(v.x, 0.24, v.z);
        mesh.rotation.y = Math.atan2(-v.x, -v.z);
        mesh.scale.setScalar(this.reducedMotion ? 1 : 0.01);
        this.piecesGroup.add(mesh);
        this.builtVertices.set(v.id, {
          ownerId: v.building.ownerId,
          type: v.building.type,
          mesh,
          spawnAge: this.reducedMotion ? 0.5 : 0,
        });
        if (mesh.userData.bannerPivot) {
          this.cityBanners.push(mesh.userData.bannerPivot);
        }
        if (wasUpgrade) {
          this.spawnBurst(v.x, 0.75, v.z, 12);
        }
      }
    }

    // Sync roads
    for (const e of game.edges) {
      const existing = this.builtEdges.get(e.id);
      if (!e.ownerId) {
        if (existing) {
          this.piecesGroup.remove(existing.mesh);
          this.builtEdges.delete(e.id);
        }
        continue;
      }
      if (!existing || existing.ownerId !== e.ownerId) {
        if (existing) this.piecesGroup.remove(existing.mesh);
        const color = playerColorById.get(e.ownerId) ?? 'crimson';
        const mesh = createRoadMesh(color, this.pieceMats);
        mesh.position.set(e.x, 0.245, e.z);
        mesh.rotation.y = -e.angle;
        mesh.scale.setScalar(this.reducedMotion ? 1 : 0.01);
        this.piecesGroup.add(mesh);
        this.builtEdges.set(e.id, {
          ownerId: e.ownerId,
          mesh,
          spawnAge: this.reducedMotion ? 0.35 : 0,
        });
      }
    }

    // Sync robber position
    const robberHex = game.hexes.find((h) => h.hasRobber);
    if (robberHex) {
      this.robberTargetPos.set(robberHex.x + 0.32, 0.28, robberHex.z + 0.28);
    }

    // Trigger 3D dice roll animation & producing hex harvest sparkles
    if (game.dice && game.diceRollSeq !== this.lastDiceSeq) {
      this.lastDiceSeq = game.diceRollSeq;
      this.die1TargetRot.copy(getDieRotationForValue(game.dice[0]));
      this.die2TargetRot.copy(getDieRotationForValue(game.dice[1]));
      this.diceAnimTime = this.reducedMotion ? -1 : 0;
      if (this.reducedMotion) {
        this.die1.rotation.copy(this.die1TargetRot);
        this.die2.rotation.copy(this.die2TargetRot);
      }

      const sum = game.dice[0] + game.dice[1];
      if (sum !== 7) {
        for (const h of game.hexes) {
          if (h.numberToken === sum && !h.hasRobber) {
            this.spawnBurst(h.x, 0.55, h.z, 6);
          }
        }
      }
      if (this.autoCameraFocus && !this.reducedMotion && !this.isSoftwareGl && this.mode === 'game') {
        this.cameraPresetTarget = {
          pos: new THREE.Vector3(1.8, 14.4, 16.9),
          target: new THREE.Vector3(0.6, 0.18, 0.65),
        };
      }
    }

    this.updateHighlights(
      highlights.vertices,
      highlights.edges,
      highlights.cities,
      highlights.robberHexes,
      game,
    );
  }

  private updateHighlights(
    vertexIds: string[],
    edgeIds: string[],
    cityIds: string[],
    robberHexIds: string[],
    game: PublicGameState | null,
  ) {
    this.clearHover();
    this.highlightGroup.clear();
    this.interactables = [];

    if (!game) return;

    const ringGeo = new THREE.RingGeometry(0.16, 0.27, 20);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf7c954,
      side: THREE.DoubleSide,
    });
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

    const vertexById = new Map(game.vertices.map((v) => [v.id, v]));
    for (const vId of vertexIds) {
      const v = vertexById.get(vId);
      if (!v) continue;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(v.x, 0.285, v.z);
      this.highlightGroup.add(ring);

      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.4, 8), proxyMat);
      proxy.position.set(v.x, 0.35, v.z);
      proxy.userData = { kind: 'vertex', id: vId };
      this.highlightGroup.add(proxy);
      this.interactables.push(proxy);
    }

    for (const vId of cityIds) {
      const v = vertexById.get(vId);
      if (!v) continue;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.41, 24).rotateX(-Math.PI / 2),
        ringMat,
      );
      ring.position.set(v.x, 0.285, v.z);
      this.highlightGroup.add(ring);

      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.6, 8), proxyMat);
      proxy.position.set(v.x, 0.42, v.z);
      proxy.userData = { kind: 'city', id: vId };
      this.highlightGroup.add(proxy);
      this.interactables.push(proxy);
    }

    const edgeById = new Map(game.edges.map((e) => [e.id, e]));
    const edgeBarGeo = new THREE.BoxGeometry(0.95, 0.05, 0.22);
    const edgeBarMat = new THREE.MeshBasicMaterial({
      color: 0xf7c954,
      transparent: true,
      opacity: 0.74,
    });

    for (const eId of edgeIds) {
      const e = edgeById.get(eId);
      if (!e) continue;
      const marker = new THREE.Mesh(edgeBarGeo, edgeBarMat);
      marker.position.set(e.x, 0.28, e.z);
      marker.rotation.y = -e.angle;
      marker.userData = { kind: 'edge', id: eId, angle: e.angle };
      this.highlightGroup.add(marker);
      this.interactables.push(marker);
    }

    const hexById = new Map(this.currentHexesCache.map((h) => [h.id, h]));
    const hexRingGeo = new THREE.RingGeometry(0.55, 0.74, 6);
    hexRingGeo.rotateX(-Math.PI / 2);
    const robberMat = new THREE.MeshBasicMaterial({
      color: 0xe64937,
      side: THREE.DoubleSide,
    });

    for (const hId of robberHexIds) {
      const h = hexById.get(hId);
      if (!h) continue;
      const ring = new THREE.Mesh(hexRingGeo, robberMat);
      ring.position.set(h.x, 0.31, h.z);
      this.highlightGroup.add(ring);

      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.4, 6), proxyMat);
      proxy.position.set(h.x, 0.38, h.z);
      proxy.userData = { kind: 'hex', id: hId };
      this.highlightGroup.add(proxy);
      this.interactables.push(proxy);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    const elapsed = (now - this.startTimeMs) / 1000;

    // 1. Ocean shader animation (unless reduced quality/motion)
    if (this.quality !== 'reduced' && !this.reducedMotion) {
      this.oceanUniforms.uTime.value = elapsed;
    }

    // 2. Title screen orbital showcase or preset glide
    if (this.mode === 'title' && !this.isSoftwareGl && !this.reducedMotion) {
      const angle = elapsed * 0.14;
      this.camera.position.set(
        Math.sin(angle) * 15.4,
        11.8 + Math.sin(elapsed * 0.25) * 0.6,
        Math.cos(angle) * 15.4,
      );
      this.controls.target.set(0, 0.2, 0);
    } else if (this.cameraPresetTarget) {
      if (this.reducedMotion) {
        this.camera.position.copy(this.cameraPresetTarget.pos);
        this.controls.target.copy(this.cameraPresetTarget.target);
        this.cameraPresetTarget = null;
      } else {
        const k = 6.2;
        const alpha = 1 - Math.exp(-k * dt);
        this.camera.position.lerp(this.cameraPresetTarget.pos, alpha);
        this.controls.target.lerp(this.cameraPresetTarget.target, alpha);
        if (this.camera.position.distanceTo(this.cameraPresetTarget.pos) < 0.05) {
          this.cameraPresetTarget = null;
        }
      }
    }

    this.controls.update();

    // 3. Living diorama micro-motion (wind sway, windmills, bobbing harbor cogs, roaming schooner)
    if (!this.reducedMotion && this.quality !== 'reduced') {
      for (let i = 0; i < this.swayTrees.length; i++) {
        const tree = this.swayTrees[i];
        const phase = (tree.userData.swayPhase as number) || 0;
        tree.rotation.z = Math.sin(elapsed * 1.4 + phase) * 0.032;
      }
      for (let i = 0; i < this.windmills.length; i++) {
        this.windmills[i].rotation.z -= dt * 1.45;
      }
      for (let i = 0; i < this.harborShips.length; i++) {
        const ship = this.harborShips[i];
        const phase = (ship.userData.bobPhase as number) || 0;
        ship.position.y = 0.02 + Math.sin(elapsed * 1.8 + phase) * 0.025;
        ship.rotation.z = Math.sin(elapsed * 1.4 + phase) * 0.045;
      }
      for (let i = 0; i < this.cityBanners.length; i++) {
        this.cityBanners[i].rotation.y = Math.sin(elapsed * 3.1 + i) * 0.22;
      }

      // Coastal merchant schooner cruising outer channel
      const shipAngle = elapsed * 0.085;
      const shipRad = 8.45;
      this.coastalShip.position.set(
        Math.cos(shipAngle) * shipRad,
        0.02 + Math.sin(elapsed * 1.9) * 0.025,
        Math.sin(shipAngle) * shipRad,
      );
      this.coastalShip.rotation.y = -shipAngle;
      this.coastalShip.rotation.z = Math.sin(elapsed * 1.5) * 0.05;

      // Ambient motes float gently
      for (let i = 0; i < MOTE_COUNT; i++) {
        const m = this.moteOffsets[i];
        _dummy.position.set(
          m.x + Math.sin(elapsed * m.speed + m.phase) * 0.22,
          m.y + Math.cos(elapsed * m.speed * 0.8 + m.phase) * 0.14,
          m.z + Math.cos(elapsed * m.speed + m.phase) * 0.22,
        );
        _dummy.rotation.set(elapsed + m.phase, elapsed * 0.5, 0);
        _dummy.scale.setScalar(0.8 + Math.sin(elapsed * 1.6 + m.phase) * 0.25);
        _dummy.updateMatrix();
        this.ambientMotes.setMatrixAt(i, _dummy.matrix);
      }
      this.ambientMotes.instanceMatrix.needsUpdate = true;
    }

    // 4. Resource yield / build sparkle burst particles
    if (this.burstParticles.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < this.burstParticles.length; i++) {
        const p = this.burstParticles[i];
        p.age += dt;
        if (p.age >= p.life) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 1.1 * dt;
        const fade = 1 - p.age / p.life;
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.age * 4, p.age * 3, 0);
        _dummy.scale.setScalar(p.scale * fade);
        _dummy.updateMatrix();
        this.burstMesh.setMatrixAt(writeIdx, _dummy.matrix);
        this.burstParticles[writeIdx] = p;
        writeIdx++;
      }
      this.burstParticles.length = writeIdx;
      this.burstMesh.count = writeIdx;
      this.burstMesh.instanceMatrix.needsUpdate = true;
    } else if (this.burstMesh.count !== 0) {
      this.burstMesh.count = 0;
    }

    // 5. Spring pop-in for newly constructed settlements, cities, and roads
    for (const entry of this.builtVertices.values()) {
      if (entry.spawnAge < 0.5) {
        entry.spawnAge = Math.min(0.5, entry.spawnAge + dt);
        const t = entry.spawnAge / 0.5;
        const s = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2.2);
        entry.mesh.scale.setScalar(Math.max(0.01, s));
      } else {
        entry.mesh.scale.setScalar(1);
      }
    }
    for (const entry of this.builtEdges.values()) {
      if (entry.spawnAge < 0.35) {
        entry.spawnAge = Math.min(0.35, entry.spawnAge + dt);
        const t = entry.spawnAge / 0.35;
        entry.mesh.scale.setScalar(THREE.MathUtils.lerp(0.1, 1, 1 - Math.pow(1 - t, 3)));
      } else {
        entry.mesh.scale.setScalar(1);
      }
    }

    // 6. Robber smooth glide with slight hop
    const distToRobber = this.robberMesh.position.distanceTo(this.robberTargetPos);
    if (distToRobber > 0.01) {
      if (this.reducedMotion) {
        this.robberMesh.position.copy(this.robberTargetPos);
      } else {
        const alpha = 1 - Math.exp(-9 * dt);
        _vec3.copy(this.robberTargetPos);
        this.robberMesh.position.lerp(_vec3, alpha);
        this.robberMesh.position.y =
          this.robberTargetPos.y + Math.sin(Math.min(1, distToRobber) * Math.PI) * 0.55;
      }
    }

    // 7. Physical 3D dice tumble & bounce settle
    if (this.diceAnimTime >= 0) {
      this.diceAnimTime += dt;
      const dur = 0.85;
      if (this.diceAnimTime < dur) {
        const p = this.diceAnimTime / dur;
        const bounce = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 1.65;
        this.die1.position.y = 0.76 + bounce;
        this.die2.position.y = 0.76 + bounce * 0.85;
        this.die1.rotation.x += dt * 16 * (1 - p);
        this.die1.rotation.z += dt * 13 * (1 - p);
        this.die2.rotation.x -= dt * 14 * (1 - p);
        this.die2.rotation.y += dt * 15 * (1 - p);
      } else {
        this.die1.position.y = 0.76;
        this.die2.position.y = 0.76;
        this.die1.rotation.copy(this.die1TargetRot);
        this.die2.rotation.copy(this.die2TargetRot);
        this.diceAnimTime = -1;
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();
    this.ambientMotes.geometry.dispose();
    (this.ambientMotes.material as THREE.Material).dispose();
    this.burstMesh.geometry.dispose();
    (this.burstMesh.material as THREE.Material).dispose();
    this.textures.dispose();
    this.terrainAssets.dispose();
    this.pieceMats.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
