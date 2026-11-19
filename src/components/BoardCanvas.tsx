import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
} from '../game/rules';
import { getBoardTooltipTarget } from '../game/tutorialEngine';
import type { GameState, PublicGameState, TerrainType } from '../game/types';
import {
  BoardSceneController,
  type PostProcessingPipeline,
  type TileFlipAnimationConfig,
  type ValidHighlights,
} from '../three/BoardScene';
import {
  BLOOM_LAYER,
  type SettlementHouseSetConfig,
} from '../three/pieces';
import type {
  TerrainElevationProfile,
  TerrainMeshFidelityConfig,
} from '../three/terrain';
import { useGameStore, type QualityPreset } from '../store/useGameStore';

/**
 * Modular 3D medieval house set for settlement rendering: player-colored painted
 * half-timbered walls, sculpted staggered roof tiles, and brick-and-stone chimneys.
 */
export const MODULAR_SETTLEMENT_HOUSE_SET: SettlementHouseSetConfig = {
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

/**
 * Distinct per-biome elevation layers and procedural relief amplitudes passed
 * into the terrain mesh builder for a tactile, physical tabletop silhouette.
 */
export const TERRAIN_ELEVATION_PROFILES: Record<TerrainType, TerrainElevationProfile> = {
  mountains: {
    baseDepth: 0.16,
    midLayerScale: 0.78,
    midLayerHeight: 0.092,
    upperLayerScale: 0.56,
    upperLayerHeight: 0.104,
    reliefAmplitude: 0.108,
    revealedTokenY: 0.486,
    reliefStyle: 'ridges',
  },
  hills: {
    baseDepth: 0.16,
    midLayerScale: 0.76,
    midLayerHeight: 0.082,
    upperLayerScale: 0.54,
    upperLayerHeight: 0.076,
    reliefAmplitude: 0.058,
    revealedTokenY: 0.452,
    reliefStyle: 'terraced',
  },
  forest: {
    baseDepth: 0.16,
    midLayerScale: 0.74,
    midLayerHeight: 0.068,
    upperLayerScale: 0.52,
    upperLayerHeight: 0.052,
    reliefAmplitude: 0.048,
    revealedTokenY: 0.422,
    reliefStyle: 'forest_rise',
  },
  pasture: {
    baseDepth: 0.16,
    midLayerScale: 0.8,
    midLayerHeight: 0.048,
    upperLayerScale: 0,
    upperLayerHeight: 0,
    reliefAmplitude: 0.084,
    revealedTokenY: 0.378,
    reliefStyle: 'meadow',
  },
  fields: {
    baseDepth: 0.16,
    midLayerScale: 0.72,
    midLayerHeight: 0.054,
    upperLayerScale: 0,
    upperLayerHeight: 0,
    reliefAmplitude: 0.04,
    revealedTokenY: 0.386,
    reliefStyle: 'furrows',
  },
  desert: {
    baseDepth: 0.15,
    midLayerScale: 0.78,
    midLayerHeight: 0.04,
    upperLayerScale: 0,
    upperLayerHeight: 0,
    reliefAmplitude: 0.094,
    revealedTokenY: 0.374,
    reliefStyle: 'dunes',
  },
};

/**
 * High-fidelity procedural relief configuration for BoardScene terrain meshes:
 * increases radial hex subdivision, adds 2-octave crevice/crest height variation,
 * per-tile plinth elevation jitter, and extra stone cliff skirt bevels.
 */
export const TERRAIN_MESH_FIDELITY: TerrainMeshFidelityConfig = {
  subdivisionRings: 10,
  secondaryNoiseWeight: 0.38,
  perTileElevationVariance: 0.048,
  cliffSkirtSteps: 2,
  vertexColorVariation: 0.18,
};

/**
 * Randomized pre-game tile flipping animation configuration for blind-start board setup.
 */
export const PREGAME_TILE_FLIP_ANIMATION: TileFlipAnimationConfig = {
  randomizedCascade: true,
  staggerIntervalSec: 0.052,
  flipSpeed: 2.05,
  arcLiftHeight: 0.58,
  rollWobbleRad: 0.25,
  preGameShuffleRipple: true,
};

const AdditiveBloomShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    bloomTexture: { value: null as THREE.Texture | null },
    bloomStrength: { value: 0.45 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D bloomTexture;
    uniform float bloomStrength;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec4 bloom = texture2D(bloomTexture, vUv);
      gl_FragColor = vec4(base.rgb + bloom.rgb * bloomStrength, base.a);
    }
  `,
};

/**
 * Configures a Selective Emissive Bloom + subtle miniature Depth of Field pipeline:
 * - Only meshes tagged on BLOOM_LAYER (windows, lanterns, braziers, build sparks)
 *   emit bloom so snow peaks, number tokens, sheep, desert sand, and water never glare.
 * - Calibrated shallow BokehPass keeps the playable hex island razor sharp while
 *   gently softening the distant tabletop and outer board rim.
 */
function createDioramaPostProcessing({
  renderer,
  scene,
  camera,
  width,
  height,
  pixelRatio,
}: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  pixelRatio: number;
}): PostProcessingPipeline {
  const bloomLayer = new THREE.Layers();
  bloomLayer.set(BLOOM_LAYER);

  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const blackBg = new THREE.Color(0x000000);
  const savedMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
  const hiddenNonBloom: THREE.Object3D[] = [];

  // Isolated off-screen composer rendering ONLY BLOOM_LAYER emissive meshes
  const bloomTarget = new THREE.WebGLRenderTarget(
    Math.max(1, width),
    Math.max(1, height),
    { type: THREE.HalfFloatType },
  );
  const bloomComposer = new EffectComposer(renderer, bloomTarget);
  bloomComposer.renderToScreen = false;
  bloomComposer.setPixelRatio(Math.min(pixelRatio, 1));
  bloomComposer.setSize(width, height);

  const bloomRenderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.0,
    0.28,
    0.25,
  );
  bloomComposer.addPass(bloomRenderPass);
  bloomComposer.addPass(bloomPass);

  // Main high-precision MSAA composer
  const finalTarget = new THREE.WebGLRenderTarget(
    Math.max(1, width),
    Math.max(1, height),
    {
      type: THREE.HalfFloatType,
      samples: Math.min(4, renderer.capabilities.maxSamples),
    },
  );
  const finalComposer = new EffectComposer(renderer, finalTarget);
  finalComposer.setPixelRatio(pixelRatio);
  finalComposer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  const mixPass = new ShaderPass(AdditiveBloomShader, 'tDiffuse');
  mixPass.needsSwap = true;

  // Gentle outer-edge tilt-shift DOF keeping all playable tiles & tokens crisp
  const bokehPass = new BokehPass(scene, camera, {
    focus: 22.4,
    aperture: 0.00016,
    maxblur: 0.0022,
  });

  const outputPass = new OutputPass();

  finalComposer.addPass(renderPass);
  finalComposer.addPass(mixPass);
  finalComposer.addPass(bokehPass);
  finalComposer.addPass(outputPass);

  const bokehUniforms = bokehPass.uniforms as Record<string, THREE.IUniform>;

  return {
    render: (focusDistance: number, quality: QualityPreset, reducedMotion: boolean) => {
      const bloomStrength =
        quality === 'high' ? 0.48 : quality === 'balanced' ? 0.32 : 0;

      if (bloomStrength > 0) {
        const savedBg = scene.background;
        const savedFog = scene.fog;
        scene.background = blackBg;
        scene.fog = null;

        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.visible || bloomLayer.test(mesh.layers)) return;
          const mat = mesh.material;
          if (!Array.isArray(mat) && mat && mat.transparent && !mat.depthWrite) {
            hiddenNonBloom.push(mesh);
            mesh.visible = false;
          } else {
            savedMaterials.set(mesh, mat);
            mesh.material = darkMaterial;
          }
        });

        try {
          bloomComposer.render();
        } finally {
          for (const [obj, mat] of savedMaterials) {
            (obj as THREE.Mesh).material = mat;
          }
          savedMaterials.clear();
          for (let i = 0; i < hiddenNonBloom.length; i++) {
            hiddenNonBloom[i].visible = true;
          }
          hiddenNonBloom.length = 0;
          scene.background = savedBg;
          scene.fog = savedFog;
        }
      }

      mixPass.uniforms.bloomTexture.value = bloomComposer.readBuffer.texture;
      mixPass.uniforms.bloomStrength.value = bloomStrength;

      bokehUniforms.focus.value = focusDistance;
      bokehPass.enabled = quality === 'high' && !reducedMotion;

      finalComposer.render();
    },
    setSize: (w: number, h: number, pr: number) => {
      bloomComposer.setPixelRatio(Math.min(pr, 1));
      bloomComposer.setSize(w, h);
      finalComposer.setPixelRatio(pr);
      finalComposer.setSize(w, h);
      bokehUniforms.aspect.value = camera.aspect;
    },
    dispose: () => {
      bloomRenderPass.dispose();
      bloomPass.dispose();
      bloomComposer.dispose();
      bloomTarget.dispose();
      renderPass.dispose();
      mixPass.dispose();
      bokehPass.dispose();
      outputPass.dispose();
      finalComposer.dispose();
      finalTarget.dispose();
      darkMaterial.dispose();
    },
  };
}

/**
 * Computes valid highlighted board slots for either the local controlling player
 * or the remote active phone controller's placement intent.
 */
function computeHighlights(
  game: PublicGameState | null,
  localPlayerId: string | null,
  localIntent: string | null,
  remoteHighlight: { playerId: string; kind: string | null } | null,
): ValidHighlights {
  const empty: ValidHighlights = {
    vertices: [],
    edges: [],
    cities: [],
    robberHexes: [],
    flipHexes: [],
  };
  if (!game || game.phase === 'finished') return empty;

  if (game.phase === 'tile_reveal') {
    return {
      ...empty,
      flipHexes: game.hexes.filter((h) => !h.revealed).map((h) => h.id),
    };
  }

  const active = game.players[game.activePlayerIndex];
  if (!active) return empty;

  // Determine which player's perspective to highlight
  const isLocalActive = localPlayerId && active.id === localPlayerId;
  const targetPlayerId = isLocalActive
    ? localPlayerId
    : remoteHighlight?.playerId === active.id
      ? remoteHighlight.playerId
      : null;

  if (!targetPlayerId) return empty;

  const pseudoState = game as unknown as GameState;

  if (
    game.phase === 'setup_forward_settlement' ||
    game.phase === 'setup_reverse_settlement'
  ) {
    return {
      ...empty,
      vertices: getValidSettlementVertices(pseudoState, targetPlayerId),
    };
  }

  if (
    game.phase === 'setup_forward_road' ||
    game.phase === 'setup_reverse_road' ||
    game.phase === 'road_building_1' ||
    game.phase === 'road_building_2'
  ) {
    return {
      ...empty,
      edges: getValidRoadEdges(pseudoState, targetPlayerId),
    };
  }

  if (game.phase === 'move_robber') {
    return {
      ...empty,
      robberHexes: game.hexes.filter((h) => !h.hasRobber).map((h) => h.id),
    };
  }

  const intent = isLocalActive ? localIntent : remoteHighlight?.kind ?? null;
  if (game.phase === 'main' && intent) {
    if (intent === 'settlement') {
      return {
        ...empty,
        vertices: getValidSettlementVertices(pseudoState, targetPlayerId),
      };
    }
    if (intent === 'road') {
      return {
        ...empty,
        edges: getValidRoadEdges(pseudoState, targetPlayerId),
      };
    }
    if (intent === 'city') {
      return {
        ...empty,
        cities: getValidCityVertices(pseudoState, targetPlayerId),
      };
    }
    if (intent === 'robber') {
      return {
        ...empty,
        robberHexes: game.hexes.filter((h) => !h.hasRobber).map((h) => h.id),
      };
    }
  }

  return empty;
}

export function BoardCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const tooltipDomRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<BoardSceneController | null>(null);

  const screen = useGameStore((s) => s.screen);
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const privateState = useGameStore((s) => s.privateState);
  const quality = useGameStore((s) => s.quality);
  const reducedMotion = useGameStore((s) => s.reducedMotion);
  const autoCameraFocus = useGameStore((s) => s.autoCameraFocus);
  const placementIntent = useGameStore((s) => s.placementIntent);
  const activeSubDrawer = useGameStore((s) => s.activeSubDrawer);
  const showBoardTooltips = useGameStore((s) => s.showBoardTooltips);
  const cameraCommand = useGameStore((s) => s.cameraCommand);
  const dispatchGameAction = useGameStore((s) => s.dispatchGameAction);

  const callbacksRef = useRef({
    onSelectVertex: (_vertexId: string) => {},
    onSelectEdge: (_edgeId: string) => {},
    onSelectHex: (_hexId: string) => {},
  });

  // Update interaction callbacks dynamically without tearing down Three.js canvas
  useEffect(() => {
    callbacksRef.current = {
      onSelectVertex: (vertexId: string) => {
        const state = useGameStore.getState();
        const game = state.room?.game;
        const pid = state.playerId;
        if (!game || !pid) return;
        const active = game.players[game.activePlayerIndex];
        if (!active || active.id !== pid) return;

        if (
          game.phase === 'setup_forward_settlement' ||
          game.phase === 'setup_reverse_settlement'
        ) {
          dispatchGameAction({
            type: 'PLACE_SETUP_SETTLEMENT',
            playerId: pid,
            vertexId,
          });
        } else if (game.phase === 'main') {
          if (state.placementIntent === 'city') {
            dispatchGameAction({ type: 'UPGRADE_CITY', playerId: pid, vertexId });
            state.setPlacementIntent(null);
          } else if (state.placementIntent === 'settlement') {
            dispatchGameAction({ type: 'BUILD_SETTLEMENT', playerId: pid, vertexId });
            state.setPlacementIntent(null);
          }
        }
      },
      onSelectEdge: (edgeId: string) => {
        const state = useGameStore.getState();
        const game = state.room?.game;
        const pid = state.playerId;
        if (!game || !pid) return;
        const active = game.players[game.activePlayerIndex];
        if (!active || active.id !== pid) return;

        if (
          game.phase === 'setup_forward_road' ||
          game.phase === 'setup_reverse_road'
        ) {
          dispatchGameAction({ type: 'PLACE_SETUP_ROAD', playerId: pid, edgeId });
        } else if (
          game.phase === 'main' ||
          game.phase === 'road_building_1' ||
          game.phase === 'road_building_2'
        ) {
          dispatchGameAction({ type: 'BUILD_ROAD', playerId: pid, edgeId });
          if (game.phase === 'main') state.setPlacementIntent(null);
        }
      },
      onSelectHex: (hexId: string) => {
        const state = useGameStore.getState();
        const game = state.room?.game;
        if (!game) return;
        const pid = state.playerId;
        if (game.phase === 'tile_reveal') {
          const actorId = pid ?? game.players[0]?.id;
          if (actorId) {
            dispatchGameAction({ type: 'FLIP_TILE', playerId: actorId, hexId });
          }
          return;
        }
        if (!pid) return;
        if (game.phase === 'move_robber') {
          dispatchGameAction({ type: 'MOVE_ROBBER', playerId: pid, hexId });
        }
      },
    };
  }, [dispatchGameAction]);

  // Mount WebGL canvas once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const ctrl = new BoardSceneController(el, callbacksRef, {
      createPostProcessing: createDioramaPostProcessing,
      terrainElevationProfiles: TERRAIN_ELEVATION_PROFILES,
      terrainMeshFidelity: TERRAIN_MESH_FIDELITY,
      settlementHouseSet: MODULAR_SETTLEMENT_HOUSE_SET,
      tileFlipAnimation: PREGAME_TILE_FLIP_ANIMATION,
    });
    controllerRef.current = ctrl;
    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setMode(screen === 'title' ? 'title' : 'game');
  }, [screen]);

  useEffect(() => {
    controllerRef.current?.setQuality(quality);
  }, [quality]);

  useEffect(() => {
    controllerRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    controllerRef.current?.setAutoCameraFocus(autoCameraFocus);
  }, [autoCameraFocus]);

  useEffect(() => {
    if (cameraCommand) {
      controllerRef.current?.setCameraPreset(cameraCommand.type);
    }
  }, [cameraCommand]);

  const highlights = useMemo(
    () =>
      computeHighlights(
        room?.game ?? null,
        playerId,
        placementIntent,
        room?.activePlacementHighlight ?? null,
      ),
    [room?.game, playerId, placementIntent, room?.activePlacementHighlight],
  );

  useEffect(() => {
    controllerRef.current?.syncGameState(room?.game ?? null, highlights);
  }, [room?.game, highlights]);

  const boardTooltipTarget = useMemo(() => {
    if (screen !== 'tv_game' || !room?.game || !showBoardTooltips) return null;
    return getBoardTooltipTarget(room.game, playerId, {
      missionId: room.mode === 'tutorial' ? room.tutorialMission : undefined,
      placementIntent,
      subDrawer: activeSubDrawer,
      myResources: privateState?.resources,
    });
  }, [
    screen,
    room?.game,
    room?.mode,
    room?.tutorialMission,
    playerId,
    placementIntent,
    activeSubDrawer,
    privateState?.resources,
    showBoardTooltips,
  ]);

  const handleTooltipProject = useCallback(
    (pos: { x: number; y: number; visible: boolean } | null) => {
      const node = tooltipDomRef.current;
      if (!node) return;
      if (!pos || !pos.visible) {
        node.style.opacity = '0';
        return;
      }
      node.style.opacity = '1';
      node.style.transform = `translate3d(${pos.x}px, ${pos.y - 14}px, 0) translate(-50%, -100%)`;
    },
    [],
  );

  useEffect(() => {
    controllerRef.current?.setTooltipAnchor(
      boardTooltipTarget?.worldPos ?? null,
      handleTooltipProject,
    );
  }, [boardTooltipTarget, handleTooltipProject]);

  const toneStyle =
    boardTooltipTarget?.tone === 'crimson'
      ? { border: 'border-[#e05b4f]/80', badgeBg: 'bg-[#3d1816]', badgeText: 'text-[#fda4af]', pin: '#e05b4f' }
      : boardTooltipTarget?.tone === 'emerald'
        ? { border: 'border-[#49b372]/80', badgeBg: 'bg-[#153424]', badgeText: 'text-[#86efac]', pin: '#49b372' }
        : boardTooltipTarget?.tone === 'azure'
          ? { border: 'border-[#6cb2de]/80', badgeBg: 'bg-[#142c40]', badgeText: 'text-[#bae6fd]', pin: '#6cb2de' }
          : { border: 'border-[#f5d88c]/85', badgeBg: 'bg-[#2a2212]', badgeText: 'text-[#f5d88c]', pin: '#f5d88c' };

  return (
    <>
      <div
        ref={mountRef}
        data-testid="board-canvas-container"
        className="fixed inset-0 w-full h-full z-0"
      />

      {boardTooltipTarget && (
        <div className="fixed inset-0 z-[5] pointer-events-none overflow-hidden">
          <div
            ref={tooltipDomRef}
            data-testid="board-context-tooltip"
            data-target-kind={boardTooltipTarget.kind}
            data-target-id={boardTooltipTarget.id}
            style={{
              opacity: 0,
              transform: 'translate3d(50vw, 45vh, 0) translate(-50%, -100%)',
              willChange: 'transform, opacity',
            }}
            className="absolute left-0 top-0 pointer-events-none transition-opacity duration-150"
          >
            <div
              className={`w-[276px] rounded-xl bg-[#101821]/95 border ${toneStyle.border} px-3.5 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.65)]`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`font-mono-num text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${toneStyle.badgeBg} ${toneStyle.badgeText}`}
                >
                  {boardTooltipTarget.badge}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[#94a3b8]">
                  3D Board Cue
                </span>
              </div>
              <div className="font-display text-xs font-bold text-[#f7eed7] leading-tight">
                {boardTooltipTarget.title}
              </div>
              <div className="text-[11px] text-[#cbd5e1] leading-snug mt-1">
                {boardTooltipTarget.body}
              </div>
            </div>
            {/* Downward brass pointer stem anchoring directly onto the 3D board target */}
            <div className="flex flex-col items-center">
              <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
                <path
                  d="M2 0 L18 0 L10 11 Z"
                  fill="#101821"
                  stroke={toneStyle.pin}
                  strokeWidth="1.6"
                />
              </svg>
              <span
                className="w-2.5 h-2.5 rounded-full border border-[#101821] -mt-0.5"
                style={{ backgroundColor: toneStyle.pin }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
