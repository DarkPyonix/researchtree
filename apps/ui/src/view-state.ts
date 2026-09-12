/**
 * What the viewer is looking at, small enough to save: the repo, the selected node, the view, the
 * hidden status layers and the camera.
 *
 * Only the PowerPoint add-in saves this, into the slide it sits on (`capabilities.viewState`), so a
 * deck opens on exactly the screen its author left there, with no sign-in for a public repository.
 * The central web app has the address bar for the same job and saves nothing.
 */
import type { Status } from "@researchtree/core";

export interface ViewState {
  repo: string;
  node: string | null;
  /** "island" | "flat" | "tree" | "tree3d" */
  mode: string;
  board: boolean;
  hidden: Status[];
  /** theta, phi, radius, target x, target z, zoom (see Tree3D.camera6) */
  camera: number[];
}

const STATUSES = new Set<Status>(["running", "adopted", "rejected"]);

/** Read back a state written by an older or newer version without trusting any of it. */
export function parseViewState(raw: unknown): ViewState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.repo !== "string" || !v.repo.includes("/")) return null;
  const camera = Array.isArray(v.camera) ? v.camera.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : [];
  const hidden = Array.isArray(v.hidden) ? v.hidden.filter((s): s is Status => typeof s === "string" && STATUSES.has(s as Status)) : [];
  return {
    repo: v.repo,
    node: typeof v.node === "string" ? v.node : null,
    mode: typeof v.mode === "string" ? v.mode : "island",
    board: v.board === true,
    hidden,
    camera: camera.length === 6 ? camera : [],
  };
}
