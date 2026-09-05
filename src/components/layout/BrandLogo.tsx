import { cn } from '@/lib/utils'

interface Props {
  size?: number
  className?: string
}

/**
 * 品牌 Logo:答题对勾 + 递进箭头(练习→上岸)。
 * 纯 SVG,flat 填充,深浅/护眼主题下底色统一辨识。
 */
export function BrandLogo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill="#3f7df6" />
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1" />
      <path
        d="M9 17.2l4.4 4.4L23 10.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23.4 19.6l1.5 1.5 3-3.2" fill="none" stroke="#b7dcff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
