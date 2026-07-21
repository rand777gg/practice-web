export interface DeviceInfo {
  os: string
  browser: string
  hostname: string | null
  osIcon: string
  browserIcon: string
  displayName: string
}

const ua = navigator.userAgent

// Iconify icons for OS and browser detection
const OS_ICONS: Record<string, string> = {
  windows: 'mdi:microsoft-windows',
  macos: 'mdi:apple',
  linux: 'mdi:linux',
  android: 'mdi:android',
  ios: 'mdi:apple-ios',
  unknown: 'mdi:monitor',
}

const BROWSER_ICONS: Record<string, string> = {
  chrome: 'mdi:google-chrome',
  edge: 'mdi:microsoft-edge',
  firefox: 'mdi:firefox',
  safari: 'mdi:safari',
  unknown: 'mdi:web',
}

function getOsIcon(os: string): string {
  const l = os.toLowerCase()
  if (l.includes('windows')) return OS_ICONS.windows
  if (l.includes('macos') || l.includes('mac os')) return OS_ICONS.macos
  if (l.includes('linux')) return OS_ICONS.linux
  if (l.includes('android')) return OS_ICONS.android
  if (l.includes('ios')) return OS_ICONS.ios
  return OS_ICONS.unknown
}

function getBrowserIcon(browser: string): string {
  const l = browser.toLowerCase()
  if (l.includes('edge')) return BROWSER_ICONS.edge
  if (l.includes('chrome')) return BROWSER_ICONS.chrome
  if (l.includes('firefox')) return BROWSER_ICONS.firefox
  if (l.includes('safari')) return BROWSER_ICONS.safari
  return BROWSER_ICONS.unknown
}

function parseBrowser(): string {
  if (/Edg\//.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/)
    return m ? `Edge ${m[1]}` : 'Edge'
  }
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/)
    return m ? `Chrome ${m[1]}` : 'Chrome'
  }
  if (/Firefox\//.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/)
    return m ? `Firefox ${m[1]}` : 'Firefox'
  }
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    const m = ua.match(/Version\/(\d+)/)
    return m ? `Safari ${m[1]}` : 'Safari'
  }
  return 'Unknown Browser'
}

function parseMacOS(): string | null {
  const m = ua.match(/Mac OS X (\d+)[_.](\d+)/)
  if (!m) return null
  const major = parseInt(m[1], 10)
  if (major >= 24) return 'macOS 15'
  if (major >= 23) return 'macOS 14'
  if (major >= 22) return 'macOS 13'
  if (major >= 21) return 'macOS 12'
  if (major >= 20) return 'macOS 11'
  return `macOS ${major}`
}

/**
 * Detect OS synchronously from navigator.userAgent.
 * Win10 vs Win11 cannot be distinguished from the standard Chrome UA alone —
 * the UA only says "Windows NT 10.0" for both.
 * We use userAgentData (async) to get the real version, and fall back to
 * "Windows 10/11" when the high-entropy API is unavailable.
 */
function parseOSSync(): string | null {
  if (/Windows NT 10/.test(ua)) return null // need async detection
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1'
  if (/Windows NT 6\.[12]/.test(ua)) return 'Windows 7'
  const m = parseMacOS()
  if (m) return m
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'Linux'
  if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+(\.\d+)?)/)
    return m ? `Android ${m[1]}` : 'Android'
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+)[_.](\d+)/)
    return m ? `iOS ${m[1]}.${m[2]}` : 'iOS'
  }
  return null
}

/**
 * Try to get the accurate Windows version via the User-Agent Client Hints API.
 * platformVersion for Win11 is e.g. "10.0.22631" (build >= 22000).
 */
async function resolveWindowsVersion(): Promise<string> {
  try {
    if ('userAgentData' in navigator) {
      const uad = navigator.userAgentData as any
      const hints = await uad.getHighEntropyValues(['platformVersion'])
      const pv: string = hints.platformVersion || ''
      const m = pv.match(/^\d+\.\d+\.(\d+)/)
      if (m && parseInt(m[1], 10) >= 22000) return 'Windows 11'
      return 'Windows 10'
    }
  } catch { /* ignore */ }
  return 'Windows 10/11'
}

// Cached async result
let cachedOS: string | null = null
let osPromise: Promise<string> | null = null

async function resolveOS(): Promise<string> {
  if (cachedOS) return cachedOS
  if (!osPromise) {
    osPromise = (async () => {
      const sync = parseOSSync()
      if (sync) return sync
      return resolveWindowsVersion()
    })()
  }
  const result = await osPromise
  cachedOS = result
  return result
}

function getOSSync(): string {
  return parseOSSync() || 'Windows 10/11'
}

function buildDeviceInfo(os: string, browser: string): DeviceInfo {
  return {
    os,
    browser,
    hostname: null,
    osIcon: getOsIcon(os),
    browserIcon: getBrowserIcon(browser),
    displayName: `${os} · ${browser}`,
  }
}

export function getDeviceInfoSync(): DeviceInfo {
  return buildDeviceInfo(getOSSync(), parseBrowser())
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return buildDeviceInfo(await resolveOS(), parseBrowser())
}
