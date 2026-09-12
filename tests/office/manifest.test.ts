import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = readFileSync(fileURLToPath(new URL("../../apps/office/manifest.xml", import.meta.url)), "utf8");
const extensionVersion = (JSON.parse(readFileSync(fileURLToPath(new URL("../../apps/extension/package.json", import.meta.url)), "utf8")) as { version: string }).version;

/** The store rejects a manifest that is missing any of this, and a sideloaded add-in just fails to load. */
describe("PowerPoint add-in manifest", () => {
  it("is a PowerPoint content add-in", () => {
    expect(manifest).toContain('xsi:type="ContentApp"');
    expect(manifest).toContain('<Host Name="Presentation" />');
  });

  it("carries the version of the release it ships with", () => {
    const version = /<Version>([\d.]+)<\/Version>/.exec(manifest)?.[1];
    expect(version).toBe(`${extensionVersion}.0`);
  });

  it("loads its pages over HTTPS from the published site", () => {
    const source = /<SourceLocation DefaultValue="([^"]+)"/.exec(manifest)?.[1];
    expect(source).toBe("https://darkpyonix.github.io/researchtree/office.html");
    // Everything the add-in actually loads or navigates to (xmlns declarations are not addresses).
    const loaded = [...manifest.matchAll(/(?:DefaultValue="|<AppDomain>)(https?:\/\/[^"<]+)/g)].map((m) => m[1]!);
    expect(loaded.length).toBeGreaterThan(3);
    for (const url of loaded) expect(url.startsWith("https://")).toBe(true);
  });

  it("lists every domain the add-in navigates to, so sign-in is not blocked", () => {
    expect(manifest).toContain("<AppDomain>https://github.com</AppDomain>");
    expect(manifest).toContain("<AppDomain>https://researchtree.thisisthepy.workers.dev</AppDomain>");
  });

  it("has the icons, support URL and identity the store requires", () => {
    expect(manifest).toMatch(/<Id>[0-9a-f-]{36}<\/Id>/);
    expect(manifest).toContain("<IconUrl DefaultValue=");
    expect(manifest).toContain("<HighResolutionIconUrl DefaultValue=");
    expect(manifest).toContain("<SupportUrl DefaultValue=");
    expect(manifest).toContain("<ProviderName>DarkPyonix</ProviderName>");
  });
});
