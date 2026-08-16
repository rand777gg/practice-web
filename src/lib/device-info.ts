export interface DeviceInfo {
  os: string
  browser: string
  osIcon: string
  browserIcon: string
  displayName: string
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

export function getDeviceInfoSync(): DeviceInfo {
  const raw = detectOsCategory()
  const browser = detectBrowser()
  return {
    os: raw,
    browser,
    osIcon: OS_ICONS[raw].icon,
    browserIcon: BROWSER_ICONS[browser].icon,
    displayName: `${OS_ICONS[raw].label} · ${BROWSER_ICONS[browser].label}`,
  }
}
