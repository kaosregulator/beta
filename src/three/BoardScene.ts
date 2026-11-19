import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PublicGameState, TerrainType } from '../game/types';
import { generateBoard } from '../game/boardGen';
import {
  BLOOM_LAYER,
  DEFAULT_SETTLEMENT_HOUSE_SET,
  createCityMesh,
  createDieMesh,
  createHarborMesh,
  createPieceMaterials,
  createRoadMesh,
  createRobberMesh,
  createSettlementMesh,
  disposePieceGroupGeometries,
  getDieRotationForValue,
  type PieceMaterials,
  type SettlementHouseSetConfig,
} from './pieces';
import {
  buildHexTileGroup,
  createCoastalShipMesh,
  createTabletopAndOcean,
  createTerrainAssets,
  DEFAULT_TERRAIN_ELEVATION_PROFILES,
  DEFAULT_TERRAIN_MESH_FIDELITY,
  type TerrainAssets,
  type TerrainElevationProfile,
  type TerrainMeshFidelityConfig,
  type TerrainTileBuildResult,
} from './terrain';
import { createProceduralTextureSet, type ProceduralTextureSet } from './textures';
import type { QualityPreset } from '../store/useGameStore';

export interface ValidHighlights {
  vertices: string[];
  edges: string[];
  cities: string[];
  robberHexes: string[];
  flipHexes: string[];
}

export interface BoardInteractionCallbacks {
  onSelectVertex: (vertexId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectHex: (hexId: string) => void;
}

export interface PostProcessingPipeline {
  render: (focusDistance: number, quality: QualityPreset, reducedMotion: boolean) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  dispose: () => void;
}

export interface TileFlipAnimationConfig {
  randomizedCascade: boolean;
  staggerIntervalSec: number;
  flipSpeed: number;
  arcLiftHeight: number;
  rollWobbleRad: number;
  preGameShuffleRipple: boolean;
}

export const DEFAULT_TILE_FLIP_ANIMATION: TileFlipAnimationConfig = {
  randomizedCascade: true,
  staggerIntervalSec: 0.048,
  flipSpeed: 2.05,
  arcLiftHeight: 0.56,
  rollWobbleRad: 0.24,
  preGameShuffleRipple: true,
};

export interface BoardSceneOptions {
  terrainElevationProfiles?: Record<TerrainType, TerrainElevationProfile>;
  terrainMeshFidelity?: TerrainMeshFidelityConfig;
  settlementHouseSet?: SettlementHouseSetConfig;
  tileFlipAnimation?: TileFlipAnimationConfig;
  createPostProcessing?: (ctx: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    width: number;
    height: number;
    pixelRatio: number;
  }) => PostProcessingPipeline;
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

interface BuildEffect {
  ring: THREE.Mesh;
  outerRing: THREE.Mesh | null;
  beam: THREE.Mesh;
  age: number;
  life: number;
  maxScale: number;
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
  private buildEffectGroup = new THREE.Group();
  private buildEffectRingGeo: THREE.RingGeometry;
  private buildEffectBeamGeo: THREE.CylinderGeometry;
  private buildEffects: BuildEffect[] = [];

  private robberMesh: THREE.Group;
  private robberTargetPos = new THREE.Vector3(0, 0.355, 0);

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

  private elevationProfiles: Record<TerrainType, TerrainElevationProfile>;
  private meshFidelity: TerrainMeshFidelityConfig;
  private settlementHouseSet: SettlementHouseSetConfig;
  private tileFlipConfig: TileFlipAnimationConfig;
  private tileEntries: Array<
    TerrainTileBuildResult & {
      targetRevealed: boolean;
      flipProgress: number;
      flipDelay: number;
      flipRollDir: number;
      flipYawDir: number;
      shuffleDelayRatio: number;
      hexX: number;
      hexZ: number;
      burstSpawned: boolean;
    }
  > = [];
  private tileEntryById = new Map<
    string,
    TerrainTileBuildResult & {
      targetRevealed: boolean;
      flipProgress: number;
      flipDelay: number;
      flipRollDir: number;
      flipYawDir: number;
      shuffleDelayRatio: number;
      hexX: number;
      hexZ: number;
      burstSpawned: boolean;
    }
  >();
  private lastShuffleSeq = 0;
  private shuffleAnimTime = -1;
  private hasPlayedInitialBlindDeal = false;
  private hoverFlipRing: THREE.Mesh | null = null;
  private hoverFlipRingGeo: THREE.RingGeometry;
  private hoverFlipRingMat: THREE.MeshBasicMaterial;

  private tooltipWorldPos: THREE.Vector3 | null = null;
  private onTooltipScreenPos: ((pos: { x: number; y: number; visible: boolean } | null) => void) | null =
    null;
  private lastProjectedTooltip: { x: number; y: number; visible: boolean } | null = null;

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
  private postProcessing: PostProcessingPipeline | null = null;

  constructor(
    container: HTMLElement,
    callbacksRef: { current: BoardInteractionCallbacks },
    options?: BoardSceneOptions,
  ) {
    this.container = container;
    this.callbacksRef = callbacksRef;
    this.elevationProfiles =
      options?.terrainElevationProfiles ?? DEFAULT_TERRAIN_ELEVATION_PROFILES;
    this.meshFidelity =
      options?.terrainMeshFidelity ?? DEFAULT_TERRAIN_MESH_FIDELITY;
    this.settlementHouseSet =
      options?.settlementHouseSet ?? DEFAULT_SETTLEMENT_HOUSE_SET;
    this.tileFlipConfig =
      options?.tileFlipAnimation ?? DEFAULT_TILE_FLIP_ANIMATION;
    this.isSoftwareGl = detectSoftwareGl();

    this.hoverFlipRingGeo = new THREE.RingGeometry(1.16, 1.31, 6);
    this.hoverFlipRingGeo.rotateX(-Math.PI / 2);
    this.hoverFlipRingMat = new THREE.MeshBasicMaterial({
      color: 0xf7c954,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
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
    this.scene.environmentIntensity = 0.52;
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

    // Studio warm/cool 3-point lighting rig (sculpting sun angle for rich bevel & terrain shadows)
    const hemi = new THREE.HemisphereLight(0xa6ceec, 0x2f2318, 0.58);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff0d1, 2.0);
    this.keyLight.position.set(11.5, 11.5, 9.0);
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

    const rimLight = new THREE.DirectionalLight(0xffdea6, 0.65);
    rimLight.position.set(-10, 7.5, -9);
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
    this.burstMesh.layers.enable(BLOOM_LAYER);
    this.scene.add(this.burstMesh);

    this.buildEffectRingGeo = new THREE.RingGeometry(0.24, 0.34, 32);
    this.buildEffectRingGeo.rotateX(-Math.PI / 2);
    this.buildEffectBeamGeo = new THREE.CylinderGeometry(0.16, 0.34, 1.85, 16, 1, true);
    this.scene.add(this.buildEffectGroup);

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

    if (!this.isSoftwareGl && options?.createPostProcessing) {
      this.postProcessing = options.createPostProcessing({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        width,
        height,
        pixelRatio: this.renderer.getPixelRatio(),
      });
    }

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
    this.postProcessing?.setSize(w, h, this.renderer.getPixelRatio());
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
        const kind = hit.userData.kind as
          | 'vertex'
          | 'edge'
          | 'city'
          | 'hex'
          | 'flip_hex';
        if (kind === 'vertex') {
          this.hoverGhost = createSettlementMesh(
            'ghost',
            this.pieceMats,
            hit.userData.id as string,
            this.settlementHouseSet,
          );
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
        } else if (kind === 'flip_hex') {
          const ring = new THREE.Mesh(this.hoverFlipRingGeo, this.hoverFlipRingMat);
          ring.position.set(hit.position.x, 0.375, hit.position.z);
          this.hoverFlipRing = ring;
          this.highlightGroup.add(ring);
        }
      }
    }
  };

  private clearHover() {
    if (this.hoverGhost) {
      this.highlightGroup.remove(this.hoverGhost);
      disposePieceGroupGeometries(this.hoverGhost, this.pieceMats);
      this.hoverGhost = null;
    }
    if (this.hoverFlipRing) {
      this.highlightGroup.remove(this.hoverFlipRing);
      this.hoverFlipRing = null;
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
    const kind = target.userData.kind as
      | 'vertex'
      | 'edge'
      | 'city'
      | 'hex'
      | 'flip_hex';
    const id = target.userData.id as string;

    if (kind === 'vertex' || kind === 'city') {
      this.callbacksRef.current.onSelectVertex(id);
    } else if (kind === 'edge') {
      this.callbacksRef.current.onSelectEdge(id);
    } else if (kind === 'hex' || kind === 'flip_hex') {
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

  private spawnBuildCelebration(x: number, z: number, isCityUpgrade: boolean) {
    if (this.reducedMotion || this.quality === 'reduced') return;

    const ringMat = new THREE.MeshBasicMaterial({
      color: isCityUpgrade ? 0xffe48a : 0xf7c954,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(this.buildEffectRingGeo, ringMat);
    ring.position.set(x, 0.28, z);
    ring.layers.enable(BLOOM_LAYER);
    this.buildEffectGroup.add(ring);

    let outerRing: THREE.Mesh | null = null;
    if (isCityUpgrade) {
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xffc64b,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      outerRing = new THREE.Mesh(this.buildEffectRingGeo, outerMat);
      outerRing.position.set(x, 0.29, z);
      outerRing.layers.enable(BLOOM_LAYER);
      this.buildEffectGroup.add(outerRing);
    }

    const beamMat = new THREE.MeshBasicMaterial({
      color: isCityUpgrade ? 0xffe49c : 0xf5d06e,
      transparent: true,
      opacity: isCityUpgrade ? 0.34 : 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(this.buildEffectBeamGeo, beamMat);
    beam.position.set(x, isCityUpgrade ? 1.15 : 0.95, z);
    beam.scale.set(isCityUpgrade ? 1.25 : 0.88, isCityUpgrade ? 1.25 : 0.85, isCityUpgrade ? 1.25 : 0.88);
    beam.layers.enable(BLOOM_LAYER);
    this.buildEffectGroup.add(beam);

    this.buildEffects.push({
      ring,
      outerRing,
      beam,
      age: 0,
      life: isCityUpgrade ? 1.15 : 0.8,
      maxScale: isCityUpgrade ? 3.05 : 2.35,
    });
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

  public setTooltipAnchor(
    worldPos: { x: number; y: number; z: number } | null,
    onProject: ((pos: { x: number; y: number; visible: boolean } | null) => void) | null,
  ) {
    this.tooltipWorldPos = worldPos
      ? new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z)
      : null;
    this.onTooltipScreenPos = onProject;
    this.lastProjectedTooltip = null;
    if (!worldPos && onProject) {
      onProject(null);
    }
  }

  public projectWorldPoint(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; visible: boolean } | null {
    if (this.disposed) return null;
    this.camera.updateMatrixWorld();
    _vec3.set(x, y, z).project(this.camera);
    const visible = _vec3.z >= -1 && _vec3.z <= 1;
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width || this.container.clientWidth);
    const h = Math.max(1, rect.height || this.container.clientHeight);
    return {
      x: rect.left + (_vec3.x * 0.5 + 0.5) * w,
      y: rect.top + (-_vec3.y * 0.5 + 0.5) * h,
      visible,
    };
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
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.postProcessing?.setSize(w, h, this.renderer.getPixelRatio());
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

    for (const entry of this.tileEntries) {
      entry.disposeCustomGeometries();
    }
    this.tileEntries = [];
    this.tileEntryById.clear();

    this.hexGroup.clear();
    this.harborGroup.clear();
    this.swayTrees = [];
    this.windmills = [];
    this.harborShips = [];
    this.cityBanners = [];

    for (const hex of hexes) {
      const built = buildHexTileGroup(
        hex,
        this.terrainAssets,
        this.textures,
        this.elevationProfiles,
        this.meshFidelity,
      );
      this.hexGroup.add(built.group);
      this.swayTrees.push(...built.swayTrees);
      this.windmills.push(...built.windmills);
      built.plainBackGroup.visible = !hex.revealed;
      const entry = {
        ...built,
        targetRevealed: hex.revealed,
        flipProgress: hex.revealed ? 1 : 0,
        flipDelay: 0,
        flipRollDir: (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6),
        flipYawDir: Math.random() > 0.5 ? 1 : -1,
        shuffleDelayRatio: Math.random(),
        hexX: hex.x,
        hexZ: hex.z,
        burstSpawned: hex.revealed,
      };
      this.tileEntries.push(entry);
      this.tileEntryById.set(hex.id, entry);
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

    this.builtVertices.forEach((v) => {
      this.piecesGroup.remove(v.mesh);
      disposePieceGroupGeometries(v.mesh, this.pieceMats);
    });
    this.builtVertices.clear();
    this.builtEdges.forEach((e) => {
      this.piecesGroup.remove(e.mesh);
      disposePieceGroupGeometries(e.mesh, this.pieceMats);
    });
    this.builtEdges.clear();
  }

  public syncGameState(
    game: PublicGameState | null,
    highlights: ValidHighlights,
  ) {
    if (!game) {
      this.hasPlayedInitialBlindDeal = false;
      this.updateHighlights([], [], [], [], [], game);
      return;
    }

    const sigBefore = this.currentBoardSignature;
    this.rebuildTerrain(game.hexes, game.harbors);
    const boardChanged = this.currentBoardSignature !== sigBefore;

    // Trigger randomized tabletop shuffle ripple on explicit shuffle OR first blind-start entry
    if (game.shuffleSeq !== this.lastShuffleSeq) {
      if (game.shuffleSeq > 0) {
        this.shuffleAnimTime = this.reducedMotion ? -1 : 0;
        for (const entry of this.tileEntries) {
          entry.shuffleDelayRatio = Math.random();
        }
      }
      this.lastShuffleSeq = game.shuffleSeq;
    } else if (
      game.phase === 'tile_reveal' &&
      this.tileFlipConfig.preGameShuffleRipple &&
      (!this.hasPlayedInitialBlindDeal || boardChanged) &&
      !this.reducedMotion
    ) {
      this.hasPlayedInitialBlindDeal = true;
      this.shuffleAnimTime = 0;
      for (const entry of this.tileEntries) {
        entry.shuffleDelayRatio = Math.random();
      }
    }

    // Sync tile flip reveal states with randomized cascade delays & per-tile wrist tilt
    const newlyRevealedEntries: typeof this.tileEntries = [];
    for (const hex of game.hexes) {
      const entry = this.tileEntryById.get(hex.id);
      if (!entry) continue;
      if (hex.revealed !== entry.targetRevealed) {
        entry.targetRevealed = hex.revealed;
        if (hex.revealed) {
          entry.burstSpawned = false;
          entry.flipRollDir = (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6);
          entry.flipYawDir = Math.random() > 0.5 ? 1 : -1;
          newlyRevealedEntries.push(entry);
        } else {
          entry.flipDelay = 0;
        }
        if (this.reducedMotion) {
          entry.flipProgress = hex.revealed ? 1 : 0;
          entry.flipPivot.rotation.set(hex.revealed ? 0 : Math.PI, 0, 0);
          entry.flipPivot.position.y = 0.285;
          entry.biomeGroup.visible = hex.revealed;
          entry.plainBackGroup.visible = !hex.revealed;
          entry.tokenMountGroup.position.y = hex.revealed
            ? entry.revealedTokenY
            : entry.unrevealedTokenY;
        }
      }
    }

    if (newlyRevealedEntries.length > 1 && !this.reducedMotion) {
      const orderIndices = newlyRevealedEntries.map((_, idx) => idx);
      if (this.tileFlipConfig.randomizedCascade) {
        for (let i = orderIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [orderIndices[i], orderIndices[j]] = [orderIndices[j], orderIndices[i]];
        }
      }
      for (let i = 0; i < newlyRevealedEntries.length; i++) {
        const orderSlot = orderIndices[i];
        newlyRevealedEntries[i].flipDelay =
          orderSlot * this.tileFlipConfig.staggerIntervalSec + Math.random() * 0.025;
      }
    } else if (newlyRevealedEntries.length === 1) {
      newlyRevealedEntries[0].flipDelay = 0;
    }

    const playerColorById = new Map(game.players.map((p) => [p.id, p.color]));

    // Sync buildings (settlements & city upgrades)
    for (const v of game.vertices) {
      const existing = this.builtVertices.get(v.id);
      if (!v.building) {
        if (existing) {
          this.piecesGroup.remove(existing.mesh);
          disposePieceGroupGeometries(existing.mesh, this.pieceMats);
          this.builtVertices.delete(v.id);
        }
        continue;
      }

      if (
        !existing ||
        existing.ownerId !== v.building.ownerId ||
        existing.type !== v.building.type
      ) {
        const isInitialLoad =
          this.builtVertices.size === 0 &&
          (game.turnNumber > 1 || game.phase === 'roll');
        const wasUpgrade = Boolean(existing && v.building.type === 'city');
        if (existing) {
          this.piecesGroup.remove(existing.mesh);
          disposePieceGroupGeometries(existing.mesh, this.pieceMats);
        }
        const color = playerColorById.get(v.building.ownerId) ?? 'crimson';
        const mesh =
          v.building.type === 'city'
            ? createCityMesh(color, this.pieceMats)
            : createSettlementMesh(
                color,
                this.pieceMats,
                v.id,
                this.settlementHouseSet,
              );
        mesh.position.set(v.x, 0.245, v.z);
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
          this.spawnBurst(v.x, 1.05, v.z, 22);
          this.spawnBuildCelebration(v.x, v.z, true);
        } else if (!isInitialLoad) {
          this.spawnBurst(v.x, 0.74, v.z, 12);
          this.spawnBuildCelebration(v.x, v.z, false);
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
        if (this.builtEdges.size > 1) {
          this.spawnBurst(e.x, 0.45, e.z, 5);
        }
      }
    }

    // Sync robber position & hide while desert tile is still upside down
    const robberHex = game.hexes.find((h) => h.hasRobber);
    if (robberHex) {
      this.robberTargetPos.set(robberHex.x + 0.32, 0.355, robberHex.z + 0.28);
      const robberEntry = this.tileEntryById.get(robberHex.id);
      this.robberMesh.visible = Boolean(
        robberHex.revealed && (!robberEntry || robberEntry.flipProgress > 0.75),
      );
    } else {
      this.robberMesh.visible = false;
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
      highlights.flipHexes,
      game,
    );
  }

  private updateHighlights(
    vertexIds: string[],
    edgeIds: string[],
    cityIds: string[],
    robberHexIds: string[],
    flipHexIds: string[],
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
      ring.position.set(v.x, 0.275, v.z);
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
        new THREE.RingGeometry(0.32, 0.46, 24).rotateX(-Math.PI / 2),
        ringMat,
      );
      ring.position.set(v.x, 0.275, v.z);
      this.highlightGroup.add(ring);

      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 8), proxyMat);
      proxy.position.set(v.x, 0.48, v.z);
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
      marker.position.set(e.x, 0.275, e.z);
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
      ring.position.set(h.x, 0.375, h.z);
      this.highlightGroup.add(ring);

      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.4, 6), proxyMat);
      proxy.position.set(h.x, 0.44, h.z);
      proxy.userData = { kind: 'hex', id: hId };
      this.highlightGroup.add(proxy);
      this.interactables.push(proxy);
    }

    if (flipHexIds.length > 0) {
      const flipProxyGeo = new THREE.CylinderGeometry(1.38, 1.38, 0.38, 6);
      for (const hId of flipHexIds) {
        const h = hexById.get(hId);
        if (!h) continue;
        const proxy = new THREE.Mesh(flipProxyGeo, proxyMat);
        proxy.position.set(h.x, 0.34, h.z);
        proxy.userData = { kind: 'flip_hex', id: hId };
        this.highlightGroup.add(proxy);
        this.interactables.push(proxy);
      }
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
    const animDt = Math.min(Math.max(rawDt, 0.001), 0.25);
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

    // 5b. Celebratory golden consecration rings & beacon fade-out
    if (this.buildEffects.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < this.buildEffects.length; i++) {
        const fx = this.buildEffects[i];
        fx.age += dt;
        if (fx.age >= fx.life) {
          this.buildEffectGroup.remove(fx.ring);
          (fx.ring.material as THREE.Material).dispose();
          if (fx.outerRing) {
            this.buildEffectGroup.remove(fx.outerRing);
            (fx.outerRing.material as THREE.Material).dispose();
          }
          this.buildEffectGroup.remove(fx.beam);
          (fx.beam.material as THREE.Material).dispose();
          continue;
        }
        const p = fx.age / fx.life;
        const easeOut = 1 - Math.pow(1 - p, 3);
        const fade = Math.pow(1 - p, 1.5);
        fx.ring.scale.setScalar(1 + easeOut * (fx.maxScale - 1));
        (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;

        if (fx.outerRing) {
          const p2 = Math.max(0, (p - 0.14) / 0.86);
          const ease2 = 1 - Math.pow(1 - p2, 3);
          fx.outerRing.scale.setScalar(0.9 + ease2 * (fx.maxScale * 1.15 - 0.9));
          (fx.outerRing.material as THREE.MeshBasicMaterial).opacity = 0.65 * Math.pow(1 - p2, 1.4);
        }

        const beamFade = Math.sin(Math.min(1, p * 1.35) * Math.PI) * (1 - p);
        (fx.beam.material as THREE.MeshBasicMaterial).opacity = 0.34 * Math.max(0, beamFade);

        this.buildEffects[writeIdx] = fx;
        writeIdx++;
      }
      this.buildEffects.length = writeIdx;
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
      this.diceAnimTime += animDt;
      const dur = 0.85;
      if (this.diceAnimTime < dur) {
        const p = this.diceAnimTime / dur;
        const bounce = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 1.65;
        this.die1.position.y = 0.76 + bounce;
        this.die2.position.y = 0.76 + bounce * 0.85;
        this.die1.rotation.x += animDt * 16 * (1 - p);
        this.die1.rotation.z += animDt * 13 * (1 - p);
        this.die2.rotation.x -= animDt * 14 * (1 - p);
        this.die2.rotation.y += animDt * 15 * (1 - p);
      } else {
        this.die1.position.y = 0.76;
        this.die2.position.y = 0.76;
        this.die1.rotation.copy(this.die1TargetRot);
        this.die2.rotation.copy(this.die2TargetRot);
        this.diceAnimTime = -1;
      }
    }

    // 7b. Physical 3D randomized tile flip reveal & shuffle ripple animations
    for (let i = 0; i < this.tileEntries.length; i++) {
      const entry = this.tileEntries[i];
      const target = entry.targetRevealed ? 1 : 0;
      if (Math.abs(entry.flipProgress - target) > 0.0005) {
        if (entry.flipDelay > 0) {
          const remaining = entry.flipDelay - animDt;
          if (remaining > 0) {
            entry.flipDelay = remaining;
            continue;
          }
          entry.flipDelay = 0;
        }
        if (this.reducedMotion) {
          entry.flipProgress = target;
        } else {
          const speed = this.tileFlipConfig.flipSpeed;
          if (entry.flipProgress < target) {
            entry.flipProgress = Math.min(1, entry.flipProgress + animDt * speed);
          } else {
            entry.flipProgress = Math.max(0, entry.flipProgress - animDt * speed);
          }
        }
        const raw = entry.flipProgress;
        const p =
          raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
        const arc = Math.sin(p * Math.PI);
        const settleOvershoot = raw > 0.78 ? Math.sin(((raw - 0.78) / 0.22) * Math.PI) * 0.045 : 0;

        entry.flipPivot.rotation.x = (1 - p) * Math.PI;
        entry.flipPivot.rotation.z =
          arc * this.tileFlipConfig.rollWobbleRad * entry.flipRollDir;
        entry.flipPivot.rotation.y =
          arc * 0.16 * entry.flipYawDir;
        entry.flipPivot.position.y =
          0.285 + arc * this.tileFlipConfig.arcLiftHeight + settleOvershoot;

        const showBiome = entry.flipPivot.rotation.x < Math.PI * 0.48;
        entry.biomeGroup.visible = showBiome;
        entry.plainBackGroup.visible = !showBiome;
        entry.tokenMountGroup.position.y =
          THREE.MathUtils.lerp(entry.unrevealedTokenY, entry.revealedTokenY, p) +
          arc * (this.tileFlipConfig.arcLiftHeight + 0.14);

        if (raw >= 1 || raw <= 0) {
          entry.flipPivot.rotation.set(target === 1 ? 0 : Math.PI, 0, 0);
          entry.flipPivot.position.y = 0.285;
          entry.tokenMountGroup.position.y =
            target === 1 ? entry.revealedTokenY : entry.unrevealedTokenY;
        }

        if (!entry.burstSpawned && target === 1 && raw >= 0.88) {
          entry.burstSpawned = true;
          this.spawnBurst(entry.hexX, 0.48, entry.hexZ, 7);
        }
      }
    }

    if (!this.robberMesh.visible) {
      const robberHex = this.currentHexesCache.find((h) => h.hasRobber);
      if (robberHex) {
        const robberEntry = this.tileEntryById.get(robberHex.id);
        if (robberEntry && robberEntry.targetRevealed && robberEntry.flipProgress > 0.75) {
          this.robberMesh.visible = true;
        }
      }
    }

    if (this.shuffleAnimTime >= 0) {
      this.shuffleAnimTime += animDt;
      const totalDur = 0.82;
      if (this.shuffleAnimTime < totalDur) {
        for (let i = 0; i < this.tileEntries.length; i++) {
          const entry = this.tileEntries[i];
          const delay = entry.shuffleDelayRatio * 0.28;
          const localP = Math.max(0, Math.min(1, (this.shuffleAnimTime - delay) / 0.48));
          const lift = Math.sin(localP * Math.PI);
          entry.group.position.y = lift * 0.52;
          entry.group.rotation.y = Math.sin(localP * Math.PI * 2) * 0.22 * entry.flipYawDir;
          if (!entry.targetRevealed && entry.flipProgress < 0.02) {
            // Subtle face-down wrist-peek wobble on unrevealed tiles during pre-game shuffle
            entry.flipPivot.rotation.x = Math.PI - lift * 0.22;
            entry.flipPivot.rotation.z = lift * 0.14 * entry.flipRollDir;
          }
        }
      } else {
        for (let i = 0; i < this.tileEntries.length; i++) {
          const entry = this.tileEntries[i];
          entry.group.position.y = 0;
          entry.group.rotation.y = 0;
          if (!entry.targetRevealed && entry.flipProgress < 0.02) {
            entry.flipPivot.rotation.set(Math.PI, 0, 0);
          }
        }
        this.shuffleAnimTime = -1;
      }
    }

    // 8. Guarded 3D-to-screen projection for live TV-board contextual tooltip
    if (this.tooltipWorldPos && this.onTooltipScreenPos && this.mode === 'game') {
      _vec3.copy(this.tooltipWorldPos).project(this.camera);
      const visible = _vec3.z >= -1 && _vec3.z <= 1;
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      const rawX = (_vec3.x * 0.5 + 0.5) * w;
      const rawY = (-_vec3.y * 0.5 + 0.5) * h;
      const px = Math.round(Math.max(185, Math.min(w - 185, rawX)));
      const py = Math.round(Math.max(170, Math.min(h - 145, rawY)));
      const prev = this.lastProjectedTooltip;
      if (
        !prev ||
        prev.visible !== visible ||
        Math.abs(prev.x - px) > 0.75 ||
        Math.abs(prev.y - py) > 0.75
      ) {
        this.lastProjectedTooltip = { x: px, y: py, visible };
        this.onTooltipScreenPos(this.lastProjectedTooltip);
      }
    }

    if (this.postProcessing && !this.isSoftwareGl && this.quality !== 'reduced') {
      const focusDistance = this.camera.position.distanceTo(this.controls.target);
      this.postProcessing.render(focusDistance, this.quality, this.reducedMotion);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

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
    this.postProcessing?.dispose();
    this.postProcessing = null;
    this.tileEntries.forEach((e) => e.disposeCustomGeometries());
    this.tileEntries = [];
    this.tileEntryById.clear();
    this.hoverFlipRingGeo.dispose();
    this.hoverFlipRingMat.dispose();
    this.ambientMotes.geometry.dispose();
    (this.ambientMotes.material as THREE.Material).dispose();
    this.burstMesh.geometry.dispose();
    (this.burstMesh.material as THREE.Material).dispose();
    this.buildEffectRingGeo.dispose();
    this.buildEffectBeamGeo.dispose();
    for (const fx of this.buildEffects) {
      (fx.ring.material as THREE.Material).dispose();
      if (fx.outerRing) (fx.outerRing.material as THREE.Material).dispose();
      (fx.beam.material as THREE.Material).dispose();
    }
    this.buildEffects = [];
    this.textures.dispose();
    this.terrainAssets.dispose();
    this.pieceMats.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
