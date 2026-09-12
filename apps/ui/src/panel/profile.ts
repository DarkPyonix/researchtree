/**
 * The researcher behind the map (docs/ISLAND.md).
 *
 * The introduction is `PROFILE.md` in the settings repository; without one, the account's own
 * profile README (`<user>/<user>`) stands in, which is what most people already keep up to date.
 * A résumé file in the settings repository becomes a button, and is opened rather than rendered:
 * it is usually a PDF.
 */
import { ISLAND_CONFIG_REPO, type GitHubClient } from "@researchtree/core";

/** What a résumé file is called, whatever its extension: resume.pdf, CV.md, Resume.docx … */
const RESUME_RE = /^(resume|cv|이력서)\.(pdf|md|docx?|txt)$/i;

export interface Profile {
  /** Markdown introducing the researcher, or null when neither file exists. */
  text: string | null;
  /** Where the text came from, for the line under the heading. */
  source: "profile" | "account" | null;
  /** Link to the résumé file on GitHub, when the settings repository has one. */
  resumeUrl: string | null;
  resumeName: string | null;
}

export async function loadProfile(gh: GitHubClient, user: string): Promise<Profile> {
  const settings = `${user}/${ISLAND_CONFIG_REPO}`;
  // One listing tells us both whether there is a PROFILE.md and what the résumé is called, which
  // matters because a guest only gets sixty GitHub calls an hour.
  const names = await gh.listDir(settings, "", "HEAD").catch(() => [] as string[]);
  const resumeName = names.find((n) => RESUME_RE.test(n)) ?? null;

  const profile = names.includes("PROFILE.md") ? await gh.getFileText(settings, "PROFILE.md", "HEAD").catch(() => null) : null;
  const account = profile?.trim() ? null : await gh.getFileText(`${user}/${user}`, "README.md", "HEAD").catch(() => null);

  return {
    text: profile?.trim() ? profile : account?.trim() ? account : null,
    source: profile?.trim() ? "profile" : account?.trim() ? "account" : null,
    resumeName,
    resumeUrl: resumeName ? `https://github.com/${settings}/blob/HEAD/${resumeName}` : null,
  };
}
