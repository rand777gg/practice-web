/**
 * 「小刷」AI 助手 DEMO 剧本。
 * 心理陪伴走结构化引导，专业课答疑走「基于平台题库 / 专题 / 文献」的检索增强示例，
 * 回答里会带出来源引用，用来体现答案是有资料依据的。全部为内置示例，不调用真实模型。
 */

export type AssistantMode = 'auto' | 'psych' | 'study'

export interface AssistantSource {
  label: string
  type: '题库' | '专题' | '文献' | '真题'
}

export interface AssistantReply {
  text: string
  sub?: string
  tags?: string[]
  sources?: AssistantSource[]
  followups?: string[]
}

export interface AssistantScript {
  id: string
  mode: Exclude<AssistantMode, 'auto'>
  label: string
  keywords: string[]
  reply: AssistantReply
}

export const MODE_LABEL: Record<AssistantMode, string> = {
  auto: '自动判断',
  psych: '备考心理',
  study: '专业课答疑',
}

export const QUICK_PROMPTS: { mode: Exclude<AssistantMode, 'auto'>; text: string }[] = [
  { mode: 'psych', text: '最近总是焦虑，一坐到书桌前就心慌' },
  { mode: 'psych', text: '学不动了，感觉自己一直在原地打转' },
  { mode: 'psych', text: '看到别人进度比我快，情绪很低落' },
  { mode: 'study', text: '树与图这两章到底该怎么复习？' },
  { mode: 'study', text: 'PV 操作题有没有固定的下手顺序？' },
  { mode: 'study', text: 'Cache 组相联的地址位数怎么算不混？' },
]

export const FALLBACK_REPLY: AssistantReply = {
  text: '这个问题我需要再多一点信息才能答得准。能不能补充一下：你现在复习到哪个阶段、卡在哪一步、大概每天能投入多少时间？',
  sub: '如果是要问具体知识点，直接说科目加章节名（例如「操作系统 内存管理」），我会去平台题库里找对应题目一起讲。',
  tags: ['补充信息', '说明阶段'],
  followups: ['我现在在二轮复习', '帮我看看我的薄弱点'],
}

export const ASSISTANT_SCRIPTS: AssistantScript[] = [
  {
    id: 'anxiety',
    mode: 'psych',
    label: '考试焦虑',
    keywords: ['焦虑', '心慌', '紧张', '害怕', '慌', '压力', '崩'],
    reply: {
      text: '先做个区分：让你难受的通常不是「考试」本身，而是脑子里那个很模糊的念头——「我可能考不上」。模糊的东西没法解决，所以我们把它变具体。',
      sub: '你拿一张纸，写下三行：① 我最怕的具体结果是什么；② 它发生的客观依据是什么；③ 如果真发生了，我的下一步是什么。写完之后你会发现，第三行往往是有解的，而焦虑主要来自第二行被无限放大。',
      tags: ['焦虑具体化', '三行法', '今晚就能做'],
      sources: [{ label: '平台《考前心理调适》专题', type: '专题' }],
      followups: ['我写完还是慌怎么办', '怎么区分正常紧张和需要求助'],
    },
  },
  {
    id: 'stuck',
    mode: 'psych',
    label: '学不动',
    keywords: ['学不动', '不想学', '摆烂', '没动力', '拖延', '打转', '效率低'],
    reply: {
      text: '「学不动」大多数时候不是态度问题，是启动成本太高。你给今天定的目标可能是「复习第三章」，这个颗粒度大到大脑直接罢工。',
      sub: '把下限降到荒谬的程度：今天只做 5 道题，做完就算赢。我在平台里看过大量练习记录，真正有效的不是某天学 12 小时，而是连续 30 天每天都没断。先保住连续性，再谈强度。',
      tags: ['最小启动', '降低下限', '保住连续性'],
      sources: [{ label: '平台练习记录统计（近 30 日）', type: '题库' }],
      followups: ['5 道题做完还想继续怎么办', '我总是断在第二周'],
    },
  },
  {
    id: 'sleep',
    mode: 'psych',
    label: '睡眠问题',
    keywords: ['失眠', '睡不着', '睡不好', '熬夜', '作息'],
    reply: {
      text: '睡前刷题是最容易踩的坑：题目带来的兴奋感和「还有题没做完」的未完成感，会直接推迟入睡。',
      sub: '建议把睡前一小时改成低认知负荷的事——复盘错题清单（只看不做）、朗读背记内容。另外固定起床时间比固定入睡时间更有效，哪怕昨晚只睡了五小时也按时起，两三天后入睡会自然提前。',
      tags: ['睡前降负荷', '固定起床时间'],
      followups: ['躺下就是睡不着怎么办', '白天太困撑不住'],
    },
  },
  {
    id: 'compare',
    mode: 'psych',
    label: '与人比较',
    keywords: ['别人', '比较', '落后', '进度', '自卑', '比不过'],
    reply: {
      text: '和别人比进度这件事有个结构性缺陷：你看到的是对方的进度播报，看不到对方的错题量。而错题量才是真正决定分数的那部分。',
      sub: '换个可比的对象——和「三天前的自己」比。平台会记录你的正确率曲线，你可以只看自己的趋势，不看别人的数字。',
      tags: ['纵向对比', '只看正确率曲线'],
      sources: [{ label: '平台个人正确率趋势', type: '题库' }],
      followups: ['我的正确率一直不涨', '怎么判断自己是不是复习得太慢'],
    },
  },
  {
    id: 'second-attempt',
    mode: 'psych',
    label: '二战压力',
    keywords: ['二战', '再考', '复读', '一年时间'],
    reply: {
      text: '二战最大的消耗不是知识量，是「这次不能再失败了」这个念头本身。它会让你每一次做错题都被放大成对全局的否定。',
      sub: '试着把「这次必须上」换成「这次我要把去年丢分的地方补上」。前者是一个无法验证的赌注，后者是一份可勾选的清单。你去年哪些模块丢分最多，我们可以一起列出来，先攻确定性最高的那部分。',
      tags: ['替换目标表述', '可勾选清单'],
      followups: ['帮我看看该从哪门课开始补', '我总是想起去年的分数'],
    },
  },
  {
    id: 'give-up',
    mode: 'psych',
    label: '想放弃',
    keywords: ['放弃', '弃考', '不考了', '退出', '算了'],
    reply: {
      text: '有弃考的念头是常见反应，尤其在十月之后。先别急着做决定，把它拆成两件事：你是想放弃「这次考试」，还是想放弃「现在这种活法」？',
      sub: '如果是后者，那要调整的是节奏而不是目标——把每天的净学习时间砍掉三分之一，先撑两周看看状态。真正需要退出的决定，不会因为你多等两周而变糟。',
      tags: ['区分目标与节奏', '先降强度两周'],
      followups: ['降了强度更慌', '我不知道自己要什么'],
    },
  },
  {
    id: 'ds-tree',
    mode: 'study',
    label: '数据结构 · 树与图',
    keywords: ['树', '图', '二叉树', '遍历', 'dfs', 'bfs', '数据结构'],
    reply: {
      text: '树与图这两章的共同点是「手工模拟题占大头」。最高效的复习方式不是背代码，而是把每种遍历、每种旋转、每种最短路径算法在纸上各推三遍，直到不用思考就能写出中间状态。',
      sub: '我在平台题库里筛了两组题给你：树与图的手工模拟题（近五年真题，共 15 道）和需要写代码的算法设计题（8 道）。建议先做手工题建立直觉，再上代码题。',
      tags: ['先手工后代码', '每日 3 道', '做错立刻归档'],
      sources: [
        { label: '数据结构章节精练 · 树与图 15 题', type: '题库' },
        { label: '算法设计题手写专项 · 8 题', type: '题库' },
        { label: '《算法导论》第 22 章 图的基本算法', type: '文献' },
      ],
      followups: ['低链接值（low-link）怎么理解', '帮我把这 15 题排成计划'],
    },
  },
  {
    id: 'os-pv',
    mode: 'study',
    label: '操作系统 · PV 操作',
    keywords: ['pv', '信号量', '同步', '互斥', '死锁', '读者', '写者'],
    reply: {
      text: 'PV 操作题有固定的下手顺序，按这个顺序写基本不会漏：',
      sub: '① 先判断是互斥还是同步——互斥要成对出现且初值为 1，同步看谁等谁；② 列出全部资源与缓冲区，逐个定信号量初值；③ 最后才写进程代码，每个进程内 P 在前 V 在后（同类资源）。写完必须回头检查有没有「拿了 A 等 B」的环路，那是死锁。',
      tags: ['三步法', 'P 前 V 后', '查环路'],
      sources: [
        { label: 'PV 操作与同步大题专项 · 74 题', type: '题库' },
        { label: '《计算机操作系统》第 2 章 进程同步', type: '文献' },
      ],
      followups: ['写者优先怎么改', '缓冲区大小为 1 和 N 有什么区别'],
    },
  },
  {
    id: 'co-cache',
    mode: 'study',
    label: '组成原理 · Cache 地址',
    keywords: ['cache', '组相联', '映射', '存储', '组成原理', '标记位'],
    reply: {
      text: '地址划分只有一个容易错的地方：**组数是先除以路数再取对数**。很多人直接拿总块数算组号位，那算出来是块号位而不是组号位。',
      sub: '固定顺序：① 块内地址 = log₂(块大小)；② 总块数 = Cache 数据区容量 ÷ 块大小；③ 组数 = 总块数 ÷ 路数；④ 组号 = log₂(组数)；⑤ 标记 = 地址总位 − 块内 − 组号。做到心算不出错为止。',
      tags: ['先除路数再取对数', '五步固定顺序'],
      sources: [
        { label: 'Cache 与流水线计算专练 · 96 题', type: '题库' },
        { label: '《计算机组成原理》第 4 章 存储系统', type: '文献' },
      ],
      followups: ['全相联的标记位怎么算', '写策略的两种方式怎么区分'],
    },
  },
  {
    id: 'cn-congestion',
    mode: 'study',
    label: '计算机网络 · 拥塞控制',
    keywords: ['拥塞', 'tcp', '窗口', '慢开始', 'ssthresh', '计算机网络', '子网'],
    reply: {
      text: '拥塞控制的题本质上是在检验你记不记得「什么时候切档」：窗口小于 ssthresh 时按指数涨（慢开始），达到或超过 ssthresh 后改成线性涨（拥塞避免）。',
      sub: '画一张窗口随轮次变化的表，逐行写「本轮窗口 / 下一轮怎么涨 / 是否切档」。我在平台里挑了两道近五年的真题，参数各不相同，做完基本能覆盖常见变式。',
      tags: ['先判断是否到 ssthresh', '列表逐轮推'],
      sources: [
        { label: '网络计算题专项 · 子网/窗口/拥塞控制 88 题', type: '题库' },
        { label: 'RFC 9293 (TCP)', type: '文献' },
        { label: '2021 / 2023 年 408 真题', type: '真题' },
      ],
      followups: ['快速重传和快速恢复的区别', '超时之后窗口怎么重置'],
    },
  },
  {
    id: 'db-normal',
    mode: 'study',
    label: '数据库 · 范式判定',
    keywords: ['范式', '3nf', 'bcnf', '函数依赖', '数据库', '候选码'],
    reply: {
      text: '范式判定题不要背定义，走这套流程更稳：① 求候选码（能推全部属性的最小属性集）；② 找主属性与非主属性；③ 逐个检查是否存在部分依赖（→ 2NF）、传递依赖（→ 3NF）、以及每个决定因素是否都含候选码（→ BCNF）。',
      sub: '最常见的失分点是「只检查了一条依赖」。建议把函数依赖集画成有向图，遍历每条路径，看有没有 A→B→C 这种两跳。',
      tags: ['先求候选码', '依赖画成有向图'],
      sources: [
        { label: '数据库原理章节精练 · 范式判定 64 题', type: '题库' },
        { label: '《数据库系统概论》第 6 章 关系数据理论', type: '文献' },
      ],
      followups: ['候选码怎么快速求', 'BCNF 和 3NF 的实际区别'],
    },
  },
  {
    id: 'cc-ll1',
    mode: 'study',
    label: '编译原理 · FIRST/FOLLOW',
    keywords: ['first', 'follow', 'll1', 'lr', '文法', '编译'],
    reply: {
      text: 'FIRST/FOLLOW 集不要心算，一定要列表逐轮迭代，并在旁边标「第几轮新增了哪个终结符」。这样检查时能一眼定位漏项。',
      sub: '两个高频漏点：① FOLLOW 集一定要先放入输入结束符 #；② 当 A → αB 且 α 可以推导出 ε 时，要把 FOLLOW(A) 也并入 FOLLOW(B)。把这两条写进你的检查清单，正确率会明显上升。',
      tags: ['列表逐轮迭代', '先放 #', '注意 ε 分支'],
      sources: [
        { label: 'LL(1)/LR(1) 分析表构造专项 · 52 题', type: '题库' },
        { label: 'Knuth 1965, On the Translation of Languages from Left to Right', type: '文献' },
      ],
      followups: ['怎么判断是不是 LL(1)', 'LR 项目集族构造有模板吗'],
    },
  },
]

/** 按模式与关键词匹配最合适的一条剧本 */
export function matchScript(input: string, mode: AssistantMode): AssistantScript | null {
  const text = input.toLowerCase()
  const pool =
    mode === 'auto' ? ASSISTANT_SCRIPTS : ASSISTANT_SCRIPTS.filter((script) => script.mode === mode)
  let best: { script: AssistantScript; score: number } | null = null
  for (const script of pool) {
    let score = 0
    for (const keyword of script.keywords) {
      if (text.includes(keyword)) score += keyword.length
    }
    if (score > 0 && (!best || score > best.score)) best = { script, score }
  }
  return best?.script ?? null
}
