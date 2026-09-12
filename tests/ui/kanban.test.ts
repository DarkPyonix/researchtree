import { describe, expect, it } from "vitest";
import type { TreeNode } from "@researchtree/core";
import { columnOf, COLUMNS } from "../../apps/ui/src/views/kanban";

function node(pr: Partial<TreeNode["pr"]>): TreeNode {
  return {
    pr: { number: 1, url: "", title: "", author: "a", state: "open", merged: false, draft: false, reviewers: 0, createdAt: "", updatedAt: "", closedAt: null, ...pr },
  } as TreeNode;
}

describe("board columns", () => {
  it("follows the stages a pull request goes through", () => {
    expect(columnOf(node({ draft: true }))).toBe("draft");
    expect(columnOf(node({}))).toBe("working");
    expect(columnOf(node({ reviewers: 2 }))).toBe("review");
    expect(columnOf(node({ merged: true, state: "closed" }))).toBe("merged");
    expect(columnOf(node({ state: "closed" }))).toBe("closed");
  });

  it("reads a finished PR by how it finished, whatever it was before", () => {
    // A draft that was merged belongs with the merged work, not back in the draft column.
    expect(columnOf(node({ draft: true, merged: true, state: "closed" }))).toBe("merged");
    expect(columnOf(node({ draft: true, state: "closed" }))).toBe("closed");
    expect(columnOf(node({ reviewers: 3, merged: true, state: "closed" }))).toBe("merged");
  });

  it("puts every experiment in exactly one column", () => {
    const cases = [node({}), node({ draft: true }), node({ reviewers: 1 }), node({ merged: true, state: "closed" }), node({ state: "closed" })];
    for (const n of cases) expect(COLUMNS).toContain(columnOf(n));
  });
});
