import { useEffect, useRef } from 'react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'

interface Props {
  src: string
  poster?: string
  title?: string
}

export default function MarkdownVideo({ src, poster, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const player = new Plyr(el, {
      controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'],
      tooltips: { controls: true, seek: true },
      ratio: '16:9',
    })
    return () => { player.destroy() }
  }, [src])

  return (
    <div
      className="my-3 overflow-hidden rounded-xl ring-1 ring-border"
      style={{ '--plyr-color-main': 'hsl(var(--primary))', '--plyr-video-controls-background': 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.75))' } as React.CSSProperties}
    >
      <video ref={videoRef} src={src} poster={poster} title={title} playsInline preload="metadata" className="aspect-video w-full" />
    </div>
  )
}
