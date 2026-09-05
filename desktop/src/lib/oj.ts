export type OjId = "codeforces" | "vnoj" | "tbcpc";

export interface OjDefinition {
  id: OjId;
  name: string;
  shortName: string;
  baseUrl: string;
  profilePath: (handle: string) => string;
}

export interface OjConnection {
  oj: OjId;
  handle: string;
}

export interface OjSubmission {
  id: string;
  problem: string;
  verdict: string;
  accepted: boolean;
  runtimeMs?: number;
  submittedAt?: number;
  url?: string;
  oj: OjId;
}

export interface OjSnapshot {
  oj: OjId;
  handle: string;
  profileUrl: string;
  displayName?: string;
  rank?: string;
  rating?: number;
  solved?: number;
  submissionCount?: number;
  submissionLabel: string;
  averageRuntimeMs?: number;
  submissions: OjSubmission[];
  source: string;
  fetchedAt: string;
}

export const OJ_DEFINITIONS: Record<OjId, OjDefinition> = {
  codeforces: {
    id: "codeforces",
    name: "Codeforces",
    shortName: "CF",
    baseUrl: "https://codeforces.com",
    profilePath: (handle) => `/profile/${encodeURIComponent(handle)}`,
  },
  vnoj: {
    id: "vnoj",
    name: "VNOJ",
    shortName: "VNOJ",
    baseUrl: "https://oj.vnoi.info",
    profilePath: (handle) => `/user/${encodeURIComponent(handle)}`,
  },
  tbcpc: {
    id: "tbcpc",
    name: "TBCPCOJ",
    shortName: "TBCPC",
    baseUrl: "https://oj.tbcpc.id.vn",
    profilePath: (handle) => `/user/${encodeURIComponent(handle)}`,
  },
};

const STORAGE_KEY = "ide.ankb.oj-connections";
const REQUEST_TIMEOUT_MS = 12_000;
const CODEFORCES_STATUS_PAGE_SIZE = 1_000;

function requestUrl(oj: OjId, path: string): string {
  // The Vite proxy keeps browser previews usable when an OJ does not expose
  // CORS. Tauri and production builds call the public endpoint directly.
  if (import.meta.env.DEV) return `/oj-proxy/${oj}${path}`;
  return `${OJ_DEFINITIONS[oj].baseUrl}${path}`;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asIdentifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asString(value);
}

function uniqueProblemKey(problem: Record<string, unknown>): string {
  const contestId = asIdentifier(problem.contestId) ?? asIdentifier(problem.contest_id) ?? "";
  const index = asIdentifier(problem.index) ?? asIdentifier(problem.problem_id) ?? asIdentifier(problem.name) ?? "";
  return `${contestId}:${index}`;
}

function codeforcesSubmission(raw: Record<string, unknown>): OjSubmission {
  const problem = asRecord(raw.problem) ?? {};
  const verdict = asString(raw.verdict) ?? "Unknown";
  const id = String(raw.id ?? `${raw.creationTimeSeconds ?? ""}-${uniqueProblemKey(problem)}`);
  const contestId = asIdentifier(raw.contestId) ?? asIdentifier(raw.contest_id);
  const index = asIdentifier(problem.index);
  return {
    id,
    problem: [contestId, index].filter(Boolean).join(" ") || asString(problem.name) || "Unknown problem",
    verdict,
    accepted: verdict === "OK",
    runtimeMs: asNumber(raw.timeConsumedMillis),
    submittedAt: asNumber(raw.creationTimeSeconds),
    url: contestId && index ? `https://codeforces.com/contest/${contestId}/submission/${id}` : undefined,
    oj: "codeforces",
  };
}

async function fetchCodeforces(handle: string): Promise<OjSnapshot> {
  const encoded = encodeURIComponent(handle);
  const profile = await fetchJson(requestUrl("codeforces", `/api/user.info?handles=${encoded}`));
  const profileRecord = asRecord(profile);
  if (profileRecord?.status !== "OK") {
    throw new Error(asString(profileRecord?.comment) ?? "Handle was not found");
  }
  const users = Array.isArray(profileRecord.result) ? profileRecord.result : [];
  const user = asRecord(users[0]);
  if (!user) throw new Error("Handle was not found");

  const status = await fetchJson(requestUrl("codeforces", `/api/user.status?handle=${encoded}&from=1&count=${CODEFORCES_STATUS_PAGE_SIZE}`));
  const statusRecord = asRecord(status);
  if (statusRecord?.status !== "OK") {
    throw new Error(asString(statusRecord?.comment) ?? "Could not read submissions");
  }
  const rawSubmissions = Array.isArray(statusRecord.result) ? statusRecord.result : [];
  const submissions = rawSubmissions.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)).map(codeforcesSubmission);
  const solvedKeys = new Set<string>();
  for (const raw of rawSubmissions) {
    const item = asRecord(raw);
    if (item?.verdict !== "OK") continue;
    const problem = asRecord(item.problem) ?? {};
    solvedKeys.add(uniqueProblemKey(problem));
  }
  const runtimes = submissions.map((item) => item.runtimeMs).filter((value): value is number => value !== undefined);

  return {
    oj: "codeforces",
    handle: asString(user.handle) ?? handle,
    profileUrl: `${OJ_DEFINITIONS.codeforces.baseUrl}${OJ_DEFINITIONS.codeforces.profilePath(handle)}`,
    displayName: asString(user.handle) ?? handle,
    rank: asString(user.rank),
    rating: asNumber(user.rating),
    solved: solvedKeys.size,
    submissionCount: submissions.length,
    submissionLabel: `Latest submissions fetched (up to ${CODEFORCES_STATUS_PAGE_SIZE.toLocaleString()})`,
    averageRuntimeMs: runtimes.length ? runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length : undefined,
    submissions: submissions.slice(0, 8),
    source: "Codeforces API",
    fetchedAt: new Date().toISOString(),
  };
}

function readDmojNumber(text: string, expression: RegExp): number | undefined {
  const match = text.match(expression);
  return match ? asNumber(match[1]) : undefined;
}

function parseDmojProfile(html: string, oj: OjId, handle: string): OjSnapshot {
  const document = new DOMParser().parseFromString(html, "text/html");
  const text = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text || /(?:404 error|could not find page)/i.test(text)) throw new Error("Profile was not found");

  const profileHandle = document.querySelector("h1 a, .page-title a")?.textContent?.trim() || handle;
  const solved = readDmojNumber(text, /Problems solved:\s*([\d,]+)/i);
  const rating = readDmojNumber(text, /(?:^|\s)Rating:\s*([\d,.]+)/i);
  const submissions = readDmojNumber(text, /([\d,]+) submissions in the last year/i);
  const rankMatch = text.match(/Rank by rating:\s*#?([\d,]+)/i);
  const profilePath = OJ_DEFINITIONS[oj].profilePath(profileHandle);

  // Public DMOJ profiles expose aggregate statistics, but not a public,
  // unauthenticated submission API. Keep unavailable values undefined rather
  // than manufacturing runtime or submission rows.
  return {
    oj,
    handle: profileHandle,
    profileUrl: `${OJ_DEFINITIONS[oj].baseUrl}${profilePath}`,
    displayName: profileHandle,
    rank: rankMatch ? `#${rankMatch[1]}` : undefined,
    rating,
    solved,
    submissionCount: submissions,
    submissionLabel: "Last year",
    submissions: [],
    source: "Public profile",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchDmoj(oj: "vnoj" | "tbcpc", handle: string): Promise<OjSnapshot> {
  const profilePath = OJ_DEFINITIONS[oj].profilePath(handle);
  // The API endpoint is attempted first for DMOJ installations that expose it.
  // Both VNOJ and TBCPCOJ may disable this endpoint, so the public profile is
  // an intentional, read-only fallback.
  const apiPaths = [`/api/user/info/${encodeURIComponent(handle)}`, `/api/user/info/${encodeURIComponent(handle)}/`];
  for (const apiPath of apiPaths) {
    try {
      const data = asRecord(await fetchJson(requestUrl(oj, apiPath)));
      if (!data) continue;
      const solved = asNumber(data.problems_solved ?? data.solved ?? data.problemsSolved);
      const rating = asNumber(data.rating);
      const submissionCount = asNumber(data.submissions ?? data.submission_count ?? data.submissionCount);
      const returnedHandle = asString(data.username ?? data.handle);
      if (solved === undefined && rating === undefined && submissionCount === undefined && !returnedHandle) continue;
      return {
        oj,
        handle: returnedHandle ?? handle,
        profileUrl: `${OJ_DEFINITIONS[oj].baseUrl}${profilePath}`,
        displayName: asString(data.username ?? data.handle) ?? handle,
        rank: asString(data.rank),
        rating,
        solved,
        submissionCount,
        submissionLabel: "Reported by OJ",
        submissions: [],
        source: "OJ API",
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      // Try the next documented shape, then the profile page below.
    }
  }
  return parseDmojProfile(await fetchText(requestUrl(oj, profilePath)), oj, handle);
}

export async function fetchOjSnapshot(connection: OjConnection): Promise<OjSnapshot> {
  const handle = connection.handle.trim();
  if (!handle) throw new Error("Enter a handle");
  if (connection.oj === "codeforces") return fetchCodeforces(handle);
  return fetchDmoj(connection.oj, handle);
}

export function loadOjConnections(): OjConnection[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OjConnection => {
      const record = asRecord(item);
      return Boolean(record && (record.oj === "codeforces" || record.oj === "vnoj" || record.oj === "tbcpc") && typeof record.handle === "string" && record.handle.trim());
    }).map((item) => ({ oj: item.oj, handle: item.handle.trim() }));
  } catch {
    return [];
  }
}

export function saveOjConnections(connections: OjConnection[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch {
    // A private browsing context may deny storage; the live session still works.
  }
}
