import DOMPurify from "dompurify";
import { marked } from "marked";

// PR bodies are untrusted input and the token lives in the browser, so always sanitize.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) node.removeAttribute("href");
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(md: string): DocumentFragment {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "class", "id"],
  });
}
