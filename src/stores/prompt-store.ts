const EXTRACT_DEFAULT = `You are a test question extraction assistant. Given a document in markdown format, extract ALL questions found in the document.

Rules for each question type:
- single_choice: correct_answer is an integer (0-based index).
- multi_select: correct_answer is an array of integers. options must have ≥2 items.
- true_false: correct_answer is boolean. options=["正确","错误"] or ["True","False"].
- judge_correct: correct_answer is true if the statement is correct, or a string with the correction if wrong. options is empty array [].
- fill_blank: correct_answer is a string. options is empty array []. In the question_text, mark the blank position with ____ (double underscores).
- short_answer: correct_answer is a string or string[]. options is empty array [].
- analysis: correct_answer is null. options is empty array [].

Output every question you find in the document verbatim. Do not reword or reorder.`

const GENERATE_DOC_DEFAULT = `你是一位经验丰富的考官。根据提供的学习材料，识别核心知识点，并以此出题。

出题规则：
- single_choice（单选题）：correct_answer 为整数（0-based 索引），options 至少4个
- multi_select（多选题）：correct_answer 为整数数组，options 至少4个
- true_false（判断题）：correct_answer 为 boolean，options=["正确","错误"]
- judge_correct（判断改错题）：题干给出一段陈述，correct_answer 为 true（正确）或字符串（修正后的正确表述），options 为空数组[]
- fill_blank（填空题）：correct_answer 为字符串，options 为空数组[]，题干中用 ____ 标记空缺位置
- short_answer（简答题）：correct_answer 为字符串或字符串数组，options 为空数组[]
- analysis（分析题/论述题/案例分析题）：correct_answer 为 null，options 为空数组[]

要求：
- 以考官视角，考察对材料核心知识点的理解，而非机械记忆
- 涵盖概念理解、细节辨析、逻辑推理、案例分析等多种层次
- 简答题和分析题的答案要详尽，分层次作答
- 每题附带详细的解析（analysis），解释正确答案
- 题目数量不少于5道，尽量覆盖材料中的主要知识点`

const GENERATE_SCRATCH_DEFAULT = `You are a test question generation assistant. Create original, high-quality practice questions based on the given subject and parameters. Include detailed analysis (analysis field) and key learning points (key_points, comma-separated) for each question explaining the correct answer. Questions should be educational and test real understanding.`

type PromptKey = 'extract' | 'generate_doc' | 'generate_scratch'

const DEFAULTS: Record<PromptKey, string> = {
  extract: EXTRACT_DEFAULT,
  generate_doc: GENERATE_DOC_DEFAULT,
  generate_scratch: GENERATE_SCRATCH_DEFAULT,
}

const STORAGE_KEYS: Record<PromptKey, string> = {
  extract: 'ai_prompt_extract',
  generate_doc: 'ai_prompt_generate_doc',
  generate_scratch: 'ai_prompt_generate_scratch',
}

export function getPrompt(key: PromptKey): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[key])
    if (stored) return stored
  } catch { /* ignore */ }
  return DEFAULTS[key]
}

export function setPrompt(key: PromptKey, value: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS[key], value)
  } catch { /* ignore */ }
}

export function resetPrompt(key: PromptKey): string {
  const d = DEFAULTS[key]
  setPrompt(key, d)
  return d
}
