/** 平台 MCP 端点与各客户端的接入配置。片段里的 {{URL}} / <TOKEN> 由页面替换。 */

export function mcpEndpoint(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  return url ? `${url.replace(/\/$/, '')}/functions/v1/mcp` : 'https://<你的项目>.supabase.co/functions/v1/mcp'
}

/** supabase-js 在 localStorage 里的会话 key */
export function authStorageKey(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  const ref = url ? new URL(url).hostname.split('.')[0] : '<project-ref>'
  return `sb-${ref}-auth-token`
}

export function tokenSnippet(): string {
  return `JSON.parse(localStorage.getItem('${authStorageKey()}')).access_token`
}

export interface McpToolDoc {
  name: string
  summaryZh: string
  summaryEn: string
  argsZh: string
  argsEn: string
}

export const MCP_TOOLS: McpToolDoc[] = [
  {
    name: 'search_questions',
    summaryZh: '按关键词 / 学科 / 题型搜平台题库，返回题目简要信息',
    summaryEn: 'Search the platform question bank by keyword, subject or type',
    argsZh: 'keyword、subject、question_type、limit（默认 10，上限 50）',
    argsEn: 'keyword, subject, question_type, limit (default 10, max 50)',
  },
  {
    name: 'get_question',
    summaryZh: '按 id 取一道题的全文：题干、选项、正确答案、解析、知识点',
    summaryEn: 'Fetch one question in full: stem, options, answer, analysis, key points',
    argsZh: 'id（来自 search_questions 或 list_wrong_questions）',
    argsEn: 'id (from search_questions or list_wrong_questions)',
  },
  {
    name: 'list_wrong_questions',
    summaryZh: '我错过的题，按最近答错时间倒序，同一题只出现一次',
    summaryEn: 'My wrong answers, newest first, each question once',
    argsZh: 'subject（可选）、limit（默认 20）',
    argsEn: 'subject (optional), limit (default 20)',
  },
  {
    name: 'get_practice_stats',
    summaryZh: '我的练习进度：每个学科的题库总量、累计做过、今日做过',
    summaryEn: 'My practice progress per subject: total, done overall, done today',
    argsZh: 'subjects（可选，不传统计全部）',
    argsEn: 'subjects (optional; omit for all)',
  },
  {
    name: 'list_favorites',
    summaryZh: '我收藏的题，按收藏时间倒序',
    summaryEn: 'My favorited questions, newest first',
    argsZh: 'limit（默认 20）',
    argsEn: 'limit (default 20)',
  },
  {
    name: 'judge_code',
    summaryZh: '平台的中心判题：逐测试点真跑代码，全部通过才算通过',
    summaryEn: 'The platform judge: really runs your code per test point; passes only if all pass',
    argsZh: 'language、source_code、test_cases[{input, expected}]（上限 20 点）',
    argsEn: 'language, source_code, test_cases[{input, expected}] (max 20 points)',
  },
  {
    name: 'list_prompts',
    summaryZh: '列出你在「提示词」页配置过的提示词（改过的内置 + 自建）',
    summaryEn: 'List the prompts you configured on the Prompts page (edited built-ins + your own)',
    argsZh: 'enabled_only（默认 true）',
    argsEn: 'enabled_only (default true)',
  },
  {
    name: 'get_prompt',
    summaryZh: '按 key 取一条提示词的完整正文，让 AI 按你定的规矩干活',
    summaryEn: 'Fetch one prompt in full by key, so the AI works by your rules',
    argsZh: 'key，例如 extract / generate_doc / clean_stem',
    argsEn: 'key, e.g. extract / generate_doc / clean_stem',
  },
]

export interface McpClientDoc {
  id: string
  name: string
  /** 配置文件位置；顺序即优先级 */
  paths: string[]
  snippet: string
  cli?: string
  noteZh: string
  noteEn: string
  /** 官方文档出处 */
  source: string
}

export const MCP_CLIENTS: McpClientDoc[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    paths: ['.mcp.json（项目根）', '~/.claude.json（用户级）'],
    snippet: `{
  "mcpServers": {
    "practice-web": {
      "type": "http",
      "url": "{{URL}}",
      "headers": {
        "Authorization": "Bearer \${PRACTICE_WEB_TOKEN}"
      }
    }
  }
}`,
    cli: 'claude mcp add --transport http practice-web {{URL}} --header "Authorization: Bearer <TOKEN>"',
    noteZh: 'url 形式的条目必须写 "type"，漏了会被当成 stdio 服务器。${VAR} 从环境变量取，token 不用落盘。',
    noteEn: 'A url entry must set "type", otherwise it is treated as a stdio server. ${VAR} is expanded from the environment, so no token touches the file.',
    source: 'https://docs.claude.com/en/docs/claude-code/mcp',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    paths: ['~/.codex/config.toml', '.codex/config.toml（受信任项目）'],
    snippet: `[mcp_servers.practice-web]
url = "{{URL}}"
bearer_token_env_var = "PRACTICE_WEB_TOKEN"`,
    cli: 'codex mcp add practice-web --url {{URL}}',
    noteZh: '命令行没有传 header 的选项，token 必须写进 config.toml 的 bearer_token_env_var（或 http_headers）。',
    noteEn: 'The CLI has no header flag — the token must go through bearer_token_env_var (or http_headers) in config.toml.',
    source: 'https://developers.openai.com/codex/mcp',
  },
  {
    id: 'dsh',
    name: 'DSH（DeepSeek Harness）',
    paths: [
      'Windows：%APPDATA%\\dsh-desktop\\harness\\profiles\\web\\cordis.patch.yml',
      'macOS / Linux：~/.dsh/profiles/web/cordis.patch.yml',
      '也可以放在 home 层：~/.dsh/cordis.patch.yml（后应用，优先级更高）',
    ],
    snippet: `- insert:
    - id: mcp-practice-web
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: practice-web
        transport: streamable-http
        url: {{URL}}
        headers:
          Authorization: !!js '\`Bearer \${process.env.PRACTICE_WEB_TOKEN}\`'`,
    noteZh: '这个文件默认是空数组 []，把 - insert: 那一段加进去即可。工具会以 mcp__practice-web__<工具名> 出现；只桥接 tools，不桥接 resources / prompts。',
    noteEn: 'The file starts as an empty array []; add the - insert: entry. Tools show up as mcp__practice-web__<tool>; only tools are bridged, not resources or prompts.',
    source: 'https://github.com/deepseek-ai/deepseek-harness',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    paths: ['.cursor/mcp.json（项目）', '~/.cursor/mcp.json（全局）'],
    snippet: `{
  "mcpServers": {
    "practice-web": {
      "url": "{{URL}}",
      "headers": {
        "Authorization": "Bearer \${env:PRACTICE_WEB_TOKEN}"
      }
    }
  }
}`,
    noteZh: '远程服务器不用写 type，有 url 就是 HTTP。${env:NAME} 是 Cursor 自己的变量语法（注意不是 ${VAR}）。agent mcp 没有 add 子命令，直接改文件。',
    noteEn: 'Remote servers need no type — a url means HTTP. ${env:NAME} is Cursor’s own syntax (not ${VAR}). agent mcp has no add subcommand; edit the file.',
    source: 'https://cursor.com/docs/mcp',
  },
  {
    id: 'vscode',
    name: 'VS Code + Copilot',
    paths: ['.vscode/mcp.json（工作区）', '用户级 mcp.json（命令面板：MCP: Open User Configuration）'],
    snippet: `{
  "servers": {
    "practice-web": {
      "type": "http",
      "url": "{{URL}}",
      "headers": {
        "Authorization": "Bearer \${input:practice-web-token}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "practice-web-token",
      "description": "practice-web MCP token",
      "password": true
    }
  ]
}`,
    noteZh: '键是 servers 不是 mcpServers。用 inputs + ${input:...} 让 VS Code 弹一次输入框并把 token 存起来，别硬编码。',
    noteEn: 'The key is servers, not mcpServers. Use inputs + ${input:...} so VS Code prompts once and stores the token instead of hardcoding it.',
    source: 'https://code.visualstudio.com/docs/copilot/customization/mcp-servers',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    paths: ['~/.gemini/settings.json（用户）', '.gemini/settings.json（项目，默认作用域）'],
    snippet: `{
  "mcpServers": {
    "practice-web": {
      "httpUrl": "{{URL}}",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}`,
    cli: 'gemini mcp add --transport http --header "Authorization: Bearer <TOKEN>" practice-web {{URL}}',
    noteZh: 'httpUrl 才是 Streamable HTTP（url 是旧的 SSE）。env 对象支持变量展开，但 headers 只认字面值，所以这里得填真 token，或者用命令行 --header。',
    noteEn: 'httpUrl means Streamable HTTP (url is the legacy SSE transport). The env object expands variables, but headers takes literal values only — fill the real token or use the CLI --header flag.',
    source: 'https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md',
  },
  {
    id: 'opencode',
    name: 'opencode',
    paths: ['opencode.json（项目根）', '~/.config/opencode/opencode.json（全局）'],
    snippet: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "practice-web": {
      "type": "remote",
      "url": "{{URL}}",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:PRACTICE_WEB_TOKEN}"
      }
    }
  }
}`,
    cli: 'opencode mcp add',
    noteZh: '远程服务器写 "type": "remote"。变量语法是 {env:NAME}；配合 "oauth": false 可以强制只走 header 鉴权。',
    noteEn: 'Remote servers use "type": "remote". Interpolation is {env:NAME}; pair it with "oauth": false to force header-only auth.',
    source: 'https://opencode.ai/docs/mcp-servers/',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    paths: ['~/.codeium/windsurf/mcp_config.json（仅用户级）'],
    snippet: `{
  "mcpServers": {
    "practice-web": {
      "serverUrl": "{{URL}}",
      "headers": {
        "Authorization": "Bearer \${env:PRACTICE_WEB_TOKEN}"
      }
    }
  }
}`,
    noteZh: '远程 HTTP 要写 serverUrl（或 url），不是 command。没有项目级配置文件。',
    noteEn: 'Remote HTTP needs serverUrl (or url), not command. There is no project-level config file.',
    source: 'https://docs.windsurf.com/windsurf/cascade/mcp',
  },
  {
    id: 'zed',
    name: 'Zed',
    paths: ['~/.config/zed/settings.json（Windows：%APPDATA%\\Zed\\settings.json）', '.zed/settings.json（项目）'],
    snippet: `{
  "context_servers": {
    "practice-web": {
      "url": "{{URL}}",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}`,
    noteZh: 'Zed 的键叫 context_servers。headers 里没有变量展开，只能填字面 token；不填 Authorization 时 Zed 会走它自己的 OAuth 流程（本端点没实现 OAuth，所以请填 token）。',
    noteEn: 'Zed calls the key context_servers. Header values have no variable expansion, so use a literal token; without an Authorization header Zed starts its own OAuth flow, which this endpoint does not implement.',
    source: 'https://zed.dev/docs/ai/mcp',
  },
]

/** 没有官方 MCP 支持的客户端，单独说明，不编配置 */
export const MCP_UNSUPPORTED: { name: string; noteZh: string; noteEn: string; source: string }[] = [
  {
    name: 'pi（Earendil Works）',
    noteZh:
      '官方文档与仓库里都没有 MCP：文档导航没有 MCP 页，仓库里也没有任何 mcp 相关文件，只有一个已关闭的功能请求 issue 提议加一个读 ~/.pi/mcp.json 的扩展示例。pi 的扩展方式是 TypeScript 扩展，想接 MCP 得用第三方扩展，所以这里不给配置片段。',
    noteEn:
      'No MCP anywhere in pi’s official docs or repo: no MCP page in the docs navigation, no mcp-related files in the repository, and only a closed feature-request issue proposing an extension example that reads ~/.pi/mcp.json. pi is extended through TypeScript extensions, so MCP needs a third-party extension — no config snippet here.',
    source: 'https://github.com/earendil-works/pi/issues/563',
  },
]
