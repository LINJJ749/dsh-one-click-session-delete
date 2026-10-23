/**
 * Host half of the one-click Session delete plugin.
 *
 * The shipped Harness deliberately has no Session deletion: Sessions can be
 * archived, never removed, and the persistence seam has no delete API. This
 * plugin adds one explicit, local-GUI-only operation that permanently removes
 * Session storage:
 *
 *   - the canonical JSONL log of each target Session under
 *     `<persistence root>/--<projectKey(cwd)>--/<encodeSegment(id)>/`
 *     (`session[.vN].jsonl[.zstd]`); the log file is renamed to a
 *     `.deleted-<stamp>` marker first (the single atomic commit point — a
 *     Session without a canonical log is invisible to list/stat/open), then
 *     the Session directory is removed best-effort;
 *   - the Session's persisted projection-cache row in the `session_projcache`
 *     storage domain (a derived cache);
 *   - best-effort workspace-registry bookkeeping: the Session is detached from
 *     its Workspace accounting slot, unarchived and unpinned.
 *
 * The client half calls it through `POST /session-delete/api/delete`; the
 * response is `{ ok: true, value }` or `{ ok: false, error: { code, message,
 * details? } }`.
 *
 * Safety rules:
 *   - only same-origin/local GUI requests pass `ctx.connection.requestRejection`;
 *   - a live Session (in-memory Session or live Agent) is refused: its write
 *     handle would recreate a headerless log after deletion;
 *   - a Session with derived Sessions (forks/subagents) is refused unless the
 *     caller explicitly passes `cascade: true`; the whole subtree must be cold;
 *   - ids are validated and every path is proven to stay inside the session
 *     root.
 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

/** Required Host services (cordis fiber inject). */
export const inject = ['webServer', 'connection']

/** The one delete endpoint. */
const ROUTE_DELETE = '/session-delete/api/delete'
/** Refuse oversized bodies: the request is one session id plus flags. */
const MAX_BODY_BYTES = 64 * 1024
/** Session ids are path and storage-domain keys: keep the accepted alphabet tight. */
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/
/** Physical log generations this backend can own: `session.jsonl[.zstd]`, `session.vN.jsonl[.zstd]`. */
const CANONICAL_LOG_RE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/

/** One operation failure with a stable, client-facing code and optional details. */
function codedError(code, message, details) {
  const error = new Error(message)
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

/** Write one JSON response. */
function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Read the request body as JSON, bounded by {@link MAX_BODY_BYTES}. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw codedError('bad-request', 'request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') throw codedError('bad-request', 'request body is required')
  try {
    return JSON.parse(text)
  } catch {
    throw codedError('bad-request', 'request body is not valid JSON')
  }
}

/** Expand a leading `~` the way the harness home resolution does. */
function expandTilde(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

/** Environment-derived harness home, used only as the last resort. */
function envDshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(expandTilde(configured.trim()))
  return join(homedir(), '.dsh')
}

/**
 * The configured Session-persistence root. The JSONL backend exposes its
 * resolved root as a runtime property, which is authoritative even when a
 * deployment moved the root away from the default; the boot-provided
 * `dshHomePath` and `$DSH_HOME` are fallbacks.
 */
function resolveSessionsRoot(ctx) {
  const persistence = ctx.get('sessionPersistence')
  const runtimeRoot = persistence !== undefined && typeof persistence.root === 'string' && persistence.root !== ''
    ? resolve(persistence.root)
    : undefined
  if (runtimeRoot !== undefined) return runtimeRoot
  const homePath = ctx.get('dshHomePath')
  if (typeof homePath === 'function') {
    try {
      const resolved = homePath('sessions')
      if (typeof resolved === 'string' && resolved !== '') return resolve(resolved)
    } catch {
      // fall through to the environment default
    }
  }
  return join(envDshHome(), 'sessions')
}

/** The storage root; only used when the storage-domain service is unavailable. */
function resolveStoragesRoot(ctx, sessionsRoot) {
  const homePath = ctx.get('dshHomePath')
  if (typeof homePath === 'function') {
    try {
      const resolved = homePath('storages')
      if (typeof resolved === 'string' && resolved !== '') return resolve(resolved)
    } catch {
      // fall through to the sibling-of-sessions guess
    }
  }
  if (basename(sessionsRoot) === 'sessions') return join(dirname(sessionsRoot), 'storages')
  return join(envDshHome(), 'storages')
}

/**
 * Encode an arbitrary Session id into the single path segment the JSONL
 * backend uses. Only `A-Za-z0-9._-` stay literal; everything else becomes
 * `~XXXX`.
 */
function encodeSegment(raw) {
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/** Whether `child` is the same as, or nested inside, `parent`. */
function isInside(parent, child) {
  const parentResolved = resolve(parent)
  const childResolved = resolve(child)
  return childResolved === parentResolved || childResolved.startsWith(parentResolved.endsWith(sep) ? parentResolved : parentResolved + sep)
}

/** Stat a directory; `undefined` when the path is missing or not a directory. */
async function directoryStat(path) {
  try {
    const stat = await fs.stat(path)
    return stat.isDirectory() ? stat : undefined
  } catch {
    return undefined
  }
}

/**
 * Find the session-owned directory for one id under the persistence root. The
 * project subdirectory is named from the Session's own cwd, but the id segment
 * is fixed, so scanning project directories finds the Session without reading
 * its header.
 */
async function locateSessionDir(sessionsRoot, sessionId) {
  const encoded = encodeSegment(sessionId)
  let projects
  try {
    projects = await fs.readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of projects) {
    if (!entry.isDirectory()) continue
    const candidate = join(sessionsRoot, entry.name, encoded)
    if (await directoryStat(candidate) !== undefined) return candidate
  }
  return undefined
}

/**
 * Collect the Session ids derived from `sessionId` (direct and transitive
 * children, i.e. forks and subagent children) from one Session listing. The
 * listing reads stored headers only, so this never opens a Session log.
 */
async function collectDescendants(ctx, sessionId) {
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined || typeof sessionQuery.listSessions !== 'function') return []
  let records
  try {
    records = await sessionQuery.listSessions()
  } catch {
    return []
  }
  const byParent = new Map()
  for (const record of records) {
    const header = record?.header
    const childId = header?.id
    const parent = header?.parentSession
    if (typeof childId !== 'string' || typeof parent !== 'string' || parent === '') continue
    const children = byParent.get(parent)
    if (children === undefined) byParent.set(parent, [childId])
    else children.push(childId)
  }
  const descendants = []
  const seen = new Set([sessionId])
  const queue = [sessionId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const childId of byParent.get(current) ?? []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      descendants.push(childId)
      queue.push(childId)
    }
  }
  return descendants
}

/** Refuse when a Session is retained or live: its write handle would resurrect a headerless log. */
function assertNotLive(ctx, sessionId) {
  const agents = ctx.get('agents')
  const agent = agents !== undefined && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
  if (agent !== undefined) return 'agent'
  const sessions = ctx.get('sessions')
  const session = sessions !== undefined && typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined
  if (session !== undefined) return 'session'
  return undefined
}

/** Rename every canonical log generation in one Session directory: the atomic delete commit. */
async function renameCanonicalLogs(sessionDir) {
  let names
  try {
    names = await fs.readdir(sessionDir)
  } catch {
    return []
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const renamed = []
  for (const name of names) {
    if (!CANONICAL_LOG_RE.test(name)) continue
    const from = join(sessionDir, name)
    const to = join(sessionDir, `${name}.deleted-${stamp}`)
    await fs.rename(from, to)
    renamed.push(to)
  }
  return renamed
}

/** Remove one Session's projection-cache row through the storage domain, else its record file. */
async function removeSessionCache(ctx, storagesRoot, sessionId) {
  const storageDomain = ctx.get('storageDomain')
  if (storageDomain !== undefined && typeof storageDomain.get === 'function') {
    const domain = storageDomain.get('session_projcache')
    if (domain !== undefined && typeof domain.table === 'function') {
      try {
        const table = domain.table('sessions')
        if (table !== undefined && typeof table.delete === 'function') {
          const removed = await table.delete(sessionId)
          if (removed === true) return [`session_projcache/sessions/${sessionId}`]
          return []
        }
      } catch (error) {
        ctx.logger?.warn?.(`session-delete: storage-domain cache delete failed for "${sessionId}": ${String(error)}`)
      }
    }
  }
  // Fallback: the per-record JSON backend stores one document per Session id.
  const directory = join(storagesRoot, 'session_projcache', 'sessions')
  const prefix = `${sessionId}.json`
  const removed = []
  let names
  try {
    names = await fs.readdir(directory)
  } catch {
    return removed
  }
  for (const name of names) {
    if (name !== prefix && !name.startsWith(`${prefix}.bak.`)) continue
    const path = join(directory, name)
    await fs.rm(path, { force: true })
    removed.push(path)
  }
  return removed
}

/** Best-effort registry bookkeeping: detach the Session from its Workspace accounting slot. */
async function detachFromWorkspaces(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined || typeof registry.list !== 'function') return []
  let workspaces
  try {
    workspaces = registry.list()
  } catch {
    return []
  }
  const detached = []
  for (const workspace of workspaces) {
    try {
      const record = workspace?.record
      const accounted = Array.isArray(record?.sessionIds)
        ? record.sessionIds
        : (Array.isArray(workspace?.sessionIds) ? workspace.sessionIds : [])
      if (!accounted.includes(sessionId)) continue
      if (typeof workspace.detachSession !== 'function') continue
      await workspace.detachSession(sessionId)
      detached.push(String(workspace.id))
    } catch (error) {
      ctx.logger?.warn?.(`session-delete: workspace detach failed: ${String(error)}`)
    }
  }
  return detached
}

/** Best-effort global archive/pin cleanup; both are safe no-ops when the id is absent. */
async function clearArchiveAndPin(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return
  try {
    await registry.unarchiveSession(sessionId)
  } catch (error) {
    ctx.logger?.warn?.(`session-delete: unarchive cleanup failed: ${String(error)}`)
  }
  try {
    await registry.unpinSession(sessionId)
  } catch (error) {
    ctx.logger?.warn?.(`session-delete: unpin cleanup failed: ${String(error)}`)
  }
}

/** Remove a directory only when it is empty; a shared project directory stays. */
async function removeIfEmpty(path) {
  try {
    await fs.rmdir(path)
    return true
  } catch {
    return false
  }
}

/**
 * The one shared deletion operation. Validates every target before touching
 * anything, then commits each Session (canonical-log rename) and cleans the
 * derived records. Throws a coded error on every refusal or hard failure.
 *
 * @param ctx - Host plugin context.
 * @param sessionId - Session to remove.
 * @param cascade - also remove derived Sessions (forks/subagent children).
 */
async function deleteSessionStorage(ctx, sessionId, cascade) {
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    throw codedError('bad-request', `invalid session id: ${JSON.stringify(sessionId)}`)
  }

  const sessionsRoot = resolveSessionsRoot(ctx)
  if (await directoryStat(sessionsRoot) === undefined) {
    throw codedError('storage-unresolved', `session root is not a readable directory: ${sessionsRoot}`)
  }
  const storagesRoot = resolveStoragesRoot(ctx, sessionsRoot)
  const rootDir = await locateSessionDir(sessionsRoot, sessionId)
  if (rootDir === undefined) {
    throw codedError('session/unknown', `session "${sessionId}" has no stored log`)
  }

  const descendants = await collectDescendants(ctx, sessionId)
  if (descendants.length > 0 && cascade !== true) {
    throw codedError(
      'session/children',
      `session "${sessionId}" has ${String(descendants.length)} derived session(s); pass cascade to delete them together`,
      { count: descendants.length },
    )
  }
  const targets = cascade === true ? [sessionId, ...descendants] : [sessionId]

  // Validate the whole subtree before deleting anything.
  const plans = []
  for (const targetId of targets) {
    const live = assertNotLive(ctx, targetId)
    if (live !== undefined) {
      if (targetId === sessionId) {
        throw codedError('session/live', `session "${targetId}" is live: close it before deleting`)
      }
      throw codedError('session/children-live', `derived session "${targetId}" is live: close it before deleting`)
    }
    const dir = targetId === sessionId ? rootDir : await locateSessionDir(sessionsRoot, targetId)
    if (dir !== undefined && !isInside(sessionsRoot, dir)) {
      throw codedError('storage-unresolved', 'resolved session path escapes the session root')
    }
    plans.push({ sessionId: targetId, dir })
  }
  // Delete deepest first: a tree whose children are already gone is cheaper to
  // reason about when a later step fails.
  plans.reverse()

  const deleted = []
  const removedPaths = []
  const residuals = []
  const detachedWorkspaces = []
  const cacheRemoved = []
  for (const plan of plans) {
    if (plan.dir !== undefined) {
      try {
        removedPaths.push(...await renameCanonicalLogs(plan.dir))
        // The rename committed and the Session is already invisible; removing
        // the leftover directory (marker files included) is best effort.
        try {
          await fs.rm(plan.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
          removedPaths.push(plan.dir)
          await removeIfEmpty(dirname(plan.dir))
        } catch (error) {
          residuals.push(plan.dir)
          ctx.logger?.warn?.(`session-delete: leftover directory removal failed for "${plan.sessionId}": ${String(error)}`)
        }
      } catch (error) {
        if (plan.sessionId === sessionId) {
          throw codedError('delete-failed', `cannot remove session log: ${error instanceof Error ? error.message : String(error)}`)
        }
        ctx.logger?.warn?.(`session-delete: derived session log removal failed for "${plan.sessionId}": ${String(error)}`)
      }
    }
    try {
      cacheRemoved.push(...await removeSessionCache(ctx, storagesRoot, plan.sessionId))
    } catch (error) {
      ctx.logger?.warn?.(`session-delete: projection cache cleanup failed for "${plan.sessionId}": ${String(error)}`)
    }
    try {
      detachedWorkspaces.push(...await detachFromWorkspaces(ctx, plan.sessionId))
    } catch (error) {
      ctx.logger?.warn?.(`session-delete: workspace detach failed for "${plan.sessionId}": ${String(error)}`)
    }
    try {
      await clearArchiveAndPin(ctx, plan.sessionId)
    } catch (error) {
      ctx.logger?.warn?.(`session-delete: archive/pin cleanup failed for "${plan.sessionId}": ${String(error)}`)
    }
    deleted.push(plan.sessionId)
  }

  return {
    sessionId,
    cascade: cascade === true,
    deleted,
    removedPaths,
    cacheRemoved,
    detachedWorkspaces,
    residuals,
  }
}

/**
 * Register the delete route. Every caller runs the same operation; the route
 * only owns the HTTP transport, trust check, and error mapping.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_DELETE,
    handler: async (req, res) => {
      try {
        const rejection = ctx.get('connection')?.requestRejection(req)
        if (rejection !== undefined) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'request rejected' } })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
          return
        }
        const payload = await readJsonBody(req)
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
          throw codedError('bad-request', 'request body must be a JSON object')
        }
        const sessionId = payload.sessionId
        if (typeof sessionId !== 'string') throw codedError('bad-request', 'sessionId must be a string')
        if (payload.cascade !== undefined && typeof payload.cascade !== 'boolean') {
          throw codedError('bad-request', 'cascade must be a boolean')
        }
        const value = await deleteSessionStorage(ctx, sessionId, payload.cascade === true)
        writeJson(res, 200, { ok: true, value })
      } catch (error) {
        if (error !== null && typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string') {
          const status = error.code === 'bad-request' ? 400
            : error.code === 'forbidden' ? 403
              : error.code === 'session/unknown' ? 404
                : error.code === 'method-error' ? 405
                  : (error.code === 'session/live' || error.code === 'session/children' || error.code === 'session/children-live') ? 409
                    : 500
          writeJson(res, status, {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error.details === undefined ? {} : { details: error.details }),
            },
          })
          return
        }
        ctx.logger?.warn?.(`session-delete: delete request failed: ${String(error)}`)
        writeJson(res, 500, { ok: false, error: { code: 'delete-failed', message: 'session storage could not be removed' } })
      }
    },
  }), 'session-delete: /session-delete/api/delete route')
}
