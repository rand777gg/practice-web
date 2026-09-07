import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { isJudge0Reachable, JUDGE0_DEFAULT_URL } from '@/lib/judge0'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import {
  Terminal, ShieldCheck, ArrowRight, RotateCw, CheckCircle2, XCircle,
  Loader2, Copy, Box, Info,
} from 'lucide-react'

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }
  return (
    <div className="relative rounded-md border border-border bg-zinc-950 dark:bg-zinc-900">
      <button type="button" onClick={copy} aria-label="copy" className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-100 transition-colors p-1">
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="overflow-x-auto p-3 pr-10 text-xs leading-relaxed font-mono text-zinc-100">{code}</pre>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</div>
      <div className="min-w-0 flex-1 space-y-1.5 pb-4">
        <p className="text-sm font-semibold">{title}</p>
        <div className="text-sm text-muted-foreground space-y-1.5 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

export function Component() {
  const { lang, t } = useT()
  const [state, setState] = useState<'checking' | 'ok' | 'fail'>('checking')

  const probe = useCallback(async () => {
    const ok = await isJudge0Reachable(JUDGE0_DEFAULT_URL, 4000)
    setState(ok ? 'ok' : 'fail')
  }, [])

  // 挂载即探测;setState 仅出现在异步回调里,避免 effect 内同步 setState
  useEffect(() => {
    isJudge0Reachable(JUDGE0_DEFAULT_URL, 4000).then((ok) => setState(ok ? 'ok' : 'fail'))
  }, [])

  const recheck = () => { setState('checking'); probe() }

  const zh = lang === 'zh'
  const repo = 'https://github.com/judge0/judge0'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('localJudge.previewNotice')}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold flex-1 min-w-0">{zh ? '本地 Judge0 判题环境' : 'Local Judge0 Environment'}</h1>
        <Badge variant="secondary">{zh ? '本地自测' : 'Local self-test'}</Badge>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Terminal className="h-4 w-4" /> {zh ? '这是什么' : 'What is this'}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>
            {zh
              ? <>编程/算法题的代码在你的<b className="text-foreground">本机</b>运行判分。平台中心判题按公共成绩计，供所有人正常使用；当你需要<b className="text-foreground">高峰期自测</b>、或想多试几遍不影响成绩时，可开启「本地自测」，由你自部署的 <b className="text-foreground">Judge0</b>(Docker) 来跑。</>
              : <>Programming / algorithm code runs and is judged on <b className="text-foreground">your own machine</b>. The platform judge scores public records for everyone; when you want to <b className="text-foreground">self-test during peak hours</b>, you can enable “local self-test” powered by your own Dockerized <b className="text-foreground">Judge0</b>.</>}
          </p>
          <p className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 text-xs">
            {zh
              ? '⚠️ 本地判题结果仅用于个人练习，不参与排行榜、不计入公开成绩/考试/竞赛。'
              : '⚠️ Local judging is for personal practice only; it never enters leaderboards, public scores, exams or contests.'}
          </p>
        </CardContent>
      </Card>

      {/* 连通性检测 */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{zh ? '检测本机 Judge0' : 'Probe local Judge0'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{JUDGE0_DEFAULT_URL}</p>
            </div>
            <Button variant="outline" size="sm" onClick={recheck} disabled={state === 'checking'} className="gap-1.5">
              {state === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              {zh ? '重新检测' : 'Re-check'}
            </Button>
            <div className={cn('flex items-center gap-1.5 text-xs font-medium',
              state === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                : state === 'fail' ? 'text-red-500'
                : 'text-muted-foreground')}>
              {state === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
              {state === 'ok' && <CheckCircle2 className="h-4 w-4" />}
              {state === 'fail' && <XCircle className="h-4 w-4" />}
              {state === 'ok' ? (zh ? '已连接，可开始本地自测' : 'Connected — ready for local self-test')
                : state === 'fail' ? (zh ? '未连接，请先按下方步骤启动' : 'Not connected — follow the steps below first')
                : (zh ? '正在检测…' : 'Checking…')}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Box className="h-4 w-4" /> {zh ? '用 Docker 一键启动(推荐)' : 'Start with Docker (recommended)'}</CardTitle>
          <CardDescription>{zh ? '只需要装好 Docker Desktop，然后跑一条命令。' : 'Install Docker Desktop, then run one command.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Step n={1} title={zh ? '安装 Docker' : 'Install Docker'}>
            <p>{zh ? '官网下载并安装，Windows 选 Docker Desktop，macOS 同；装完启动它。' : 'Download from the official site — Docker Desktop for Windows / macOS. Start it after installing.'}</p>
          </Step>
          <Step n={2} title={zh ? '拿到编排文件' : 'Get the compose file'}>
            <p>
              {zh
                ? <>仓库 <code className="rounded bg-muted px-1 py-0.5">judge0/</code> 目录已内置编排文件(含反代,浏览器可直连、已补 Private Network Access 头)。进入后一键拉起：</>
                : <>The repo ships an orchestration file under <code className="rounded bg-muted px-1 py-0.5">judge0/</code> (with a reverse proxy so the browser can reach it — PNA header included). From that folder, bring it up:</>}
            </p>
            <CodeBlock code="cd practice-web/judge0&#10;docker compose up -d" />
          </Step>
          <Step n={3} title={zh ? '验证' : 'Verify'}>
            <p>{zh ? '打开上面的“检测本机 Judge0”按钮状态变绿即可在题目里开「本地自测」。也手动访问：' : 'The probe above turns green when ready. You can also open:'}</p>
            <CodeBlock code="curl http://localhost:2358/config_info" />
            <p className="text-xs">{zh ? '看到 JSON(含 language_count 等)即表示已在运行。' : 'A JSON response (with language_count etc.) means it is running.'}</p>
          </Step>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> {zh ? '安全与说明' : 'Notes & safety'}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            {zh ? (
              <>
                <li>本地判题运行在你的机器，结果<b className="text-foreground">不可信</b>，仅作练习参考。</li>
                <li>推荐端口固定 <code className="rounded bg-muted px-1 py-0.5">2358</code>；仓库 compose 已绑定并补上浏览器所需的 <code className="rounded bg-muted px-1 py-0.5">Access-Control-Allow-Private-Network</code> 响应头，无需额外改浏览器。</li>
                <li>支持的输入模型与 OJ 一致：题目给出「输入/输出」多组测试点，你的代码从 <code className="rounded bg-muted px-1 py-0.5">stdin</code> 读、往 <code className="rounded bg-muted px-1 py-0.5">stdout</code> 写，逐测试点比对判分。</li>
              </>
            ) : (
              <>
                <li>Local judging runs on your machine; results are <b className="text-foreground">untrusted</b> and for practice only.</li>
                <li>Port stays at <code className="rounded bg-muted px-1 py-0.5">2358</code>. The compose file already binds it and adds the <code className="rounded bg-muted px-1 py-0.5">Access-Control-Allow-Private-Network</code> header the browser needs — no manual browser flags required.</li>
                <li>Input model matches OJ: a question gives several “input / output” test points; your code reads <code className="rounded bg-muted px-1 py-0.5">stdin</code> and writes <code className="rounded bg-muted px-1 py-0.5">stdout</code>, then each test point is compared and scored.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Info className="h-4 w-4" /> {zh ? '进阶 / 手动部署' : 'Advanced / manual deploy'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {zh
              ? <>完整协议见 <a className="text-primary underline underline-offset-2" href={repo} target="_blank" rel="noopener noreferrer">Judge0 官方仓库</a>。需要支持更多语言/调参时,改 <code className="rounded bg-muted px-1 py-0.5">judge0/docker-compose.yml</code> 里 <code className="rounded bg-muted px-1 py-0.5">judge0/judge0</code> 的镜像版本(默认 1.13.1)并重启即可。</>
              : <>Full protocol: see the <a className="text-primary underline underline-offset-2" href={repo} target="_blank" rel="noopener noreferrer">official Judge0 repo</a>. To add more languages or tune limits, bump the <code className="rounded bg-muted px-1 py-0.5">judge0/judge0</code> image version in <code className="rounded bg-muted px-1 py-0.5">judge0/docker-compose.yml</code> (default 1.13.1) and restart.</>}
          </p>
          <p className="flex items-center gap-1.5 pt-1 text-primary">
            <ArrowRight className="h-3.5 w-3.5" />
            {zh ? '回到做题页，在编程题编辑器顶部打开「本地自测」即可体验。' : 'Back to practice — flip on “local self-test” at the top of the code editor.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
