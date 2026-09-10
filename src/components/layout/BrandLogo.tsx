import { cn } from '@/lib/utils'

interface Props {
  size?: number
  className?: string
}

/** 品牌 Logo: 奶龙(512x512 WebP, 透明通道) */
export function BrandLogo({ size = 24, className }: Props) {
  return (
    <img
      src="/nailong.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
