// dsh-summary / 前端：会话总结 + 文件管理
//
// 侧边栏图标 → 主面板。两个标签页：
//   按会话 —— 工作区 / 会话列表，右边看总结或生成
//   文件   —— 所有已生成的 Markdown，可查看、删除

window.__ModuleLoader__.load({
  id: 'dsh-summary',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const T = {
      text: 'var(--dsw-alias-label-primary, #111827)',
      dim: 'var(--dsw-alias-label-secondary, #6b7280)',
      line: 'var(--dsw-alias-border-l1, rgba(127,127,127,.2))',
      line2: 'var(--dsw-alias-border-l2, rgba(127,127,127,.34))',
      card: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.05))',
      card2: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.09))',
      base: 'var(--dsw-alias-bg-base, #fff)',
      ok: 'var(--dsw-alias-state-success-primary, #10b981)',
      bad: 'var(--dsw-alias-state-error-primary, #ef4444)',
    }

    // 按钮配色写死，不依赖主题 token，避免浅色底上白字看不见
    const ghost = {
      fontSize: 12,
      padding: '5px 12px',
      borderRadius: 8,
      border: '1px solid currentColor',
      background: 'transparent',
      color: 'inherit',
      opacity: 0.72,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }

    const primary = {
      fontSize: 12,
      padding: '5px 14px',
      borderRadius: 8,
      border: '1px solid #1d4ed8',
      background: '#2563eb',
      color: '#ffffff',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontWeight: 600,
    }

    const danger = {
      fontSize: 11.5,
      padding: '4px 10px',
      borderRadius: 7,
      border: '1px solid #dc2626',
      background: 'transparent',
      color: '#dc2626',
      cursor: 'pointer',
      fontFamily: 'inherit',
    }

    function MiniMarkdown({ text }) {
      const blocks = []
      const lines = String(text || '').split('\n')
      let list = []
      let key = 0

      const flush = () => {
        if (!list.length) return
        blocks.push(
          h(
            'ul',
            { key: 'ul' + key++, style: { margin: '8px 0', paddingLeft: 20 } },
            list.map((item, i) =>
              h('li', { key: i, style: { margin: '4px 0', lineHeight: 1.8, color: T.text, fontSize: 13.5 } }, item),
            ),
          ),
        )
        list = []
      }

      for (const raw of lines) {
        const line = raw.replace(/\s+$/, '')
        if (!line.trim()) {
          flush()
          continue
        }
        const hm = /^(#{1,4})\s+(.*)$/.exec(line)
        if (hm) {
          flush()
          const level = hm[1].length
          blocks.push(
            h(
              'div',
              {
                key: 'h' + key++,
                style: {
                  fontSize: level <= 1 ? 19 : level === 2 ? 15.5 : 14,
                  fontWeight: 700,
                  color: T.text,
                  margin: level <= 2 ? '22px 0 8px' : '16px 0 6px',
                },
              },
              hm[2],
            ),
          )
          continue
        }
        if (/^---+$/.test(line.trim())) {
          flush()
          blocks.push(
            h('hr', { key: 'hr' + key++, style: { border: 0, borderTop: '1px solid ' + T.line, margin: '18px 0' } }),
          )
          continue
        }
        const lm = /^\s*[-*]\s+(.*)$/.exec(line)
        if (lm) {
          list.push(lm[1])
          continue
        }
        flush()
        blocks.push(
          h(
            'p',
            { key: 'p' + key++, style: { margin: '8px 0', lineHeight: 1.85, color: T.text, fontSize: 13.5 } },
            line,
          ),
        )
      }
      flush()
      return h('div', null, blocks)
    }

    function Icon(props) {
      const size = props && props.size ? props.size : 20
      const active = props && props.active
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('rect', {
          x: 5,
          y: 3.5,
          width: 14,
          height: 17,
          rx: 2.4,
          stroke: active ? '#5B9EFF' : 'currentColor',
          strokeWidth: 1.5,
        }),
        h('path', {
          d: 'M8.5 8h7M8.5 11.5h7M8.5 15h4',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          opacity: 0.75,
        }),
      )
    }

    function SessionSummaryButton(props) {
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      const sessionId = props && props.sessionId ? String(props.sessionId) : ''

      const run = async () => {
        if (busy || !sessionId) return
        setBusy(true)
        setMsg('')
        try {
          const res = await fetch('/summary/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, mode: 'simple' }),
          })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          setMsg('已保存')
        } catch (e) {
          setMsg('失败')
        } finally {
          setBusy(false)
          setTimeout(() => setMsg(''), 4000)
        }
      }

      return h(
        'button',
        {
          onClick: run,
          title: '生成这个会话的总结',
          disabled: busy,
          style: {
            fontSize: 12,
            fontWeight: 500,
            padding: '4px 11px',
            borderRadius: 8,
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            opacity: busy ? 0.55 : 0.8,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          },
        },
        busy ? '生成中…' : msg || '总结',
      )
    }

    function Page() {
      const [tab, setTab] = useState('sessions')

      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [selected, setSelected] = useState(null)
      const [content, setContent] = useState('')
      const [currentPath, setCurrentPath] = useState('')
      const [mode, setMode] = useState('simple')
      const [busy, setBusy] = useState('')
      const [note, setNote] = useState('')
      const [hover, setHover] = useState('')

      const [files, setFiles] = useState([])
      const [fileSel, setFileSel] = useState(null)

      const load = useCallback(async () => {
        try {
          const res = await fetch('/summary/list', { cache: 'no-store' })
          const json = await res.json()
          if (json.error) {
            setError(json.error)
            return
          }
          setError('')
          setData(json)
        } catch (e) {
          setError(String(e && e.message))
        }
        try {
          const res2 = await fetch('/summary/files', { cache: 'no-store' })
          const json2 = await res2.json()
          if (!json2.error) setFiles(json2.files || [])
        } catch {
          // 文件列表失败不影响主流程
        }
      }, [])

      useEffect(() => {
        load()
        const timer = setInterval(load, 6000)
        return () => clearInterval(timer)
      }, [load])

      const openFile = async (path) => {
        setCurrentPath(path || '')
        if (!path) {
          setContent('')
          return
        }
        try {
          const res = await fetch('/summary/read?path=' + encodeURIComponent(path), { cache: 'no-store' })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          setContent(json.content || '')
        } catch (e) {
          setContent('读取失败：' + String(e && e.message))
        }
      }

      const pickSession = async (ws, s) => {
        setSelected({ kind: 'session', ws, s })
        setNote('')
        await openFile(s.filePath || '')
      }

      const pickWorkspace = (ws) => {
        setSelected({ kind: 'workspace', ws })
        setNote('')
        const f = (ws.files || []).find((x) => x === '_工作区.md')
        openFile(f ? ws.dir + '\\' + f : '')
      }

      const generate = async (target) => {
        const t = target || selected
        if (!t) return
        setBusy('gen')
        setNote('生成中，会话越长越慢…')
        try {
          const body = t.kind === 'workspace' ? { workspaceId: t.ws.id } : { sessionId: t.s.id, mode }
          const res = await fetch('/summary/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          if (t === selected) setContent(json.content || '')
          setNote('已写好：' + json.file)
          await load()
        } catch (e) {
          setNote('失败：' + String(e && e.message))
        } finally {
          setBusy('')
        }
      }

      const removeByPath = async (path) => {
        if (!path) return
        const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('删除这份总结？删了就没了。') : true
        if (!ok) return
        setBusy('del')
        try {
          const res = await fetch('/summary/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path }),
          })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          if (path === currentPath) {
            setContent('')
            setCurrentPath('')
          }
          setNote('已删除')
          await load()
        } catch (e) {
          setNote('删除失败：' + String(e && e.message))
        } finally {
          setBusy('')
        }
      }

      if (error) return h('div', { style: { padding: 48, color: T.bad, fontSize: 13 } }, '读不到会话列表：' + error)
      if (!data) return h('div', { style: { padding: 48, color: T.dim, fontSize: 13 } }, '读取中…')

      const workspaces = data.workspaces || []
      const selectedTitle = !selected
        ? ''
        : selected.kind === 'workspace'
          ? selected.ws.title
          : selected.s.title || '会话'

      const tabBtn = (id, label) =>
        h(
          'button',
          {
            key: id,
            onClick: () => setTab(id),
            style: {
              fontSize: 12.5,
              padding: '5px 14px',
              borderRadius: 7,
              border: 'none',
              background: tab === id ? T.base : 'transparent',
              color: tab === id ? T.text : T.dim,
              fontWeight: tab === id ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
            },
          },
          label,
        )

      return h(
        'div',
        { style: { height: '100%', background: T.base, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },

        // 顶栏
        h(
          'div',
          {
            style: {
              padding: '16px 28px 12px',
              borderBottom: '1px solid ' + T.line,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              flex: '0 0 auto',
            },
          },
          h(
            'div',
            { style: { display: 'grid', gap: 1 } },
            h('div', { style: { fontSize: 16.5, fontWeight: 700, color: T.text } }, '会话总结'),
            h('div', { style: { fontSize: 11, color: T.dim } }, 'Markdown 存在各工作区的 .dsh-summaries 里'),
          ),
          h(
            'div',
            { style: { display: 'flex', padding: 2, borderRadius: 9, background: T.card2, border: '1px solid ' + T.line } },
            [tabBtn('sessions', '按会话'), tabBtn('files', '文件')],
          ),
          h('div', { style: { flex: '1 1 auto' } }),
          tab === 'sessions'
            ? h(
                'div',
                { style: { display: 'flex', padding: 2, borderRadius: 9, background: T.card2, border: '1px solid ' + T.line } },
                ['simple', 'detailed'].map((m) =>
                  h(
                    'button',
                    {
                      key: m,
                      onClick: () => setMode(m),
                      style: {
                        fontSize: 11.5,
                        padding: '4px 12px',
                        borderRadius: 7,
                        border: 'none',
                        background: mode === m ? T.base : 'transparent',
                        color: mode === m ? T.text : T.dim,
                        fontWeight: mode === m ? 600 : 400,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      },
                    },
                    m === 'simple' ? '简单' : '详细',
                  ),
                ),
              )
            : null,
          h('button', { onClick: load, style: ghost }, '刷新'),
        ),

        // 主体
        h(
          'div',
          { style: { flex: '1 1 auto', display: 'flex', minHeight: 0 } },

          // 左栏
          h(
            'div',
            {
              style: {
                width: tab === 'sessions' ? 316 : 340,
                flex: '0 0 auto',
                borderRight: '1px solid ' + T.line,
                overflowY: 'auto',
                padding: '12px 10px 30px',
                background: T.card,
              },
            },

            tab === 'sessions'
              ? workspaces.length
                ? workspaces.map((ws) =>
                    h(
                      'div',
                      { key: ws.id, style: { marginBottom: 12 } },
                      h(
                        'div',
                        {
                          onClick: () => pickWorkspace(ws),
                          onMouseEnter: () => setHover('ws:' + ws.id),
                          onMouseLeave: () => setHover(''),
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            padding: '6px 9px',
                            borderRadius: 9,
                            cursor: 'pointer',
                            background:
                              selected && selected.kind === 'workspace' && selected.ws.id === ws.id
                                ? T.card2
                                : hover === 'ws:' + ws.id
                                  ? T.card2
                                  : 'transparent',
                          },
                        },
                        h('i', { style: { width: 7, height: 7, borderRadius: 2, background: '#2563eb', flex: '0 0 auto' } }),
                        h(
                          'span',
                          {
                            style: {
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: T.text,
                              flex: '1 1 auto',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            },
                            title: ws.path,
                          },
                          ws.title,
                        ),
                        h(
                          'button',
                          {
                            onClick: (e) => {
                              e.stopPropagation()
                              generate({ kind: 'workspace', ws })
                            },
                            title: '把这个工作区所有会话总结合成一份总览',
                            style: {
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 6,
                              border: '1px solid ' + T.line2,
                              background: T.base,
                              color: T.text,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              flex: '0 0 auto',
                            },
                          },
                          '总览',
                        ),
                      ),
                      ws.sessions && ws.sessions.length
                        ? h(
                            'div',
                            { style: { display: 'grid', gap: 1, marginTop: 2 } },
                            ws.sessions.map((s) =>
                              h(
                                'div',
                                {
                                  key: s.id,
                                  onClick: () => pickSession(ws, s),
                                  onMouseEnter: () => setHover('s:' + s.id),
                                  onMouseLeave: () => setHover(''),
                                  style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '5px 9px 5px 20px',
                                    borderRadius: 7,
                                    cursor: 'pointer',
                                    background:
                                      selected && selected.kind === 'session' && selected.s.id === s.id
                                        ? T.card2
                                        : hover === 's:' + s.id
                                          ? T.card2
                                          : 'transparent',
                                  },
                                },
                                h('i', {
                                  style: {
                                    width: 5,
                                    height: 5,
                                    borderRadius: 99,
                                    background: s.file ? T.ok : T.line2,
                                    flex: '0 0 auto',
                                  },
                                }),
                                h(
                                  'span',
                                  {
                                    style: {
                                      fontSize: 11.5,
                                      color: s.file ? T.text : T.dim,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    },
                                    title: s.title,
                                  },
                                  s.title,
                                ),
                              ),
                            ),
                          )
                        : h('div', { style: { fontSize: 10.5, color: T.dim, padding: '2px 9px 0 20px' } }, '没有对话'),
                    ),
                  )
                : h('div', { style: { fontSize: 12, color: T.dim, padding: 14 } }, '没有工作区')
              : files.length
                ? files.map((f) =>
                    h(
                      'div',
                      {
                        key: f.path,
                        onClick: () => {
                          setFileSel(f)
                          openFile(f.path)
                        },
                        onMouseEnter: () => setHover('f:' + f.path),
                        onMouseLeave: () => setHover(''),
                        style: {
                          padding: '7px 9px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          marginBottom: 2,
                          background:
                            fileSel && fileSel.path === f.path ? T.card2 : hover === 'f:' + f.path ? T.card2 : 'transparent',
                        },
                      },
                      h(
                        'div',
                        {
                          style: {
                            fontSize: 12,
                            color: T.text,
                            fontWeight: f.isWorkspace ? 600 : 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        },
                        f.isWorkspace ? '工作区总览' : f.workspace,
                      ),
                      h(
                        'div',
                        { style: { fontSize: 10, color: T.dim, marginTop: 2, display: 'flex', gap: 8 } },
                        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
                        h('span', { style: { flex: '1 1 auto' } }),
                        h('span', null, Math.max(1, Math.round(f.size / 1024)) + ' KB'),
                      ),
                    ),
                  )
                : h('div', { style: { fontSize: 12, color: T.dim, padding: 14 } }, '还没有生成过总结'),
          ),

          // 右栏
          h(
            'div',
            { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' } },
            h(
              'div',
              {
                style: {
                  padding: '10px 26px',
                  borderBottom: '1px solid ' + T.line,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: '0 0 auto',
                },
              },
              h(
                'span',
                {
                  style: {
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: content ? T.text : T.dim,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                },
                tab === 'files' ? (fileSel ? fileSel.name : '选择一份文件') : selectedTitle || '选择一个会话',
              ),
              h('span', { style: { flex: '1 1 auto' } }),
              currentPath
                ? h(
                    'button',
                    { onClick: () => removeByPath(currentPath), disabled: !!busy, style: danger },
                    busy === 'del' ? '删除中…' : '删除',
                  )
                : null,
              tab === 'sessions' && selected
                ? h(
                    'button',
                    { onClick: () => generate(), disabled: !!busy, style: { ...primary, opacity: busy ? 0.6 : 1 } },
                    busy === 'gen' ? '生成中…' : selected.kind === 'workspace' ? '生成总览' : '生成总结',
                  )
                : null,
            ),
            note
              ? h('div', { style: { padding: '5px 26px', fontSize: 11, color: note.startsWith('失败') ? T.bad : T.dim } }, note)
              : null,
            h(
              'div',
              { style: { flex: '1 1 auto', overflowY: 'auto', padding: '18px 26px 44px' } },
              content
                ? h('div', { style: { maxWidth: 780 } }, h(MiniMarkdown, { text: content }))
                : h(
                    'div',
                    {
                      style: {
                        maxWidth: 400,
                        margin: '60px auto',
                        textAlign: 'center',
                        display: 'grid',
                        gap: 10,
                        justifyItems: 'center',
                      },
                    },
                    h('div', { style: { opacity: 0.45 } }, h(Icon, { size: 38 })),
                    h(
                      'div',
                      { style: { fontSize: 12.5, color: T.dim, lineHeight: 1.9 } },
                      tab === 'files'
                        ? '左边选一份文件查看内容。'
                        : selected
                          ? selected.kind === 'workspace'
                            ? '这个工作区还没有总览。点「总览」生成一份。'
                            : '这个会话还没有总结。点右边按钮生成。'
                          : '左边选一个会话，右边就能看总结或者生成。',
                    ),
                  ),
            ),
          ),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'summary', order: 31 }, Icon),
        )
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'summary' }, Page))
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'summary', order: 10 }, SessionSummaryButton),
        )
      },
    }
  },
})
