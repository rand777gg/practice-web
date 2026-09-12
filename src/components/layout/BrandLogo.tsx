import { cn } from '@/lib/utils'

interface Props {
  size?: number
  className?: string
}

/** 品牌 Logo: 小Q 睡颜(512x512 WebP) */
export function BrandLogo({ size = 24, className }: Props) {
  return (
    <img
      src="/logo.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
