import localSupabaseDockerZh from './skills/local-supabase-docker.zh.md?raw'
import localSupabaseDockerEn from './skills/local-supabase-docker.en.md?raw'
import localJudge0SetupZh from './skills/local-judge0-setup.zh.md?raw'
import localJudge0SetupEn from './skills/local-judge0-setup.en.md?raw'

export type SkillId = 'local-supabase-docker' | 'local-judge0-setup'

export interface SkillDoc {
  id: SkillId
  /** frontmatter 里的 name，同时是 skills 目录名与下载文件名 */
  name: string
  titleZh: string
  titleEn: string
  summaryZh: string
  summaryEn: string
  tags: string[]
  /** 目标环境 */
  targetZh: string
  targetEn: string
  /** 环境就绪后用来确认成功的命令 */
  verify: string
  /** AI 拿到这份 SKILL.md 后能替用户做的事 */
  canDoZh: string[]
  canDoEn: string[]
  markdownZh: string
  markdownEn: string
}

export const SKILL_DOCS: SkillDoc[] = [
  {
    id: 'local-supabase-docker',
    name: 'local-supabase-docker',
    titleZh: 'Docker 启动 Supabase 开源版',
    titleEn: 'Self-hosted Supabase with Docker',
    summaryZh:
      '让 AI 在你自己机器上用 Docker 起一套 Supabase（Postgres + Auth + Storage + REST），建好题库表、跑通连通性验证，再把连接信息交给你填进「我的题库」。题目全程留在本机，平台不存副本。',
    summaryEn:
      'Have the AI bring up a self-hosted Supabase (Postgres + Auth + Storage + REST) in Docker on your machine, create the question table, verify connectivity, and hand you the connection fields for “My Question Bank”. Your questions never leave your machine.',
    tags: ['Docker', 'Supabase', 'Postgres', '我的题库'],
    targetZh: 'Windows / macOS / Linux，需 Docker 与 Node.js 18+',
    targetEn: 'Windows / macOS / Linux, needs Docker and Node.js 18+',
    verify: 'curl -s "http://127.0.0.1:54321/rest/v1/questions?select=id&limit=1" -H "apikey: <anon key>"',
    canDoZh: [
      '检查 Docker 是否可用、54321 / 54322 是否被占用',
      '用 Supabase CLI 或单个 Postgres 容器把库拉起来',
      '执行建表 SQL，并核对表结构',
      '跑 REST 连通性验证，把原始输出贴给你',
      '告诉你 API URL / anon key / 连接串该填到哪一栏',
    ],
    canDoEn: [
      'Check that Docker runs and that ports 54321 / 54322 are free',
      'Start the stack via the Supabase CLI or a single Postgres container',
      'Run the schema SQL and verify the resulting table',
      'Run the REST connectivity check and show you the raw output',
      'Tell you which field takes the API URL, anon key and connection string',
    ],
    markdownZh: localSupabaseDockerZh,
    markdownEn: localSupabaseDockerEn,
  },
  {
    id: 'local-judge0-setup',
    name: 'local-judge0-setup',
    titleZh: '本地判题 Judge0 安装与调用',
    titleEn: 'Local Judge0: install & operate',
    summaryZh:
      '让 AI 在 VirtualBox 的 Ubuntu 22.04 里装好 Judge0 CE（含 cgroup v1、端口转发、Docker Compose），装完还能直接用 REST 接口逐测试点判你的代码，通过才敢说「已通过」。',
    summaryEn:
      'Have the AI install Judge0 CE inside a VirtualBox Ubuntu 22.04 VM (cgroup v1, port forwarding, Docker Compose), then judge your code test point by test point over REST — claiming “passed” only when it truly passes.',
    tags: ['Judge0', 'VirtualBox', 'Ubuntu 22.04', '本地判题'],
    targetZh: 'VirtualBox 里的 Ubuntu 22.04（Windows 的 WSL2 不行，只有 cgroup v2）',
    targetEn: 'Ubuntu 22.04 in VirtualBox (WSL2 won’t work — cgroup v2 only)',
    verify: 'curl -s http://localhost:2358/config_info',
    canDoZh: [
      '判断当前环境能不能跑 Judge0（cgroup v1 / v2）',
      '按步骤装好虚拟机、端口转发、Docker 与 Judge0',
      '用 /submissions/batch 批量提交每个测试点并轮询结果',
      '按 status.id 与 stdout 比对，逐点给出通过 / 错误原因',
      '连不上时如实说「未本地验证」，不谎报通过',
    ],
    canDoEn: [
      'Tell whether the current environment can run Judge0 (cgroup v1 vs v2)',
      'Walk through the VM, port forwarding, Docker and Judge0 setup',
      'Submit every test point via /submissions/batch and poll the results',
      'Compare status.id and stdout, reporting each point’s verdict',
      'Say “not verified locally” when unreachable — never fake a pass',
    ],
    markdownZh: localJudge0SetupZh,
    markdownEn: localJudge0SetupEn,
  },
]

/** AI 助手读取 SKILL.md 的约定位置（用户级 / 项目级） */
export const SKILL_INSTALL_PATHS = [
  '~/.claude/skills/<name>/SKILL.md',
  '.claude/skills/<name>/SKILL.md',
] as const

export function skillInstallCommand(name: string, markdown: string, shell: 'bash' | 'powershell') {
  if (shell === 'powershell') {
    return `$dir = "$env:USERPROFILE\\.claude\\skills\\${name}"
New-Item -ItemType Directory -Force $dir | Out-Null
@'
${markdown}
'@ | Set-Content -Encoding utf8 "$dir\\SKILL.md"`
  }
  return `mkdir -p ~/.claude/skills/${name}
cat > ~/.claude/skills/${name}/SKILL.md <<'SKILL_MD'
${markdown}
SKILL_MD`
}
