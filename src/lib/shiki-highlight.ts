/**
 * shiki 代码上色的唯一入口 —— 资料库「逐段」视图的代码块和「整篇」视图的 markdown 代码块都走它。
 *
 * 走 shiki 的 **core + 按需语言/主题**: 先建一个空高亮器, 真遇到某种语言、某个主题才去 import 那一份。
 * 不能图省事用 `shiki/bundle/web` 把所有语言列进 langs —— 那是一次性把几十份语法全下载下来
 * (cpp 一份就 600KB), 而一篇文献里通常只有一种语言; 整包(bundle/full)有 347 种语法共 7.6MB, 更不值。
 * 高亮器全局只建一个: 一本 295 页的书里代码块可能上百个, 每次都建会把页面拖死。
 *
 * 语言名来自 MinerU(guess_lang) 或 markdown 的围栏标记, 五花八门(txt、python3、C++), 认不出来的一律
 * 退回纯文本 —— 猜错语言比不上色更糟: 会把 `#` 注释当成运算符、把字符串拆错。
 */

/** 语言 id → 语法的按需 import。只有文档里真出现的语言才会被下载 */
const LANG_MODULES: Record<string, () => Promise<unknown>> = {
  python: () => import('shiki/langs/python.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  bash: () => import('shiki/langs/shellscript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  dart: () => import('shiki/langs/dart.mjs'),
  scala: () => import('shiki/langs/scala.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  matlab: () => import('shiki/langs/matlab.mjs'),
  r: () => import('shiki/langs/r.mjs'),
  latex: () => import('shiki/langs/latex.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  dockerfile: () => import('shiki/langs/dockerfile.mjs'),
  makefile: () => import('shiki/langs/makefile.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  'objective-c': () => import('shiki/langs/objective-c.mjs'),
  mermaid: () => import('shiki/langs/mermaid.mjs'),
}

/**
 * 主题也必须是**静态**的 import 表。
 *
 * 主题名来自设置项(用户可以在 46 个深色/19 个浅色主题里挑), 看起来该写成
 * `import(`shiki/themes/${name}.mjs`)` —— 但 Vite 不对"包名 + 变量"做 glob 展开,
 * 浏览器拿到的还是裸标识符, 运行时直接 `Failed to resolve module specifier`(踩过的坑:
 * 表现是选了什么主题都退回 github-light)。所以这里把设置页给出的主题逐个列出来,
 * 每份主题仍是按需下载; 表里没有的名字退回默认主题, 代码不会变成没颜色的白块。
 */
const THEME_MODULES: Record<string, () => Promise<unknown>> = {
  andromeeda: () => import('shiki/themes/andromeeda.mjs'),
  'aurora-x': () => import('shiki/themes/aurora-x.mjs'),
  'ayu-dark': () => import('shiki/themes/ayu-dark.mjs'),
  'ayu-light': () => import('shiki/themes/ayu-light.mjs'),
  'ayu-mirage': () => import('shiki/themes/ayu-mirage.mjs'),
  'catppuccin-frappe': () => import('shiki/themes/catppuccin-frappe.mjs'),
  'catppuccin-latte': () => import('shiki/themes/catppuccin-latte.mjs'),
  'catppuccin-macchiato': () => import('shiki/themes/catppuccin-macchiato.mjs'),
  'catppuccin-mocha': () => import('shiki/themes/catppuccin-mocha.mjs'),
  'dark-plus': () => import('shiki/themes/dark-plus.mjs'),
  dracula: () => import('shiki/themes/dracula.mjs'),
  'dracula-soft': () => import('shiki/themes/dracula-soft.mjs'),
  'everforest-dark': () => import('shiki/themes/everforest-dark.mjs'),
  'everforest-light': () => import('shiki/themes/everforest-light.mjs'),
  'github-dark': () => import('shiki/themes/github-dark.mjs'),
  'github-dark-default': () => import('shiki/themes/github-dark-default.mjs'),
  'github-dark-dimmed': () => import('shiki/themes/github-dark-dimmed.mjs'),
  'github-dark-high-contrast': () => import('shiki/themes/github-dark-high-contrast.mjs'),
  'github-light': () => import('shiki/themes/github-light.mjs'),
  'github-light-default': () => import('shiki/themes/github-light-default.mjs'),
  'github-light-high-contrast': () => import('shiki/themes/github-light-high-contrast.mjs'),
  'gruvbox-dark-hard': () => import('shiki/themes/gruvbox-dark-hard.mjs'),
  'gruvbox-dark-medium': () => import('shiki/themes/gruvbox-dark-medium.mjs'),
  'gruvbox-dark-soft': () => import('shiki/themes/gruvbox-dark-soft.mjs'),
  'gruvbox-light-hard': () => import('shiki/themes/gruvbox-light-hard.mjs'),
  'gruvbox-light-medium': () => import('shiki/themes/gruvbox-light-medium.mjs'),
  'gruvbox-light-soft': () => import('shiki/themes/gruvbox-light-soft.mjs'),
  horizon: () => import('shiki/themes/horizon.mjs'),
  'horizon-bright': () => import('shiki/themes/horizon-bright.mjs'),
  houston: () => import('shiki/themes/houston.mjs'),
  'kanagawa-dragon': () => import('shiki/themes/kanagawa-dragon.mjs'),
  'kanagawa-lotus': () => import('shiki/themes/kanagawa-lotus.mjs'),
  'kanagawa-wave': () => import('shiki/themes/kanagawa-wave.mjs'),
  laserwave: () => import('shiki/themes/laserwave.mjs'),
  'light-plus': () => import('shiki/themes/light-plus.mjs'),
  'material-theme': () => import('shiki/themes/material-theme.mjs'),
  'material-theme-darker': () => import('shiki/themes/material-theme-darker.mjs'),
  'material-theme-lighter': () => import('shiki/themes/material-theme-lighter.mjs'),
  'material-theme-ocean': () => import('shiki/themes/material-theme-ocean.mjs'),
  'material-theme-palenight': () => import('shiki/themes/material-theme-palenight.mjs'),
  'min-dark': () => import('shiki/themes/min-dark.mjs'),
  'min-light': () => import('shiki/themes/min-light.mjs'),
  monokai: () => import('shiki/themes/monokai.mjs'),
  'night-owl': () => import('shiki/themes/night-owl.mjs'),
  'night-owl-light': () => import('shiki/themes/night-owl-light.mjs'),
  nord: () => import('shiki/themes/nord.mjs'),
  'one-dark-pro': () => import('shiki/themes/one-dark-pro.mjs'),
  'one-light': () => import('shiki/themes/one-light.mjs'),
  plastic: () => import('shiki/themes/plastic.mjs'),
  poimandres: () => import('shiki/themes/poimandres.mjs'),
  red: () => import('shiki/themes/red.mjs'),
  'rose-pine': () => import('shiki/themes/rose-pine.mjs'),
  'rose-pine-dawn': () => import('shiki/themes/rose-pine-dawn.mjs'),
  'rose-pine-moon': () => import('shiki/themes/rose-pine-moon.mjs'),
  'slack-dark': () => import('shiki/themes/slack-dark.mjs'),
  'slack-ochin': () => import('shiki/themes/slack-ochin.mjs'),
  'snazzy-light': () => import('shiki/themes/snazzy-light.mjs'),
  'solarized-dark': () => import('shiki/themes/solarized-dark.mjs'),
  'solarized-light': () => import('shiki/themes/solarized-light.mjs'),
  'synthwave-84': () => import('shiki/themes/synthwave-84.mjs'),
  'tokyo-night': () => import('shiki/themes/tokyo-night.mjs'),
  vesper: () => import('shiki/themes/vesper.mjs'),
  'vitesse-black': () => import('shiki/themes/vitesse-black.mjs'),
  'vitesse-dark': () => import('shiki/themes/vitesse-dark.mjs'),
  'vitesse-light': () => import('shiki/themes/vitesse-light.mjs'),
}

/** 语法之间有依赖: html 里的 <script>/<style> 要用 javascript/css 的语法才认得出来 */
const LANG_DEPS: Record<string, string[]> = {
  html: ['javascript', 'css'],
  php: ['html'],
}

/** 别名 → 上面的语言 id(表里没有的一律退回纯文本) */
const LANG_ALIAS: Record<string, string> = {
  js: 'javascript', node: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python', python2: 'python',
  'c++': 'cpp', cplusplus: 'cpp', cp: 'cpp',
  cs: 'csharp', 'c#': 'csharp', csharpdotnet: 'csharp',
  sh: 'bash', shell: 'bash', shellscript: 'bash', zsh: 'bash', console: 'bash',
  golang: 'go', rs: 'rust', kt: 'kotlin', rb: 'ruby', yml: 'yaml', md: 'markdown',
  tex: 'latex', ps1: 'powershell', objc: 'objective-c', mmd: 'mermaid',
  txt: '', text: '', plain: '', plaintext: '', none: '', '': '',
}

interface ShikiCore {
  codeToHtml: (code: string, options: Record<string, unknown>) => string
  loadLanguage: (...langs: unknown[]) => Promise<void>
  loadTheme: (...themes: unknown[]) => Promise<void>
  getLoadedLanguages: () => string[]
  getLoadedThemes: () => string[]
}

let corePromise: Promise<ShikiCore> | null = null
const loadedLangs = new Set<string>()
const loadedThemes = new Set<string>()

const LIGHT_THEME = 'github-light'
const DARK_THEME = 'github-dark'

function getCore(): Promise<ShikiCore> {
  corePromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ])
    // 双主题先装好: 不指定主题时的默认路径不再需要任何额外下载
    const [light, dark] = await Promise.all([
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ])
    const core = await createHighlighterCore({
      themes: [light, dark],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    }) as unknown as ShikiCore
    loadedThemes.add(LIGHT_THEME)
    loadedThemes.add(DARK_THEME)
    return core
  })()
  return corePromise
}

function resolveLang(lang: string | null | undefined): string {
  const key = String(lang ?? '').trim().toLowerCase()
  if (!key) return ''
  const mapped = LANG_ALIAS[key] ?? key
  return mapped in LANG_MODULES ? mapped : ''
}

async function ensureLanguage(core: ShikiCore, id: string): Promise<void> {
  if (loadedLangs.has(id)) return
  for (const dep of LANG_DEPS[id] ?? []) await ensureLanguage(core, dep)
  const load = LANG_MODULES[id]
  if (!load) return
  try {
    await core.loadLanguage(await load())
    loadedLangs.add(id)
  } catch {
    // 语法块取不到就让它退回纯文本: 代码本身还是要看得见
  }
}

/** 主题名来自设置项, 只认 THEME_MODULES 里列出的那些 */
async function ensureTheme(core: ShikiCore, name: string): Promise<void> {
  if (loadedThemes.has(name)) return
  const load = THEME_MODULES[name]
  if (!load) return
  try {
    await core.loadTheme(await load())
    loadedThemes.add(name)
  } catch {
    // 主题取不到就退回默认双主题里的浅色, 代码不会变成没颜色的白块
  }
}

export interface HighlightOptions {
  /** 指定单个主题; 不传就用 github-light/github-dark 双主题, 由 .dark 类自动切换 */
  theme?: string | null
}

export async function highlightCode(
  code: string,
  lang?: string | null,
  opts?: HighlightOptions,
): Promise<string> {
  const core = await getCore()
  const id = resolveLang(lang)
  if (id) await ensureLanguage(core, id)
  const useLang = id && core.getLoadedLanguages().includes(id) ? id : 'text'

  const wanted = opts?.theme?.trim()
  if (wanted) {
    await ensureTheme(core, wanted)
    const useTheme = core.getLoadedThemes().includes(wanted) ? wanted : LIGHT_THEME
    return core.codeToHtml(code, { lang: useLang, theme: useTheme })
  }
  return core.codeToHtml(code, {
    lang: useLang,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
  })
}
