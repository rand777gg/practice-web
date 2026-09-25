import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import noDirectTableAccess from './eslint-rules/no-direct-table-access.js'

/**
 * 数据访问层的护栏。
 *
 * 为什么用 lint 而不是只靠约定：这次改造把 200 多处 supabase.from 收进了 src/services，
 * 但"收进去"本身不会自己保持 —— 下一次赶时间时写一句 supabase.from('questions').select('*')
 * 比去服务层加函数快得多，然后所有努力在两个月内回退。这里把两条关键规则钉住：
 *   1. select('*') 只允许出现在 src/services（error，字段集必须显式声明）；
 *   2. 表访问只允许出现在 src/services（warn，是迁移剩余量的清单，也是新代码的提醒）。
 * 两条政策的严重级别不同，所以用了两个规则槽（见 eslint-rules/no-direct-table-access.js）。
 */
const noBareSelectStar = {
  selector: "CallExpression[callee.property.name='select'][arguments.0.value='*']",
  message:
    "禁止 select('*')（src/services 之外）。先在该领域的服务模块里加一个显式列集常量（见 src/services/profiles.ts 的 PROFILE_COLUMNS + assertColumns 写法），再让服务函数返回领域对象。",
}

export default defineConfig([
  // supabase/functions 是 Deno 侧的服务端代码，用 service_role 直连数据库是它的正常形态；
  // tmp-* 是本地脚手架，都不属于这条前端约束的范围
  globalIgnores(['dist', 'dev-dist', 'stats.html', 'supabase/functions/**', 'tmp-iki/**', 'tmp-*.mjs']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/services/**'],
    plugins: { local: { rules: { 'no-direct-table-access': noDirectTableAccess } } },
    rules: {
      'no-restricted-syntax': ['error', noBareSelectStar],
      'local/no-direct-table-access': 'warn',
    },
  },
  {
    // 服务层是这个约束的唯一例外：它就是唯一该碰表的地方
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', noBareSelectStar],
    },
  },
])
