// 把仓库里的 OWNER / <owner> 占位符换成你的 GitHub 用户名。
//
//   node scripts/set-owner.mjs your-name
//
// 会改 package.json、README.md、awesome-entry.yml 三处。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const owner = (process.argv[2] || '').trim()

if (!owner) {
  console.error('用法: node scripts/set-owner.mjs <你的 GitHub 用户名>')
  process.exit(1)
}
if (!/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('用户名只能含字母、数字和连字符')
  process.exit(1)
}

const files = ['package.json', 'README.md', 'awesome-entry.yml']
let changed = 0

for (const name of files) {
  const path = join(root, name)
  if (!existsSync(path)) continue
  const before = readFileSync(path, 'utf8')
  const after = before.replaceAll('OWNER', owner).replaceAll('<owner>', owner)
  if (after !== before) {
    writeFileSync(path, after, 'utf8')
    changed += 1
    console.log('updated:', name)
  }
}

console.log(changed ? `done — ${changed} 个文件已更新为 ${owner}` : '没有需要改的占位符')
