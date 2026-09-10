/**
 * 「我的题库」DEMO 数据。
 *
 * 核心设定：平台**不存储**用户「我的题库」里的内容。题目只存在于用户自己的数据库
 * （本地 Docker 起的 Supabase 开源版 / 自建库 / 浏览器本地），平台只提供刷题的前端展示与判题调用。
 * 只有用户主动勾选「共享」并点击上传的题目才会进入平台数据库。
 */

export type BankConnectionKind = 'docker' | 'remote' | 'browser'

export interface BankField {
  key: string
  label: string
  placeholder: string
  secret?: boolean
}

export interface BankConnection {
  kind: BankConnectionKind
  label: string
  tagline: string
  desc: string
  fields: BankField[]
  recommended?: boolean
  /** 平台是否参与存储 */
  platformStores: 'no' | 'shared-only'
}

export const BANK_CONNECTIONS: BankConnection[] = [
  {
    kind: 'docker',
    label: '本地 Docker 启动 Supabase 开源版',
    tagline: '推荐',
    desc: '在你自己机器上用 Docker 起一套 Supabase（Postgres + Auth + Storage）。数据全程留在本机，平台只读取你填的连接地址。',
    recommended: true,
    platformStores: 'no',
    fields: [
      { key: 'apiUrl', label: 'API URL', placeholder: 'http://127.0.0.1:54321' },
      { key: 'anonKey', label: 'anon key', placeholder: 'eyJhbGciOiJIUzI1NiIs…', secret: true },
      { key: 'dbUrl', label: '数据库连接串（可选）', placeholder: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', secret: true },
    ],
  },
  {
    kind: 'remote',
    label: '连接我自建的数据库',
    tagline: '预留接口',
    desc: '支持 Postgres / MySQL 直连，或你自己的 REST / GraphQL 服务。平台通过适配器接口读写，不落任何副本。',
    platformStores: 'no',
    fields: [
      { key: 'driver', label: '驱动类型', placeholder: 'postgres | mysql | rest' },
      { key: 'endpoint', label: '地址', placeholder: 'db.example.com:5432 或 https://api.example.com/questions' },
      { key: 'database', label: '库名 / 路径', placeholder: 'my_question_bank' },
      { key: 'username', label: '用户名', placeholder: 'reader' },
      { key: 'password', label: '密码', placeholder: '••••••••', secret: true },
    ],
  },
  {
    kind: 'browser',
    label: '仅存在浏览器本地',
    tagline: '零配置',
    desc: '题目存在浏览器 IndexedDB 里，不连任何数据库。换设备或清缓存会丢数据，适合先试用。',
    platformStores: 'no',
    fields: [],
  },
]

export const DOCKER_STEPS: { title: string; code: string; note: string }[] = [
  {
    title: '方式一：Supabase CLI（含 Postgres / Auth / Storage）',
    code: `# 只需执行一次，生成 supabase/ 目录
npx supabase init

# 启动本地整套服务
npx supabase start
# 启动后会打印：
#   API URL : http://127.0.0.1:54321
#   anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
#   DB URL  : postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 关闭（数据保留在 Docker volume 里）
npx supabase stop`,
    note: '把打印出的 API URL 与 anon key 填到左侧表单即可。',
  },
  {
    title: '方式二：只要一个 Postgres 容器',
    code: `docker run -d --name my-bank-db \\
  -e POSTGRES_PASSWORD=your-strong-password \\
  -e POSTGRES_DB=my_question_bank \\
  -p 54322:5432 \\
  -v my-bank-data:/var/lib/postgresql/data \\
  supabase/postgres:15.1.0.147

# 验证
docker exec -it my-bank-db psql -U postgres -d my_question_bank -c "select 1"`,
    note: '适合已有后端、只想借一个标准 Postgres 的场景。',
  },
]

export const BANK_SCHEMA_SQL = `-- 在你自己的库里执行，建一张最小可用的题目表
create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  topic_code  text not null,           -- 例如 408-01
  type        text not null,           -- 单项选择 / 综合应用 / 算法设计 …
  stem        text not null,
  options     jsonb,                   -- [{ "key": "A", "text": "…" }]
  answer      text,
  analysis    text,
  tags        text[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists questions_topic_idx on questions (topic_code);`

/** 平台预留的适配器接口：实现这四个方法即可接入任意数据库 */
export const ADAPTER_INTERFACE = `/** 平台预留接口 —— 你的数据库只需要实现以下四个方法 */
export interface QuestionBankAdapter {
  /** 校验连接信息并返回可用性，平台不会缓存凭据 */
  connect(config: BankConnectionConfig): Promise<{ ok: boolean; message: string }>

  /** 分页拉取题目，用于平台侧的刷题展示；平台不落库 */
  listQuestions(params: {
    cursor?: string
    limit?: number
    topicCode?: string
  }): Promise<{ items: QuestionRecord[]; nextCursor?: string }>

  /** 写入或更新题目（由用户在平台侧编辑时调用，直接写回你的库） */
  upsertQuestion(record: QuestionRecord): Promise<{ id: string }>

  /** 删除题目 */
  removeQuestion(id: string): Promise<void>
}`

export const SHARE_ENDPOINT = `// 只有用户主动勾选「共享」并点击上传的题目，才会走这个接口进平台库
POST /functions/v1/my-bank-upload
{
  "items": [
    { "topic_code": "408-01", "type": "综合应用", "stem": "…", "answer": "…" }
  ],
  "consent": {
    "confirmed": true,          // 用户已在界面上二次确认
    "attribution": "来自用户自建题库"  // 平台会保留来源标注
  }
}`

export interface LocalQuestion {
  id: string
  topicId: string
  type: string
  stem: string
  answer: string
  /** 是否勾选共享到平台 */
  shared: boolean
  /** synced=已在平台侧出现过；local=只在本机 */
  status: 'local' | 'shared-pending' | 'shared-done'
  updatedAt: string
}

export const LOCAL_QUESTIONS: LocalQuestion[] = [
  {
    id: 'lq1', topicId: 'ds', type: '算法设计',
    stem: '设计算法求二叉树中两个结点的最近公共祖先（LCA），要求时间复杂度 O(n)。',
    answer: '后序遍历：左右子树各自返回是否找到目标结点，若某结点左右都找到则它就是 LCA。',
    shared: false, status: 'local', updatedAt: '2026-09-10',
  },
  {
    id: 'lq2', topicId: 'os', type: '综合应用',
    stem: '某系统采用二级页表，页大小为 4KB，页表项 4B，逻辑地址 32 位，求页目录与页表各占多少页。',
    answer: '页内偏移 12 位，两级页号各 10 位；页表项共 2^10 个 → 每级页表占 4KB = 1 页。',
    shared: true, status: 'shared-pending', updatedAt: '2026-09-09',
  },
  {
    id: 'lq3', topicId: 'co', type: '综合应用',
    stem: '指令流水线采用 5 段，各段耗时分别为 2ns/2ns/3ns/2ns/2ns，求不考虑冒险时的最大吞吐率。',
    answer: '时钟周期取最慢段 3ns，最大吞吐率 = 1/3ns ≈ 3.33×10^8 条/秒。',
    shared: false, status: 'local', updatedAt: '2026-09-08',
  },
  {
    id: 'lq4', topicId: 'cn', type: '单项选择',
    stem: '在 CSMA/CD 中，若最小帧长减小，则（　）。',
    answer: 'B',
    shared: false, status: 'local', updatedAt: '2026-09-07',
  },
  {
    id: 'lq5', topicId: 'db', type: '综合应用',
    stem: '给定事务调度 S，判断其是否可串行化，并给出冲突可串行化的调度序列。',
    answer: '画优先图，若图中无环则冲突可串行化；拓扑排序即为等价串行调度。',
    shared: true, status: 'shared-done', updatedAt: '2026-09-05',
  },
]

export const BANK_STATS = { local: 5, shared: 2, uploaded: 1 }

/** 平台侧不提供的几件事，直接在界面上说清楚 */
export const PLATFORM_LIMITS: string[] = [
  '不存储、不备份、不索引你「我的题库」中的任何题目内容',
  '不同步你的数据库连接凭据，凭据只保存在你本机浏览器',
  '不对你自建库中的题目参与平台排行榜与成绩统计',
  '不保证你自建库的可用性——库停了，练习页就读不到题',
]
