window.__ModuleLoader__.load({
  id: 'dsh-session-delete',
  factory(require) {
    const React = require('react')
    const { useRef, useState, useEffect, useSyncExternalStore } = React
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'sessionDelete'

    /** Dictionary: Simplified Chinese. */
    const zh = {
      'actions.delete': '删除会话',
      'menu.deleteSession': '删除会话',
      'dialog.title': '永久删除此会话？',
      'dialog.desc': '“{title}”的本地会话记录将被永久删除，无法恢复。',
      'dialog.hint': '只是想从侧栏收起时，请改用“归档会话”，之后仍可恢复。',
      'dialog.cancel': '取消',
      'dialog.confirm': '永久删除',
      'dialog.confirmCascade': '一并删除 {count} 个会话',
      'dialog.deleting': '正在删除…',
      'dialog.close': '关闭',
      'dialog.failed': '删除失败：{message}',
      'dialog.childrenNotice': '该会话还包含 {count} 个派生会话（分叉或子代理）。继续操作会把这些派生会话一并永久删除。',
      'error.live': '该会话正在打开或运行中，请先切换到其它会话后再删除。',
      'error.unknown': '会话不存在或已被删除。',
      'error.children': '该会话存在派生会话（分叉或子代理），确认后可一并删除。',
      'error.childrenLive': '派生会话中有正在打开或运行的会话，请先关闭它们后再删除。',
      'error.storage': '无法定位会话存储目录（DSH_HOME 解析失败）。',
      'error.forbidden': '请求被拒绝：只允许本机 GUI 发起删除。',
      'error.method': '请求方式错误。',
      'error.badRequest': '删除请求参数无效。',
    }

    /** Dictionary: English. */
    const en = {
      'actions.delete': 'Delete session',
      'menu.deleteSession': 'Delete session',
      'dialog.title': 'Permanently delete this session?',
      'dialog.desc': 'The local records of “{title}” will be permanently deleted and cannot be recovered.',
      'dialog.hint': 'To merely hide it from the sidebar, use “Archive session” instead; archived sessions can be restored.',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Delete permanently',
      'dialog.confirmCascade': 'Delete all {count} sessions',
      'dialog.deleting': 'Deleting…',
      'dialog.close': 'Close',
      'dialog.failed': 'Delete failed: {message}',
      'dialog.childrenNotice': 'This session has {count} derived session(s) (forks or subagents). Continuing permanently deletes them too.',
      'error.live': 'This session is open or running. Switch to another session before deleting it.',
      'error.unknown': 'The session no longer exists.',
      'error.children': 'This session has derived sessions (forks or subagents); confirm to delete them together.',
      'error.childrenLive': 'A derived session is open or running. Close it before deleting.',
      'error.storage': 'The session storage directory could not be resolved (DSH_HOME resolution failed).',
      'error.forbidden': 'Request rejected: deletion is only allowed from the local GUI.',
      'error.method': 'Wrong request method.',
      'error.badRequest': 'Invalid delete request.',
    }

    /** Client-side CSS, injected once for the plugin's whole lifetime. */
    const CSS = [
      '.sdw-icon-button{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;flex:none;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.sdw-icon-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.sdw-icon-button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}',
      '.sdw-row-delete:hover{color:var(--dsw-alias-state-error-primary)}',
      '.sdw-menu-item{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;min-height:32px;padding:0 8px;border:none;border-top:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:start;cursor:pointer}',
      '.sdw-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.sdw-menu-item:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}',
      '.sdw-menu-item-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.sdw-menu-item:hover .sdw-menu-item-icon{color:var(--dsw-alias-state-error-primary)}',
      '.sdw-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45)}',
      '.sdw-dialog{box-sizing:border-box;width:min(460px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:18px 20px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 16px 40px rgba(0,0,0,.28)}',
      '.sdw-dialog-head{display:flex;align-items:flex-start;gap:12px}',
      '.sdw-dialog-title{margin:0;flex:1;min-width:0;font-size:16px;line-height:24px;font-weight:600}',
      '.sdw-dialog-close{flex:none;margin:-2px -4px 0 0}',
      '.sdw-dialog-desc{margin:10px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.sdw-dialog-hint{margin:8px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.sdw-dialog-notice{margin:10px 0 0;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere}',
      '.sdw-dialog-error{margin:10px 0 0;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}',
      '.sdw-dialog-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}',
      '.sdw-button{box-sizing:border-box;height:32px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:30px;cursor:pointer}',
      '.sdw-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.sdw-button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}',
      '.sdw-button:disabled{opacity:.55;cursor:default}',
      '.sdw-button-danger{border-color:transparent;background:var(--dsw-alias-state-error-primary);color:#fff}',
      '.sdw-button-danger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);filter:brightness(1.08)}',
    ].join('')

    /** Tiny subscribable snapshot store shared by the row control and the dialog. */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          if (next === value) return
          value = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /**
     * Resolve one of this plugin's Host routes against the page base, keeping a
     * reverse-proxy directory prefix. In the desktop shell the page is
     * `dsh-app://app/` and the shell forwards non-static paths to the Host
     * same-origin, so the relative URL is the one transport that works in both
     * the browser and the desktop window.
     */
    function routeUrl(path) {
      const base = typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI !== ''
        ? document.baseURI
        : 'http://dsh.internal/'
      return new URL(path.replace(/^\/+/, ''), base).href
    }

    /** Map a Host failure code to the user-facing message key. */
    function errorKey(code) {
      if (code === 'session/live') return 'error.live'
      if (code === 'session/unknown') return 'error.unknown'
      if (code === 'session/children-live') return 'error.childrenLive'
      if (code === 'storage-unresolved') return 'error.storage'
      if (code === 'forbidden') return 'error.forbidden'
      if (code === 'method-error') return 'error.method'
      if (code === 'bad-request') return 'error.badRequest'
      return undefined
    }

    /** Trash outline icon matching the host's 14px row-action icons. */
    function TrashIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('path', { d: 'M2.75 4.25h10.5' }),
        h('path', { d: 'M6.25 4.25V3a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 .75.75v1.25' }),
        h('path', { d: 'M4 4.25l.68 8.16a1.5 1.5 0 0 0 1.49 1.34h3.66a1.5 1.5 0 0 0 1.49-1.34L12 4.25' }),
        h('path', { d: 'M6.75 6.75v4M9.25 6.75v4' }),
      )
    }

    /** Small close (x) icon for the dialog header. */
    function CloseIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('path', { d: 'M4 4l8 8M12 4l-8 8' }),
      )
    }

    /** Hover button at the end of one Session row (order 300, after archive and pin). */
    function DeleteSessionRowButton({ sessionId, displayTitle, requestDelete, t }) {
      return h('button', {
        type: 'button',
        className: 'sdw-icon-button sdw-row-delete',
        title: t('actions.delete'),
        'aria-label': t('actions.delete'),
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          requestDelete({ sessionId, displayTitle })
        },
      }, h(TrashIcon))
    }

    /** The "..." menu row (order 460, after the shipped session-id row). */
    function DeleteSessionMenuItem({ sessionId, displayTitle, requestDelete, useMenuOpenState, t }) {
      const [, setMenuOpen] = useMenuOpenState()
      return h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'sdw-menu-item',
        onClick: () => {
          setMenuOpen(false)
          requestDelete({ sessionId, displayTitle })
        },
      },
        h('span', { className: 'sdw-menu-item-icon' }, h(TrashIcon)),
        h('span', null, t('menu.deleteSession')),
      )
    }

    /**
     * `shell.overlay` entry: nothing while no confirmation is pending,
     * otherwise one dialog for the pending request. The dialog owns its own
     * in-flight and error state, which dies with the request.
     */
    function DeleteSessionDialog({ usePendingDelete, settleDelete, deleteSession, t }) {
      const request = usePendingDelete((value) => value)
      if (request === null) return null
      return h(DeleteSessionConfirmForm, {
        key: request.sessionId,
        request,
        settleDelete,
        deleteSession,
        t,
      })
    }

    /** One request's confirmation dialog. */
    function DeleteSessionConfirmForm({ request, settleDelete, deleteSession, t }) {
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const [childrenCount, setChildrenCount] = useState(null)
      const cancelRef = useRef(null)
      const cascade = childrenCount !== null

      const close = () => {
        if (busy) return
        settleDelete()
      }
      const confirm = () => {
        setBusy(true)
        setFailure(null)
        deleteSession(request.sessionId, cascade).then(() => {
          settleDelete()
        }).catch((reason) => {
          setBusy(false)
          if (reason !== null && typeof reason === 'object' && reason.code === 'session/children') {
            // The Session has derived Sessions. Keep the dialog open and let the
            // user decide whether to delete the whole subtree with one more click.
            const count = typeof reason.details?.count === 'number' ? reason.details.count : null
            setChildrenCount(count)
            return
          }
          setFailure(reason)
        })
      }

      useEffect(() => {
        cancelRef.current?.focus()
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (!busy) settleDelete()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => { window.removeEventListener('keydown', onKeyDown, true) }
      }, [busy])

      const failureMessage = failure === null
        ? null
        : t(errorKey(failure.code) ?? 'dialog.failed', { message: failure.message })
      const childrenNotice = childrenCount === null
        ? null
        : t('dialog.childrenNotice', { count: childrenCount })
      const confirmLabel = busy
        ? t('dialog.deleting')
        : cascade
          ? t('dialog.confirmCascade', { count: childrenCount })
          : t('dialog.confirm')
      const title = request.displayTitle === '' ? request.sessionId : request.displayTitle

      return h('div', {
        className: 'sdw-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && !busy) settleDelete()
        },
      },
        h('div', {
          className: 'sdw-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'sdw-delete-title',
        },
          h('div', { className: 'sdw-dialog-head' },
            h('h2', { id: 'sdw-delete-title', className: 'sdw-dialog-title' }, t('dialog.title')),
            h('button', {
              type: 'button',
              className: 'sdw-icon-button sdw-dialog-close',
              title: t('dialog.close'),
              'aria-label': t('dialog.close'),
              onClick: close,
            }, h(CloseIcon)),
          ),
          h('p', { className: 'sdw-dialog-desc' }, t('dialog.desc', { title })),
          h('p', { className: 'sdw-dialog-hint' }, t('dialog.hint')),
          childrenNotice !== null && h('p', { className: 'sdw-dialog-notice', role: 'status' }, childrenNotice),
          failureMessage !== null && h('p', { className: 'sdw-dialog-error', role: 'alert' }, failureMessage),
          h('div', { className: 'sdw-dialog-footer' },
            h('button', {
              type: 'button',
              className: 'sdw-button',
              ref: cancelRef,
              disabled: busy,
              onClick: close,
            }, t('dialog.cancel')),
            h('button', {
              type: 'button',
              className: 'sdw-button sdw-button-danger',
              disabled: busy,
              onClick: confirm,
            }, confirmLabel),
          ),
        ),
      )
    }

    /** Required Client services (cordis fiber inject). */
    const inject = ['slots', 'locale', 'sessions']

    /** Register the row control, the menu row, the dialog, and the styles. */
    function apply(ctx) {
      const pendingDelete = createStore(null)
      const sessions = ctx.get('sessions')

      const settleDelete = () => { pendingDelete.set(null) }
      const requestDelete = (request) => { pendingDelete.set(request) }

      /** Delete one session through the Host route, then refresh the Session list. */
      const deleteSession = async (sessionId, cascade) => {
        let response
        try {
          response = await fetch(routeUrl('session-delete/api/delete'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(cascade === true ? { sessionId, cascade: true } : { sessionId }),
          })
        } catch (cause) {
          const error = new Error(cause instanceof Error ? cause.message : String(cause))
          error.code = 'network'
          throw error
        }
        let payload
        try {
          payload = await response.json()
        } catch {
          payload = undefined
        }
        if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
          const reported = payload !== null && typeof payload === 'object' && payload.error !== null && typeof payload.error === 'object'
            ? payload.error
            : undefined
          const error = new Error(
            reported !== undefined && typeof reported.message === 'string' ? reported.message : `HTTP ${response.status}`,
          )
          error.code = reported !== undefined ? reported.code : undefined
          error.details = reported !== undefined ? reported.details : undefined
          throw error
        }
        const value = payload.value ?? null
        // The Host has committed the deletion; drop the rows locally at once so
        // the sidebar reacts immediately, then align with the Host baseline in
        // the background (the full list also removes identities the Host no
        // longer knows).
        const deleted = Array.isArray(value?.deleted) && value.deleted.length > 0 ? value.deleted : [sessionId]
        for (const deletedId of deleted) {
          try {
            sessions?.handleSessionRemoved?.(deletedId)
          } catch (cause) {
            console.warn('[session-delete] local row removal failed:', cause)
          }
        }
        try {
          void sessions?.refresh?.().catch((cause) => {
            console.warn('[session-delete] list refresh failed after deletion:', cause)
          })
        } catch (cause) {
          console.warn('[session-delete] list refresh failed after deletion:', cause)
        }
        return value
      }

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-delete: dictionaries')

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const pluginCss = 'dsh-session-delete/client.css'
        for (const stale of document.querySelectorAll('style[data-plugin-css]')) {
          if (stale.dataset.pluginCss === pluginCss) stale.remove()
        }
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-session-delete'
        tag.dataset.pluginCss = pluginCss
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => { tag.remove() }
      }, 'session-delete: styles')

      // One-click delete: hover control at the end of each Session row.
      ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.row.action',
        id: 'delete-session',
        order: 300,
        locale: NS,
        inject: () => ({ requestDelete }),
      }, DeleteSessionRowButton))

      // The same operation as a row in the Session's "..." menu.
      ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.menu.item',
        id: 'delete-session',
        order: 460,
        locale: NS,
        inject: () => ({ requestDelete }),
      }, DeleteSessionMenuItem))

      // One frame-wide confirmation dialog fed by the row/menu requests.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-delete-dialog',
        locale: NS,
        inject: () => ({
          hooks: { pendingDelete },
          settleDelete,
          deleteSession,
        }),
      }, DeleteSessionDialog))
    }

    return { inject, apply }
  },
})
