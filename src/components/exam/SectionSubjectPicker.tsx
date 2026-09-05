import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

interface Props {
  /** 已选学科; null / 空数组 = 未限定(分区语义: 继承整卷学科; 整卷语义: 不限学科) */
  value: string[] | null
  /** 题库中真实存在的学科(候选主体, 底部输入框可添加任意学科) */
  subjects: string[]
  /** 附加候选: 整卷学科、其他分区已选学科等, 保证出现过/用到的学科一定有选项 */
  extra?: string[]
  onChange: (next: string[] | null) => void
  className?: string
  /** 空态按钮文案(默认=分区场景"随整卷"; 整卷场景传"不限学科") */
  noneLabel?: string
  /** 空态悬停说明(默认=subjectInheritTitle) */
  noneHint?: string
  /** 有选择时顶部"清除限定"菜单项文案(默认=subjectReset) */
  resetLabel?: string
  /** 有选择时直接展示学科名(顿号连接)而非"{n}门学科", 用于整卷等宽裕场景 */
  showNames?: boolean
}

/** 学科限定: 支持多选 + 自定义输入; 分区场景全部取消 = 恢复跟随整卷 */
export function SectionSubjectPicker({
  value,
  subjects,
  extra,
  onChange,
  className,
  noneLabel,
  noneHint,
  resetLabel,
  showNames,
}: Props) {
  const { t } = useT()
  const [custom, setCustom] = useState('')
  const sel = value ?? []

  const options = useMemo(() => {
    const set = new Set<string>()
    for (const x of subjects) if (x.trim()) set.add(x.trim())
    for (const x of extra ?? []) if (x.trim()) set.add(x.trim())
    for (const x of sel) if (x.trim()) set.add(x.trim())
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [subjects, extra, sel])

  const label =
    sel.length === 0
      ? (noneLabel ?? t('examTemplate.subjectInherit'))
      : showNames
        ? sel.join('、')
        : sel.length === 1
          ? sel[0]
          : t('examTemplate.subjectMultiCount').replace('{n}', String(sel.length))
  const title =
    sel.length === 0
      ? (noneHint ?? t('examTemplate.subjectInheritTitle'))
      : `${t('examTemplate.subject')}: ${sel.join('、')}`

  const toggle = (sub: string) => {
    const next = sel.includes(sub) ? sel.filter((x) => x !== sub) : [...sel, sub]
    onChange(next.length ? next : null)
  }

  const addCustom = () => {
    const v = custom.trim()
    if (!v) return
    if (!sel.includes(v)) onChange([...sel, v])
    setCustom('')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 shrink-0 gap-1 px-2 text-xs', className)}
          title={title}
        >
          <span className={cn('max-w-[104px] truncate', sel.length === 0 && 'text-muted-foreground')}>
            {label}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {sel.length > 0 && (
          <>
            <DropdownMenuItem onClick={() => onChange(null)}>
              <span className="text-muted-foreground">{resetLabel ?? t('examTemplate.subjectReset')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('examTemplate.noSubjects')}</div>
        )}
        {options.map((sub) => {
          const checked = sel.includes(sub)
          return (
            <DropdownMenuCheckboxItem
              key={sub}
              checked={checked}
              onCheckedChange={() => toggle(sub)}
              // 多选时保持菜单不关闭; 点外部/Esc 再收起
              onSelect={(e) => e.preventDefault()}
            >
              <span className="block max-w-[200px] truncate">{sub}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <div className="px-1 pb-0.5 pt-0.5">
          <Input
            className="h-7 text-xs"
            placeholder={t('examTemplate.subjectCustomPlaceholder')}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
