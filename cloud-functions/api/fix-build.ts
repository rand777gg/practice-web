/**
 * EdgeOne Makers Cloud Function — Build Failure Auto-Fix Agent
 *
 * Receives EdgeOne Pages `deployment.failed` webhook, fetches build logs,
 * analyzes errors with DeepSeek, applies fixes via GitHub API, notifies Feishu.
 *
 * Env vars (set in EdgeOne Makers console):
 *   EO_API_TOKEN      — EdgeOne Pages API token
 *   DEEPSEEK_API_KEY  — DeepSeek API key
 *   GITHUB_TOKEN      — GitHub PAT (repo scope)
 *   FEISHU_WEBHOOK_URL — Feishu bot webhook URL
 *   WEBHOOK_SECRET    — (optional) shared secret for auth
 */

interface WebhookPayload {
  eventType: string
  projectName: string
  projectId: string
  deploymentId: string
  repoBranch: string
  timestamp: string
}

interface BuildLog {
  entries: Array<{ message: string; level: string }>
}

const GITHUB_REPO = process.env.GITHUB_REPO || 'rand777gg/react-practice-web'
const GITHUB_API = 'https://api.github.com'

async function gh(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function fetchBuildLog(deploymentId: string): Promise<string> {
  // EdgeOne Pages API — get build logs for the failed deployment
  const res = await fetch(
    `https://api.edgeone.ai/v1/pages/deployments/${deploymentId}/logs`,
    { headers: { Authorization: `Bearer ${process.env.EO_API_TOKEN}` } },
  )
  if (!res.ok) return `Build log fetch failed: ${res.status} ${await res.text()}`
  const data = (await res.json()) as BuildLog
  return (data.entries || []).map((e) => e.message).join('\n')
}

async function analyzeAndFix(log: string, branch: string) {
  const prompt = `你是一个资深前端修复专家。以下是 EdgeOne Pages 构建失败的日志。分析错误原因，给出具体修复方案。

## 构建日志
${log.slice(0, 20_000)}

## 要求
1. 找出所有导致构建失败的错误（TypeScript 类型错误、ESLint 错误、依赖问题等）
2. 对每个错误，输出修复方案
3. 按以下格式输出（严格 JSON，无其他内容）：
{
  "summary": "一句话总结问题",
  "fixes": [
    {
      "file": "src/components/Foo.tsx",
      "description": "修复了什么",
      "oldLine": "需要替换的原代码（最好是唯一可匹配的一行）",
      "newLine": "替换后的新代码"
    }
  ],
  "needsManualIntervention": false
}

注意：
- oldLine 必须是原文件中真实存在的、唯一的行，用于定位替换位置
- 如果错误无法自动修复，设置 needsManualIntervention=true
- 只输出 JSON，不要加任何额外说明`

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  })
  const j = await res.json()
  const text = j.choices?.[0]?.message?.content || ''
  // Extract JSON from response (strip markdown code fences if present)
  const json = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(json)
}

async function getFileContent(path: string, branch: string) {
  try {
    const d = await gh(`/repos/${GITHUB_REPO}/contents/${path}?ref=${branch}`)
    return { content: Buffer.from(d.content, 'base64').toString('utf8'), sha: d.sha }
  } catch {
    return null
  }
}

async function updateFile(path: string, content: string, sha: string, branch: string, message: string) {
  return gh(`/repos/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha, branch }),
  })
}

async function sendFeishu(text: string) {
  if (!process.env.FEISHU_WEBHOOK_URL) return
  await fetch(process.env.FEISHU_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: `[PR Review] ${text}` } }),
  })
}

export default async function onRequest(context: { request: Request }) {
  const req = context.request

  // Validate auth
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (process.env.WEBHOOK_SECRET && auth !== process.env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Only handle deployment.failed
  const body = (await req.json()) as WebhookPayload
  if (body.eventType !== 'deployment.failed') {
    return new Response('Ignored', { status: 200 })
  }

  const branch = body.repoBranch || 'master'
  console.log(`[fix-build] Build failed on ${branch}`)

  try {
    // 1. Fetch build log
    const log = await fetchBuildLog(body.deploymentId)
    console.log(`[fix-build] Log fetched (${log.length} chars)`)

    // 2. Analyze + generate fix with DeepSeek
    const plan = await analyzeAndFix(log, branch)
    console.log(`[fix-build] Analysis: ${plan.summary}`)
    console.log(`[fix-build] ${plan.fixes.length} fix(es), needsManual=${plan.needsManualIntervention}`)

    if (plan.needsManualIntervention || !plan.fixes.length) {
      await sendFeishu(
        `⚠️ 构建失败 — 需人工处理\n\n项目: ${body.projectName}\n分支: ${branch}\n原因: ${plan.summary}\n\n构建日志见 EdgeOne Pages 控制台`,
      )
      return new Response(JSON.stringify({ status: 'manual_intervention_needed' }), { status: 200 })
    }

    // 3. Create fix branch
    const fixBranch = `fix/build-${Date.now()}`
    const mainBranch = branch
    // Get base ref SHA
    const base = await gh(`/repos/${GITHUB_REPO}/git/ref/heads/${mainBranch}`)
    await gh(`/repos/${GITHUB_REPO}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${fixBranch}`, sha: base.object.sha }),
    })

    // 4. Apply each fix
    const applied = []
    for (const fix of plan.fixes) {
      try {
        const file = await getFileContent(fix.file, fixBranch)
        if (!file) { console.log(`[fix-build] File not found: ${fix.file}`); continue }

        const newContent = file.content.replace(fix.oldLine, fix.newLine)
        if (newContent === file.content) {
          console.log(`[fix-build] oldLine not matched in ${fix.file}: "${fix.oldLine}"`)
          continue
        }

        await updateFile(fix.file, newContent, file.sha, fixBranch, `fix: ${fix.description}`)
        applied.push(fix)
        console.log(`[fix-build] Fixed ${fix.file}: ${fix.description}`)
      } catch (e) {
        console.error(`[fix-build] Failed to fix ${fix.file}:`, e)
      }
    }

    if (!applied.length) {
      await sendFeishu(`⚠️ 构建失败 — 自动修复未能应用\n\n项目: ${body.projectName}\n分支: ${branch}\n\n请手动修复`)
      return new Response(JSON.stringify({ status: 'fix_failed' }), { status: 200 })
    }

    // 5. Create PR
    const pr = await gh(`/repos/${GITHUB_REPO}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `fix: auto-fix build errors on ${branch}`,
        head: fixBranch,
        base: mainBranch,
        body: `## 🔧 自动修复构建错误\n\n**问题**: ${plan.summary}\n\n### 修复内容\n${applied.map((f) => `- **${f.file}**: ${f.description}`).join('\n')}\n\n---\n🤖 EdgeOne Makers Build Fix Agent | Powered by DeepSeek`,
      }),
    })

    // 6. Notify
    const fixList = applied.map((f) => `- ${f.file}: ${f.description}`).join('\n')
    await sendFeishu(
      `🔧 构建失败已自动修复\n\n项目: ${body.projectName}\n分支: ${branch}\n问题: ${plan.summary}\n\n修复内容:\n${fixList}\n\nPR: ${pr.html_url}`,
    )

    console.log(`[fix-build] PR created: ${pr.html_url}`)
    return new Response(JSON.stringify({ status: 'fixed', pr: pr.html_url }), { status: 200 })
  } catch (e) {
    console.error('[fix-build] Error:', e)
    await sendFeishu(`❌ 构建失败 — 自动修复异常\n\n项目: ${body.projectName}\n分支: ${branch}\n错误: ${e instanceof Error ? e.message : '未知'}`)
    return new Response(JSON.stringify({ status: 'error', message: String(e) }), { status: 500 })
  }
}
