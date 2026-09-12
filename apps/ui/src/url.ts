/**
 * What the address says: whose island, and which research inside it.
 *
 *   ?user=b-re-w                      the account's island map
 *   ?user=b-re-w&repo=moshi           one research on that island
 *   ?user=b-re-w&repo=DarkPyonix/tts  a research the account did under an organization
 *   ?repo=DarkPyonix/tts              one research on its own, with no island around it
 *
 * A research on someone's island may well live in an organization, so `repo` takes either a bare
 * name (belonging to `user`) or a full `owner/name`. Links written before `user` existed still work.
 */
export interface UrlPlace {
  /** Whose island, when the address names one. */
  user: string | null;
  /** Full `owner/name` of the research to open, or null for the island map. */
  repo: string | null;
}

const NAME_RE = /^[A-Za-z0-9._-]+$/;

/** Resolve what to open from a query string. Anything malformed reads as "nothing asked for". */
export function readPlace(search: string | URLSearchParams): UrlPlace {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const asked = params.get("user")?.trim() || null;
  // Only a name that passed the check may stand in for an owner.
  const user = asked && NAME_RE.test(asked) ? asked : null;
  return { user, repo: fullRepo(user, params.get("repo")?.trim() || null) };
}

/** `moshi` with user `b-re-w` -> `b-re-w/moshi`; `DarkPyonix/tts` stays as it is. */
export function fullRepo(user: string | null, repo: string | null): string | null {
  if (!repo) return null;
  if (repo.includes("/")) {
    const [owner, name, ...rest] = repo.split("/");
    return rest.length === 0 && owner && name && NAME_RE.test(owner) && NAME_RE.test(name) ? `${owner}/${name}` : null;
  }
  if (!user || !NAME_RE.test(repo)) return null;
  return `${user}/${repo}`;
}

/** The shortest way to write a repo in the address of a given island: bare name when it belongs there. */
export function shortRepo(user: string | null, repo: string | null): string | null {
  if (!repo) return null;
  const [owner, name] = repo.split("/");
  return user && owner === user && name ? name : repo;
}
