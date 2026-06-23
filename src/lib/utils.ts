import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CJK = '[一-鿿㐀-䶿豈-﫿]'

export function normalizeChineseText(text: string): string {
  if (!text) return text
  let result = text
  // 中英文之间加空格
  result = result.replace(new RegExp(`(${CJK})([a-zA-Z])`, 'g'), '$1 $2')
  result = result.replace(new RegExp(`([a-zA-Z])(${CJK})`, 'g'), '$1 $2')
  // 中文与数字之间加空格
  result = result.replace(new RegExp(`(${CJK})(\\d)`, 'g'), '$1 $2')
  result = result.replace(new RegExp(`(\\d)(${CJK})`, 'g'), '$1 $2')
  // 半角标点转全角（在中文前后）
  result = result.replace(new RegExp(`(${CJK})([,])(${CJK})`, 'g'), '$1，$3')
  result = result.replace(new RegExp(`(${CJK})([;])`, 'g'), '$1；')
  result = result.replace(new RegExp(`([;])(${CJK})`, 'g'), '；$2')
  result = result.replace(new RegExp(`(${CJK})([!])`, 'g'), '$1！')
  result = result.replace(new RegExp(`(${CJK})([?])`, 'g'), '$1？')
  return result
}
