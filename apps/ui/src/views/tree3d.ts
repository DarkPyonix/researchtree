import { displayName, seasonOf, t, type ResearchTree, type Season, type Status, type TreeNode, type VersionNode } from "@researchtree/core";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { formatMetric, reducedMotion, statusLabel } from "../theme";
import { branchColors, formatVersionDate, islandOf, mergeLinks, pathSet, placeTree, yearBoundaries } from "./layout";
import { LAYOUT_COL, type TreeViewApi, type ViewFilter, type ViewOptions } from "./view";

/*
 * "Research islands": the tree is laid out on voxel islands seen from an isometric camera. Every
 * research version gets its own island (the root version included), with open water between them;
 * a path to the next version ends at a wooden ferry landing, and a little ferry waits in the channel. Branches are dirt paths, and every experiment is a small
 * garden plot whose plant shows its status (grown tree, sapling, stump, sprout).
 *
 * The flat (2D) mode is the same scene: the camera turns top-down, plants are pressed flat, and the
 * ground and water disappear so only paths, plots and labels remain on the page background.
 */

const DEPTH_STEP = 10; // world units per layout column (x axis = time)
const ROW_STEP = 16; // world units between sibling rows (z axis): wide, so branches clearly fan out
const FRUSTUM = 30; // visible world height at zoom 1
const GROW_STEP = 380; // ms between generations in the intro animation
/** Opacity of plants and paths in a hidden status layer, and of their labels. */
const DIM_OPACITY = 0.22;
const DIM_LABEL = 0.25;
const CAMERA_DIR = new THREE.Vector3(-1, 1.25, 1.45).normalize();
const CAMERA_RADIUS = 120;
/** Top-down camera for the flat mode: tiny polar angle toward +z so screen right = +x and screen down = +z. */
const TOP_DOWN = new THREE.Spherical(CAMERA_RADIUS, 1e-4, 0);
/** Azimuth that puts +x (later in time) at the top of the screen: the camera sits on the -x side. */
const TREE_THETA = -Math.PI / 2;

/**
 * Which way the time axis runs on screen. "island" is the default angle (time runs to the right in
 * the flat mode, diagonally in 3D); "tree" turns the view so the first version is at the bottom and
 * the latest at the top.
 */
export type Heading = "island" | "tree";

/** Node id of the research intro reef: not a branch, so it can never clash with one. */
export const INTRO_ID = "__intro";

/** Water level: the reef and the ferries sit on it. */
const SEA_Y = -0.62;

const COLORS = {
  grass: ["#a7d38b", "#b0d994", "#9fcc84", "#b8dd9d", "#a3cf88"],
  sand: ["#efdcae", "#ead5a2", "#f2e3bb"],
  dirt: ["#c79b6d", "#bd9163", "#caa276"],
  path: "#f1e4c6",
  plot: "#b9de96",
  bed: "#b98a5e",
  bedGrey: "#b7ab9d",
  water: "#8fd3e3",
  trunk: "#8d5e3c",
  stump: "#a18a73",
  withered: "#cfc6b8",
  root: "#3d7a6b",
  cloud: "#ffffff",
  fence: "#fffaf0",
  fruit: "#f4c24f",
  flowers: ["#f7a1b5", "#ffffff", "#f9d56e", "#c9a7f2"],
  rock: ["#c9c4bc", "#bdb7ae"],
  /** An area nobody has unlocked: bare stone under fog. */
  locked: ["#7f8d95", "#cdd8db"],
  bush: ["#8cc474", "#7fb96a"],
};

/** One place on an account's map: a research to draw, or one this reader may not open. */
export interface WorldEntry {
  offset: THREE.Vector3;
  tree?: ResearchTree;
  filter?: ViewFilter;
  /** Repository of a research that could not be read: drawn as an area that is not unlocked. */
  locked?: string;
}

/**
 * Season looks (northern hemisphere, by date). The ground follows the season at its place on the
 * time axis; each experiment shows the season of its last work through an effect, not its colors:
 * spring blossoms and falling petals, summer fireflies, autumn falling leaves, winter snow.
 */
const SEASON = {
  spring: { grass: ["#b4dc92", "#bde29c", "#aad689"], accent: ["#f7b8c9", "#fbd3de", "#ffffff"], particle: ["#f7b8c9", "#fbd3de", "#fde9ef"] },
  summer: { grass: ["#93c974", "#8ac26b", "#9dd07e"], accent: ["#f9d56e", "#ffffff", "#c9a7f2"], particle: ["#fff3a0", "#fbe77a", "#fffbd6"] },
  autumn: { grass: ["#d9c774", "#d2b964", "#e1cf82"], accent: ["#e8893a", "#d9632f", "#f0b640"], particle: ["#e8893a", "#d25a3a", "#f0b640"] },
  winter: { grass: ["#eef3f6", "#e5edf2", "#f7fafc"], accent: ["#ffffff", "#dfe9f0", "#cfe0ea"], particle: ["#ffffff", "#f4f8fb", "#e8f0f6"] },
} satisfies Record<Season, { grass: string[]; accent: string[]; particle: string[] }>;
/** Particles per experiment for each season's effect. */
const PARTICLES: Record<Season, number> = { spring: 7, summer: 5, autumn: 6, winter: 9 };
const SNOW = "#ffffff";
const BRIDGE = ["#b98a5e", "#a97c52"];
/** Island radius around nodes and paths, and the water channel kept between two versions' islands. */
const ISLAND_RADIUS = 9;
const CHANNEL = 3.4;
/** Path cells this close (along the path) to land become a wooden landing; farther out is open water. */
const LANDING = 4;


type Rand = () => number;

/** True when no part of the island lies within `r` cells of this spot: real sea, not the shore. */
function openWater(x: number, z: number, ground: Set<string>, r: number): boolean {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (ground.has(`${Math.round(x + dx)},${Math.round(z + dz)}`)) return false;
    }
  }
  return true;
}

function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pick<T>(list: readonly T[], r: Rand): T {
  return list[Math.floor(r() * list.length) % list.length]!;
}

function tint(hex: string, toward: string, t: number): string {
  return "#" + new THREE.Color(hex).lerp(new THREE.Color(toward), t).getHexString();
}

/** Write an inline style only when it changes, so unchanged labels never invalidate style. */
/** A parent-child link, or a dashed merge from an experiment into a version. */
type Link = { source: { data: { id: string } }; target: { data: { id: string; node?: TreeNode }; depth: number }; dashed?: boolean };

/** How a hidden status layer draws its plants and the paths to them. */
function fade(m: THREE.Material): void {
  m.transparent = true;
  m.opacity = DIM_OPACITY;
  m.depthWrite = false;
}

function setStyle(el: HTMLElement, prop: "opacity" | "visibility", value: string): void {
  if (el.style[prop] !== value) el.style[prop] = value;
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface NodeVisual {
  id: string | null; // null = research root
  node?: TreeNode;
  group: THREE.Group;
  pos: THREE.Vector3;
  top: number;
  color: string;
  label: HTMLElement;
  materials: THREE.MeshStandardMaterial[];
  sway?: THREE.Object3D;
  /** The garden plot under the plant: hidden in the flat mode. */
  base?: THREE.Object3D[];
  appearAt: number;
  depth: number;
}

/** Where a season effect plays: an experiment's plant. */
interface Emitter {
  x: number;
  z: number;
  top: number;
  appearAt: number;
  seed: number;
}

interface Effect {
  season: Season;
  mesh: THREE.InstancedMesh;
  emitters: Emitter[];
}

interface YearMark {
  pos: THREE.Vector3;
  label: HTMLElement;
}

interface PathVisual {
  mesh: THREE.InstancedMesh;
  total: number;
  startAt: number;
  targetId: string;
}

interface CameraState {
  sph: THREE.Spherical;
  target: THREE.Vector3;
  zoom: number;
  flat: number;
}

interface Morph {
  from: CameraState;
  to: CameraState;
  start: number;
  duration: number;
  /** Maps time (0..1) to the flat value; may overshoot for a springy rise. */
  flatAt: (t: number) => number;
  done: () => void;
}

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
  start: number;
  duration: number;
}

/** Isometric voxel island view (three.js). */
export class Tree3D implements TreeViewApi {
  static supported(): boolean {
    try {
      const c = document.createElement("canvas");
      return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      return false;
    }
  }

  private readonly wrap: HTMLDivElement;
  private readonly labels: HTMLDivElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private readonly world = new THREE.Group();
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly sun: THREE.DirectionalLight;
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly observer: ResizeObserver;
  private readonly matCache = new Map<string, THREE.MeshStandardMaterial>();
  private disposables: { dispose(): void }[] = [];

  private visuals = new Map<string, NodeVisual>();
  private rootVisual: NodeVisual | null = null;
  /** True while several research islands share the sea: node ids carry their repository. */
  private scoped = false;
  /** The research being read on a sea of several, if any: what a morph frames and what stays labelled. */
  private scope: string | null = null;
  /** Island bounds accumulate across every tree in the scene. */
  private islandFresh = true;
  /** The research intro rock beside the first version, and its label. */
  private reef: THREE.Group | null = null;
  /** Every reef in the scene: one per research island. */
  private reefs: { group: THREE.Group; label: HTMLElement }[] = [];
  /** One name per research island, floating over it on the world map. */
  private islandNames: { label: HTMLElement; at: THREE.Vector3 }[] = [];
  /** Middle of each locked island: they have no plants to fit the camera around. */
  private lockedSpots: THREE.Vector3[] = [];
  /** Where each research sits on a map of many, and which one the camera is over. */
  private islandSpots: { repo: string; at: THREE.Vector3 }[] = [];
  private overIsland: string | null = null;
  /** Set the first time the reader drags or zooms: until then the camera is only being framed. */
  private sailed = false;
  private reefPos: THREE.Vector3 | null = null;
  private reefLabel: HTMLElement | null = null;
  private paths: PathVisual[] = [];
  private clouds: THREE.Group[] = [];
  /** Shown only in the flat mode: dashed crossings over the water, so branches stay connected. */
  private flatOnly: THREE.Object3D[] = [];
  private ferries: THREE.Group[] = [];
  private yearMarks: YearMark[] = [];
  private emitters: Record<Season, Emitter[]> = { spring: [], summer: [], autumn: [], winter: [] };
  private effects: Effect[] = [];
  /** World x -> date (ms), or null when the tree has no real time spread. */
  private dateAtX: ((x: number) => number) | null = null;
  private island = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  private tree: ResearchTree | null = null;
  private selected: string | null = null;
  private hovered: string | null = null;
  private tween: Tween | null = null;
  private introStart = 0;
  private raf = 0;
  private last = performance.now();
  private down: { x: number; y: number } | null = null;
  /** 0 = standing island, 1 = pressed flat under a top-down camera (the flat mode). */
  private flat = 0;
  /** Flat (2D) mode: top-down camera, pan and zoom only, no ground. */
  private flatMode = false;
  /** Ground, water, landings and ferries: hidden in the flat mode. */
  private ground: THREE.Object3D[] = [];
  /** Cells covered by paths (kept off the island edges). */
  private pathCells = new Set<string>();
  private morph: Morph | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: ViewOptions,
    /** Start in the flat (2D) mode, ready to `raise()`. */
    startFlat = false,
    private heading: Heading = "island",
  ) {
    this.wrap = document.createElement("div");
    this.wrap.className = "tree3d";
    this.labels = document.createElement("div");
    this.labels.className = "labels3d";

    // Transparent: the page background shows through (plain in 3D, dotted in the flat mode).
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "tree3d-canvas";
    this.wrap.append(this.renderer.domElement, this.labels);
    container.append(this.wrap);

    this.scene.add(this.world);

    // Wide near/far range: an orthographic camera can see behind its own position, which keeps the
    // sea from being clipped at the bottom of the screen when looking down at an angle.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
    this.camera.position.setFromSpherical(this.isoSph());
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff7ea, 0xa9c79a, 1.9));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.75, 2.15, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.03; // far enough out for a whole map of research islands
    this.controls.maxZoom = 4;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener("start", () => {
      this.tween = null;
      // From here on, where the camera ends up is where the reader chose to sail.
      this.sailed = true;
    });

    const el = this.renderer.domElement;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener("pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!d || this.morph || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || e.button !== 0) return;
      this.opts.onSelect(this.pick(e.clientX, e.clientY));
    });
    el.addEventListener("pointermove", (e) => {
      if (e.buttons) return;
      const id = this.pick(e.clientX, e.clientY);
      if (id !== this.hovered) {
        this.hovered = id;
        el.style.cursor = id ? "pointer" : "";
      }
    });

    if (startFlat) {
      this.flat = 1;
      this.setFlatMode(true);
    }

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ building the island

  private mat(color: string): THREE.MeshStandardMaterial {
    let m = this.matCache.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
      this.matCache.set(color, m);
    }
    return m;
  }

  private box(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(this.unitBox, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private instanced(count: number, castShadow = false): THREE.InstancedMesh {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const mesh = new THREE.InstancedMesh(this.unitBox, mat, Math.max(1, count));
    // Instances spread over the whole map, and paths grow from zero instances during the intro, so a
    // bounding sphere taken early would make three.js cull whole paths once you drag. Always draw them.
    mesh.frustumCulled = false;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.disposables.push(mat, mesh);
    return mesh;
  }

  private clearWorld(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    for (const v of [...this.visuals.values(), ...(this.rootVisual ? [this.rootVisual] : [])]) {
      for (const m of v.materials) m.dispose();
    }
    this.world.clear();
    this.labels.replaceChildren();
    this.visuals.clear();
    this.rootVisual = null;
    this.reef = null;
    this.reefPos = null;
    this.reefLabel = null;
    this.reefs = [];
    this.islandNames = [];
    this.lockedSpots = [];
    this.islandSpots = [];
    this.overIsland = null;
    this.islandFresh = true;
    this.paths = [];
    this.clouds = [];
    this.flatOnly = [];
    this.ferries = [];
    this.yearMarks = [];
    this.labelBase = new Map();
    this.ground = [];
    this.pathCells = new Set();
    this.emitters = { spring: [], summer: [], autumn: [], winter: [] };
    this.effects = [];
  }

  /** Season at a world x position (falls back to summer when there is no time axis). */
  private seasonAtX(x: number): Season {
    return this.dateAtX ? seasonOf(new Date(this.dateAtX(x)).toISOString()) : "summer";
  }

  render(tree: ResearchTree, filter: ViewFilter): void {
    const firstForTree = this.tree?.repo !== tree.repo;
    this.tree = tree;
    this.clearWorld();
    this.scoped = false;
    this.labels.classList.remove("world");
    this.buildTree(tree, filter, new THREE.Vector3());
    this.finish(firstForTree);
  }

  /**
   * Several research islands on one sea (docs/ISLAND.md): the account's whole map, drawn with the
   * same islands the viewer sails into. Node ids are scoped by repository, because two repositories
   * may well both have an `experiment/warmup`.
   */
  renderWorld(entries: WorldEntry[], keepCamera = false): void {
    this.tree = entries.find((e) => e.tree)?.tree ?? null;
    this.clearWorld();
    this.scoped = true;
    // On a map of islands the plants keep their shapes but lose their chips: only the research's
    // own name is readable at this distance.
    this.labels.classList.add("world");
    for (const entry of entries) {
      if (entry.tree) this.buildTree(entry.tree, entry.filter ?? { hidden: new Set(), metrics: new Map() }, entry.offset);
      else if (entry.locked) this.buildLocked(entry.locked, entry.offset);
    }
    // Swapping which islands are on the sea must not move the reader: only a first draw frames itself.
    this.finish(!keepCamera);
  }

  /**
   * Research this reader cannot open, drawn the way a game draws an area nobody has unlocked: the
   * island is there in outline, under fog, with a sign saying what it would take to walk on it.
   */
  private buildLocked(repo: string, offset: THREE.Vector3): void {
    const g = new THREE.Group();
    g.position.copy(offset);
    g.userData.nodeId = `${repo}\u0000`;
    const [stone, fog] = this.nodeMaterials([COLORS.locked[0]!, COLORS.locked[1]!]);
    // A low plateau under three banks of cloud: a shape, with nothing on it to read.
    this.box(g, stone!, 44, 3.4, 28, 0, -1.7, 0);
    this.box(g, stone!, 30, 3.4, 40, -2, -1.7, 1);
    this.box(g, stone!, 20, 3, 20, 6, 1.4, -4);
    this.box(g, fog!, 42, 3.2, 30, 1, 3.4, 1);
    this.box(g, fog!, 30, 3, 38, -3, 6, -1);
    this.box(g, fog!, 20, 2.6, 20, 5, 8.4, 3);
    this.world.add(g);
    const label = this.makeLabel(g.userData.nodeId as string, t("world.lockedName"), t("world.lockedSub"), "island-name locked");
    this.islandNames.push({ label, at: offset.clone() });
    this.lockedSpots.push(offset.clone());
    this.islandSpots.push({ repo, at: offset.clone() });
    // The map is framed around everything on it, this island included.
    const half = 26;
    this.island = this.islandFresh
      ? { minX: offset.x - half, maxX: offset.x + half, minZ: offset.z - half, maxZ: offset.z + half }
      : {
          minX: Math.min(this.island.minX, offset.x - half),
          maxX: Math.max(this.island.maxX, offset.x + half),
          minZ: Math.min(this.island.minZ, offset.z - half),
          maxZ: Math.max(this.island.maxZ, offset.z + half),
        };
    this.islandFresh = false;
  }

  /** Where one research's island sits, and everything on it. */
  private buildTree(tree: ResearchTree, filter: ViewFilter, offset: THREE.Vector3): void {
    const scope = this.scoped ? tree.repo : "";
    const rand = mulberry32(hash(tree.repo));

    // Layout: the time-axis placement, mapped onto the ground plane.
    const placement = placeTree(tree, LAYOUT_COL);
    const unit = DEPTH_STEP / LAYOUT_COL;
    const pts = [...placement.pos.values()];
    const xs = pts.map((p) => p.x * unit);
    const zs = pts.map((p) => p.row * ROW_STEP);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const worldOf = (p: (typeof pts)[number]) => new THREE.Vector3(p.x * unit - cx + offset.x, 0, p.row * ROW_STEP - cz + offset.z);
    // The time axis belongs to one research; a whole map of them has no single one.
    this.dateAtX = this.scoped ? null : placement.timed ? (x) => placement.xToDate((x + cx) / unit) : null;

    const colors = new Map([...branchColors(tree)].map(([id, c]) => [id, tint(c, "#ffffff", 0.08)]));

    const positions = new Map(pts.map((p) => [p.data.id, worldOf(p)]));
    const occupied = new Set<string>();
    const cell = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
    for (const p of positions.values()) {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) occupied.add(cell(p.x + dx, p.z + dz));
    }

    const depthOf = new Map(pts.map((p) => [p.data.id, p.depth]));
    const merges = mergeLinks(tree)
      .filter((m) => positions.has(m.from) && positions.has(m.to))
      .map((m) => ({ source: { data: { id: m.from } }, target: { data: { id: m.to }, depth: depthOf.get(m.to) ?? 1 }, dashed: true }));
    const traced = this.tracePaths([...placement.links, ...merges], positions, occupied);
    // Each node lives on the island of the version it grows from (the root is the first version).
    const eras = new Map([...positions.keys()].map((id) => [id, islandOf(tree, id)]));
    const { land, ground } = this.buildIsland(positions, eras, placement.links, occupied, rand);
    // Paths to experiments in a hidden status layer fade with their plants. A merge link's experiment is its source.
    const hidden = new Set(pts.flatMap((p) => (p.data.node && filter.hidden.has(p.data.node.status) ? [p.data.id] : [])));
    this.buildPaths(traced, positions, colors, ground, (l) => hidden.has(l.dashed ? l.source.data.id : l.target.data.id));
    this.buildDecorations(land, occupied, rand);
    if (placement.timed) this.buildYearMarks(yearBoundaries(placement.start, placement.end).map((y) => ({ year: y.year, x: placement.dateToX(y.at) * unit - cx })), land);
    this.buildClouds(rand);

    for (const p of pts) {
      const pos = positions.get(p.data.id)!;
      const id = scope ? `${scope}\u0000${p.data.id}` : p.data.id;
      if (p.data.node) this.visuals.set(id, this.rescope(this.buildExperiment(p.data.node, pos, colors.get(p.data.id) ?? "#999999", p.depth, filter), id));
      else if (p.data.version) this.visuals.set(id, this.rescope(this.buildVersion(tree.root, p.data.version, pos, p.depth), id));
      else {
        const root = this.rescope(this.buildRoot(tree.root, tree.rootVersion, pos), id);
        if (scope) this.visuals.set(id, root);
        else this.rootVisual = root;
        // The reef in the water beside the first version: what this research is about (docs/ISLAND.md).
        this.buildReef(pos, ground, scope);
      }
    }

    this.buildEffects(rand);
    if (scope) this.nameIsland(tree, offset);
  }

  /** The research's name, written over its island, so a sea of them stays readable. */
  private nameIsland(tree: ResearchTree, offset: THREE.Vector3): void {
    const label = this.makeLabel(`${tree.repo}\u0000`, tree.repo.split("/")[1] ?? tree.repo, tree.repo, "island-name");
    this.islandNames.push({ label, at: offset.clone() });
    this.islandSpots.push({ repo: tree.repo, at: offset.clone() });
  }

  /** A visual and its group answer to the scoped id, so a click says which research it was. */
  private rescope(v: NodeVisual, id: string): NodeVisual {
    if (id === v.id) return v;
    v.group.userData.nodeId = id;
    return { ...v, id };
  }

  private finish(firstForTree: boolean): void {
    const span = Math.max(this.island.maxX - this.island.minX, this.island.maxZ - this.island.minZ) / 2 + 6;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -span;
    cam.right = cam.top = span;
    cam.near = 1;
    cam.far = 200;
    cam.updateProjectionMatrix();
    this.sun.position.set(-28, 60, 36);
    this.sun.target.position.set(0, 0, 0);

    this.applySelection();
    if (firstForTree && this.flatMode) {
      const goal = this.computeFit(undefined, new THREE.Vector3().setFromSpherical(this.topDown()).normalize());
      if (goal) this.setCamera(this.topDown(), goal.target, goal.zoom);
      this.introStart = -1e9;
    } else if (firstForTree) {
      this.fit(undefined, false);
      this.introStart = reducedMotion() ? -1e9 : performance.now();
    }
  }

  /** Tile cells (two wide) along each link's curve, in order from source to target. */
  private tracePaths(
    links: Link[],
    positions: Map<string, THREE.Vector3>,
    occupied: Set<string>,
  ): { link: Link; cells: [number, number][] }[] {
    const cellOf = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
    return links.map((l) => {
      const a = positions.get(l.source.data.id)!;
      const b = positions.get(l.target.data.id)!;
      const mx = (a.x + b.x) / 2;
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(a.x, 0, a.z),
        new THREE.Vector3(mx, 0, a.z),
        new THREE.Vector3(mx, 0, b.z),
        new THREE.Vector3(b.x, 0, b.z),
      );
      const cells: [number, number][] = [];
      const seen = new Set<string>();
      const add = (x: number, z: number) => {
        const k = cellOf(x, z);
        if (seen.has(k)) return;
        seen.add(k);
        cells.push([Math.round(x), Math.round(z)]);
        occupied.add(k);
        this.pathCells.add(k);
      };
      const steps = Math.ceil(curve.getLength() * 3);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = curve.getPoint(t);
        const d = curve.getTangent(t);
        // Two tiles wide: widen across the direction of travel.
        if (Math.abs(d.x) >= Math.abs(d.z)) {
          add(p.x, Math.floor(p.z));
          add(p.x, Math.ceil(p.z));
        } else {
          add(Math.floor(p.x), p.z);
          add(Math.ceil(p.x), p.z);
        }
      }
      return { link: l, cells };
    });
  }

  /**
   * Path tiles on land; where a path leaves an island it becomes a wooden landing on posts, and the
   * open water in between gets a ferry. The flat mode hides all of that and draws each link as a
   * plain line instead (see buildFlatLines).
   */
  private buildPaths(
    traced: ReturnType<Tree3D["tracePaths"]>,
    positions: Map<string, THREE.Vector3>,
    colors: Map<string, string>,
    ground: Set<string>,
    faded: (link: Link) => boolean,
  ): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const planks: [number, number][] = [];
    const posts: [number, number][] = [];
    for (const { link: l, cells } of traced) {
      const rejected = l.target.data.node?.status === "rejected";
      const color = new THREE.Color(
        rejected ? tint(COLORS.path, "#b9b2a6", 0.35) : tint(COLORS.path, colors.get(l.target.data.id) ?? COLORS.path, 0.42),
      );
      const onLand = cells.map(([x, z]) => ground.has(`${x},${z}`));
      const landIdx = onLand.flatMap((v, i) => (v ? [i] : []));
      const nearLand = (i: number) => landIdx.some((j) => Math.abs(i - j) <= LANDING);
      const tiles = cells.filter((_, i) => onLand[i]);
      const open: number[] = [];
      cells.forEach(([x, z], i) => {
        if (onLand[i]) return;
        if (nearLand(i)) {
          planks.push([x, z]);
          if ((x + z) % 3 === 0) posts.push([x, z]);
        } else {
          open.push(i);
        }
      });

      const mesh = this.instanced(tiles.length);
      if (faded(l)) fade(mesh.material as THREE.MeshStandardMaterial);
      tiles.forEach(([x, z], i) => {
        m.compose(new THREE.Vector3(x, 0.06, z), q, new THREE.Vector3(1, 0.12, 1));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color);
      });
      this.world.add(mesh);
      this.paths.push({ mesh, total: tiles.length, startAt: (l.target.depth - 1) * GROW_STEP, targetId: l.target.data.id });

      // One ferry in the middle of the open water, pointing along the crossing.
      if (open.length >= 3) {
        const [fx, fz] = cells[open[Math.floor(open.length / 2)]!]!;
        const a = positions.get(l.source.data.id)!;
        const b = positions.get(l.target.data.id)!;
        this.buildFerry(fx, fz, Math.atan2(-(b.z - a.z), b.x - a.x), color);
      }
    }

    const plankMesh = this.instanced(planks.length, true);
    planks.forEach(([x, z], i) => {
      m.compose(new THREE.Vector3(x, -0.14, z), q, new THREE.Vector3(1.02, 0.2, 1.02));
      plankMesh.setMatrixAt(i, m);
      plankMesh.setColorAt(i, new THREE.Color(BRIDGE[(x + z) & 1]!));
    });
    plankMesh.count = planks.length;
    const postMesh = this.instanced(posts.length, true);
    posts.forEach(([x, z], i) => {
      m.compose(new THREE.Vector3(x + 0.42, -0.4, z + 0.42), q, new THREE.Vector3(0.16, 0.9, 0.16));
      postMesh.setMatrixAt(i, m);
      postMesh.setColorAt(i, new THREE.Color(COLORS.trunk));
    });
    postMesh.count = posts.length;
    this.world.add(plankMesh, postMesh);
    this.ground.push(plankMesh, postMesh);
    this.buildFlatLines(traced.map((t) => t.link), positions, colors, faded);
  }

  /**
   * Flat mode: every link as a thin line in its branch colour along the same curve as the 3D path
   * (dashed for extra merges into a version). One mesh with vertex colours, shown only when flat.
   */
  private buildFlatLines(
    links: Link[],
    positions: Map<string, THREE.Vector3>,
    colors: Map<string, string>,
    faded: (link: Link) => boolean,
  ): void {
    const WIDTH = 0.5;
    const DASH = 1.2;
    const layers = [false, true].map((dim) => ({ dim, pos: [] as number[], col: [] as number[] }));
    for (const l of links) {
      const { pos, col } = layers[faded(l) ? 1 : 0]!;
      const a = positions.get(l.source.data.id)!;
      const b = positions.get(l.target.data.id)!;
      const mx = (a.x + b.x) / 2;
      const curve = new THREE.CubicBezierCurve(new THREE.Vector2(a.x, a.z), new THREE.Vector2(mx, a.z), new THREE.Vector2(mx, b.z), new THREE.Vector2(b.x, b.z));
      const rejected = l.target.data.node?.status === "rejected";
      const c = new THREE.Color(rejected ? "#b9b2a6" : (colors.get(l.target.data.id) ?? COLORS.trunk));
      const pts = curve.getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() * 2)));
      let run = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i]!;
        const q = pts[i + 1]!;
        const len = p.distanceTo(q);
        const on = !l.dashed || Math.floor(run / DASH) % 2 === 0;
        run += len;
        if (!on || len === 0) continue;
        const nx = (-(q.y - p.y) / len) * (WIDTH / 2);
        const nz = ((q.x - p.x) / len) * (WIDTH / 2);
        const y = 0.2;
        const quad = [p.x + nx, y, p.y + nz, p.x - nx, y, p.y - nz, q.x + nx, y, q.y + nz, q.x - nx, y, q.y - nz];
        const [v0, v1, v2, v3] = [0, 3, 6, 9];
        for (const k of [v0, v1, v2, v2, v1, v3]) pos.push(quad[k]!, quad[k + 1]!, quad[k + 2]!);
        for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      }
    }
    for (const { dim, pos, col } of layers) {
      if (!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      if (dim) fade(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.disposables.push(geo, mat);
      this.world.add(mesh);
      this.flatOnly.push(mesh);
    }
  }

  /** A little ferry moored in the channel between two islands. */
  private buildFerry(x: number, z: number, angle: number, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.set(x, -0.62, z);
    g.rotation.y = angle;
    const hull = this.mat("#b98a5e");
    const rim = this.mat("#8d5e3c");
    const sail = this.mat("#fffaf0");
    const flag = this.mat("#" + color.getHexString());
    this.box(g, hull, 1.9, 0.32, 0.95, 0, 0, 0);
    this.box(g, rim, 2.1, 0.12, 1.1, 0, 0.3, 0);
    this.box(g, rim, 0.5, 0.2, 0.7, 0.95, 0.1, 0);
    this.box(g, rim, 0.1, 1.5, 0.1, -0.1, 0.4, 0);
    this.box(g, sail, 0.06, 0.95, 0.7, 0.05, 0.7, 0.28);
    this.box(g, flag, 0.04, 0.2, 0.34, -0.1, 1.72, 0.18);
    g.userData.phase = (x * 13 + z * 7) % 10;
    this.world.add(g);
    this.ground.push(g);
    this.ferries.push(g);
  }

  /**
   * One island per research version. Every cell belongs to the version whose nodes and paths are
   * nearest; it is land when close enough and not on the channel between two versions.
   */
  private buildIsland(
    positions: Map<string, THREE.Vector3>,
    eras: Map<string, string>,
    links: { source: { data: { id: string } }; target: { data: { id: string } } }[],
    occupied: Set<string>,
    r: Rand,
  ): { land: [number, number][]; ground: Set<string> } {
    const seeds = new Map<string, THREE.Vector2[]>();
    const seed = (era: string, x: number, z: number) => {
      let list = seeds.get(era);
      if (!list) seeds.set(era, (list = []));
      list.push(new THREE.Vector2(x, z));
    };
    for (const [id, p] of positions) seed(eras.get(id)!, p.x, p.z);
    for (const l of links) {
      const era = eras.get(l.source.data.id);
      if (era === undefined || era !== eras.get(l.target.data.id)) continue;
      const a = positions.get(l.source.data.id)!;
      const b = positions.get(l.target.data.id)!;
      const mx = (a.x + b.x) / 2;
      const curve = new THREE.CubicBezierCurve(new THREE.Vector2(a.x, a.z), new THREE.Vector2(mx, a.z), new THREE.Vector2(mx, b.z), new THREE.Vector2(b.x, b.z));
      for (const q of curve.getSpacedPoints(Math.max(2, Math.ceil(curve.getLength() / 1.5)))) seed(era, q.x, q.y);
    }

    const ps = [...positions.values()];
    const minX = Math.min(...ps.map((p) => p.x)) - 6;
    const maxX = Math.max(...ps.map((p) => p.x)) + 7;
    const minZ = Math.min(...ps.map((p) => p.z)) - 5;
    const maxZ = Math.max(...ps.map((p) => p.z)) + 5;
    this.island = this.islandFresh
      ? { minX, maxX, minZ, maxZ }
      : {
          minX: Math.min(this.island.minX, minX),
          maxX: Math.max(this.island.maxX, maxX),
          minZ: Math.min(this.island.minZ, minZ),
          maxZ: Math.max(this.island.maxZ, maxZ),
        };
    this.islandFresh = false;

    const groups = [...seeds.values()];
    const cells: { x: number; z: number; edge: boolean; h: number }[] = [];
    for (let x = Math.floor(minX) - 1; x <= Math.ceil(maxX) + 1; x++) {
      for (let z = Math.floor(minZ) - 1; z <= Math.ceil(maxZ) + 1; z++) {
        let d1 = Infinity;
        let d2 = Infinity;
        for (const pts of groups) {
          let d = Infinity;
          for (const q of pts) d = Math.min(d, (q.x - x) ** 2 + (q.y - z) ** 2);
          d = Math.sqrt(d);
          if (d < d1) [d1, d2] = [d, d1];
          else if (d < d2) d2 = d;
        }
        const wobble = (r() - 0.5) * 0.9;
        const key = `${x},${z}`;
        if (d1 > ISLAND_RADIUS + wobble || d2 - d1 < CHANNEL) continue;
        const edge = (d1 > ISLAND_RADIUS - 1.3 + wobble * 0.5 || d2 - d1 < CHANNEL + 0.9) && !occupied.has(key);
        cells.push({ x, z, edge, h: r() < 0.12 ? 0.08 : 0 });
      }
    }

    const top = this.instanced(cells.length);
    const base = this.instanced(cells.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    cells.forEach((c, i) => {
      const topH = c.edge ? 0.3 : 0.4 + c.h;
      m.compose(new THREE.Vector3(c.x, -topH / 2 + (c.edge ? -0.08 : c.h), c.z), q, new THREE.Vector3(1, topH, 1));
      top.setMatrixAt(i, m);
      top.setColorAt(i, new THREE.Color(c.edge ? pick(COLORS.sand, r) : pick(SEASON[this.seasonAtX(c.x)].grass, r)));
      m.compose(new THREE.Vector3(c.x, -0.4 - 0.9, c.z), q, new THREE.Vector3(1, 1.8, 1));
      base.setMatrixAt(i, m);
      base.setColorAt(i, new THREE.Color(pick(COLORS.dirt, r)));
    });

    const rx = (maxX - minX) / 2;
    const rz = (maxZ - minZ) / 2;
    const water = new THREE.Mesh(
      // Far larger than any view, so the sea reaches every edge of the screen.
      new THREE.PlaneGeometry(rx * 2 + 4000, rz * 2 + 4000),
      new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.9 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set((minX + maxX) / 2, -0.75, (minZ + maxZ) / 2);
    water.receiveShadow = true;
    this.disposables.push(water.geometry, water.material);
    this.world.add(top, base, water);
    this.ground.push(top, base, water);

    return { land: cells.filter((c) => !c.edge).map((c) => [c.x, c.z]), ground: new Set(cells.map((c) => `${c.x},${c.z}`)) };
  }

  private buildDecorations(land: [number, number][], occupied: Set<string>, r: Rand): void {
    const free = land.filter(([x, z]) => !occupied.has(`${x},${z}`));
    const flowers: [number, number, string][] = [];
    const tufts: [number, number, string][] = [];
    const rocks: [number, number, string][] = [];
    const bushes: [number, number, string][] = [];
    for (const [x, z] of free) {
      const t = r();
      const season = this.seasonAtX(x);
      const bloom = season === "spring" ? 0.13 : season === "winter" ? 0.03 : 0.07;
      if (t < bloom) flowers.push([x, z, pick(SEASON[season].accent, r)]);
      else if (t < bloom + 0.08) tufts.push([x, z, season === "winter" ? SNOW : season === "autumn" ? "#c9b562" : "#93c878"]);
      else if (t < bloom + 0.105) rocks.push([x, z, pick(COLORS.rock, r)]);
      else if (t < bloom + 0.13) bushes.push([x, z, season === "winter" ? "#e9f0f3" : season === "autumn" ? pick(SEASON.autumn.accent, r) : pick(COLORS.bush, r)]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const place = (items: [number, number, string?][], size: [number, number, number], y: number, color: (c?: string) => string, cast: boolean) => {
      const mesh = this.instanced(items.length, cast);
      items.forEach(([x, z, c], i) => {
        const jx = (r() - 0.5) * 0.5;
        const jz = (r() - 0.5) * 0.5;
        const s = 0.8 + r() * 0.4;
        m.compose(new THREE.Vector3(x + jx, y + (size[1] * s) / 2, z + jz), q, new THREE.Vector3(size[0] * s, size[1] * s, size[2] * s));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(color(c)));
      });
      mesh.count = items.length;
      this.world.add(mesh);
      this.ground.push(mesh);
    };
    place(flowers.map(([x, z]) => [x, z]), [0.08, 0.32, 0.08], 0, () => "#6fae57", false);
    place(flowers, [0.22, 0.18, 0.22], 0.3, (c) => c ?? "#ffffff", false);
    place(tufts, [0.3, 0.22, 0.3], 0, (c) => c ?? "#93c878", false);
    place(rocks, [0.55, 0.32, 0.45], 0, (c) => c ?? "#c9c4bc", true);
    place(bushes, [0.8, 0.6, 0.8], 0, (c) => c ?? "#8cc474", true);
  }

  private buildYearMarks(years: { year: number; x: number }[], land: [number, number][]): void {
    const { minX, maxX } = this.island;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const stone = new THREE.Color("#e9e3d6");
    for (const { year, x } of years) {
      if (x < minX + 1 || x > maxX - 1) continue;
      const col = Math.round(x);
      const cells = land.filter(([cx]) => cx === col);
      if (cells.length === 0) continue;
      const mesh = this.instanced(cells.length);
      cells.forEach(([cx, cz], i) => {
        m.compose(new THREE.Vector3(cx, 0.03, cz), q, new THREE.Vector3(0.5, 0.06, i % 2 ? 0.7 : 0.9));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, stone);
      });
      this.world.add(mesh);
      this.ground.push(mesh);
      const zs = cells.map(([, z]) => z);
      const label = document.createElement("div");
      label.className = "year3d";
      label.textContent = String(year);
      this.labels.append(label);
      this.yearMarks.push({ pos: new THREE.Vector3(col, 0, Math.min(...zs) - 0.5), label });
    }
  }

  private buildEffects(r: Rand): void {
    for (const season of ["spring", "summer", "autumn", "winter"] as const) {
      const emitters = this.emitters[season];
      if (emitters.length === 0) continue;
      const count = emitters.length * PARTICLES[season];
      let mesh: THREE.InstancedMesh;
      if (season === "summer") {
        // Fireflies glow: unlit material so they stay bright in the shade.
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        mesh = new THREE.InstancedMesh(this.unitBox, mat, count);
        this.disposables.push(mat, mesh);
      } else {
        mesh = this.instanced(count);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(pick(SEASON[season].particle, r)));
      this.world.add(mesh);
      this.effects.push({ season, mesh, emitters });
    }
  }

  /** Animate falling petals / leaves / snow and drifting fireflies. */
  private stepEffects(now: number, since: number, visible: boolean): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const t = now / 1000;
    const frac = (x: number) => x - Math.floor(x);
    for (const fx of this.effects) {
      fx.mesh.visible = visible;
      if (!visible) continue;
      const per = PARTICLES[fx.season];
      let i = 0;
      for (const em of fx.emitters) {
        const live = since > em.appearAt + 520;
        for (let k = 0; k < per; k++, i++) {
          const seed = em.seed + k * 7.31;
          const a = frac(seed * 0.618) * Math.PI * 2;
          const rr = 0.5 + frac(seed * 3.7) * 1.3;
          if (!live) {
            sc.set(0, 0, 0);
          } else if (fx.season === "summer") {
            const ang = a + t * (0.35 + frac(seed * 1.9) * 0.4);
            p.set(em.x + Math.cos(ang) * (rr + 0.6), em.top * 0.55 + Math.sin(t * 1.3 + seed) * 0.7 + 0.4, em.z + Math.sin(ang) * (rr + 0.6));
            const glow = Math.max(0, Math.sin(t * 2.4 + seed * 5));
            sc.setScalar(0.05 + glow * 0.11);
            e.set(0, 0, 0);
          } else {
            const period = fx.season === "spring" ? 5 : fx.season === "autumn" ? 6 : 7.5;
            const u = frac(t / period + frac(seed * 0.377));
            const start = fx.season === "winter" ? em.top + 3.2 : em.top;
            const y = start * (1 - u) + 0.08;
            const drift = Math.sin(t * 1.4 + seed) * (fx.season === "winter" ? 0.15 : 0.45);
            p.set(em.x + Math.cos(a) * rr + drift, y, em.z + Math.sin(a) * rr + drift * 0.5);
            const fade = Math.min(1, y * 4, (1 - u) * 8);
            if (fx.season === "winter") {
              sc.setScalar(0.1 * fade);
              e.set(0, 0, 0);
            } else {
              const leaf = fx.season === "autumn";
              sc.set((leaf ? 0.24 : 0.17) * fade, 0.035, (leaf ? 0.18 : 0.13) * fade);
              e.set(t * 1.7 + seed, t * 1.1 + seed, t * 0.8);
            }
          }
          m.compose(p, q.setFromEuler(e), sc);
          fx.mesh.setMatrixAt(i, m);
        }
      }
      fx.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private buildClouds(r: Rand): void {
    const { minX, maxX, minZ, maxZ } = this.island;
    const mat = this.mat(COLORS.cloud);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const n = 2 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const s = 0.7 + r() * 0.8;
        const b = this.box(g, mat, s * 1.7, s * 0.6, s * 1.1, j * 1.1 - n * 0.5, r() * 0.35, (r() - 0.5) * 0.9);
        b.castShadow = false;
        b.receiveShadow = false;
      }
      const behind = r() < 0.5;
      g.position.set(minX + r() * (maxX - minX), 7 + r() * 3, behind ? minZ - 6 - r() * 4 : maxZ + 5 + r() * 4);
      g.userData.speed = 0.35 + r() * 0.35;
      this.clouds.push(g);
      this.world.add(g);
    }
  }

  private nodeMaterials(colors: string[]): THREE.MeshStandardMaterial[] {
    return colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 }));
  }

  /** A version milestone on the trunk: stone plinth, obelisk and a banner. */
  private buildVersion(root: string, version: VersionNode, pos: THREE.Vector3, depth: number): NodeVisual {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.nodeId = version.id;
    const mats = this.nodeMaterials(["#d8d2c6", "#ece7dd", COLORS.root, tint(COLORS.root, "#ffffff", 0.3), COLORS.trunk, COLORS.fruit]);
    const [plinth, stone, banner, bannerLight, pole, cap] = mats as THREE.MeshStandardMaterial[] as [
      THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial,
      THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial,
    ];
    this.box(g, plinth, 3, 0.3, 3, 0, 0, 0);
    this.box(g, stone, 1.6, 0.6, 1.6, 0, 0.3, 0);
    this.box(g, stone, 1, 2.4, 1, 0, 0.9, 0);
    this.box(g, stone, 0.6, 0.6, 0.6, 0, 3.3, 0);
    this.box(g, cap, 0.3, 0.3, 0.3, 0, 3.9, 0);
    this.box(g, pole, 0.12, 2.6, 0.12, 1.1, 0.3, 0.9);
    this.box(g, banner, 0.08, 0.8, 1.1, 1.1, 2.1, 0.35);
    this.box(g, bannerLight, 0.09, 0.2, 1.1, 1.1, 2.3, 0.35);
    this.world.add(g);
    return {
      id: version.id,
      group: g,
      pos,
      top: 4.4,
      color: COLORS.root,
      label: this.makeLabel(version.id, `${root} ${version.name}`, t("tree.versionSub", { date: formatVersionDate(version.date), n: version.mergedFrom.length }), "root version"),
      materials: mats,
      appearAt: (depth - 1) * GROW_STEP + 320,
      depth,
    };
  }

  private buildRoot(name: string, version: string | null, pos: THREE.Vector3): NodeVisual {
    // The root stands for the first research version; selecting it opens that version's panel.
    const g = new THREE.Group();
    g.position.copy(pos);
    const [trunk, leaf, leaf2, leaf3, stone] = this.nodeMaterials([COLORS.trunk, COLORS.root, tint(COLORS.root, "#ffffff", 0.18), tint(COLORS.root, "#ffffff", 0.34), "#d8d2c6"]);
    this.box(g, stone!, 3.2, 0.3, 3.2, 0, 0, 0);
    this.box(g, trunk!, 1, 3.2, 1, 0, 0.3, 0);
    this.box(g, trunk!, 0.4, 0.4, 1.8, 0, 2.2, 0);
    this.box(g, leaf!, 4, 1.6, 4, 0, 3.2, 0);
    this.box(g, leaf2!, 3, 1.2, 3, 0.2, 4.7, -0.2);
    this.box(g, leaf3!, 1.7, 0.9, 1.7, -0.2, 5.8, 0.2);
    const v: NodeVisual = {
      id: name,
      group: g,
      pos,
      top: 6.9,
      color: COLORS.root,
      label: this.makeLabel(name, version ? `${name} ${version}` : name, t("tree.rootSub"), "root"),
      materials: [trunk!, leaf!, leaf2!, leaf3!, stone!],
      appearAt: 0,
      depth: 0,
    };
    g.userData.nodeId = name;
    this.world.add(g);
    return v;
  }

  /**
   * A rock standing in the water off the first version, with a sign on it. Clicking it opens the
   * research intro, so a visitor can read what this is before walking the tree.
   */
  private buildReef(rootPos: THREE.Vector3, ground: Set<string>, scope = ""): void {
    const g = new THREE.Group();
    if (!scope) this.reefPos = null;
    // Out from the first version along -x, which the camera draws as the diagonal below and to the
    // left of it. It walks until the island is five cells behind it and it is a good way offshore,
    // so the islet it stands on reads as its own landmark rather than part of the shore.
    const OFFSHORE = 34;
    let x = rootPos.x - 3;
    const z = rootPos.z;
    for (let i = 0; i < 60 && (rootPos.x - x < OFFSHORE || !openWater(x, z, ground, 8)); i++) x -= 1;
    g.position.set(x, SEA_Y, z);
    g.userData.nodeId = scope ? `${scope}\u0000${INTRO_ID}` : INTRO_ID;
    const [rock, rockLight, moss, board, post, sand, grass] = this.nodeMaterials([
      COLORS.rock[0]!,
      COLORS.rock[1]!,
      COLORS.bush[0]!,
      "#f3e7c9",
      COLORS.trunk,
      COLORS.sand[0]!,
      COLORS.grass[0]!,
    ]);
    // An islet of its own, so the rock stands on land like everything else on the map. Overlapping
    // blocks of different sizes give it the ragged shore the big islands have, rather than a slab.
    for (const [w, d, x, z] of [
      [13, 9, 0, 0],
      [9, 12, 1.5, 0.5],
      [7, 7, -4, -2.5],
      [6, 6, 3.5, 3],
    ] as const) {
      this.box(g, sand!, w, 2.6, d, x, -1.8, z);
    }
    // Sand shows as a rim; the middle of the islet is green, the way the islands are.
    this.box(g, sand!, 4.5, 0.5, 4.5, -4, 0.8, -2.2);
    for (const [w, d, x, z] of [
      [9.5, 5.5, 0.2, -0.4],
      [5.5, 8, 1.4, 0.8],
      [3.5, 3.5, -2.6, 1.6],
    ] as const) {
      this.box(g, grass!, w, 0.5, d, x, 0.8, z);
    }
    // A stone and a bush on the shore, the same small detail the islands carry.
    this.box(g, rock!, 1.2, 0.8, 1.1, -3.6, 1.3, 1.8);
    this.box(g, moss!, 1.6, 1.2, 1.4, 3.4, 1.7, -1.6);
    const y = 1.3;
    // Big enough to read as a landmark from the opening view, not a pebble.
    this.box(g, rock!, 5.4, 2.2, 5, 0, y, 0);
    this.box(g, rockLight!, 4, 1.6, 3.6, 0.3, y + 2.2, 0.2);
    this.box(g, rock!, 2.4, 1.8, 2.2, -0.8, y + 3.8, -0.5);
    this.box(g, moss!, 3, 0.2, 2.6, 0.5, y + 3.8, 0.5);
    // A signboard on a post: this is something to read, not scenery.
    this.box(g, post!, 0.3, 2, 0.3, 1, y + 3.8, 1);
    this.box(g, board!, 3.2, 1.7, 0.24, 1, y + 5.4, 1);
    this.world.add(g);
    const label = this.makeLabel(g.userData.nodeId as string, t("intro.reef"), t("intro.reefSub"), "reef");
    this.reefs.push({ group: g, label });
    if (!scope) {
      this.reef = g;
      this.reefPos = g.position.clone();
      this.reefLabel = label;
    }
  }

  private buildExperiment(node: TreeNode, pos: THREE.Vector3, color: string, depth: number, filter: ViewFilter): NodeVisual {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.nodeId = node.id;
    const status: Status = node.status;
    const draft = node.pr.draft;
    const season = seasonOf(node.lastWorkAt);
    const light = tint(color, "#ffffff", 0.22);
    const lighter = tint(color, "#ffffff", 0.42);
    const blossom = [this.mat("#f7b8c9"), this.mat("#fde2ea")];
    const snow = this.mat(SNOW);

    const mats = this.nodeMaterials([
      COLORS.plot,
      status === "rejected" ? COLORS.bedGrey : COLORS.bed,
      COLORS.trunk,
      color,
      light,
      lighter,
      COLORS.stump,
      COLORS.withered,
      COLORS.fence,
      COLORS.fruit,
    ]);
    const [plot, bed, trunk, leaf, leafLight, leafLighter, stump, withered, fence, fruit] = mats as [
      THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial,
      THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial,
      THREE.MeshStandardMaterial, THREE.MeshStandardMaterial,
    ];

    const base = [this.box(g, plot, 3, 0.25, 3, 0, 0, 0), this.box(g, bed, 2.2, 0.12, 2.2, 0, 0.25, 0)];
    let top = 1;
    let sway: THREE.Object3D | undefined;

    if (draft) {
      this.box(g, bed, 0.9, 0.3, 0.9, 0, 0.37, 0);
      this.box(g, leaf, 0.12, 0.55, 0.12, 0, 0.67, 0);
      this.box(g, leafLight, 0.35, 0.12, 0.18, 0.18, 1.1, 0);
      this.box(g, leafLight, 0.18, 0.12, 0.35, -0.12, 1.02, 0.1);
      if (season === "spring") this.box(g, blossom[0]!, 0.16, 0.16, 0.16, 0.3, 1.2, 0);
      if (season === "winter") this.box(g, snow, 0.4, 0.1, 0.24, 0.16, 1.22, 0);
      top = 1.4;
    } else if (status === "adopted") {
      this.box(g, trunk, 0.45, 1.6, 0.45, 0, 0.37, 0);
      this.box(g, leaf, 2, 1.2, 2, 0, 1.8, 0);
      this.box(g, leafLight, 1.45, 0.9, 1.45, 0.1, 3, -0.1);
      this.box(g, leafLighter, 0.8, 0.55, 0.8, -0.1, 3.9, 0.1);
      if (season === "spring") {
        const spots = [[0.95, 2.4, 0.5], [-0.7, 2.2, 0.95], [0.5, 3.3, -0.65], [-0.55, 3.45, 0.55], [1.0, 2.0, -0.75], [-0.95, 2.6, -0.4], [0.1, 4.2, 0.3]] as const;
        spots.forEach(([bx, by, bz], i) => this.box(g, blossom[i % 2]!, 0.28, 0.28, 0.28, bx, by, bz));
      } else if (season === "winter") {
        this.box(g, snow, 2.05, 0.22, 2.05, 0, 3.0, 0);
        this.box(g, snow, 1.5, 0.2, 1.5, 0.1, 3.9, -0.1);
        this.box(g, snow, 0.85, 0.22, 0.85, -0.1, 4.45, 0.1);
      } else {
        for (const [fx, fy, fz] of [[0.95, 2.3, 0.4], [-0.6, 2.1, 0.95], [0.3, 3.3, 0.75]] as const) this.box(g, fruit, 0.22, 0.22, 0.22, fx, fy, fz);
      }
      for (const [px, pz] of [[1.35, 1.35], [-1.35, 1.35], [1.35, -1.35], [-1.35, -1.35]] as const) this.box(g, fence, 0.16, 0.5, 0.16, px, 0.25, pz);
      top = season === "winter" ? 4.7 : 4.5;
    } else if (status === "running") {
      this.box(g, trunk, 0.25, 1, 0.25, 0, 0.37, 0);
      const crown = new THREE.Group();
      crown.position.set(0, 1.3, 0);
      this.box(crown, leaf, 1.2, 0.8, 1.2, 0, 0, 0);
      this.box(crown, leafLight, 0.7, 0.5, 0.7, 0.05, 0.8, -0.05);
      if (season === "spring") for (const [bx, by, bz] of [[0.5, 0.45, 0.45], [-0.5, 0.3, 0.5], [0.25, 1.05, -0.3]] as const) this.box(crown, blossom[0]!, 0.22, 0.22, 0.22, bx, by, bz);
      if (season === "winter") {
        this.box(crown, snow, 1.25, 0.16, 1.25, 0, 0.8, 0);
        this.box(crown, snow, 0.72, 0.16, 0.72, 0.05, 1.3, -0.05);
      }
      g.add(crown);
      sway = crown;
      top = 2.7;
    } else {
      this.box(g, stump, 0.6, 0.45, 0.6, 0, 0.37, 0);
      this.box(g, trunk, 0.5, 0.06, 0.5, 0, 0.82, 0);
      for (const [lx, lz] of [[0.7, 0.5], [-0.6, 0.7], [0.4, -0.8], [-0.8, -0.3]] as const) this.box(g, withered, 0.28, 0.06, 0.22, lx, 0.37, lz);
      if (season === "winter") this.box(g, snow, 0.62, 0.12, 0.62, 0, 0.88, 0);
      top = 1.1;
    }
    // Fallen leaves gather on the bed in autumn.
    if (season === "autumn") {
      [[0.75, 0.5], [-0.65, -0.45], [0.2, -0.8], [-0.3, 0.75]].forEach(([lx, lz], i) =>
        this.box(g, this.mat(SEASON.autumn.particle[i % 3]!), 0.3, 0.04, 0.22, lx!, 0.37, lz!),
      );
    }

    const metricKey = filter.metrics.get(islandOf(this.tree!, node.id)) ?? null;
    const metric = metricKey ? node.meta.metrics?.[metricKey] : undefined;
    const tag = statusLabel(draft ? "draft" : status);
    const v: NodeVisual = {
      id: node.id,
      node,
      group: g,
      pos,
      top,
      color,
      label: this.makeLabel(node.id, displayName(this.tree!, node.id), metric !== undefined ? `${metricKey} ${formatMetric(metric)} · ${tag}` : tag, `status-${status}`, node.warnings.length > 0),
      materials: mats,
      sway,
      base,
      appearAt: (depth - 1) * GROW_STEP + 320,
      depth,
    };
    if (filter.hidden.has(status)) this.dim(v, true);
    else this.emitters[season].push({ x: pos.x, z: pos.z, top, appearAt: v.appearAt, seed: hash(node.id) % 1000 });
    this.world.add(g);
    return v;
  }

  private dim(v: NodeVisual, on: boolean): void {
    for (const m of v.materials) {
      if (on) fade(m);
      else Object.assign(m, { transparent: false, opacity: 1, depthWrite: true });
    }
    v.label.classList.toggle("dim", on);
  }

  private makeLabel(id: string | null, name: string, sub: string, cls: string, warn = false): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `label3d ${cls}`;
    const n = document.createElement("span");
    n.className = "label3d-name";
    n.textContent = name;
    const s = document.createElement("span");
    s.className = "label3d-sub";
    s.textContent = sub;
    el.append(n, s);
    if (warn) {
      const w = document.createElement("span");
      w.className = "label3d-warn";
      w.textContent = "!";
      el.append(w);
    }
    if (id) el.dataset.id = id;
    el.addEventListener("click", () => this.opts.onSelect(id));
    this.labels.append(el);
    return el;
  }

  // ------------------------------------------------------------------ interaction

  private pick(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const groups = [...this.visuals.values(), ...(this.rootVisual ? [this.rootVisual] : [])].map((v) => v.group);
    for (const reef of this.reefs) groups.push(reef.group);
    for (const hit of this.raycaster.intersectObjects(groups, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !("nodeId" in o.userData)) o = o.parent;
      if (o) return (o.userData.nodeId as string | null) ?? null;
    }
    return null;
  }

  /** Visual for a node, version or the root. */
  private visual(id: string): NodeVisual | undefined {
    return this.visuals.get(id) ?? (this.rootVisual?.id === id ? this.rootVisual : undefined);
  }

  select(id: string | null, focus = true): void {
    this.selected = id;
    this.applySelection();
    if (id && focus) this.fit([id], true);
  }

  private applySelection(): void {
    const onPath = this.tree ? pathSet(this.tree, this.selected) : new Set<string>();
    for (const v of [...this.visuals.values(), ...(this.rootVisual ? [this.rootVisual] : [])]) {
      v.label.classList.toggle("selected", v.id === this.selected);
      v.label.classList.toggle("on-path", v.id !== null && onPath.has(v.id) && v.id !== this.selected);
    }
    const v = this.selected ? this.visual(this.selected) : undefined;
    this.ring.visible = Boolean(v);
    if (v) {
      this.ring.position.set(v.pos.x, 0.4, v.pos.z);
      this.ring.material.color.set(v.color);
    }
  }

  focusNode(id: string): void {
    this.visual(id)?.label.focus({ preventScroll: true });
  }

  /**
   * A picture of the whole sea, straight down: the travel map is the world itself, seen from above,
   * so it can never drift out of step with what the reader is looking at. Returns the image and the
   * way back from world coordinates to pixels in it, for the pins drawn on top.
   */
  mapSnapshot(): { url: string; width: number; height: number; crop: { x: number; y: number; w: number; h: number }; place(x: number, z: number): [number, number] } | null {
    if (!this.islandSpots.length) return null;
    const { w, h } = this.size();
    const pad = 30;
    // Every island has to be in the picture, so the frame is the ground the scene drew *and* the
    // place of each research: bounds alone have been known to hold only the last island built.
    let minX = this.island.minX;
    let maxX = this.island.maxX;
    let minZ = this.island.minZ;
    let maxZ = this.island.maxZ;
    for (const spot of this.islandSpots) {
      minX = Math.min(minX, spot.at.x - 120);
      maxX = Math.max(maxX, spot.at.x + 120);
      minZ = Math.min(minZ, spot.at.z - 100);
      maxZ = Math.max(maxZ, spot.at.z + 100);
    }
    minX -= pad;
    maxX += pad;
    minZ -= pad;
    maxZ += pad;
    // One scale for both axes, so the islands keep their shape; the shorter side gets the slack.
    const scale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const cam = new THREE.OrthographicCamera((-w / scale) / 2, (w / scale) / 2, (h / scale) / 2, (-h / scale) / 2, 1, 4000);
    cam.position.set(cx, 900, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);
    cam.updateProjectionMatrix();

    const flatWas = this.flat;
    this.flat = 0;
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.flat = flatWas;
    this.renderer.render(this.scene, this.camera);
    const place = (x: number, z: number): [number, number] => [(x - cx) * scale + w / 2, (z - cz) * scale + h / 2];
    // The islands rarely fill a screen-shaped frame, so the map says which part of the picture holds
    // them and the dialog shows only that.
    const [x0, y0] = place(minX, minZ);
    const [x1, y1] = place(maxX, maxZ);
    const crop = {
      x: Math.max(0, Math.min(x0, x1)),
      y: Math.max(0, Math.min(y0, y1)),
      w: Math.min(w, Math.abs(x1 - x0)),
      h: Math.min(h, Math.abs(y1 - y0)),
    };
    return { url, width: w, height: h, crop, place };
  }

  /**
   * Reading one research on a map of many: that island shows every chip it has, the rest keep only
   * their name, so the sea stays readable while the tree in front of you does not.
   */
  scopeLabels(repo: string | null): void {
    this.scope = repo;
    this.labels.classList.toggle("world", repo === null);
    for (const [id, visual] of this.visuals) {
      visual.label.classList.toggle("off-scope", repo !== null && !id.startsWith(`${repo}\u0000`));
    }
    for (const name of this.islandNames) name.label.classList.toggle("off-scope", repo !== null && name.label.dataset.id === `${repo}\u0000`);
  }

  /**
   * Sail to one research on a map of several: the camera flies until that island fills the view.
   * Ids are scoped by repository here, so the island is everything the repository put on the sea.
   */
  sailTo(repo: string): void {
    const ids = this.idsOf(repo);
    if (ids.length) this.fit(ids, true);
  }

  private idsOf(repo: string): string[] {
    return [...this.visuals.keys()].filter((id) => id.startsWith(`${repo}\u0000`));
  }

  /**
   * What a morph frames. On a sea of islands that is the research being read, not the whole
   * account: framing every island mid-turn flies the camera out and back, and the morph then reads
   * as one screen swapped for another instead of the same island turning in place.
   */
  private inScope(): string[] | undefined {
    const ids = this.scope ? this.idsOf(this.scope) : [];
    return ids.length ? ids : undefined;
  }

  get element(): Element {
    return this.wrap;
  }

  fit(ids?: readonly string[], animate = true): void {
    if (this.morph) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const goal = this.computeFit(ids, offset.clone().normalize());
    if (!goal) return;
    const { target, zoom } = goal;

    if (!animate || reducedMotion()) {
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(offset);
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
      this.tween = null;
      return;
    }
    this.tween = {
      from: this.controls.target.clone(),
      to: target,
      fromZoom: this.camera.zoom,
      toZoom: zoom,
      start: performance.now(),
      duration: 800,
    };
  }

  /** Camera target and zoom that frame the given nodes (or everything) when looking along `dir`. */
  private computeFit(ids: readonly string[] | undefined, dir: THREE.Vector3): { target: THREE.Vector3; zoom: number } | null {
    const all = [...this.visuals.values(), ...(this.rootVisual ? [this.rootVisual] : [])];
    const vs = ids ? ids.map((i) => this.visual(i)).filter((v): v is NodeVisual => Boolean(v)) : all;
    if (vs.length === 0) return null;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();

    const center = new THREE.Vector3();
    for (const v of vs) center.add(v.pos);
    center.divideScalar(vs.length);

    let ex = 0;
    let ey = 0;
    const corners: THREE.Vector3[] = [];
    for (const v of vs) for (const y of [0, v.top + 1.5]) corners.push(v.pos.clone().setY(y));
    // Fitting everything means the research intro rock too, or it would start off screen.
    if (!ids && this.reefPos) corners.push(this.reefPos.clone().setY(0), this.reefPos.clone().setY(8));
    // A locked island has nothing growing on it, so its own corners are what keeps it in frame.
    if (!ids) {
      for (const at of this.lockedSpots) {
        for (const dx of [-26, 26]) for (const dz of [-26, 26]) corners.push(new THREE.Vector3(at.x + dx, 8, at.z + dz));
      }
    }
    for (const c of corners) {
      const p = c.sub(center);
      ex = Math.max(ex, Math.abs(p.dot(right)));
      ey = Math.max(ey, Math.abs(p.dot(camUp)));
    }
    const single = vs.length === 1;
    // A map of islands needs sea around it; one island needs only a little air.
    ex = ex * 2 + (this.scoped ? 110 : single ? 16 : 7);
    ey = ey * 2 + (this.scoped ? 80 : single ? 10 : 5);

    const { w, h } = this.size();
    const i = this.opts.insets();
    const vw = Math.max(120, w - i.left - i.right);
    const vh = Math.max(120, h - i.top - i.bottom);
    const pxPerUnit = Math.min(vw / ex, vh / ey);
    const zoom = THREE.MathUtils.clamp((pxPerUnit * FRUSTUM) / h, this.controls.minZoom, single ? 2.2 : 1.8);

    const unitsPerPx = FRUSTUM / zoom / h;
    const ox = (i.left - i.right) / 2;
    const oy = (i.top - i.bottom) / 2;
    // Shift the target so the nodes sit in the middle of the uncovered area (left of the side panel,
    // above the bottom sheet). The vertical shift moves along the ground: moving along camUp would
    // push the target below the ground on a tilted camera, and clamping it back would undo the shift.
    const target = center.clone().addScaledVector(right, -ox * unitsPerPx);
    const ground = camUp.clone().setY(0);
    const k = ground.length();
    if (k > 0.2) target.addScaledVector(ground.normalize(), (oy * unitsPerPx) / k);
    target.y = Math.max(0, target.y);
    return { target, zoom };
  }

  // ------------------------------------------------------------------ 3D <-> 2D morph

  /** Camera for the flat mode in the current heading. */
  private topDown(): THREE.Spherical {
    return new THREE.Spherical(TOP_DOWN.radius, TOP_DOWN.phi, this.heading === "tree" ? TREE_THETA : TOP_DOWN.theta);
  }

  /** Isometric 3D camera in the current heading. */
  private isoSph(): THREE.Spherical {
    const sph = new THREE.Spherical().setFromVector3(CAMERA_DIR.clone().multiplyScalar(CAMERA_RADIUS));
    if (this.heading === "tree") sph.theta = TREE_THETA;
    return sph;
  }

  /** Where the camera is, in numbers small enough to save: theta, phi, radius, target, zoom. */
  camera6(): readonly number[] {
    const c = this.cameraState();
    return [c.sph.theta, c.sph.phi, c.sph.radius, c.target.x, c.target.z, c.zoom].map((n) => Math.round(n * 1000) / 1000);
  }

  /** Put the camera back where camera6() found it. The view does not animate into place. */
  restoreCamera(v: readonly number[]): void {
    if (v.length !== 6 || v.some((n) => !Number.isFinite(n))) return;
    const [theta, phi, radius, x, z, zoom] = v as [number, number, number, number, number, number];
    this.tween = null;
    this.setCamera(new THREE.Spherical(radius, phi, theta), new THREE.Vector3(x, 0, z), zoom);
    this.controls.update();
  }

  private cameraState(): CameraState {
    const offset = this.camera.position.clone().sub(this.controls.target);
    return { sph: new THREE.Spherical().setFromVector3(offset), target: this.controls.target.clone(), zoom: this.camera.zoom, flat: this.flat };
  }

  private setCamera(sph: THREE.Spherical, target: THREE.Vector3, zoom: number): void {
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
    this.camera.lookAt(target);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
  }

  private pxPerUnit(zoom = this.camera.zoom): number {
    return (zoom * this.size().h) / FRUSTUM;
  }

  /** Whether the view is in the flat (2D) mode. */
  get isFlat(): boolean {
    return this.flatMode;
  }

  /** Flat mode controls: pan and zoom only, camera locked top-down. */
  private setFlatMode(on: boolean): void {
    this.flatMode = on;
    const c = this.controls;
    const top = this.topDown();
    c.enableRotate = !on;
    c.minPolarAngle = on ? top.phi : 0.35;
    c.maxPolarAngle = on ? top.phi : 1.2;
    c.minAzimuthAngle = on ? top.theta : -Infinity;
    c.maxAzimuthAngle = on ? top.theta : Infinity;
    c.enabled = on;
  }

  private runMorph(to: CameraState, duration: number, flatAt: (t: number) => number): Promise<void> {
    this.tween = null;
    this.controls.enabled = false;
    const from = this.cameraState();
    // Turn the short way round: the user may have orbited the 3D camera any number of times.
    while (to.sph.theta - from.sph.theta > Math.PI) to.sph.theta -= 2 * Math.PI;
    while (to.sph.theta - from.sph.theta < -Math.PI) to.sph.theta += 2 * Math.PI;
    return new Promise((resolve) => {
      this.morph = {
        from,
        to,
        start: performance.now(),
        duration: reducedMotion() ? 1 : duration,
        flatAt,
        done: resolve,
      };
    });
  }

  /** Press the islands flat under a top-down camera (3D -> flat mode). */
  async lower(): Promise<void> {
    if (this.flatMode) return;
    const from = this.cameraState();
    const target = from.target.clone().setY(0);
    const start = this.flat;
    await this.runMorph({ sph: this.topDown(), target, zoom: from.zoom, flat: 1 }, 700, (t) => start + (1 - start) * easeInOut(t));
    this.setFlatMode(true);
  }

  /** Let the island rise out of the flat state and tilt back to the isometric camera (2D -> 3D). */
  async raise(): Promise<void> {
    if (!this.flatMode) return;
    this.setFlatMode(false);
    const sph = this.isoSph();
    const goal = this.computeFit(this.inScope(), new THREE.Vector3().setFromSpherical(sph).normalize());
    if (!goal) return;
    await this.runMorph({ sph, target: goal.target, zoom: goal.zoom, flat: 0 }, 950, (t) => 1 - easeOutBack(t));
    this.controls.enabled = true;
  }

  /**
   * Turn the view to a heading and frame the whole tree, staying flat or 3D. Turning to "island" in
   * 3D restores the first view (default angle, everything in frame).
   */
  async turn(heading: Heading): Promise<void> {
    this.heading = heading;
    const flat = this.flatMode;
    const sph = flat ? this.topDown() : this.isoSph();
    const goal = this.computeFit(this.inScope(), new THREE.Vector3().setFromSpherical(sph).normalize());
    if (!goal) return;
    const level = this.flat;
    await this.runMorph({ sph, target: goal.target, zoom: goal.zoom, flat: level }, 900, () => level);
    if (flat) this.setFlatMode(true);
    else this.controls.enabled = true;
  }

  private stepMorph(now: number): void {
    const m = this.morph!;
    const t = Math.min(1, (now - m.start) / m.duration);
    const k = easeInOut(t);
    const sph = new THREE.Spherical(
      THREE.MathUtils.lerp(m.from.sph.radius, m.to.sph.radius, k),
      THREE.MathUtils.lerp(m.from.sph.phi, m.to.sph.phi, k),
      THREE.MathUtils.lerp(m.from.sph.theta, m.to.sph.theta, k),
    );
    this.setCamera(sph, m.from.target.clone().lerp(m.to.target, k), THREE.MathUtils.lerp(m.from.zoom, m.to.zoom, k));
    this.flat = m.flatAt(t);
    // No blur over the whole canvas: it was the one part of the morph that acted on the screen rather
    // than on the scene, and it made a camera move read as one picture dissolving into another.

    if (t >= 1) {
      this.morph = null;
      this.flat = m.to.flat;
      m.done();
    }
  }

  // ------------------------------------------------------------------ frame loop

  /** Canvas size, measured only on resize: reading it every frame after moving the labels forced a
   * full style recalculation per frame, which made dragging slow. */
  private dims = { w: 1, h: 1 };

  private size(): { w: number; h: number } {
    return this.dims;
  }

  private resize(): void {
    this.dims = { w: Math.max(1, this.container.clientWidth), h: Math.max(1, this.container.clientHeight) };
    const { w, h } = this.dims;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.left = (-FRUSTUM * aspect) / 2;
    this.camera.right = (FRUSTUM * aspect) / 2;
    this.camera.top = FRUSTUM / 2;
    this.camera.bottom = -FRUSTUM / 2;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Sailing between islands is how a reader moves on a map, so the page follows the camera: whatever
   * island the middle of the view has drifted onto becomes the research being read. Open water keeps
   * the last one, so crossing a channel does not blank the screen.
   */
  private checkIsland(): void {
    // Only once the reader has moved the camera themselves: framing the whole map on arrival is not
    // sailing anywhere, and it should not drop them into the nearest research.
    if (!this.sailed || !this.opts.onIsland || this.islandSpots.length < 2) return;
    const target = this.controls.target;
    let near: string | null = null;
    let best = Infinity;
    for (const spot of this.islandSpots) {
      const d = Math.hypot(spot.at.x - target.x, spot.at.z - target.z);
      if (d < best) {
        best = d;
        near = spot.repo;
      }
    }
    // Half the gap the map leaves between two islands: near enough that this one fills the view.
    if (best > 170 || near === null || near === this.overIsland) return;
    this.overIsland = near;
    this.opts.onIsland(near);
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const motion = !reducedMotion();

    if (this.morph) this.stepMorph(now);
    else if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / this.tween.duration);
      const k = easeInOut(t);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.lerpVectors(this.tween.from, this.tween.to, k);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.zoom = THREE.MathUtils.lerp(this.tween.fromZoom, this.tween.toZoom, k);
      this.camera.updateProjectionMatrix();
      if (t >= 1) this.tween = null;
    }
    if (this.controls.enabled) this.controls.update();
    this.checkIsland();
    const flat = this.flat;
    const squash = Math.max(0.03, 1 - flat);
    for (const o of this.ground) o.visible = flat < 0.92;
    for (const p of this.paths) p.mesh.visible = flat < 0.92;
    // Labels dip out mid-morph and come back once the scene has settled (3D or flat).
    const labelAlpha = String(Math.abs(1 - 2 * THREE.MathUtils.clamp(flat, 0, 1)).toFixed(3));

    // Intro: plants pop up generation by generation while paths grow toward them.
    const since = now - this.introStart;
    for (const p of this.paths) {
      const t = THREE.MathUtils.clamp((since - p.startAt) / 420, 0, 1);
      p.mesh.count = Math.max(t > 0 ? 1 : 0, Math.round(p.total * t));
      if (p.total > 0 && t === 0) p.mesh.count = 0;
    }
    const all = [...this.visuals.values(), ...(this.rootVisual ? [this.rootVisual] : [])];
    for (const v of all) {
      const t = THREE.MathUtils.clamp((since - v.appearAt) / 520, 0, 1);
      const hover = v.id !== null && v.id === this.hovered ? 1.07 : 1;
      const s = (t >= 1 ? 1 : Math.max(0.001, easeOutBack(t))) * hover;
      const base = THREE.MathUtils.lerp(v.group.scale.x || 0.001, s, t >= 1 ? 0.25 : 1);
      v.group.scale.set(base, base * squash, base);
      setStyle(v.label, "visibility", t > 0.6 ? "" : "hidden");
      // The inline opacity overrides the stylesheet, so a hidden status layer dims its labels here too.
      setStyle(v.label, "opacity", v.label.classList.contains("dim") ? (Number(labelAlpha) * DIM_LABEL).toFixed(3) : labelAlpha);
      if (v.base) for (const b of v.base) b.visible = flat < 0.92;
      if (v.sway && motion) {
        const phase = hash(v.id ?? "") % 100;
        v.sway.rotation.z = Math.sin(now / 900 + phase) * 0.07;
        v.sway.rotation.x = Math.cos(now / 1100 + phase) * 0.05;
      }
    }

    if (motion) {
      const { minX, maxX } = this.island;
      for (const c of this.clouds) {
        c.position.x += (c.userData.speed as number) * dt;
        if (c.position.x > maxX + 12) c.position.x = minX - 12;
      }
    }
    for (const c of this.clouds) c.visible = flat < 0.4;
    for (const o of this.flatOnly) o.visible = flat >= 0.92;
    if (motion) for (const f of this.ferries) f.position.y = -0.62 + Math.sin(now / 700 + (f.userData.phase as number)) * 0.05;
    this.stepEffects(now, since, motion && flat < 0.4);
    this.ring.visible = Boolean(this.selected && this.visual(this.selected)) && (flat < 0.05 || flat > 0.97);
    if (this.ring.visible) this.ring.material.opacity = 0.55 + Math.sin(now / 400) * 0.25;

    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    // Reads layout (insets): a few times a second is plenty for the year readout.
    if (now - this.lastYearCheck > 200) {
      this.lastYearCheck = now;
      this.updateYearNow();
    }
  };

  /** Label screen positions from the last full layout, and the layer offset applied since. */
  private labelBase = new Map<HTMLElement, { x: number; y: number }>();
  private layerOffset = { x: 0, y: 0 };

  /**
   * Keep the HTML chips over their nodes. Moving every chip costs a style recalculation per chip each
   * frame, which made dragging slow. While the camera only pans, all chips move by the same amount,
   * so only the label layer is translated; chips are re-laid out one by one only when their spacing
   * changes (rotate, zoom, morph, intro growth).
   */
  private placeLabels(): void {
    const { w, h } = this.size();
    const v3 = new THREE.Vector3();
    const lift = THREE.MathUtils.clamp(this.flat, 0, 1) * 1.9;
    const targets: [HTMLElement, number, number][] = [];
    for (const v of [...this.visuals.values(), ...(this.rootVisual ? [this.rootVisual] : [])]) {
      // Flat mode: pin the chip to the plot's top edge so it sits above the pressed plant, not on it.
      v3.set(v.pos.x, (v.top + 0.5) * v.group.scale.y, v.pos.z - lift).project(this.camera);
      targets.push([v.label, ((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h]);
    }
    for (const m of this.yearMarks) {
      v3.set(m.pos.x, 0.2, m.pos.z).project(this.camera);
      targets.push([m.label, ((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h]);
    }
    for (const reef of this.reefs) {
      v3.set(reef.group.position.x, 9.4, reef.group.position.z).project(this.camera);
      targets.push([reef.label, ((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h]);
    }
    for (const name of this.islandNames) {
      v3.set(name.at.x, 16, name.at.z).project(this.camera);
      targets.push([name.label, ((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h]);
    }

    // A pure pan: every chip is off its base position by the same vector.
    let dx = 0;
    let dy = 0;
    let uniform = targets.length > 0 && this.labelBase.size === targets.length;
    if (uniform) {
      const [el0, x0, y0] = targets[0]!;
      const b0 = this.labelBase.get(el0);
      if (!b0) uniform = false;
      else {
        dx = x0 - b0.x;
        dy = y0 - b0.y;
        for (const [el, x, y] of targets) {
          const b = this.labelBase.get(el);
          if (!b || Math.abs(x - b.x - dx) > 0.4 || Math.abs(y - b.y - dy) > 0.4) {
            uniform = false;
            break;
          }
        }
      }
    }
    if (uniform) {
      if (Math.abs(dx - this.layerOffset.x) > 0.05 || Math.abs(dy - this.layerOffset.y) > 0.05) {
        this.layerOffset = { x: dx, y: dy };
        this.labels.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      }
    } else {
      this.labelBase.clear();
      for (const [el, x, y] of targets) {
        this.labelBase.set(el, { x, y });
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
      if (this.layerOffset.x || this.layerOffset.y) {
        this.layerOffset = { x: 0, y: 0 };
        this.labels.style.transform = "";
      }
    }
    const fade = String(Math.abs(1 - 2 * THREE.MathUtils.clamp(this.flat, 0, 1)).toFixed(3));
    for (const m of this.yearMarks) setStyle(m.label, "opacity", fade);
  }

  private timeKey = "";
  private lastYearCheck = 0;

  /** Report the date under the middle of the viewport (only when its year or season changes). */
  private updateYearNow(): void {
    let ms: number | null = null;
    if (this.dateAtX) {
      const { w, h } = this.size();
      const i = this.opts.insets();
      const ndc = new THREE.Vector2(((i.left + (w - i.left - i.right) / 2) / w) * 2 - 1, -(((i.top + (h - i.top - i.bottom) / 2) / h) * 2 - 1));
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (hit) ms = this.dateAtX(hit.x);
    }
    const key = ms === null ? "" : `${new Date(ms).getFullYear()}-${seasonOf(new Date(ms).toISOString())}`;
    if (key === this.timeKey) return;
    this.timeKey = key;
    this.opts.onTime?.(ms);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    this.clearWorld();
    for (const m of this.matCache.values()) m.dispose();
    this.unitBox.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.renderer.dispose();
    this.wrap.remove();
  }
}
