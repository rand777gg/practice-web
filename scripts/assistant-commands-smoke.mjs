/**
 * 小Q 指令解析的单元测试 —— 纯函数, 直接跑 Node 的类型剥离。
 *
 *   node scripts/assistant-commands-smoke.mjs
 */
import {
  ASSISTANT_COMMANDS,
  activeSkillFrom,
  commandPrefix,
  conversationTitleFrom,
  findCommand,
  matchCommands,
  parseCommand,
} from '../src/lib/assistant-commands.ts'
import {
  COUNT_MAX,
  DEFAULT_CREATE_SPEC,
  PLATFORM_SOURCES,
  describeSpec,
  normalizeSpec,
  retrievalSources,
} from '../src/lib/create-spec.ts'
import { sectionsFromToc } from '../src/lib/resource-blocks.ts'

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── 指令表本身 ──
check('指令名唯一', new Set(ASSISTANT_COMMANDS.map((c) => c.name)).size === ASSISTANT_COMMANDS.length)
check('每条指令都有说明和用法', ASSISTANT_COMMANDS.every((c) => c.summary && c.usage.startsWith('/')))
check('只有 /create 需要管理员', ASSISTANT_COMMANDS.filter((c) => c.adminOnly).map((c) => c.name).join() === 'create')

// ── parseCommand ──
check('普通聊天不是指令', parseCommand('死锁的四个必要条件是什么？') === null)
check('不认识的指令返回 unknown', parseCommand('/nope').kind === 'unknown')
check('unknown 带回了指令名', parseCommand('/nope').name === 'nope')

const exportCmd = parseCommand('/export')
check('/export 解析成 export', exportCmd.kind === 'command' && exportCmd.spec.id === 'export')
check('/export 没有参数', exportCmd.args === '')

const createCmd = parseCommand('/create 3 死锁产生的四个必要条件')
check('/create 带数量的参数原样保留', createCmd.spec.id === 'create' && createCmd.args === '3 死锁产生的四个必要条件',
  createCmd.args)

check('指令名大小写不敏感', parseCommand('/EXPORT').spec.id === 'export')
check('前后空格不影响', parseCommand('   /help   ').spec.id === 'help')
check('参数里的多余空格被压掉', parseCommand('/create   死锁   必要条件').args === '死锁 必要条件')
check('中文参数不被当成指令名', parseCommand('/create 出题').args === '出题')
check('只有斜杠没有名字算 unknown', parseCommand('/').kind === 'unknown')
check('路径式文本不会被误认成指令', parseCommand('/admin/questions 看一下') === null
  || parseCommand('/admin/questions 看一下').kind === 'unknown')

// ── commandPrefix: 只在还没开始写参数时给候选 ──
check('空的斜杠给全部候选', commandPrefix('/') === '' && matchCommands('').length === ASSISTANT_COMMANDS.length)
check('打了半截给前缀', commandPrefix('/cr') === 'cr')
check('补全后的斜杠加空格不再弹菜单', commandPrefix('/create ') === null)
check('开始写参数后不再弹菜单', commandPrefix('/create 死锁') === null)
check('普通文本没有候选', commandPrefix('死锁') === null)
check('前缀匹配能收敛到一条', eq(matchCommands('cr').map((c) => c.name), ['create']))
check('没有匹配就是空', matchCommands('zzz').length === 0)
check('findCommand 忽略大小写', findCommand('HELP').id === 'help')

// ── activeSkillFrom: 技能状态靠消息回溯, 不额外存字段 ──
const msg = (meta) => ({ meta })
check('没有技能消息时为空', activeSkillFrom([msg(null), msg({ kind: 'help' })]) === null)
check('set 之后技能生效', activeSkillFrom([
  msg({ kind: 'skill', action: 'set', skillId: 'local-judge0-setup', skillTitle: 'x' }),
]) === 'local-judge0-setup')
check('list 不改变当前技能', activeSkillFrom([
  msg({ kind: 'skill', action: 'set', skillId: 'local-judge0-setup', skillTitle: 'x' }),
  msg({ kind: 'skill', action: 'list', skillId: null, skillTitle: '' }),
]) === 'local-judge0-setup')
check('clear 之后技能关掉', activeSkillFrom([
  msg({ kind: 'skill', action: 'set', skillId: 'local-judge0-setup', skillTitle: 'x' }),
  msg({ kind: 'skill', action: 'clear', skillId: null, skillTitle: '' }),
]) === null)
check('后一次 set 覆盖前一次', activeSkillFrom([
  msg({ kind: 'skill', action: 'set', skillId: 'local-supabase-docker', skillTitle: 'a' }),
  msg({ kind: 'skill', action: 'set', skillId: 'local-judge0-setup', skillTitle: 'b' }),
]) === 'local-judge0-setup')

// ── normalizeSpec: 出题参数的第一道闸门 ──
check('空对象给出一份可用的默认参数',
  normalizeSpec({}).count === DEFAULT_CREATE_SPEC.count
  && normalizeSpec({}).questionTypes.length > 0)
check('数量被夹到上限', normalizeSpec({ count: 999 }).count === COUNT_MAX)
check('数量 0 / 负数 / NaN 退回默认', [
  normalizeSpec({ count: 0 }).count,
  normalizeSpec({ count: -3 }).count,
  normalizeSpec({ count: Number.NaN }).count,
].every((n) => n === DEFAULT_CREATE_SPEC.count))
check('小数数量取整', normalizeSpec({ count: 4.6 }).count === 5)
check('平台不支持的题型被剔掉', eq(normalizeSpec({ questionTypes: ['single_choice', 'telepathy'] }).questionTypes, ['single_choice']))
check('题型全非法时退回单选', eq(normalizeSpec({ questionTypes: ['telepathy'] }).questionTypes, ['single_choice']))
check('多选题型原样保留', eq(normalizeSpec({ questionTypes: ['multi_select', 'fill_blank'] }).questionTypes, ['multi_select', 'fill_blank']))
check('来源非法时退回默认', normalizeSpec({ source: 'magic' }).source === DEFAULT_CREATE_SPEC.source)
check('选了非文献来源时清掉 documentId',
  normalizeSpec({ source: 'platform', documentId: 'abc' }).documentId === null)
check('选了文献来源时保留 documentId',
  normalizeSpec({ source: 'resource', documentId: 'abc' }).documentId === 'abc')
check('主题和范围去掉首尾空格', normalizeSpec({ prompt: '  死锁  ' }).prompt === '死锁')
check('分类只留非空且最多三个',
  eq(normalizeSpec({ categories: ['a', '', '  ', 'b', 'c', 'd'] }).categories, ['a', 'b', 'c']))
check('避重默认开着', DEFAULT_CREATE_SPEC.avoidDuplicates)
check('默认不把 AI 出的题标成已核对', DEFAULT_CREATE_SPEC.markVerified === false)
check('describeSpec 说得清参数', describeSpec({ ...DEFAULT_CREATE_SPEC, count: 5 }).includes('5 道'))
check('参数里不再有难度这一项', !('difficulty' in DEFAULT_CREATE_SPEC))

// ── 来源子选择 ──
check('默认跨来源是全部五类', DEFAULT_CREATE_SPEC.sources.length === PLATFORM_SOURCES.length)
check('只会用文献时检索来源就只剩文献',
  eq(retrievalSources(normalizeSpec({ source: 'platform', sources: ['resource'] })), ['resource']))
check('只用题库时也是', eq(retrievalSources(normalizeSpec({ sources: ['question'] })), ['question']))
check('非法来源被剔掉', eq(normalizeSpec({ sources: ['question', 'nowhere'] }).sources, ['question']))
check('来源全非法时退回全选',
  normalizeSpec({ sources: ['nowhere'] }).sources.length === PLATFORM_SOURCES.length)
check('不用资料时检索来源为空', eq(retrievalSources(normalizeSpec({ source: 'model' })), []))
check('指定文献时检索来源就是文献',
  eq(retrievalSources(normalizeSpec({ source: 'resource', documentId: 'x' })), ['resource']))

// ── 范围: 页码区间 ──
const scoped = normalizeSpec({ source: 'resource', documentId: 'x', scope: { label: '第 3 章', from: 40, to: 60, tocKey: 7 } })
check('指定文献时保留页码范围', scoped.scope?.from === 40 && scoped.scope?.to === 60)
check('范围记着目录条目的 key(下拉框要能恢复选中)', scoped.scope?.tocKey === 7)
check('范围上下限写反了会自动摆正',
  normalizeSpec({ source: 'resource', documentId: 'x', scope: { from: 60, to: 40 } }).scope?.from === 40)
check('只有一端有数字的范围当成不限',
  normalizeSpec({ source: 'resource', documentId: 'x', scope: { from: 40 } }).scope === null
  && normalizeSpec({ source: 'resource', documentId: 'x', scope: { to: 60 } }).scope === null)
check('页码 0 / 负数当成不限',
  normalizeSpec({ source: 'resource', documentId: 'x', scope: { from: 0, to: 0 } }).scope === null
  && normalizeSpec({ source: 'resource', documentId: 'x', scope: { from: -5, to: 10 } }).scope === null)
check('跨来源时清掉页码范围(几篇的页码各算各的)',
  normalizeSpec({ source: 'platform', scope: { from: 40, to: 60 } }).scope === null)
check('不用资料时也不留范围',
  normalizeSpec({ source: 'model', scope: { from: 40, to: 60 } }).scope === null)
check('没给标签时用页码范围当标签',
  normalizeSpec({ source: 'resource', documentId: 'x', scope: { from: 3, to: 9 } }).scope?.label === '第 3-9 页')

// ── 目录 → 页码区间 ──
const toc = [
  { blockIndex: 0, level: 1, title: '第 1 章 古代的医药卫生', pageNo: 10 },
  { blockIndex: 5, level: 2, title: '（三）医学流派', pageNo: 40 },
  { blockIndex: 9, level: 1, title: '第 2 章 中世纪', pageNo: 55 },
]
const secs = sectionsFromToc(toc, 120)
check('每一节都切出页码区间', secs.length === 3)
check('一节到下一节前一页为止', secs[0].pageFrom === 10 && secs[0].pageTo === 39)
check('最后一节到全书末尾', secs[2].pageFrom === 55 && secs[2].pageTo === 120)
check('区间互不重叠', secs.every((s, i) => i === 0 || s.pageFrom > secs[i - 1].pageTo))
check('目录条目本身的 key 带出来了(同名标题也能区分)',
  secs[1].key === 5 && secs[1].title === '（三）医学流派')
const samePage = sectionsFromToc([
  { blockIndex: 0, level: 1, title: 'A', pageNo: 7 },
  { blockIndex: 1, level: 2, title: 'B', pageNo: 7 },
  { blockIndex: 2, level: 2, title: 'C', pageNo: 7 },
], 30)
check('三个标题挤在同一页时不会切出负宽区间',
  samePage.every((s) => s.pageFrom <= s.pageTo), JSON.stringify(samePage))
check('没有总页数时最后一节至少到自己那一页',
  sectionsFromToc([{ blockIndex: 0, level: 1, title: 'A', pageNo: 9 }], 0)[0].pageTo === 9)
check('没有目录就是空数组(界面退回手填页码)', sectionsFromToc([], 100).length === 0)

// ── /create 的指令说明得能让人看懂它有两步 ──
const createSpec = findCommand('create')
check('/create 的说明里提到了先确认参数', createSpec.summary.includes('确认'))

// ── 会话标题去掉指令名 ──
check('标题去掉 /create 前缀', conversationTitleFrom('/create 创建几道基础医学的题目') === '创建几道基础医学的题目')
check('标题去掉 /export 前缀', conversationTitleFrom('/export 顺便导出') === '顺便导出')
check('只有指令名时保留指令名(否则标题就空了)', conversationTitleFrom('/export') === '/export')
check('普通消息不受影响', conversationTitleFrom('死锁的四个必要条件是什么？') === '死锁的四个必要条件是什么？')
check('过长的标题会截断', conversationTitleFrom(`/create ${'题'.repeat(40)}`).length === 25)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
