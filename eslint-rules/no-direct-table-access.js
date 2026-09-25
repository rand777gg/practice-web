/**
 * 本地规则：业务代码不允许直接访问表。
 *
 * 为什么单独写一条规则而不是继续用 no-restricted-syntax：ESLint 一个规则名只能有一个严重级别，
 * 而这两条政策不一样 —— select('*') 是硬禁止（error），直接访问表是迁移中的存量（warn）。
 * 混在一条规则里就只能同级别，要么放过 select('*')，要么让整个 lint 一直红着。
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: '禁止在 src/services 之外直接调用 supabase.from()' },
    messages: {
      directTableAccess:
        '业务代码不应该直接访问表「{{table}}」。请到 src/services/<领域>.ts 里加一个用例函数（run/runList + 显式列集 + AppError），组件与 store 只调用它。',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'from' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'supabase'
        ) {
          return
        }
        const first = node.arguments[0]
        const table = first && first.type === 'Literal' && typeof first.value === 'string' ? first.value : '?'
        context.report({ node, messageId: 'directTableAccess', data: { table } })
      },
    }
  },
}
