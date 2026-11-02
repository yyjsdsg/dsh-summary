// dsh-summary — 把每个会话总结成 Markdown，按工作区归档，带一个查看页面。
//
// 数据通路：
//   workspaceRegistry.list()            → 工作区及其会话
//   sessionPersistence.open(id,'read')  → 读会话事件（user/message、assistant/message）
//   llm.stream()                        → 生成总结
//   写盘：<工作区>/.dsh-summaries/<日期>-<会话id前8>.md

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

export const inject = ['sessionPersistence', 'workspaceRegistry']

const DEFAULTS = {
  enabled: true,
  /** 空闲自动总结，默认关 */
  auto: false,
  autoIdleMinutes: 10,
  /** simple | detailed */
  mode: 'simple',
  dirName: '.dsh-summaries',
  /** 单次喂给模型的对话文本上限（字符） */
  maxChars: 120000,
  model: '',
  provider: '',
}

const SIMPLE_PROMPT = `你是一个记录员。读下面这段对话，用 3 到 5 句话总结它讲的是什么、最后结论是什么。

规则：
- 只写对话里真实出现过的内容。
- 不推断动机，不评价好坏，不补充没提到的信息。
- 说清楚具体对象（哪个文件、哪个功能、哪个人），不要写「讨论了相关事宜」这种空话。
- 直接输出总结正文，不要标题，不要客套。`

const DETAILED_PROMPT = `你是一个记录员。读下面这段对话，输出四个小节：

## 聊了什么
## 定了什么
## 没做完
## 关键原话

规则：
- 只写对话里真实出现过的内容，不推断、不评价、不补充。
- 「没做完」只写对话里明确没完成的事；没有就写「无」。
- 「关键原话」摘录 1 到 3 句原话，每句不超过 40 字，注明是谁说的。
- 具体到对象（文件、功能、决定），不要写空话。`

const WORKSPACE_PROMPT = `你是一个记录员。下面是一个项目里多个会话各自的总结。

请写一份工作区总览：
## 这个项目在做什么
## 各次会话分别推进了什么
## 反复出现的主题
## 还没闭合的事

规则：只依据下面这些总结，不推断、不评价。信息不足的节写「信息不足」。`

function blocksText(blocks) {
  if (!Array.isArray(blocks)) return ''
  const out = []
  for (const b of blocks) {
    if (b && b.type === 'text' && typeof b.text === 'string') out.push(b.text)
  }
  return out.join('\n').trim()
}

function safeName(s) {
  return String(s).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60)
}

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

class SummaryService {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.titleCache = new Map()
  }

  persistence() {
    return this.ctx.get('sessionPersistence')
  }

  registry() {
    return this.ctx.get('workspaceRegistry')
  }

  dirFor(workspacePath) {
    return join(workspacePath, this.config.dirName)
  }

  fileFor(workspacePath, sessionId) {
    return join(this.dirFor(workspacePath), `${today()}-${safeName(String(sessionId).slice(-8))}.md`)
  }

  /** 一个会话的显示名：优先用户起的标题，其次第一句话，最次才用 id */
  async titleOf(sessionId) {
    const id = String(sessionId)
    const cached = this.titleCache.get(id)
    if (cached && Date.now() - cached.at < 120000) return cached.title
    let title = ''
    let firstUser = ''
    try {
      const handle = await this.persistence().open(id, 'read')
      try {
        const { events } = await handle.read()
        for (const ev of events) {
          if (ev.type === 'session/title' && ev.data && typeof ev.data.title === 'string') {
            title = ev.data.title
          }
          if (!firstUser && ev.type === 'user/message') {
            const t = blocksText(ev.data && ev.data.content)
            if (t) firstUser = t
          }
        }
      } finally {
        await handle.close().catch(() => {})
      }
    } catch {
      title = ''
    }

    let display = title
    if (!display && firstUser) {
      display = firstUser.replace(/^[@#>·\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 24)
      if (firstUser.length > 24) display += '…'
    }
    this.titleCache.set(id, { title: display, at: Date.now() })
    return display
  }

  /** 工作区 + 会话清单（含是否已有总结） */
  async listing() {
    const reg = this.registry()
    if (!reg) return { workspaces: [], error: 'workspaceRegistry 不可用' }
    const out = []
    for (const ws of reg.list()) {
      const dir = this.dirFor(ws.path)
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []
      const sessions = []
      for (const sid of ws.sessionIds || []) {
        const id = String(sid)
        const title = await this.titleOf(id)
        if (!title) continue // 没有对话内容的会话不显示
        const file = files.find((f) => f.includes(safeName(id.slice(-8))))
        sessions.push({
          id,
          title,
          file: file || null,
          filePath: file ? join(dir, file) : null,
        })
      }
      out.push({
        id: String(ws.id),
        title: ws.title,
        path: ws.path,
        dir,
        files,
        sessions,
      })
    }

    // 兜底：没有归属任何已注册工作区的会话（比如默认工作区），按所在目录归组
    try {
      const registered = new Set()
      for (const w of reg.list()) for (const sid of w.sessionIds || []) registered.add(String(sid))
      const all = await this.persistence().list()
      const groups = new Map()
      for (const snap of all) {
        const header = snap && snap.header
        if (!header) continue
        const id = String(header.id)
        if (registered.has(id)) continue
        if (header.origin === 'subagent') continue
        const cwd = header.cwd || ''
        const title = await this.titleOf(id)
        if (!title) continue
        if (!groups.has(cwd)) groups.set(cwd, [])
        groups.get(cwd).push({ id, title, file: null, filePath: null })
      }
      for (const [cwd, sessions] of groups) {
        if (!sessions.length || !cwd) continue
        const dir = this.dirFor(cwd)
        const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []
        for (const s of sessions) {
          const f = files.find((x) => x.includes(safeName(s.id.slice(-8))))
          s.file = f || null
          s.filePath = f ? join(dir, f) : null
        }
        const seg = cwd.split(/[\\/]/).filter(Boolean)
        out.push({
          id: 'dir:' + cwd,
          title: seg.length ? seg[seg.length - 1] : '默认工作区',
          path: cwd,
          dir,
          files,
          sessions,
        })
      }
    } catch {
      // 兜底失败不影响已注册的工作区
    }

    return { workspaces: out }
  }

  /** 所有已生成的总结文件，按修改时间倒序 */
  allFiles() {
    const reg = this.registry()
    if (!reg) return { files: [], error: 'workspaceRegistry 不可用' }
    const out = []
    for (const ws of reg.list()) {
      const dir = this.dirFor(ws.path)
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.md')) continue
        const full = join(dir, f)
        let size = 0
        let mtime = 0
        try {
          const st = statSync(full)
          size = st.size
          mtime = st.mtimeMs
        } catch {
          continue
        }
        out.push({
          workspace: ws.title,
          workspaceId: String(ws.id),
          name: f,
          path: full,
          size,
          mtime,
          isWorkspace: f === '_工作区.md',
        })
      }
    }
    out.sort((a, b) => b.mtime - a.mtime)
    return { files: out }
  }

  /** 把一个会话的事件读成对话文本 */
  async collect(sessionId) {
    const persistence = this.persistence()
    if (!persistence) throw new Error('sessionPersistence 不可用')
    const handle = await persistence.open(sessionId, 'read')
    try {
      const { events } = await handle.read()
      const lines = []
      let used = 0
      for (const ev of events) {
        let role = ''
        let text = ''
        if (ev.type === 'user/message') {
          role = '用户'
          text = blocksText(ev.data && ev.data.content)
        } else if (ev.type === 'assistant/message') {
          role = '助手'
          text = blocksText(ev.data && ev.data.message && ev.data.message.content)
        }
        if (!text) continue
        const line = `${role}：${text.slice(0, 4000)}`
        if (used + line.length > this.config.maxChars) {
          lines.push('（以下内容因长度限制被截断）')
          break
        }
        used += line.length
        lines.push(line)
      }
      return lines.join('\n\n')
    } finally {
      await handle.close().catch(() => {})
    }
  }

  route() {
    if (this.config.provider && this.config.model) {
      return { provider: this.config.provider, model: this.config.model }
    }
    const adm = this.ctx.get('agentDefaultModel')
    const sel = adm && typeof adm.currentSelection === 'function' ? adm.currentSelection() : null
    if (sel && sel.provider && sel.model) return { provider: sel.provider, model: sel.model }
    return null
  }

  async ask(system, user) {
    const llm = this.ctx.get('llm')
    if (!llm) throw new Error('llm 服务不可用')
    const route = this.route()
    if (!route) throw new Error('没有可用的模型')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    let out = ''
    try {
      const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
        temperature: 0.2,
        maxTokens: 2000,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
      }
    } finally {
      clearTimeout(timer)
    }
    return out.trim()
  }

  /** 生成一个会话的总结并落盘，返回文件路径 */
  async generateSession(sessionId, mode) {
    const list = await this.listing()
    let wsPath = ''
    let wsTitle = ''
    for (const ws of list.workspaces) {
      if (ws.sessions.some((s) => s.id === String(sessionId))) {
        wsPath = ws.path
        wsTitle = ws.title
        break
      }
    }
    if (!wsPath) throw new Error('这个会话不属于任何已注册的工作区')

    const transcript = await this.collect(sessionId)
    if (!transcript || transcript.length < 20) throw new Error('会话内容太少，没有可总结的东西')

    const prompt = mode === 'detailed' ? DETAILED_PROMPT : SIMPLE_PROMPT
    const body = await this.ask(prompt, transcript)
    if (!body) throw new Error('模型没有返回内容')

    const header = [
      `# 会话总结（${today()}）`,
      '',
      `- 工作区：${wsTitle}`,
      `- 会话 ID：${sessionId}`,
      `- 模式：${mode === 'detailed' ? '详细' : '简单'}`,
      `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '---',
      '',
    ].join('\n')

    const content = `${header}${body}\n`
    const dir = this.dirFor(wsPath)
    mkdirSync(dir, { recursive: true })
    const file = this.fileFor(wsPath, sessionId)
    writeFileSync(file, content, 'utf8')
    return { file, content, workspace: wsTitle }
  }

  /** 工作区汇总：读该目录下所有总结，合成一份 _工作区.md */
  async generateWorkspace(workspaceId) {
    const reg = this.registry()
    if (!reg) throw new Error('workspaceRegistry 不可用')
    const ws = reg.list().find((w) => String(w.id) === String(workspaceId))
    if (!ws) throw new Error('工作区不存在')

    const dir = this.dirFor(ws.path)
    if (!existsSync(dir)) throw new Error('这个工作区还没有任何会话总结')
    const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_工作区.md')
    if (!files.length) throw new Error('这个工作区还没有任何会话总结')

    const parts = []
    for (const f of files) {
      const p = join(dir, f)
      if (statSync(p).size > 200000) continue
      parts.push(`### ${f}\n\n${readFileSync(p, 'utf8')}`)
    }

    const body = await this.ask(WORKSPACE_PROMPT, parts.join('\n\n---\n\n').slice(0, this.config.maxChars))
    if (!body) throw new Error('模型没有返回内容')

    const content = [
      `# 工作区总览：${ws.title}`,
      '',
      `- 目录：${ws.path}`,
      `- 覆盖会话：${files.length} 个`,
      `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '---',
      '',
      body,
      '',
    ].join('\n')

    const file = join(dir, '_工作区.md')
    writeFileSync(file, content, 'utf8')
    return { file, content }
  }

  /** 校验路径只允许在工作区总结目录内 */
  resolveAllowed(filePath) {
    const reg = this.registry()
    if (!reg) throw new Error('workspaceRegistry 不可用')
    const target = resolve(filePath)
    for (const ws of reg.list()) {
      const dir = resolve(this.dirFor(ws.path)) + sep
      if (target.startsWith(dir)) return target
    }
    throw new Error('不允许操作这个路径')
  }

  /** 读一个总结文件，只允许工作区总结目录内的路径 */
  readFile(filePath) {
    const target = this.resolveAllowed(filePath)
    if (!existsSync(target)) throw new Error('文件不存在')
    return readFileSync(target, 'utf8')
  }

  /** 删除一个总结文件 */
  deleteFile(filePath) {
    const target = this.resolveAllowed(filePath)
    if (!existsSync(target)) throw new Error('文件不存在')
    unlinkSync(target)
    return true
  }
}

export function apply(ctx, config = {}) {
  const cfg = {
    ...DEFAULTS,
    ...config,
    dirName: config.dirName ? String(config.dirName) : DEFAULTS.dirName,
  }
  if (cfg.enabled === false) return

  const svc = new SummaryService(ctx, cfg)

  // 空闲自动总结
  if (cfg.auto) {
    ctx.effect(() => {
      const timer = setInterval(async () => {
        try {
          const sessions = ctx.get('sessions')
          if (!sessions) return
          const now = Date.now()
          for (const s of sessions.list()) {
            const last = (s.ownEvents && s.ownEvents().length)
              ? s.ownEvents()[s.ownEvents().length - 1].time
              : 0
            if (!last) continue
            if (now - last < cfg.autoIdleMinutes * 60000) continue
            try {
              await svc.generateSession(String(s.id), cfg.mode)
            } catch {
              // 单个失败不影响其他
            }
          }
        } catch {
          // 整个轮次失败就算了
        }
      }, Math.max(60000, cfg.autoIdleMinutes * 30000))
      return () => clearInterval(timer)
    })
  }

  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(() => {
      const json = (res, code, data) => {
        res.statusCode = code
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(data))
      }

      const readBody = async (req) => {
        let body = ''
        for await (const chunk of req) body += chunk
        return body ? JSON.parse(body) : {}
      }

      const offList = scoped.webServer.register({
        kind: 'exact',
        path: '/summary/list',
        handler: async (req, res) => {
          try {
            json(res, 200, await svc.listing())
          } catch (e) {
            json(res, 500, { error: String(e && e.message) })
          }
        },
      })

      const offRead = scoped.webServer.register({
        kind: 'prefix',
        path: '/summary/read',
        handler: (req, res) => {
          try {
            const url = new URL(req.url, 'http://localhost')
            const p = url.searchParams.get('path') || ''
            json(res, 200, { content: svc.readFile(p) })
          } catch (e) {
            json(res, 400, { error: String(e && e.message) })
          }
        },
      })

      const offGen = scoped.webServer.register({        kind: 'exact',
        path: '/summary/generate',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            json(res, 405, { error: 'POST only' })
            return
          }
          try {
            const body = await readBody(req)
            if (body.workspaceId) {
              const r = await svc.generateWorkspace(body.workspaceId)
              json(res, 200, r)
              return
            }
            const mode = body.mode === 'detailed' ? 'detailed' : 'simple'
            const r = await svc.generateSession(body.sessionId, mode)
            json(res, 200, r)
          } catch (e) {
            json(res, 400, { error: String(e && e.message) })
          }
        },
      })

      const offDel = scoped.webServer.register({
        kind: 'exact',
        path: '/summary/delete',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            json(res, 405, { error: 'POST only' })
            return
          }
          try {
            const body = await readBody(req)
            if (!body.path) throw new Error('缺少路径')
            svc.deleteFile(body.path)
            json(res, 200, { ok: true })
          } catch (e) {
            json(res, 400, { error: String(e && e.message) })
          }
        },
      })

      const offFiles = scoped.webServer.register({
        kind: 'exact',
        path: '/summary/files',
        handler: (req, res) => {
          try {
            json(res, 200, svc.allFiles())
          } catch (e) {
            json(res, 500, { error: String(e && e.message) })
          }
        },
      })

      return () => {
        offList()
        offRead()
        offGen()
        offDel()
        offFiles()
      }
    })
  })
}
