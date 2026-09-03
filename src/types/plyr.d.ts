// plyr 3.8.x ships src/js/plyr.d.ts but does not expose it via package.json
// "types"/exports, so provide a minimal ambient declaration for the API we use.
declare module 'plyr' {
  interface PlyrSource {
    type?: string
    sources?: { src: string; type?: string; size?: number }[]
  }
  interface PlyrOptions {
    controls?: string[]
    settings?: string[]
    tooltips?: { controls?: boolean; seek?: boolean }
    ratio?: string
    autoplay?: boolean
    muted?: boolean
    loop?: { active?: boolean } | boolean
    seekTime?: number
    volume?: number
    speed?: { selected?: number; options?: number[] }
    quality?: { default?: number | string; options?: number[] | string[] }
    i18n?: Record<string, unknown>
    iconUrl?: string
    blankVideo?: string
  }
  type PlyrTarget = HTMLVideoElement | HTMLAudioElement | string
  export default class Plyr {
    constructor(target: PlyrTarget, options?: PlyrOptions)
    play(): Promise<void> | void
    pause(): void
    togglePlay(): void
    stop(): void
    restart(): void
    rewind(seekTime?: number): void
    forward(seekTime?: number): void
    destroy(): void
    source: string | PlyrSource
    readonly playing: boolean
    readonly paused: boolean
    readonly currentTime: number
    readonly duration: number
    readonly volume: number
    readonly muted: boolean
  }
}
