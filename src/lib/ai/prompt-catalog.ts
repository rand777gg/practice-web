/**
 * 平台内所有 AI 调用点的提示词目录。
 *
 * 这里存的是**内置默认值**:用户可在「提示词」页面覆盖,覆盖内容存在 user_prompts 表。
 * default 必须与收敛前代码里的原文逐字一致 —— 改文案等于改产品行为,别顺手润色。
 *
 * 可编辑的只有「规矩」(system / 独立 user prompt);把数据拼进提示词的模板留在调用点代码里。
 */

export type PromptGroup = 'import' | 'generate' | 'analyze' | 'format' | 'misc'

export interface PromptDef {
  key: string
  group: PromptGroup
  titleZh: string
  titleEn: string
  /** 改了会影响什么 */
  usedByZh: string
  usedByEn: string
  /** 代码位置,便于定位 */
  usedAt: string
  /** 这段文字填到哪个槽位 */
  role: 'system' | 'user'
  default: string
}

export const PROMPT_GROUP_LABELS: Record<PromptGroup, { zh: string; en: string }> = {
  import: { zh: '导入与提取', en: 'Import & extract' },
  generate: { zh: '生成题目', en: 'Generate questions' },
  analyze: { zh: '分析与建议', en: 'Analysis & advice' },
  format: { zh: '文本处理', en: 'Text processing' },
  misc: { zh: '其他', en: 'Misc' },
}

const EXTRACT = `你是一个试题提取助手。从给定的 Markdown 文档中提取所有题目，并按 JSON 格式输出。

每道题目包含以下字段：

【question_text】题干的原始文本。必须保留原文表述，不要改写、不要省略、不要将选项文本混入题干。填空题的空缺处用 ___（下划线）标记。
**重要**：如果题目前面有材料、案例、情景描述、陈述等引导文本（如"阅读下列材料，回答问题""根据以下案例""判断下列说法是否正确"），必须将这些引导文本一并包含在 question_text 中，用换行分隔。引导文本是题目不可分割的一部分，缺失会导致题目无法作答。

【question_type】题型，取值为以下之一：
- single_choice：单选题（有多个选项，仅一个正确答案）
- multi_select：多选题（有多个选项，多个正确答案）
- true_false：判断题（选项为"正确""错误"或"True""False"）
- fill_blank：填空题（题干中有空缺）
- short_answer：简答题（需要文字作答，无选项）
- analysis：分析题/论述题/案例分析题（无标准答案）
- judge_correct：判断改错题（给出一段陈述，判断正误并改正错误）

【options】选项列表（字符串数组）。选择题提取全部选项文本，保留原文。注意：选项文本中不要包含前缀字母/序号/分隔符（如 A. B) C、 D. 等），只保留纯文本内容。非选择题为空数组 []。

【correct_answer】正确答案：
- 单选题：整数（0-based 索引，即第一个选项索引为 0）
- 多选题：整数数组（如 [0, 2]）
- 判断题：布尔值 true/false
- 判断改错题：陈述正确为 true，陈述错误为修正后的正确表述字符串
- 填空题：答案字符串或字符串数组（多个空时按顺序对应）
- 简答题：答案字符串或字符串数组
- 分析题：null

【analysis】解析或答案说明。文档中有则提取，没有则留空字符串 ""。

逐题提取，保持原文顺序，不要遗漏任何题目。`

const GENERATE_DOC = `你是一位经验丰富的考官。根据提供的学习材料，识别核心知识点，并以此出题。

出题规则：
- single_choice（单选题）：correct_answer 为整数（0-based 索引），options 至少4个
- multi_select（多选题）：correct_answer 为整数数组，options 至少4个
- true_false（判断题）：correct_answer 为 boolean，options=["正确","错误"]
- judge_correct（判断改错题）：题干给出一段陈述，correct_answer 为 true（正确）或字符串（指明错在哪里并给出修正后的正确表述），options 为空数组[]
- fill_blank（填空题）：correct_answer 为字符串或字符串数组（多个空时按顺序对应），options 为空数组[]，题干中用 ___ 标记空缺位置
- short_answer（简答题）：correct_answer 为字符串或字符串数组，options 为空数组[]
- analysis（分析题/论述题/案例分析题）：correct_answer 为 null，options 为空数组[]

要求：
- 以考官视角，考察对材料核心知识点的理解，而非机械记忆
- 涵盖概念理解、细节辨析、逻辑推理、案例分析等多种层次
- 针对每道题，明确指出其考查内容来源于材料的哪个章节、小节或段落，越具体越好（如"第3章第2节 关于XXX的部分"）
- 简答题和分析题的答案要详尽，分层次作答
- 每题附带详细的解析（analysis），解释正确答案及出处
- 题目数量不少于5道，尽量覆盖材料中的主要知识点`

export const PROMPT_DEFS: PromptDef[] = [
  {
    key: 'extract',
    group: 'import',
    titleZh: '提取题目（文档 → 题目）',
    titleEn: 'Extract questions from a document',
    usedByZh: 'AI 导入：上传 PDF / Markdown 后按文档提取题目',
    usedByEn: 'AI import: extract questions from an uploaded PDF / Markdown',
    usedAt: 'src/lib/ai/deepseek.ts · parseDocument',
    role: 'system',
    default: EXTRACT,
  },
  {
    key: 'generate_doc',
    group: 'generate',
    titleZh: '按学习材料出题',
    titleEn: 'Generate from study material',
    usedByZh: 'AI 导入：用文档内容反向出题；也用于「按文档生成」入口',
    usedByEn: 'AI import: generate questions from a document; also the generate-from-document entry',
    usedAt: 'src/lib/ai/deepseek.ts · generateFromText / generateFromDocument',
    role: 'system',
    default: GENERATE_DOC,
  },
  {
    key: 'generate_questions',
    group: 'generate',
    titleZh: '按参数生成原创题',
    titleEn: 'Generate original questions by parameters',
    usedByZh: '指定学科、题型、数量后生成原创练习题',
    usedByEn: 'Generate original practice questions from subject, type and count',
    usedAt: 'src/lib/ai/deepseek.ts · generateQuestions',
    role: 'system',
    default:
      'You are a test question generation assistant. Create original, high-quality practice questions based on the given subject and parameters. Include detailed analysis (analysis field) for each question explaining the correct answer. Questions should be educational and test real understanding.',
  },
  {
    key: 'key_points',
    group: 'analyze',
    titleZh: '提炼知识点',
    titleEn: 'Extract key points',
    usedByZh: '给题目自动补「知识点」标签（练习进度按知识点统计依赖它）',
    usedByEn: 'Auto-labels a question with key points (knowledge-point progress depends on it)',
    usedAt: 'src/lib/ai/deepseek.ts · generateKeyPoints',
    role: 'system',
    default:
      '你是一个题目知识点的提炼助手。根据题干、答案、解析，提取3-5个核心知识点。用逗号分隔，每项简短（不超过10个字）。只输出知识点，不要其他内容。',
  },
  {
    key: 'suggest_exam',
    group: 'analyze',
    titleZh: '推荐考试配置',
    titleEn: 'Suggest an exam setup',
    usedByZh: '按练习弱项推荐组卷的学科、题型与题量',
    usedByEn: 'Suggests subjects, types and size for a paper based on weak spots',
    usedAt: 'src/lib/ai/deepseek.ts · suggestExam',
    role: 'system',
    default: `你是一个智能出题助手。根据用户的练习数据分析弱项，推荐考试配置。
- subjects/categories/types 从可选列表中选，优先选择错误率高的
- 如果某类错误为0或数据不足，选2-3个有代表性的
- questionCount 建议 10-50 题，弱项多则多出
- durationMin 建议 10-60 分钟，平均每题 1-2 分钟
- reason 用简短中文解释推荐理由，50字以内`,
  },
  {
    key: 'review_advice',
    group: 'analyze',
    titleZh: '遗忘曲线复习建议',
    titleEn: 'Spaced-repetition advice',
    usedByZh: '数据中心按艾宾浩斯曲线给出今天该复习哪些学科',
    usedByEn: 'Data Center advises which subjects to review today, per the forgetting curve',
    usedAt: 'src/lib/ai/deepseek.ts · suggestPlan',
    role: 'system',
    default: `你是一个基于艾宾浩斯遗忘曲线的学习规划助手。根据用户的遗忘曲线和学科紧急度数据，给出个性化的学习建议。
输出要求：
- 用自然的口吻，像一位学习教练
- 指出最需要复习的学科，建议每天复习多少题
- 根据遗忘曲线的高峰期（第1、3、7天）给出复习节奏
- 输出 3-5 句话，总长度控制在 150 字以内
- 不要用 markdown 格式`,
  },
  {
    key: 'study_summary',
    group: 'analyze',
    titleZh: '学习情况总结（聊天口吻）',
    titleEn: 'Study summary (chatty tone)',
    usedByZh: 'AI 总结：把今日与历史答题数据讲成一段朋友式的话',
    usedByEn: 'AI summary: turns today’s and overall stats into a friendly paragraph',
    usedAt: 'src/lib/ai/summary.ts',
    role: 'system',
    default: `你是一个学习伙伴，用朋友之间聊天的口吻和用户交流。就像你和他是真实世界里的好朋友，你们经常一起学习。根据用户提供的答题数据，自然地聊一聊他的学习情况。

要求：
- 用朋友聊天的语气，可以适当用"你呀"、"咱们"、"哈哈"、"加油"等口语表达
- 自然地提到：今天表现怎么样、最近趋势如何、哪些地方需要多练练、今天怎么安排学习比较好
- 不要用markdown格式（不要用**加粗**、#标题等），纯文本就行
- 总字数控制在200字以内
- 像朋友一样鼓励他，不要太正式
- 某项数据为0或无就跳过不提`,
  },
  {
    key: 'chart_insight',
    group: 'analyze',
    titleZh: '图表解读',
    titleEn: 'Chart insight',
    usedByZh: '数据中心各图表右上角的一键分析',
    usedByEn: 'The one-click analysis on Data Center charts',
    usedAt: 'src/components/charts/AiChartInsight.tsx',
    role: 'system',
    default:
      '你是一个学习数据分析助手。根据提供的图表数据，用2-4句话简要分析：1) 数据特征或规律 2) 一条实用的学习建议。语言简洁，不要重复数据本身。',
  },
  {
    key: 'br_format',
    group: 'format',
    titleZh: '段落换行修复（单段）',
    titleEn: 'Paragraph line-break fix (single block)',
    usedByZh: 'Markdown 编辑器里把挤在一行的段落拆开',
    usedByEn: 'Splits run-together paragraphs in the Markdown editor',
    usedAt: 'src/components/markdown/MarkdownEditor.tsx',
    role: 'system',
    default:
      '你是一个纯文本格式化工具。你的唯一任务是在段落和列表项之间插入 <br> 换行符。你必须逐字保留原文，不得修改、替换、改写、省略任何内容，包括标点、空格、数学公式、Markdown 语法。只添加 <br>，不要做任何其他改动。直接输出格式化后的文本，不要加任何解释。',
  },
  {
    key: 'br_format_numbered',
    group: 'format',
    titleZh: '段落换行修复（[N] 批量）',
    titleEn: 'Paragraph line-break fix (numbered batch)',
    usedByZh: 'AI 导入预览与导入页里批量修复多段文本',
    usedByEn: 'Batch-fixes many text blocks in AI import preview and the import page',
    usedAt: 'src/components/ai-import/AiImportPreview.tsx · src/pages/admin/AiImportPage.tsx',
    role: 'system',
    default:
      '你是一个纯文本格式化工具。对下面每段 [N] 标记的文本，在段落和列表项之间插入 <br> 换行符。逐字保留原文，不得修改任何内容。保持 [N] 标记不变。直接输出格式化后的文本。',
  },
  {
    key: 'clean_stem',
    group: 'format',
    titleZh: '题干清理（去选项与解析）',
    titleEn: 'Clean the stem (drop options and analysis)',
    usedByZh: '题库编辑里从一大段粘贴内容中只抽出题干',
    usedByEn: 'Pulls just the stem out of a pasted block when editing a question',
    usedAt: 'src/components/questions/QuestionForm.tsx',
    role: 'system',
    default: `你是一个题目格式化助手。你的任务是保留题目的完整题干内容，只删除选项部分和分析/解析部分。

规则：
1. 保留题干的所有正文叙述，一字不改，包括背景材料、情境描述、设问句等
2. 删除以 A. B. C. D. 或 ①②③④ 等编号开头的选项行
3. 删除"解析："、"分析："、"答案："等开头的解析内容
4. 直接输出完整题干，不要总结、缩写或添加任何说明`,
  },
  {
    key: 'nickname',
    group: 'misc',
    titleZh: 'AI 起昵称',
    titleEn: 'AI nickname',
    usedByZh: '设置页里让 AI 给自己起一个中文昵称',
    usedByEn: 'Settings asks the AI for a Chinese nickname',
    usedAt: 'src/pages/SettingsPage.tsx',
    role: 'user',
    default: '生成一个中文学习者的昵称，2-6个字，有创意、有趣、不死板。只输出昵称，不要多余内容。',
  },
]

const BY_KEY = new Map(PROMPT_DEFS.map((def) => [def.key, def]))

export const BUILTIN_PROMPT_KEYS = PROMPT_DEFS.map((def) => def.key)

export function getPromptDef(key: string): PromptDef | undefined {
  return BY_KEY.get(key)
}

/** 内置默认值;非内置 key(用户自建)返回空串 */
export function getPromptDefault(key: string): string {
  return BY_KEY.get(key)?.default ?? ''
}

export function isBuiltinPrompt(key: string): boolean {
  return BY_KEY.has(key)
}

/** 提示词里用到的 {{变量}},仅用于展示与提醒,不做强制校验 */
export function extractVariables(body: string): string[] {
  const found = body.matchAll(/\{\{\s*([A-Za-z0-9_\u4e00-\u9fa5]+)\s*\}\}/g)
  return [...new Set([...found].map((m) => m[1]))]
}
