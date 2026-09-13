import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types'

export type AvatarStyle = 'aurora' | 'identicon' | 'orbit' | 'petal' | 'wave' | 'mosaic' | 'initials'

export interface AvatarSpec {
  style: AvatarStyle
  palette: number
  seed: number
}

/** 生成头像的样式顺序, 挑选面板按此顺序轮换样式 */
export const AVATAR_STYLES: readonly AvatarStyle[] = [
  'aurora', 'identicon', 'orbit', 'petal', 'wave', 'mosaic', 'initials',
]

const PALETTES: readonly [string, string][] = [
  ['#6366f1', '#a855f7'],
  ['#22d3ee', '#3b82f6'],
  ['#fb923c', '#ef4444'],
  ['#34d399', '#0ea5e9'],
  ['#f472b6', '#e11d48'],
  ['#fbbf24', '#f97316'],
  ['#a78bfa', '#db2777'],
  ['#2dd4bf', '#0f766e'],
  ['#64748b', '#1e293b'],
  ['#f87171', '#c084fc'],
]

const SVG_ID = 'avatar-svg'

export interface AvatarOwner {
  id: string
  name?: string | null
  /** profiles.avatar_url: 显式选定的头像 URL(GitHub 头像或自定义) */
  avatarUrl?: string | null
  /** profiles.avatar_preset: 显式选定的生成头像, 形如 "aurora:3:12345" */
  avatarPreset?: string | null
  /** 已绑定 GitHub 时, OAuth 元数据里的头像地址(未显式选择时兜底) */
  githubAvatarUrl?: string | null
}

export interface ResolvedAvatar {
  src: string
  initials: string
  kind: 'github' | 'custom' | 'preset'
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const round1 = (n: number) => Math.round(n * 10) / 10

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

type Rng = () => number

const STYLE_RENDERERS: Record<AvatarStyle, (rng: Rng, initials: string) => string> = {
  aurora: (rng) => {
    let out = `<g filter="url(#${SVG_ID}-blur)">`
    for (let i = 0; i < 4; i++) {
      out += `<circle cx="${round1(rng() * 100)}" cy="${round1(rng() * 100)}" r="${round1(24 + rng() * 28)}" fill="${i % 2 ? '#0f172a' : '#ffffff'}" opacity="${(0.16 + rng() * 0.22).toFixed(2)}"/>`
    }
    return `${out}</g>`
  },
  identicon: (rng) => {
    const size = 20
    let out = ''
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 5; row++) {
        if (rng() < 0.48) continue
        for (const c of col === 2 ? [2] : [col, 4 - col]) {
          out += `<rect x="${c * size + 1}" y="${row * size + 1}" width="${size - 2}" height="${size - 2}" rx="3" fill="#ffffff" opacity="0.92"/>`
        }
      }
    }
    return out
  },
  orbit: (rng) => {
    const cx = 40 + rng() * 20
    const cy = 40 + rng() * 20
    let out = ''
    for (let i = 0; i < 4; i++) {
      out += `<circle cx="${round1(cx)}" cy="${round1(cy)}" r="${round1(12 + i * 11 + rng() * 4)}" fill="none" stroke="#ffffff" stroke-width="${round1(1.5 + rng() * 3)}" opacity="${(0.5 - i * 0.09).toFixed(2)}"/>`
    }
    return `${out}<circle cx="${round1(cx)}" cy="${round1(cy)}" r="6" fill="#ffffff" opacity="0.9"/>`
  },
  petal: (rng) => {
    const petals = 5 + Math.floor(rng() * 4)
    let out = ''
    for (let i = 0; i < petals; i++) {
      out += `<g transform="rotate(${round1((360 / petals) * i + rng() * 10)} 50 50)"><ellipse cx="50" cy="30" rx="${round1(7 + rng() * 6)}" ry="${round1(18 + rng() * 8)}" fill="#ffffff" opacity="${(0.16 + rng() * 0.18).toFixed(2)}"/></g>`
    }
    return `${out}<circle cx="50" cy="50" r="7" fill="#ffffff" opacity="0.85"/>`
  },
  wave: (rng) => {
    let out = ''
    for (let i = 0; i < 4; i++) {
      const y = round1(30 + i * 18 + rng() * 8)
      const amp = round1(8 + rng() * 12)
      out += `<path d="M0 ${y} Q 25 ${round1(y - amp)} 50 ${y} T 100 ${y} L 100 100 L 0 100 Z" fill="#ffffff" opacity="${(0.12 + i * 0.07).toFixed(2)}"/>`
    }
    return out
  },
  mosaic: (rng) => {
    const cell = 25
    let out = ''
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const px = x * cell
        const py = y * cell
        const flip = rng() < 0.5
        const a = flip
          ? `${px},${py} ${px + cell},${py} ${px},${py + cell}`
          : `${px},${py} ${px + cell},${py} ${px + cell},${py + cell}`
        const b = flip
          ? `${px + cell},${py} ${px + cell},${py + cell} ${px},${py + cell}`
          : `${px},${py} ${px + cell},${py + cell} ${px},${py + cell}`
        out += `<polygon points="${a}" fill="#ffffff" opacity="${(0.08 + rng() * 0.28).toFixed(2)}"/>`
        out += `<polygon points="${b}" fill="#0f172a" opacity="${(0.04 + rng() * 0.16).toFixed(2)}"/>`
      }
    }
    return out
  },
  initials: (rng, initials) => {
    const text = initials || '?'
    return `<circle cx="50" cy="50" r="${round1(34 + rng() * 8)}" fill="#ffffff" opacity="0.14"/>`
      + `<text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="'Segoe UI',system-ui,-apple-system,sans-serif" font-size="${text.length > 1 ? 38 : 46}" font-weight="600" fill="#ffffff">${escapeXml(text)}</text>`
  },
}

export function renderAvatarSvg(spec: AvatarSpec, initials = '', size = 128): string {
  const [from, to] = PALETTES[spec.palette % PALETTES.length]
  const rng = mulberry32(spec.seed)
  const blur = spec.style === 'aurora'
    ? `<filter id="${SVG_ID}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`
    + `<defs><linearGradient id="${SVG_ID}-bg" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`
    + `</linearGradient>${blur}</defs>`
    + `<rect width="100" height="100" fill="url(#${SVG_ID}-bg)"/>`
    + STYLE_RENDERERS[spec.style](rng, initials)
    + `</svg>`
}

export function avatarDataUri(spec: AvatarSpec, initials = '', size = 128): string {
  return `data:image/svg+xml,${encodeURIComponent(renderAvatarSvg(spec, initials, size))}`
}

export function serializeAvatarPreset(spec: AvatarSpec): string {
  return `${spec.style}:${spec.palette}:${spec.seed}`
}

export function parseAvatarPreset(value?: string | null): AvatarSpec | null {
  if (!value) return null
  const [style, palette, seed] = value.split(':')
  if (!AVATAR_STYLES.includes(style as AvatarStyle)) return null
  const p = Number(palette)
  const s = Number(seed)
  if (!Number.isInteger(p) || !Number.isInteger(s) || s < 0) return null
  return {
    style: style as AvatarStyle,
    palette: ((p % PALETTES.length) + PALETTES.length) % PALETTES.length,
    seed: s >>> 0,
  }
}

/** 没做任何选择时, 按用户 ID 定一个稳定的头像, 保证每次刷新都是同一张 */
export function defaultAvatarSpec(key: string): AvatarSpec {
  const h = hashString(key || 'guest')
  return {
    style: AVATAR_STYLES[h % AVATAR_STYLES.length],
    palette: (h >>> 5) % PALETTES.length,
    seed: (h ^ 0x9e3779b9) >>> 0,
  }
}

/** 候选头像: 同一用户同一批次结果是稳定的, round 变化即"换一批" */
export function generateAvatarOptions(key: string, count = 14, round = 0): AvatarSpec[] {
  const base = hashString(`${key || 'guest'}#${round}`)
  const options: AvatarSpec[] = []
  for (let i = 0; i < count; i++) {
    options.push({
      style: AVATAR_STYLES[i % AVATAR_STYLES.length],
      palette: (base + i * 3) % PALETTES.length,
      seed: (hashString(`${base}:${i}:${key}`) ^ Math.imul(i + 1, 2654435761)) >>> 0,
    })
  }
  return options
}

export function initialsOf(name?: string | null, fallbackKey = ''): string {
  const clean = (name ?? '').trim()
  if (!clean) return (fallbackKey.trim() || '?').slice(0, 1).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/** GitHub 登录后 Supabase 把头像写在 user_metadata.avatar_url */
export function githubAvatarOf(user: Pick<User, 'user_metadata'> | null | undefined): string | null {
  const url = user?.user_metadata?.avatar_url
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null
}

/** 解绑后 user_metadata 里可能还留着旧的 GitHub 头像, 所以先确认身份还在 */
export function hasGitHubIdentity(
  user: Pick<User, 'identities' | 'app_metadata'> | null | undefined,
): boolean {
  if (!user) return false
  return user.app_metadata?.provider === 'github'
    || (user.identities ?? []).some((identity) => identity.provider === 'github')
}

export function isGitHubAvatarUrl(url?: string | null): boolean {
  return !!url && /^https:\/\/avatars\.githubusercontent\.com\//.test(url)
}

export function resolveAvatar(owner: AvatarOwner): ResolvedAvatar {
  const initials = initialsOf(owner.name, owner.id)
  const preset = parseAvatarPreset(owner.avatarPreset)
  if (preset) return { src: avatarDataUri(preset, initials), initials, kind: 'preset' }
  if (owner.avatarUrl) {
    return { src: owner.avatarUrl, initials, kind: isGitHubAvatarUrl(owner.avatarUrl) ? 'github' : 'custom' }
  }
  if (owner.githubAvatarUrl) return { src: owner.githubAvatarUrl, initials, kind: 'github' }
  return { src: avatarDataUri(defaultAvatarSpec(owner.id), initials), initials, kind: 'preset' }
}

export function avatarOwnerFromProfile(
  profile: Pick<Profile, 'id' | 'nickname'> & { avatar_url?: string | null; avatar_preset?: string | null },
): AvatarOwner {
  return {
    id: profile.id,
    name: profile.nickname,
    avatarUrl: profile.avatar_url,
    avatarPreset: profile.avatar_preset,
  }
}

export function selfAvatarOwner(user: User | null, profile: Profile | null): AvatarOwner {
  return {
    id: user?.id ?? 'guest',
    name: profile?.nickname || user?.email?.split('@')[0] || null,
    avatarUrl: profile?.avatar_url,
    avatarPreset: profile?.avatar_preset,
    githubAvatarUrl: githubAvatarOf(user),
  }
}
