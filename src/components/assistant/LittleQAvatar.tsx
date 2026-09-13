import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

/** 小Q 的静态形象位: Live2D 皮套已下线, 这里只挂一张 brand 图 */
export function LittleQAvatar({ className }: Props) {
  return (
    <div className={cn('relative', className)}>
      <img src="/littleq.webp" alt="小Q" className="h-full w-full object-contain" />
    </div>
  )
}
