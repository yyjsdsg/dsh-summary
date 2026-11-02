# dsh-summary

把每个会话总结成一份 Markdown 文档，存放在工作区目录下，并提供一个浏览、生成和删除的页面。

A DSH plugin that summarizes each Session into a Markdown document inside its workspace, with one page to browse, generate and delete them.

---

## 它会做什么

- **按会话总结**：把一段会话读出来，写成一份人能读的摘要，存成 `.md`
- **两种详略**：简单版三五句话；详细版分「聊了什么 / 定了什么 / 没做完 / 关键原话」四栏
- **按工作区归档**：文件放在 `<工作区>/.dsh-summaries/`，跟着项目走，可以提交进 git
- **工作区总览**：把一个工作区下所有会话的总结合在一起，写一份 `_工作区.md`
- **一个管理页面**：侧边栏图标打开，能看列表、看内容、重新生成、删除
- **输入框旁一个按钮**：正在聊的那个会话，点一下就生成

## 总结的规矩

只写对话里真实出现过的内容。不推断动机，不评价好坏，不补充没提到的信息。详细版里没有内容的节，写「无」。

## 安装

```
dsh plugin --profile <profile> add github:<owner>/dsh-summary
```

装完需要重启 DeepSeek Harness（宿主在启动时加载插件模块）。

## 使用

1. 左侧边栏点文档图标，打开「会话总结」
2. 左栏按工作区列出会话，绿点表示已有总结
3. 选中会话 → 右上角「生成总结」；或工作区名字右边的「总览」
4. 顶部「文件」标签能管理所有已生成的文件

## 文件在哪

```
<工作区目录>/.dsh-summaries/
  20261102-d60b38d3.md      ← 单个会话
  _工作区.md                 ← 工作区总览
```

## 配置

`cordis.patch.yml`：

```yaml
- insert:
    - id: summary
      name: 'dsh-summary'
      config:
        enabled: true
        auto: false            # 空闲自动总结，默认关
        autoIdleMinutes: 10    # 多久算空闲
        mode: 'simple'         # simple | detailed
        dirName: '.dsh-summaries'
```

## 数据来源

- 工作区与会话：DSH 的 `workspaceRegistry`
- 会话内容：`sessionPersistence` 里的事件日志
- 标题：会话日志里的 `session/title`，没有就用第一句话
- 摘要生成：`llm` 服务，默认跟随当前会话模型

全程只读原会话，不改写任何历史。写入只发生在 `.dsh-summaries/` 目录内。

## License

MIT
