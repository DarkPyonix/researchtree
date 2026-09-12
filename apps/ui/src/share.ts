/**
 * Passing something on to someone else. Phones (and a few desktop browsers) open the system share
 * sheet; everywhere else the text goes to the clipboard, which is as far as a page may share on its own.
 */
export type ShareResult = "shared" | "copied" | "failed";

export interface ShareText {
  title: string;
  text: string;
  url: string;
}

export async function share(data: ShareText): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      // Closing the sheet is a choice, not a failure; anything else falls back to the clipboard.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  // The share sheet puts the link after the text by itself; the clipboard copy has to do it here.
  return (await copy(`${data.text}\n${data.url}`)) ? "copied" : "failed";
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard permission (or no clipboard API): select a hidden field and let the browser copy it.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}
