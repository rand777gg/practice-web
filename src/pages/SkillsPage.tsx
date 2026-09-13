import { useState } from 'react'
import {
  Box, Check, CheckCircle2, Copy, Cpu, Download, FolderTree, Info, ListChecks, ShieldAlert,
  Sparkles, Terminal,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  SKILL_DOCS, SKILL_INSTALL_PATHS, skillInstallCommand, type SkillId,
} from '@/lib/skills-catalog'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

const SKILL_ICONS: Record<SkillId, typeof Box> = {
  'local-supabase-docker': Box,
  'local-judge0-setup': Terminal,
}

/** 复制成功给 1.6s 反馈;剪贴板不可用时不静默失败 */
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

function downloadMarkdown(name: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.md`
  link.click()
  URL.revokeObjectURL(url)
}

function Meta({ icon: Icon, label, value, mono }: {
  icon: typeof Box
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </p>
      <p className={cn('mt-1 break-all text-xs leading-relaxed', mono && 'font-mono text-[11px]')}>{value}</p>
    </div>
  )
}

export function Component() {
  const { lang } = useT()
  const [activeId, setActiveId] = useState<SkillId>(SKILL_DOCS[0].id)
  const { copied, copy } = useCopy()

  const zh = lang === 'zh'
  const skill = SKILL_DOCS.find((item) => item.id === activeId) ?? SKILL_DOCS[0]
  const Icon = SKILL_ICONS[skill.id]
  const markdown = zh ? skill.markdownZh : skill.markdownEn

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          {zh ? 'SKILL 技能' : 'Skills'}
          <Badge variant="secondary" className="font-normal">
            {zh ? `${SKILL_DOCS.length} 份` : `${SKILL_DOCS.length} docs`}
          </Badge>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {zh
            ? <>把本地环境交给 AI 自己搭：下面每份 <b className="font-medium text-foreground">SKILL.md</b> 都是写给人工智能读的操作手册——它照着里面的命令检查环境、起服务、跑验证，做完把结果告诉你。</>
            : <>Let your AI build the local environment: each <b className="font-medium text-foreground">SKILL.md</b> below is an operating manual written for an AI agent — it checks the environment, starts services and runs the verification commands, then reports back to you.</>}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {zh
            ? <>这些东西 AI 会<b className="font-medium">真的在你机器上执行</b>。交给它之前先扫一眼命令；删除数据、重建库、卸容器这类破坏性动作，手册里已写明必须先拿到你本人确认。</>
            : <>The AI will <b className="font-medium">actually run these on your machine</b>. Skim the commands before handing it over; the manuals state that destructive actions (dropping data, resetting a database, removing containers) require your explicit confirmation.</>}
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderTree className="h-4 w-4 text-primary" />
            {zh ? '怎么用' : 'How to use'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          <ol className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>
              {zh
                ? <><b className="font-medium text-foreground">1.</b> 选一份技能，点「下载 SKILL.md」拿到文件，或直接复制安装命令。</>
                : <><b className="font-medium text-foreground">1.</b> Pick a skill, hit “Download SKILL.md”, or copy the install command.</>}
            </li>
            <li>
              {zh
                ? <><b className="font-medium text-foreground">2.</b> 放进 AI 助手的 skills 目录，一份技能一个文件夹：</>
                : <><b className="font-medium text-foreground">2.</b> Put it in your AI assistant's skills folder — one folder per skill:</>}
              <span className="mt-1 flex flex-wrap gap-1.5">
                {SKILL_INSTALL_PATHS.map((path) => (
                  <code key={path} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {path.replace('<name>', skill.name)}
                  </code>
                ))}
              </span>
            </li>
            <li>
              {zh
                ? <><b className="font-medium text-foreground">3.</b> 对 AI 说「按 {skill.name} 帮我把本地环境起起来」，它就会自己读这份手册并执行。</>
                : <><b className="font-medium text-foreground">3.</b> Tell the AI “set up my local environment following {skill.name}” — it reads the manual and does the work.</>}
            </li>
          </ol>
          <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {zh
              ? '不想装进 skills 目录也行：把整份内容直接粘贴进对话，AI 同样能照着做。'
              : 'No skills folder? Paste the whole document into the chat instead — the AI can follow it just the same.'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {SKILL_DOCS.map((item) => {
          const ItemIcon = SKILL_ICONS[item.id]
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={cn(
                'rounded-xl border p-3.5 text-left transition-colors',
                active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
              )}
            >
              <div className="flex items-center gap-2">
                <ItemIcon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-xs font-medium">{zh ? item.titleZh : item.titleEn}</span>
                {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {zh ? item.summaryZh : item.summaryEn}
              </p>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">{item.name}</p>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Icon className="h-4 w-4 text-primary" />
            {zh ? skill.titleZh : skill.titleEn}
            <Badge variant="secondary" className="font-mono text-[10px] font-normal">{skill.name}</Badge>
            {skill.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] font-normal">{tag}</Badge>
            ))}
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {zh ? skill.summaryZh : skill.summaryEn}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Meta icon={Cpu} label={zh ? '目标环境' : 'Target environment'} value={zh ? skill.targetZh : skill.targetEn} />
            <Meta icon={Terminal} label={zh ? '装好后这样验证' : 'Verify like this'} value={skill.verify} mono />
          </div>

          <div className="rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ListChecks className="h-3 w-3 shrink-0" />
              {zh ? 'AI 拿到这份手册后能替你做的事' : 'What the AI can do for you with this manual'}
            </p>
            <ul className="mt-1.5 space-y-1">
              {(zh ? skill.canDoZh : skill.canDoEn).map((line) => (
                <li key={line} className="flex items-start gap-1.5 text-xs leading-relaxed">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void copy('md', markdown)}>
              {copied === 'md' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied === 'md' ? (zh ? '已复制 SKILL.md' : 'SKILL.md copied') : (zh ? '复制 SKILL.md' : 'Copy SKILL.md')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadMarkdown(skill.name, markdown)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {zh ? '下载 SKILL.md' : 'Download SKILL.md'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy('bash', skillInstallCommand(skill.name, markdown, 'bash'))}
            >
              {copied === 'bash' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Terminal className="mr-1.5 h-3.5 w-3.5" />}
              {zh ? '复制安装命令（bash）' : 'Install command (bash)'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy('pwsh', skillInstallCommand(skill.name, markdown, 'powershell'))}
            >
              {copied === 'pwsh' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Terminal className="mr-1.5 h-3.5 w-3.5" />}
              {zh ? '复制安装命令（PowerShell）' : 'Install command (PowerShell)'}
            </Button>
          </div>

          <Separator />

          <div className="overflow-hidden rounded-lg border bg-zinc-950 dark:bg-zinc-900">
            <div className="border-b border-zinc-800 px-3 py-1.5">
              <span className="font-mono text-[10px] text-zinc-400">{skill.name}/SKILL.md</span>
            </div>
            <pre className="max-h-[620px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
              {markdown}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
