import type { GetResult } from '@fingerprintjs/fingerprintjs'

export interface DeviceInfo {
  fingerprint: string
  os: string
  browser: string
  osIcon: string
  browserIcon: string
  displayName: string
}

export interface DeviceDetail {
  fingerprint: string
  os: string
  browser: string
  osIcon: string
  browserIcon: string
  displayName: string
  ip: string | null
  screen: string | null
  cpu: string | null
  timezone: string | null
  language: string | null
  canvas: string | null
  webgl: string | null
  fonts: string | null
  audio: string | null
  platform: string | null
  touchSupport: string | null
  confidence: number
}

const ua = navigator.userAgent

type OsCategory = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'

const OS_ICONS: Record<OsCategory, { icon: string; label: string }> = {
  windows: { icon: 'devicon:windows11', label: 'Windows' },
  macos:   { icon: 'mdi:apple', label: 'macOS' },
  linux:   { icon: 'mdi:linux', label: 'Linux' },
  android: { icon: 'mdi:android', label: 'Android' },
  ios:     { icon: 'mdi:apple-ios', label: 'iOS' },
  unknown: { icon: 'mdi:monitor', label: 'Unknown' },
}

const BROWSER_ICONS: Record<string, { icon: string; label: string }> = {
  chrome:  { icon: 'logos:chrome', label: 'Chrome' },
  edge:    { icon: 'mdi:microsoft-edge', label: 'Edge' },
  firefox: { icon: 'mdi:firefox', label: 'Firefox' },
  safari:  { icon: 'mdi:apple-safari', label: 'Safari' },
  wechat:  { icon: 'mdi:wechat', label: 'WeChat' },
  samsung: { icon: 'mdi:android', label: 'Samsung' },
  unknown: { icon: 'mdi:web', label: 'Unknown' },
}

// --- OS category detection (no version, just platform type) ---

function detectOsCategory(): OsCategory {
  // iOS must be checked first — its UA also contains "Mac OS X"
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X/i.test(ua)) return 'macos'
  if (/Linux/i.test(ua)) return 'linux'

  // Fallback: navigator.platform
  const p = (navigator.platform || '').toLowerCase()
  if (/iphone|ipad|ipod/.test(p)) return 'ios'
  if (p.includes('android')) return 'android'
  if (p.startsWith('win')) return 'windows'
  if (p.startsWith('mac')) return 'macos'
  if (p.startsWith('linux')) return 'linux'

  return 'unknown'
}

// --- Browser detection ---

type BrowserKey = 'chrome' | 'edge' | 'firefox' | 'safari' | 'wechat' | 'samsung' | 'unknown'

function detectBrowser(): BrowserKey {
  if (/Edg\//i.test(ua)) return 'edge'
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Chrome\//i.test(ua)) return 'chrome'
  if (/Firefox\//i.test(ua)) return 'firefox'
  if (/Safari\//i.test(ua)) return 'safari'
  return 'unknown'
}

// --- Public helpers ---

export function getOsIcon(cat: OsCategory | string): string {
  return OS_ICONS[cat as OsCategory]?.icon || OS_ICONS.unknown.icon
}

export function getBrowserIcon(key: BrowserKey | string): string {
  return BROWSER_ICONS[key as BrowserKey]?.icon || BROWSER_ICONS.unknown.icon
}

export function getOsLabel(cat: OsCategory | string): string {
  return OS_ICONS[cat as OsCategory]?.label || OS_ICONS.unknown.label
}

export function getBrowserLabel(key: BrowserKey | string): string {
  return BROWSER_ICONS[key as BrowserKey]?.label || BROWSER_ICONS.unknown.label
}

function buildDeviceInfo(raw: OsCategory, browser: BrowserKey): DeviceInfo {
  return {
    fingerprint: '',
    os: raw,
    browser,
    osIcon: OS_ICONS[raw].icon,
    browserIcon: BROWSER_ICONS[browser].icon,
    displayName: `${OS_ICONS[raw].label} · ${BROWSER_ICONS[browser].label}`,
  }
}

export function getDeviceInfoSync(): DeviceInfo {
  return buildDeviceInfo(detectOsCategory(), detectBrowser())
}

// --- FingerprintJS ---

let fpAgentPromise: Promise<any> | null = null
let cachedFpResult: GetResult | null = null

async function loadFpAgent() {
  if (!fpAgentPromise) {
    fpAgentPromise = (async () => {
      const { load } = await import('@fingerprintjs/fingerprintjs')
      return load({ monitoring: false })
    })()
  }
  return fpAgentPromise
}

/** Get the raw FPJS components object (all 37 entropy sources) */
export function getFpComponents(): Record<string, unknown> | null {
  if (!cachedFpResult) return null
  return cachedFpResult.components as unknown as Record<string, unknown>
}

export async function getFingerprint(): Promise<string> {
  if (cachedFpResult) return cachedFpResult.visitorId
  const agent = await loadFpAgent()
  const result = await agent.get()
  cachedFpResult = result
  return result.visitorId
}

function fpComponentValue(components: any, key: string): string | null {
  try {
    const c = components[key]
    if (!c || c.error) return null
    if (typeof c.value === 'string') return c.value
    if (typeof c.value === 'number') return String(c.value)
    if (typeof c.value === 'boolean') return c.value ? 'Yes' : 'No'
    return JSON.stringify(c.value).slice(0, 200)
  } catch {
    return null
  }
}

export async function getDeviceDetail(): Promise<DeviceDetail> {
  const [osCategory, fp] = await Promise.all([
    Promise.resolve(detectOsCategory()),
    getFingerprint(),
  ])
  const browser = detectBrowser()
  const components = cachedFpResult?.components || {}

  return {
    fingerprint: fp,
    os: osCategory,
    browser,
    osIcon: OS_ICONS[osCategory].icon,
    browserIcon: BROWSER_ICONS[browser].icon,
    displayName: `${OS_ICONS[osCategory].label} · ${BROWSER_ICONS[browser].label}`,
    ip: null,
    screen: fpComponentValue(components, 'screenResolution'),
    cpu: fpComponentValue(components, 'hardwareConcurrency'),
    timezone: fpComponentValue(components, 'timezone'),
    language: fpComponentValue(components, 'language'),
    canvas: fpComponentValue(components, 'canvas'),
    webgl: fpComponentValue(components, 'webGl'),
    fonts: fpComponentValue(components, 'fonts'),
    audio: fpComponentValue(components, 'audio'),
    platform: fpComponentValue(components, 'platform'),
    touchSupport: fpComponentValue(components, 'touchSupport'),
    confidence: cachedFpResult?.confidence?.score ?? 0,
  }
}