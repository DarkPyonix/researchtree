/**
 * Board view: the same experiments as the island, lined up the way a development team reads them.
 *
 * The columns follow the flow a pull request actually goes through, and every one of them comes from
 * data the tree already has, so the board works for a guest too: draft, open, review requested,
 * merged, closed. Status (running / adopted / rejected) stays as the colour of the card, and the
 * status filter dims a card exactly as it dims a plant in the 3D view.
 */
import { displayName, t, type ResearchTree, type Status, type TreeNode } from "@researchtree/core";
import { clear, h } from "../dom";
import { formatMetric, statusLabel } from "../theme";
import { islandOf } from "./layout";
import type { ViewFilter } from "./view";

export type Column = "draft" | "working" | "review" | "merged" | "closed";

export const COLUMNS: readonly Column[] = ["draft", "working", "review", "merged", "closed"];

/** Which column an experiment belongs in. The first match wins, so a merged draft still reads as merged. */
export function columnOf(node: TreeNode): Column {
  if (node.pr.merged) return "merged";
  if (node.pr.state === "closed") return "closed";
  if (node.pr.draft) return "draft";
  return node.pr.reviewers > 0 ? "review" : "working";
}

export interface KanbanOptions {
  onSelect(id: string | null): void;
  /** Room the floating cards take, so the columns start below the repo card. */
  insets(): { top: number; right: number; bottom: number };
}

export class Kanban {
  private tree: ResearchTree | null = null;
  private cards = new Map<string, HTMLElement>();
  private selected: string | null = null;

  private readonly onResize = () => this.applyInsets();

  constructor(
    private readonly root: HTMLElement,
    private readonly options: KanbanOptions,
  ) {
    this.root.classList.add("board");
    window.addEventListener("resize", this.onResize);
  }

  /** The repo card and the detail panel sit over the board; the columns keep clear of both. */
  layout(): void {
    this.applyInsets();
    this.scrollToSelected();
  }

  private applyInsets(): void {
    const { top, right, bottom } = this.options.insets();
    // The board's own box shrinks to the free area, so the panel takes space instead of covering
    // cards, and what is left still scrolls on its own.
    this.root.style.paddingTop = `${Math.round(top)}px`;
    this.root.style.right = `${Math.round(Math.max(0, right - 16))}px`;
    this.root.style.bottom = `${Math.round(Math.max(0, bottom - 16))}px`;
  }

  render(tree: ResearchTree, filter: ViewFilter): void {
    this.tree = tree;
    this.cards.clear();
    clear(this.root);

    // Half a board of empty space at each end, so the first and last column can centre too.
    this.root.append(h("div", { class: "board-spacer" }));
    const nodes = [...tree.nodes.values()];
    const byColumn = new Map<Column, TreeNode[]>(COLUMNS.map((c) => [c, []]));
    for (const node of nodes) byColumn.get(columnOf(node))!.push(node);

    for (const column of COLUMNS) {
      // Newest first: what moved last is what a standup is about.
      const items = byColumn.get(column)!.sort((a, b) => (a.pr.updatedAt < b.pr.updatedAt ? 1 : -1));
      const list = h("div", { class: "board-list" }, items.map((node) => this.card(node, tree, filter)));
      this.root.append(
        h(
          "section",
          { class: `board-col board-${column}`, "aria-label": t(`board.${column}`) },
          h("header", { class: "board-head" }, h("h2", null, t(`board.${column}`)), h("span", { class: "board-count" }, String(items.length))),
          items.length ? list : h("p", { class: "board-empty muted small" }, t("board.empty")),
        ),
      );
    }
    this.root.append(h("div", { class: "board-spacer" }));
    this.applyInsets();
    this.select(this.selected, false);
  }

  private card(node: TreeNode, tree: ResearchTree, filter: ViewFilter): HTMLElement {
    const status: Status = node.status;
    const island = islandOf(tree, node.id);
    const metricKey = filter.metrics.get(island) ?? null;
    const metric = metricKey ? node.meta.metrics?.[metricKey] : undefined;
    const card = h(
      "button",
      {
        class: `board-card status-${status}${filter.hidden.has(status) ? " dim" : ""}`,
        type: "button",
        "aria-pressed": "false",
        onclick: () => this.options.onSelect(node.id),
      },
      h(
        "span",
        { class: "board-card-head" },
        h("span", { class: "chip-dot" }),
        h("span", { class: "board-name" }, displayName(tree, node.id)),
        h("span", { class: "board-number muted" }, `#${node.pr.number}`),
      ),
      h("span", { class: "board-title" }, node.pr.title),
      h(
        "span",
        { class: "board-meta muted small" },
        h("span", null, statusLabel(status)),
        metric !== undefined ? h("span", null, `${metricKey} ${formatMetric(metric)}`) : null,
        h("span", null, node.pr.author),
      ),
    );
    this.cards.set(node.id, card);
    return card;
  }

  select(id: string | null, focus = true): void {
    this.selected = id;
    for (const [nodeId, card] of this.cards) {
      const on = nodeId === id;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-pressed", String(on));
    }
    this.applyInsets();
    if (focus) this.scrollToSelected();
  }

  /**
   * Put the chosen card in the middle of what is still visible, so the next one is a glance away
   * instead of behind the panel. On a phone the panel is a sheet along the bottom, so the middle is
   * the middle of the strip above it.
   */
  private scrollToSelected(): void {
    // One frame later: the board has just been resized around the panel, and the scroll has to be
    // measured against the box it ends up with, not the one it had.
    requestAnimationFrame(() => this.scrollNow());
  }

  private scrollNow(): void {
    const card = this.selected ? this.cards.get(this.selected) : null;
    const box = this.root;
    if (!card) return;
    const { top } = this.options.insets();
    const view = box.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const left = cardBox.left - view.left + box.scrollLeft + cardBox.width / 2;
    const up = cardBox.top - view.top + box.scrollTop + cardBox.height / 2;
    box.scrollTo({
      left: left - box.clientWidth / 2,
      // The heading row sits above the columns, so the middle of the strip is below it.
      top: up - (top + (box.clientHeight - top) / 2),
      behavior: "smooth",
    });
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    this.root.style.right = "";
    this.root.style.bottom = "";
    this.root.style.paddingTop = "";
    clear(this.root);
    this.root.classList.remove("board");
    this.cards.clear();
    this.tree = null;
  }
}
