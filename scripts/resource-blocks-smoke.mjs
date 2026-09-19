#!/usr/bin/env node
/**
 * 资料库区块解析的行为验证 —— MinerU 产物 → 目录 / PDF 定位 / 检索都建立在它上面。
 *
 * layout fixture 按 MinerU layout.json 的真实字段形状构造: pdf_info[].para_blocks 树,
 * 块上带 type / bbox / lines[].spans[].content / blocks 子块, 表格与图片靠 caption 带文本。
 * 不需要任何测试框架, Node 22+ 直接跑 .ts(原生类型擦除)。
 *
 * Usage: node scripts/resource-blocks-smoke.mjs
 */
import { blocksFromLayout, blocksFromMarkdown, blocksFromParse, buildToc } from '../src/lib/resource-blocks.ts'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`)
}

const layout = {
  pdf_info: [
    {
      para_blocks: [
        {
          type: 'title',
          bbox: [72, 60, 520, 90],
          lines: [{ spans: [{ content: '操作系统原理与实现' }] }],
        },
        {
          type: 'text',
          bbox: [72, 100, 520, 160],
          lines: [{ spans: [{ content: '操作系统是管理' }, { content: '计算机硬件与软件' }, { content: '资源的系统软件。' }] }],
        },
        {
          type: 'table',
          bbox: [72, 180, 520, 300],
          blocks: [
            { type: 'table_body', bbox: [72, 180, 520, 300], lines: [{ spans: [{ content: '管理方式 分页 分段 段页式' }] }] },
          ],
          table_caption: [{ content: '表 4-1 内存管理方式对比' }],
        },
        {
          type: 'text',
          bbox: [72, 320, 520, 340],
          lines: [{ spans: [{ content: '   ' }] }],
        },
      ],
    },
    {
      preproc_blocks: [
        {
          type: 'text',
          bbox: [72, 60, 520, 120],
          blocks: [
            { type: 'title', bbox: [72, 60, 400, 80], lines: [{ spans: [{ content: '第三章 死锁' }] }] },
            {
              type: 'text',
              bbox: [72, 90, 520, 120],
              blocks: [
                { type: 'title', bbox: [72, 90, 400, 110], lines: [{ spans: [{ content: '3.1 必要条件' }] }] },
              ],
            },
          ],
        },
        {
          type: 'figure',
          bbox: [100, 140, 480, 320],
          img_caption: [{ content: '图 3-1 死锁的循环等待' }],
        },
        {
          type: 'text',
          bbox: [72, 340, 520, 400],
          lines: [{ spans: [{ content: '死锁产生的四个必要条件。' }] }],
        },
      ],
    },
  ],
}

const blocks = blocksFromLayout(JSON.stringify(layout))

check('块数(空块丢掉, 表格/图片各算一块)', blocks.length, 7)
check('blockIndex 稠密递增', blocks.map((b) => b.blockIndex), [0, 1, 2, 3, 4, 5, 6])
check('页码按 pdf_info 顺序 1-based', blocks.map((b) => b.pageNo), [1, 1, 1, 2, 2, 2, 2])
check('同一块内多个 span 拼接', blocks[1].text, '操作系统是管理计算机硬件与软件资源的系统软件。')
check('一级标题 headingLevel=1', [blocks[0].headingLevel, blocks[0].blockType], [1, 'title'])
check('正文 headingLevel=0', blocks[1].headingLevel, 0)
check('bbox 原样带出', blocks[1].bbox, [72, 100, 520, 160])

check('表格文本从子块递归收集', blocks[2].text, '表 4-1 内存管理方式对比 管理方式 分页 分段 段页式')
check('表格块 bbox 用容器自己的', blocks[2].bbox, [72, 180, 520, 300])
check('嵌套深度决定标题层级', [blocks[3].headingLevel, blocks[4].headingLevel], [2, 3])
check('嵌套标题的页码', [blocks[3].pageNo, blocks[4].pageNo], [2, 2])
check('图片 caption 被收进来', blocks[5].text, '图 3-1 死锁的循环等待')
check('图片块类型保留', blocks[5].blockType, 'figure')

const toc = buildToc(blocks)
check('目录只含标题', toc.map((t) => t.title), ['操作系统原理与实现', '第三章 死锁', '3.1 必要条件'])
check('目录项的 level 与页码', toc.map((t) => [t.level, t.pageNo]), [[1, 1], [2, 2], [3, 2]])
check('目录项锚点就是块索引', toc.map((t) => t.blockIndex), [0, 3, 4])

const contentList = [
  { type: 'text', text: '操作系统概述', text_level: 1, page_idx: 0, bbox: [72, 60, 520, 90] },
  { type: 'text', text: '正文第一段。', page_idx: 0, bbox: [72, 100, 520, 160] },
  { type: 'table', page_idx: 1, bbox: [72, 60, 520, 200], blocks: [{ type: 'table_body', text: '分页 分段' }] },
  { type: 'text', text: '   ', page_idx: 1, bbox: [72, 210, 520, 220] },
]
const clBlocks = blocksFromLayout(contentList)
check('content_list: 块数', clBlocks.length, 3)
check('content_list: text_level 当标题层级', [clBlocks[0].headingLevel, clBlocks[1].headingLevel], [1, 0])
check('content_list: page_idx 0-based 转 1-based', clBlocks.map((b) => b.pageNo), [1, 1, 2])
check('content_list: 表格子块文本', clBlocks[2].text, '分页 分段')

// 标题行后面没空行时, 标题与正文必须拆成两块, 否则正文会被并进目录标题
const markdown = [
  '# 第一章 操作系统概述',
  '操作系统是管理计算机硬件与软件资源的系统软件。',
  '',
  '## 1.1 操作系统的定义',
  '从资源管理角度看，操作系统是资源管理者。',
  '',
  '## 1.2 发展历程',
  '经历了手工操作、批处理、分时系统等阶段。',
].join('\n')

const mdBlocks = blocksFromMarkdown(markdown, 3)
check('轻量: 紧邻标题的正文不被并进标题', mdBlocks.length, 6)
check('轻量: markdown 标题被识别', mdBlocks.map((b) => b.headingLevel), [1, 0, 2, 0, 2, 0])
check('轻量: 标题文本去掉 #', mdBlocks[0].text, '第一章 操作系统概述')
check('轻量: 正文保留', mdBlocks[1].text, '操作系统是管理计算机硬件与软件资源的系统软件。')
check('轻量: 没有坐标', mdBlocks.map((b) => b.bbox), [null, null, null, null, null, null])
check('轻量: 页码落在 1..3', mdBlocks.every((b) => b.pageNo >= 1 && b.pageNo <= 3), true)
check('轻量: 目录可建', buildToc(mdBlocks).map((t) => [t.level, t.title]), [[1, '第一章 操作系统概述'], [2, '1.1 操作系统的定义'], [2, '1.2 发展历程']])

check('有 layout 用 layout', blocksFromParse(JSON.stringify(layout), markdown, 3).length, 7)
check('layout 解析不出块时退化', blocksFromParse(JSON.stringify({ pdf_info: [] }), markdown, 3).length, 6)
check('无 layout 时退化', blocksFromParse(null, markdown, 3).length, 6)
check('坏 JSON 不抛异常', blocksFromParse('{ not json', markdown, 3).length, 6)

check('空 pdf_info 得空数组', blocksFromLayout({ pdf_info: [] }), [])
check('缺 bbox 的块被跳过', blocksFromLayout([{ type: 'text', text: '没有 bbox' }]), [])
check('空 markdown 得空数组', blocksFromMarkdown('', 5), [])

function deepTitle(depth) {
  let node = { type: 'title', bbox: [0, 0, 10, 10], lines: [{ spans: [{ content: '深' }] }] }
  for (let i = 1; i < depth; i++) {
    node = { type: 'title', bbox: [0, 0, 10, 10], blocks: [node] }
  }
  return node
}
check('标题层级封顶 6', blocksFromLayout({ pdf_info: [{ para_blocks: [deepTitle(9)] }] }).map((b) => b.headingLevel), [6])
check('深层嵌套仍只产出叶子块', blocksFromLayout({ pdf_info: [{ para_blocks: [deepTitle(9)] }] }).length, 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
