import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CJK = '[一-鿿㐀-䶿豈-﫿]'

// Common units that need a space after digits (ref: chinese-copywriting-guidelines)
// ° and % are exceptions — no space per the spec
const UNITS = '(Gbps|Mbps|Kbps|bps|GHz|MHz|kHz|rpm|GB|MB|KB|TB|PB|cm|mm|km|kg|mg|ml|Hz|g|L|W|V|A)(?![a-zA-Z])'

export function normalizeChineseText(text: string): string {
  if (!text) return text
  // Protect LaTeX math regions from normalization — replace with placeholders
  const mathBlocks: string[] = []
  let result = text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => { mathBlocks.push(`$$${m}$$`); return `\x00MATH${mathBlocks.length - 1}\x00` })
    .replace(/\$([^$]+?)\$/g, (_, m) => { mathBlocks.push(`$${m}$`); return `\x00MATH${mathBlocks.length - 1}\x00` })
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => { mathBlocks.push(`\\[${m}\\]`); return `\x00MATH${mathBlocks.length - 1}\x00` })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => { mathBlocks.push(`\\(${m}\\)`); return `\x00MATH${mathBlocks.length - 1}\x00` })
  // 中英文之间加空格
  result = result.replace(new RegExp(`(${CJK})([a-zA-Z])`, 'g'), '$1 $2')
  result = result.replace(new RegExp(`([a-zA-Z])(${CJK})`, 'g'), '$1 $2')
  // 中文与数字之间加空格
  result = result.replace(new RegExp(`(${CJK})(\\d)`, 'g'), '$1 $2')
  result = result.replace(new RegExp(`(\\d)(${CJK})`, 'g'), '$1 $2')
  // 数字与单位之间加空格
  result = result.replace(new RegExp(`(\\d)${UNITS}`, 'g'), '$1 $2')
  // 半角标点转全角（一侧有中文即转）
  result = result.replace(new RegExp(`(${CJK})([,])`, 'g'), '$1，')
  result = result.replace(new RegExp(`([,])(${CJK})`, 'g'), '，$2')
  result = result.replace(new RegExp(`(${CJK})([;])`, 'g'), '$1；')
  result = result.replace(new RegExp(`([;])(${CJK})`, 'g'), '；$2')
  result = result.replace(new RegExp(`(${CJK})([!])`, 'g'), '$1！')
  result = result.replace(new RegExp(`(${CJK})([?])`, 'g'), '$1？')
  result = result.replace(new RegExp(`(${CJK})([.:])`, 'g'), (_, c, p) => c + (p === '.' ? '。' : '：'))
  result = result.replace(new RegExp(`([.:])(${CJK})`, 'g'), (_, p, c) => (p === '.' ? '。' : '：') + c)
  result = result.replace(new RegExp(`(${CJK})([)])`, 'g'), '$1）')
  result = result.replace(new RegExp(`([(])(${CJK})`, 'g'), '（$2')
  // 弯引号直接替换为直角引号（从 Word/网页复制时常出现）
  result = result.replace(/“/g, '「')
  result = result.replace(/”/g, '」')
  result = result.replace(/‘/g, '『')
  result = result.replace(/’/g, '』')
  // 半角引号转直角引号（需邻接 CJK 判断开闭）
  result = result.replace(new RegExp(`"(${CJK})`, 'g'), '「$1')
  result = result.replace(new RegExp(`(${CJK})"`, 'g'), '$1」')
  result = result.replace(new RegExp(`'(${CJK})`, 'g'), '『$1')
  result = result.replace(new RegExp(`(${CJK})'`, 'g'), '$1』')
  // Restore LaTeX math regions
  result = result.replace(/\x00MATH(\d+)\x00/g, (_, i) => mathBlocks[Number(i)] || '')
  return result
}

// Strip AI-generated label prefixes from option text (A. / A、/ 1. / ① etc.)
export function cleanOptionText(text: string): string {
  if (!text) return text
  return text
    .replace(/^[A-Z][.、）)]\s*/, '')
    .replace(/^[①-⑩]\s*/, '')
    .replace(/^\d+[.、）)]\s*/, '')
    .trim()
}
