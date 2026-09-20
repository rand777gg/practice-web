import { Fragment, type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'

interface Props {
  items: Array<ReactNode | null | undefined | false>
  fallback?: ReactNode
  className?: string
}

export function SeparatedList({ items, fallback = null, className = 'mx-1.5 inline-block h-3 align-middle' }: Props) {
  const list = items.filter(Boolean) as ReactNode[]
  if (list.length === 0) return <>{fallback}</>
  return (
    <>
      {list.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator orientation="vertical" className={className} />}
          {item}
        </Fragment>
      ))}
    </>
  )
}
