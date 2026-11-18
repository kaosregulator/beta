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

const _vec3 = new THREE.Vector3();

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
    this.scene.background = new THREE.Color(0x0f1a24);
    this.scene.fog = new THREE.FogExp2(0x0f1a24, 0.018);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    this.camera.position.set(0, 14.0, 16.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 7.5;
    this.controls.maxDistance = 28;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.target.set(0, 0.15, 0);
    this.controls.addEventListener('start', () => {
      this.cameraPresetTarget = null;
    });

    // Studio warm/cool 3-point lighting rig
    const hemi = new THREE.HemisphereLight(0xa8c8e8, 0x3b2c1e, 0.85);
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

    const rimLight = new THREE.DirectionalLight(0x7eb8e6, 0.72);
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

    this.robberMesh = createRobberMesh(this.pieceMats);
    this.robberMesh.position.copy(this.robberTargetPos);
    this.piecesGroup.add(this.robberMesh);

    // Two 3D dice sitting on the felt-lined wooden dice tray
    this.die1 = createDieMesh(this.textures);
    this.die2 = createDieMesh(this.textures);
    this.die1.position.set(8.78, 0.74, 5.22);
    this.die2.position.set(9.42, 0.74, 4.65);
    this.die1.rotation.copy(getDieRotationForValue(5));
    this.die2.rotation.copy(getDieRotationForValue(6));
    this.diceGroup.add(this.die1, this.die2);

    // Load an attractive initial showcase island immediately for Title Screen
    const showcase = generateBoard('standard');
    this.rebuildTerrain(showcase.hexes, showcase.harbors);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind pointer events & resize observer
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
  }

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
    if (dist > 8) return; // Was camera orbit/drag

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

  public setMode(mode: 'title' | 'game') {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'game') {
      this.setCameraPreset('iso');
    }
  }

  public setQuality(quality: QualityPreset) {
    this.quality = quality;
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
        pos: new THREE.Vector3(11.6, 5.4, 8.8),
        target: new THREE.Vector3(9.1, 0.55, 4.95),
      };
    } else {
      this.cameraPresetTarget = {
        pos: new THREE.Vector3(0, 14.0, 16.2),
        target: new THREE.Vector3(0, 0.15, 0),
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

    for (const hex of hexes) {
      const tile = buildHexTileGroup(hex, this.terrainAssets, this.textures);
      this.hexGroup.add(tile);
    }

    for (const harbor of harbors) {
      const hMesh = createHarborMesh(harbor.kind, this.textures, this.pieceMats);
      hMesh.position.set(harbor.x, 0.02, harbor.z);
      hMesh.rotation.y = -harbor.angle;
      this.harborGroup.add(hMesh);
    }

    // Clear piece caches when a fresh board starts
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
        if (existing) this.piecesGroup.remove(existing.mesh);
        const color = playerColorById.get(v.building.ownerId) ?? 'crimson';
        const mesh =
          v.building.type === 'city'
            ? createCityMesh(color, this.pieceMats)
            : createSettlementMesh(color, this.pieceMats);
        mesh.position.set(v.x, 0.24, v.z);
        // Subtle radial rotation facing island center
        mesh.rotation.y = Math.atan2(-v.x, -v.z);
        mesh.scale.setScalar(0.01);
        this.piecesGroup.add(mesh);
        this.builtVertices.set(v.id, {
          ownerId: v.building.ownerId,
          type: v.building.type,
          mesh,
          spawnAge: 0,
        });
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
        mesh.scale.setScalar(0.01);
        this.piecesGroup.add(mesh);
        this.builtEdges.set(e.id, { ownerId: e.ownerId, mesh, spawnAge: 0 });
      }
    }

    // Sync robber position
    const robberHex = game.hexes.find((h) => h.hasRobber);
    if (robberHex) {
      this.robberTargetPos.set(robberHex.x + 0.32, 0.28, robberHex.z + 0.28);
    }

    // Trigger 3D dice roll animation when diceRollSeq advances
    if (game.dice && game.diceRollSeq !== this.lastDiceSeq) {
      this.lastDiceSeq = game.diceRollSeq;
      this.die1TargetRot.copy(getDieRotationForValue(game.dice[0]));
      this.die2TargetRot.copy(getDieRotationForValue(game.dice[1]));
      this.diceAnimTime = 0;
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

    const ringGeo = new THREE.RingGeometry(0.16, 0.26, 20);
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
      ring.position.set(v.x, 0.28, v.z);
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
        new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2),
        ringMat,
      );
      ring.position.set(v.x, 0.28, v.z);
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
      opacity: 0.72,
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
    const hexRingGeo = new THREE.RingGeometry(0.55, 0.72, 6);
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

    // 1. Ocean shader animation (unless reduced quality)
    if (this.quality !== 'reduced') {
      this.oceanUniforms.uTime.value = elapsed;
    }

    // 2. Title screen gentle orbital showcase
    if (this.mode === 'title' && !this.isSoftwareGl) {
      const angle = elapsed * 0.14;
      this.camera.position.set(
        Math.sin(angle) * 15.4,
        11.8 + Math.sin(elapsed * 0.25) * 0.6,
        Math.cos(angle) * 15.4,
      );
      this.controls.target.set(0, 0.2, 0);
    } else if (this.cameraPresetTarget) {
      const k = 6.5;
      const alpha = 1 - Math.exp(-k * dt);
      this.camera.position.lerp(this.cameraPresetTarget.pos, alpha);
      this.controls.target.lerp(this.cameraPresetTarget.target, alpha);
      if (this.camera.position.distanceTo(this.cameraPresetTarget.pos) < 0.05) {
        this.cameraPresetTarget = null;
      }
    }

    this.controls.update();

    // 3. Spring pop-in for newly constructed settlements, cities, and roads
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

    // 4. Robber smooth glide with slight hop
    const distToRobber = this.robberMesh.position.distanceTo(this.robberTargetPos);
    if (distToRobber > 0.01) {
      const alpha = 1 - Math.exp(-9 * dt);
      _vec3.copy(this.robberTargetPos);
      this.robberMesh.position.lerp(_vec3, alpha);
      this.robberMesh.position.y =
        this.robberTargetPos.y + Math.sin(Math.min(1, distToRobber) * Math.PI) * 0.55;
    }

    // 5. Physical 3D dice tumble & bounce settle
    if (this.diceAnimTime >= 0) {
      this.diceAnimTime += dt;
      const dur = 0.85;
      if (this.diceAnimTime < dur) {
        const p = this.diceAnimTime / dur;
        const bounce = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 1.65;
        this.die1.position.y = 0.74 + bounce;
        this.die2.position.y = 0.74 + bounce * 0.85;
        this.die1.rotation.x += dt * 16 * (1 - p);
        this.die1.rotation.z += dt * 13 * (1 - p);
        this.die2.rotation.x -= dt * 14 * (1 - p);
        this.die2.rotation.y += dt * 15 * (1 - p);
      } else {
        this.die1.position.y = 0.74;
        this.die2.position.y = 0.74;
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
    this.controls.dispose();
    this.textures.dispose();
    this.terrainAssets.dispose();
    this.pieceMats.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
