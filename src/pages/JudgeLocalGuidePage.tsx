import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { isJudge0Reachable, JUDGE0_DEFAULT_URL } from '@/lib/judge0'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import {
  Terminal, ShieldCheck, ArrowRight, RotateCw, CheckCircle2, XCircle,
  Loader2, Copy, Cpu, Info, Sparkles,
} from 'lucide-react'

/** 供用户复制给 AI 助手的 SKILL.md(中文版)—— 专业内容规范 + 本地判题验证 */
const SKILL_MD_ZH = [
  '---',
  'name: oj-professional-content',
  'description: 在本刷题平台产出专业内容(题解/解析/错题讲解/答疑);涉及编程题时,先经用户自部署的本地 Judge0 逐点自测,通过才写「已通过」。',
  '---',
  '',
  '# 专业内容(刷题平台)',
  '',
  '当你被要求产出题目相关内容(题解、解析、错题讲解、答疑)时,遵守:',
  '',
  '1. 专业规范:结论先行、术语准确、步骤清晰;面向学习者讲清「为什么」,不只贴答案;不确定的不编造。',
  '2. 编程/算法题:代码必须是能独立运行的完整程序(从 stdin 读入、向 stdout 输出),并附思路与复杂度分析。',
  '3. 若你能访问用户的本地 Judge0(http://localhost:2358,跑在 VirtualBox 的 Ubuntu 22.04 里),先自测再作答:',
  '   - 每个测试点提交一条:POST /submissions/batch,字段 {source_code, language_id, stdin}(语言 id 用 GET /languages 查,常用:python=71、c=50、cpp=54、java=62、javascript=63);',
  '   - 轮询 GET /submissions/batch?tokens=...;某点 status.id=3 且 stdout 与期望一致才算该点通过;',
  '   - 全部测试点通过才写「已通过 / Accepted」;判题服务连不上时如实写「未本地验证」,严禁谎报。',
  '4. 该结果仅代表代码在题目测试点上的表现;涉及正式成绩的结论以平台中心判题为准。',
  '',
].join('\n')

/** 供用户复制给 AI 助手的 SKILL.md(英文版) */
const SKILL_MD_EN = [
  '---',
  'name: oj-professional-content',
  'description: Produce professional content (solutions, explanations, wrong-answer walkthroughs, tutoring) for this practice platform. When code is involved, first self-test against the user’s local Judge0 and only claim “passed” when it really does.',
  '---',
  '',
  '# Professional content (practice platform)',
  '',
  'When asked to produce question-related content (solution, explanation, wrong-answer walkthrough, tutoring answer):',
  '',
  '1. Be professional: conclusion first, precise terminology, clear steps; explain the “why” for learners instead of only pasting answers; never fabricate.',
  '2. For programming/algorithm questions, code must be a complete runnable program (reads stdin, writes stdout) with an approach and complexity analysis.',
  '3. If you can reach the user’s local Judge0 (http://localhost:2358, running in a VirtualBox Ubuntu 22.04 VM), self-test before answering:',
  '   - one submission per test case: POST /submissions/batch with {source_code, language_id, stdin} (language ids via GET /languages; common: python=71, c=50, cpp=54, java=62, javascript=63);',
  '   - poll GET /submissions/batch?tokens=...; a test point passes when status.id == 3 and stdout matches the expected output;',
  '   - only claim “Accepted / passed” when every test point passes; if the judge is unreachable say “not verified locally” — never fake a pass.',
  '4. Results reflect the code on these test points only; anything affecting official scores is decided by the platform’s central judge.',
  '',
].join('\n')

// 虚拟机内操作的两段命令(按语言出不同注释)
const CMD_GRUB_ZH = `sudo nano /etc/default/grub
# 把 GRUB_CMDLINE_LINUX 改成下面这行(原来是空也可以):
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
ls /sys/fs/cgroup/memory   # 有内容 = cgroup v1 已生效,继续下一步`

const CMD_GRUB_EN = `sudo nano /etc/default/grub
# set GRUB_CMDLINE_LINUX to the line below (even if it was empty):
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
ls /sys/fs/cgroup/memory   # lists entries = cgroup v1 active, continue`

const CMD_DOCKER_ZH = `sudo apt update && sudo apt install -y docker.io docker-compose-v2
cd judge0        # 仓库里的 judge0/ 目录(拷进虚拟机,或 git clone 仓库)
docker compose up -d
curl http://localhost:2358/config_info   # 在虚拟机内看到 JSON 即成功`

const CMD_DOCKER_EN = `sudo apt update && sudo apt install -y docker.io docker-compose-v2
cd judge0        # the judge0/ folder from the repo (copy it in, or git clone the repo)
docker compose up -d
curl http://localhost:2358/config_info   # JSON response inside the VM = success`

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
  const skillMd = zh ? SKILL_MD_ZH : SKILL_MD_EN
  const cmdGrub = zh ? CMD_GRUB_ZH : CMD_GRUB_EN
  const cmdDocker = zh ? CMD_DOCKER_ZH : CMD_DOCKER_EN

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
              ? <>编程/算法题的代码在你的<b className="text-foreground">本机</b>运行判分。平台中心判题按公共成绩计，供所有人正常使用；当你需要<b className="text-foreground">高峰期自测</b>、或想多试几遍不影响成绩时，可开启「本地自测」，由你自部署的 <b className="text-foreground">Judge0</b> 来跑——它跑在一台 <b className="text-foreground">VirtualBox 的 Ubuntu 22.04</b> 虚拟机里。</>
              : <>Programming / algorithm code runs and is judged on <b className="text-foreground">your own machine</b>. The platform judge scores public records for everyone; when you want to <b className="text-foreground">self-test during peak hours</b>, you can enable “local self-test” powered by your own <b className="text-foreground">Judge0</b> — running inside a <b className="text-foreground">VirtualBox Ubuntu 22.04</b> VM.</>}
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
          <CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4" /> {zh ? '在 VirtualBox 的 Ubuntu 22.04 里跑(Windows 实测)' : 'Run it on Ubuntu 22.04 in VirtualBox (verified on Windows)'}</CardTitle>
          <CardDescription>
            {zh
              ? 'Windows 的 Docker Desktop / WSL2 只提供 cgroup v2，Judge0 的 isolate 沙箱无法运行(提交恒报 status 13)。请按下面步骤用一台 VirtualBox 的 Ubuntu 22.04 专门跑 Judge0。'
              : 'Windows Docker Desktop / WSL2 only expose cgroup v2, which Judge0’s isolate sandbox cannot use (every run fails with status 13). Use a dedicated VirtualBox Ubuntu 22.04 VM instead.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Step n={1} title={zh ? '装 VirtualBox + Ubuntu 22.04' : 'Install VirtualBox + Ubuntu 22.04'}>
            <p>
              {zh
                ? '安装 Oracle VirtualBox，并下载 Ubuntu 22.04 镜像(Server 版即可，判题不需要图形界面)。新建虚拟机：内存 ≥ 4GB、硬盘 ≥ 40GB、CPU ≥ 2 核，按向导装完系统。'
                : 'Install Oracle VirtualBox and download an Ubuntu 22.04 image (Server edition is enough — judging needs no GUI). Create the VM with ≥ 4GB RAM, ≥ 40GB disk and ≥ 2 CPUs, then finish the guided install.'}
            </p>
          </Step>
          <Step n={2} title={zh ? '端口转发：让 Windows 的 localhost:2358 直达虚拟机' : 'Port forward: reach the VM at localhost:2358'}>
            <p>
              {zh
                ? '虚拟机关机状态下：设置 → 网络 → 连接方式选「NAT」→ 高级 → 端口转发，加一条规则：协议 TCP、主机端口 2358、客户机端口 2358(主机 IP 留空)。之后 Windows 浏览器访问 localhost:2358 就会转发进虚拟机。'
                : 'With the VM powered off: Settings → Network → “Attached to: NAT” → Advanced → Port Forwarding, add a rule: Protocol TCP, Host Port 2358, Guest Port 2358 (leave Host IP empty). Windows can then reach the VM’s Judge0 at localhost:2358.'}
            </p>
          </Step>
          <Step n={3} title={zh ? '开机并强制 cgroup v1(漏了必报 status 13)' : 'Boot and force cgroup v1 (skip this and you get status 13)'}>
            <p>{zh ? '在 Ubuntu 终端里执行(需 sudo)：' : 'Run in the Ubuntu terminal (sudo required):'}</p>
            <CodeBlock code={cmdGrub} />
          </Step>
          <Step n={4} title={zh ? '在 Ubuntu 里装 Docker 并启动 Judge0' : 'Install Docker in Ubuntu and start Judge0'}>
            <p>
              {zh
                ? <>把仓库里的 <code className="rounded bg-muted px-1 py-0.5">judge0/</code> 目录拷进虚拟机(或 <code className="rounded bg-muted px-1 py-0.5">git clone</code> 你的仓库)，然后执行：</>
                : <>Copy the repo’s <code className="rounded bg-muted px-1 py-0.5">judge0/</code> folder into the VM (or <code className="rounded bg-muted px-1 py-0.5">git clone</code> your repo), then run:</>}
            </p>
            <CodeBlock code={cmdDocker} />
          </Step>
          <Step n={5} title={zh ? '回到 Windows 验证' : 'Verify from Windows'}>
            <p>
              {zh
                ? <>浏览器打开 <code className="rounded bg-muted px-1 py-0.5">http://localhost:2358/config_info</code>，能看到 JSON 就通了；再回本页点「重新检测」变绿。进入任意编程题，编辑器顶部打开「本地自测」即可逐测试点判题。</>
                : <>Open <code className="rounded bg-muted px-1 py-0.5">http://localhost:2358/config_info</code> in the browser — a JSON response means it works; back here hit “Re-check” until it turns green. Open any coding question and flip on “local self-test” to judge test point by test point.</>}
            </p>
          </Step>
        </CardContent>
      </Card>

      {/* 给 AI 的 SKILL.md */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> {zh ? '让 AI 产出专业内容(可复制 SKILL.md)' : 'Professional content from your AI (copyable SKILL.md)'}</CardTitle>
          <CardDescription>
            {zh
              ? '想让 AI(Claude / ChatGPT 等)按专业标准帮你写题解、解析、答疑？把下面的内容存成 SKILL.md 放入你 AI 助手的 skills 目录(如 ~/.claude/skills/oj-professional-content/SKILL.md)，或直接粘贴给 AI。它会先在你的本地 Judge0 上自测代码，通过才写「已通过」。'
              : 'Want an AI (Claude / ChatGPT…) to produce professional solutions, explanations and tutoring answers? Save the text below as SKILL.md in your AI assistant’s skills folder (e.g. ~/.claude/skills/oj-professional-content/SKILL.md), or paste it straight into the chat. It self-tests code on your local Judge0 and only claims “passed” when it truly is.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock code={skillMd} />
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
                <li>Judge0 只能跑在 <b className="text-foreground">cgroup v1</b> 的 Linux 上；Windows 的 Docker Desktop / WSL2 只有 cgroup v2，提交会恒报 <code className="rounded bg-muted px-1 py-0.5">status 13</code>，别在那上面折腾，直接用上面的 VirtualBox Ubuntu 方案。</li>
                <li>推荐端口固定 <code className="rounded bg-muted px-1 py-0.5">2358</code>；仓库 compose 已绑定并补上浏览器所需的 <code className="rounded bg-muted px-1 py-0.5">Access-Control-Allow-Private-Network</code> 响应头，无需额外改浏览器。</li>
                <li>支持的输入模型与 OJ 一致：题目给出「输入/输出」多组测试点，你的代码从 <code className="rounded bg-muted px-1 py-0.5">stdin</code> 读、往 <code className="rounded bg-muted px-1 py-0.5">stdout</code> 写，逐测试点比对判分。</li>
              </>
            ) : (
              <>
                <li>Local judging runs on your machine; results are <b className="text-foreground">untrusted</b> and for practice only.</li>
                <li>Judge0 needs a <b className="text-foreground">cgroup v1</b> Linux. Windows Docker Desktop / WSL2 only expose cgroup v2, so every run fails with <code className="rounded bg-muted px-1 py-0.5">status 13</code> — don’t fight that setup, use the VirtualBox Ubuntu path above.</li>
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
              ? <>完整协议见 <a className="text-primary underline underline-offset-2" href={repo} target="_blank" rel="noopener noreferrer">Judge0 官方仓库</a>。需要支持更多语言/调参时,在 Ubuntu 虚拟机里改 <code className="rounded bg-muted px-1 py-0.5">judge0/docker-compose.yml</code> 的镜像版本(默认 1.13.1)或 <code className="rounded bg-muted px-1 py-0.5">judge0.conf</code> 后重启即可。</>
              : <>Full protocol: see the <a className="text-primary underline underline-offset-2" href={repo} target="_blank" rel="noopener noreferrer">official Judge0 repo</a>. To add more languages or tune limits, edit the image version in <code className="rounded bg-muted px-1 py-0.5">judge0/docker-compose.yml</code> (default 1.13.1) or <code className="rounded bg-muted px-1 py-0.5">judge0.conf</code> inside the Ubuntu VM and restart.</>}
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
