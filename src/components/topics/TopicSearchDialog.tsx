import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, FileCode, MapPin, ScanSearch, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { topicAccent, topicSectionUrl } from '@/components/topics/topic-sections'
import {
  EXAM_TYPES, SEARCH_DIMENSIONS, searchTopics,
  type ExamType, type SearchDimension,
} from '@/lib/topic-search-demo'
import { topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

const EXAM_TONE: Record<ExamType, string> = {
  全国统考: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  自命题: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

export function TopicSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [dimension, setDimension] = useState<SearchDimension>('all')
  const [examType, setExamType] = useState<ExamType | '全部'>('全部')

  const hits = searchTopics({ query, dimension, examType })

  function go(topicId: string) {
    onOpenChange(false)
    navigate(topicSectionUrl(topicId, 'intro'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="h-4 w-4 text-primary" />
            搜索专业课
          </DialogTitle>
          <DialogDescription>
            可按学校、专业课代码、专业课名称检索，也可以只看全国统考或只看看自命题科目。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="试试输入「浙江大学」「408」「操作系统」「自命题」…"
              className="h-10 pl-9 pr-9 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">维度</span>
              {SEARCH_DIMENSIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  title={item.hint}
                  onClick={() => setDimension(item.key)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    dimension === item.key
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">考试形式</span>
              {EXAM_TYPES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setExamType(item)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    examType === item
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          <p className="text-[11px] text-muted-foreground">
            命中 {hits.length} 门专业课{query && ` · 关键词「${query}」`}
          </p>

          {hits.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">没有匹配的专业课。</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                可以换个维度试试，例如把「浙江大学 自命题」拆成「浙江大学」或「自命题」单独搜。
              </p>
            </div>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.topic.id}
                type="button"
                onClick={() => go(hit.topic.id)}
                className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
                      topicAccent(topicIndexOf(hit.topic.id)),
                    )}
                  >
                    {hit.topic.short}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{hit.topic.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn('border-transparent text-[9px] font-normal', EXAM_TONE[hit.examType])}
                      >
                        {hit.examType}
                      </Badge>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <FileCode className="h-2.5 w-2.5" />
                        {hit.topic.code}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {hit.reasons.map((reason) => (
                        <span key={reason} className="inline-flex items-center gap-1">
                          <BookOpen className="h-2.5 w-2.5" />
                          {reason}
                        </span>
                      ))}
                    </div>

                    {hit.matchedSchools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {hit.matchedSchools.slice(0, 4).map((school) => (
                          <span
                            key={`${school.id}-${school.subjectCode}`}
                            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            title={`${school.city} · ${school.note}`}
                          >
                            <MapPin className="h-2.5 w-2.5" />
                            {school.name}
                            <span className="font-mono">{school.subjectCode}</span>
                          </span>
                        ))}
                        {hit.matchedSchools.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{hit.matchedSchools.length - 4} 所
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
              </button>
            ))
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          DEMO：院校与科目代码为示例数据，仅用于演示搜索维度，不代表真实招生信息。
        </p>
      </DialogContent>
    </Dialog>
  )
}
