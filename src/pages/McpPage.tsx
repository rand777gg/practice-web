import { useState } from 'react'
import {
  Check, Copy, Info, KeyRound, Plug, Server, ShieldAlert, ShieldCheck, Sparkles, Terminal, Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  MCP_CLIENTS, MCP_TOOLS, MCP_UNSUPPORTED, mcpEndpoint, tokenSnippet,
} from '@/lib/mcp-catalog'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 仍然给一次反馈,避免按钮看起来没反应
    }
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1600)
  }

  return { copied, copy }
}

function Code({ code, label, copied, copyKey, onCopy }: {
  code: string
  label?: string
  copied: string | null
  copyKey: string
  onCopy: (key: string, text: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-zinc-950 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-400">{label}</span>
        <button
          type="button"
          onClick={() => onCopy(copyKey, code)}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          {copied === copyKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied === copyKey ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-100">{code}</pre>
    </div>
  )
}

export function Component() {
  const { lang } = useT()
  const [activeId, setActiveId] = useState(MCP_CLIENTS[0].id)
  const { copied, copy } = useCopy()

  const zh = lang === 'zh'
  const endpoint = mcpEndpoint()
  const client = MCP_CLIENTS.find((item) => item.id === activeId) ?? MCP_CLIENTS[0]
  const fill = (text: string) => text.replaceAll('{{URL}}', endpoint)

  const connectSnippet = `curl -s ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Plug className="h-5 w-5 text-primary" />
          {zh ? 'MCP 服务' : 'MCP Server'}
          <Badge variant="secondary" className="bg-emerald-100 font-normal text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {zh ? '已上线' : 'Live'}
          </Badge>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {zh
            ? <>平台自己的 MCP 端点：把你的 AI 助手接到你的练习数据上 —— 搜题、取解析、看错题与进度、<b className="font-medium text-foreground">用平台判题真跑代码</b>。工具以你本人的身份执行，读到的只有你自己的数据。</>
            : <>The platform runs its own MCP endpoint: connect your AI assistant to your practice data — search questions, read analyses, review wrong answers and progress, and <b className="font-medium text-foreground">really run code on the platform judge</b>. Tools run as you, so they only see your own data.</>}
        </p>
      </div>

      <Card className="border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {zh ? '端点' : 'Endpoint'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px]">{endpoint}</code>
            <Button size="sm" variant="outline" onClick={() => void copy('endpoint', endpoint)}>
              {copied === 'endpoint' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {zh ? '复制' : 'Copy'}
            </Button>
          </div>
          <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
            <p>· {zh ? '传输：Streamable HTTP（无状态，POST 一发一收）' : 'Transport: Streamable HTTP (stateless, one POST per call)'}</p>
            <p>· {zh ? '协议版本：2025-06-18 / 2025-03-26 / 2024-11-05' : 'Protocol: 2025-06-18 / 2025-03-26 / 2024-11-05'}</p>
            <p>· {zh ? `能力：${MCP_TOOLS.length} 个工具（不含 resources / prompts）` : `Capabilities: ${MCP_TOOLS.length} tools (no resources / prompts)`}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4 text-primary" />
            {zh ? '第一步：拿到你的 token' : 'Step 1: get your token'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {zh
              ? <>在浏览器里登录本站，按 F12 打开控制台，粘贴下面这行就得到 access token。它等同于你的登录态，<b className="font-medium text-foreground">别贴给别人</b>。</>
              : <>Sign in here, open DevTools (F12) and paste the line below to print your access token. It is your login — <b className="font-medium text-foreground">do not share it</b>.</>}
          </p>
          <Code code={tokenSnippet()} label="console" copied={copied} copyKey="token" onCopy={copy} />
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {zh
              ? 'access token 有效期约 1 小时，过期后工具会返回 401，重新取一次即可。想省事就把 token 放进环境变量（下面每个客户端都给了变量写法），别写死在配置文件里。'
              : 'The access token lives about an hour; after that tools return 401 and you just re-copy it. Put it in an environment variable (each client below shows how) instead of hardcoding it in a config file.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4 text-primary" />
            {zh ? `这个端点提供什么（${MCP_TOOLS.length} 个工具）` : `What it offers (${MCP_TOOLS.length} tools)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {MCP_TOOLS.map((tool) => (
            <div key={tool.name} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs font-medium text-primary">{tool.name}</code>
              </div>
              <p className="mt-1 text-xs leading-relaxed">{zh ? tool.summaryZh : tool.summaryEn}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {zh ? '参数：' : 'Args: '}{zh ? tool.argsZh : tool.argsEn}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-amber-300/60 dark:border-amber-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            {zh ? '安全边界' : 'Security boundaries'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-1">
          {(zh
            ? [
                '所有工具都以你本人的身份运行，数据库行级安全（RLS）全程生效：看不到别人的错题、收藏与统计。',
                '端点不使用 service_role，也没有任何越权查询；服务端只做「转发你的 token」。',
                '六个工具里五个是只读的；judge_code 只是编译运行代码，不写你的练习数据。',
                'token 泄露等于登录态泄露；撤销方式是改密码或在设置里退出全部设备。',
              ]
            : [
                'Every tool runs as you, with row-level security active end to end: no access to anyone else’s wrong answers, favorites or stats.',
                'The endpoint never uses service_role and has no privileged queries — it just forwards your token.',
                'Five of the six tools are read-only; judge_code only compiles and runs code, it never writes your practice data.',
                'A leaked token is a leaked session. Revoke it by changing your password or signing out all devices in Settings.',
              ]
          ).map((line) => (
            <p key={line} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {line}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-primary" />
            {zh ? '第二步：接到你的 AI 助手上' : 'Step 2: wire it into your AI assistant'}
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {zh
              ? '下面每份配置都对着官方文档核对过。选你的客户端，复制片段，把 <TOKEN> 换成上一步拿到的 token（用环境变量的写法就不用换）。'
              : 'Each config below was checked against the official docs. Pick your client, copy the snippet, and replace <TOKEN> with the token from step 1 (or use the env-var form and skip that).'}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="grid gap-2 sm:grid-cols-3">
            {MCP_CLIENTS.map((item) => {
              const active = item.id === activeId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                    active ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-xs font-medium">{client.name}</p>
              <ul className="mt-1 space-y-0.5">
                {client.paths.map((path) => (
                  <li key={path} className="break-all font-mono text-[10px] text-muted-foreground">{path}</li>
                ))}
              </ul>
            </div>
            <Code code={fill(client.snippet)} label={client.paths[0]} copied={copied} copyKey={`cfg-${client.id}`} onCopy={copy} />
            {client.cli && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">{zh ? '或者用命令行：' : 'Or from the CLI:'}</p>
                <Code code={fill(client.cli)} label="cli" copied={copied} copyKey={`cli-${client.id}`} onCopy={copy} />
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">{zh ? client.noteZh : client.noteEn}</p>
            <a
              href={client.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[10px] text-primary underline underline-offset-2"
            >
              {zh ? '官方文档' : 'Official docs'}
            </a>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-[11px] font-medium">{zh ? '先手动确认端点通不通' : 'Sanity-check the endpoint first'}</p>
            <Code code={connectSnippet} label="curl" copied={copied} copyKey="curl" onCopy={copy} />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {zh
                ? '返回里应该带 6 个工具的 name / description / inputSchema。返回 401 就是 token 过期或没带 Authorization。'
                : 'The response should list all 6 tools with name / description / inputSchema. A 401 means a missing or expired token.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {MCP_UNSUPPORTED.map((item) => (
        <Card key={item.name} className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-muted-foreground" />
              {item.name}：{zh ? '官方还不支持 MCP' : 'no official MCP support'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            <p className="text-[11px] leading-relaxed text-muted-foreground">{zh ? item.noteZh : item.noteEn}</p>
            <a
              href={item.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[10px] text-primary underline underline-offset-2"
            >
              {zh ? '相关 issue' : 'Related issue'}
            </a>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Terminal className="h-4 w-4 text-primary" />
            {zh ? '排错' : 'Troubleshooting'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {(zh
            ? [
                ['客户端一直连不上', '多数客户端把「连不上」写成加载失败：先用上面的 curl 确认端点和 token，再回头查配置文件的键名（servers / mcpServers / mcp / context_servers 各不相同）。'],
                ['工具返回 401', 'access token 只有约 1 小时，重新取一次；用了环境变量写法的话确认变量已导出到启动客户端的那个 shell。'],
                ['只看到 6 个工具但调不动', '检查 token 是不是本项目的（换过项目或本地 Supabase 的话 key 会不同）。'],
                ['judge_code 报 503', '平台中心判题没配 JUDGE0_URL，这种时候让 AI 如实说「未验证」，或改用本地 Judge0 自测（见「本地判题」页）。'],
                ['DSH 里工具没出现', 'cordis.patch.yml 默认是空数组，注意 - insert: 这一层的缩进；改完要重启 harness。'],
              ]
            : [
                ['The client just hangs', 'Most clients report it as a failed load: verify endpoint and token with the curl above, then re-check the config key each client uses (servers / mcpServers / mcp / context_servers all differ).'],
                ['Tools return 401', 'The access token lasts about an hour — copy a fresh one. With the env-var form, make sure the variable is exported in the shell that starts the client.'],
                ['6 tools listed but calls fail', 'Check the token belongs to this project (a different project or a local Supabase gives a different key).'],
                ['judge_code returns 503', 'The platform judge has no JUDGE0_URL configured. Have the AI say “not verified” rather than guessing, or switch to local Judge0 (see the Local Judge page).'],
                ['DSH shows no tools', 'cordis.patch.yml starts as an empty array — mind the - insert: indentation, and restart the harness after editing.'],
              ]
          ).map(([title, body]) => (
            <div key={title} className="rounded-lg border p-2.5">
              <p className="text-xs font-medium">{title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
        {zh
          ? '想给 AI「装说明书」而不是「装工具」，看旁边的 SKILL 技能页；两者配合使用效果最好：SKILL.md 交代规矩，MCP 提供手脚。'
          : 'If you want to give your AI instructions rather than tools, see the SKILL page next door — they pair well: the SKILL.md sets the rules, MCP provides the hands.'}
      </p>
    </div>
  )
}
