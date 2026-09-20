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
import { slicePageRanges, sliceToRange, selectedPageCount, planParts, rangeForSlice } from '../src/lib/page-slices.ts'

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
// 层级由标题编号还原(不是嵌套深度): 「第三章 死锁」=1 级, 「3.1 …」=2 级
check('标题编号决定层级', [blocks[3].headingLevel, blocks[4].headingLevel], [1, 2])
check('无编号的文档标题保持 1 级', blocks[0].headingLevel, 1)
check('嵌套标题的页码', [blocks[3].pageNo, blocks[4].pageNo], [2, 2])
check('图片 caption 被收进来', blocks[5].text, '图 3-1 死锁的循环等待')
check('图片块类型保留', blocks[5].blockType, 'figure')

const toc = buildToc(blocks)
check('目录只含标题', toc.map((t) => t.title), ['操作系统原理与实现', '第三章 死锁', '3.1 必要条件'])
check('目录项的 level 与页码', toc.map((t) => [t.level, t.pageNo]), [[1, 1], [1, 2], [2, 2]])
check('目录项锚点就是块索引', toc.map((t) => t.blockIndex), [0, 3, 4])

// ── 标题编号 → 层级 (真实 MinerU 的 para_blocks 是平铺的, 只能靠编号还原) ──
const flatDoc = (titles) => ({
  pdf_info: [{
    para_blocks: titles.map((t, i) => ({
      type: 'title', bbox: [0, i * 30, 100, i * 30 + 20], lines: [{ spans: [{ content: t }] }],
    })),
  }],
})
const lvl = (arr) => blocksFromLayout(flatDoc(arr)).map((b) => b.headingLevel)

check('中文章节/小数点编号还原三层', lvl(['第一章 概述', '1.1 定义', '1.1.1 细节', '第二章 进程']), [1, 2, 3, 1])
check('纯数字编号还原层级', lvl(['1 引言', '1.1 背景', '2 方法']), [1, 2, 1])
check('中文括号编号算二级', lvl(['第一章 概述', '（一）背景']), [1, 2])
check('「一、」算二级', lvl(['第一章 概述', '一、背景']), [1, 2])
check('只有二级编号时归一化到 1 级起', lvl(['2.1 甲', '2.2 乙']), [1, 1])
check('完全没有编号时退化成平铺', lvl(['封面', '前言', '结语']), [1, 1, 1])
check('只有一个标题时不动层级', lvl(['第一章 概述']), [1])
check('编号层级封顶 6', lvl(['第一章 概述', '1.1.1.1.1.1.1.1 深']), [1, 6])

// ── 真实验证时抓到的形状: 标题与正文平级平铺, 块上带 level 但全是 2 ──
const realShape = {
  pdf_info: [{
    preproc_blocks: [],
    para_blocks: [
      { type: 'title', bbox: [24, 32, 182, 53], level: 2, lines: [{ spans: [{ content: '操作系统原理与实现', type: 'text' }] }] },
      { type: 'text', bbox: [23, 64, 586, 99], lines: [{ spans: [{ content: '本文用于验证。' }] }] },
      { type: 'title', bbox: [24, 118, 150, 135], level: 2, lines: [{ spans: [{ content: '第一章 操作系统概述' }] }] },
      { type: 'title', bbox: [25, 195, 131, 211], level: 2, lines: [{ spans: [{ content: '1.1 操作系统的定义' }] }] },
    ],
  }],
}
const realBlocks = blocksFromLayout(realShape)
check('真实形状: 4 个块', realBlocks.length, 4)
check('真实形状: 目录层级有层次', realBlocks.filter((b) => b.headingLevel > 0).map((b) => b.headingLevel), [1, 1, 2])
check('真实形状: 正文块 headingLevel=0', realBlocks[1].headingLevel, 0)
check('真实形状: 页码与 bbox 正常', [realBlocks[0].pageNo, realBlocks[0].bbox], [1, [24, 32, 182, 53]])

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

const mdBlocks = blocksFromMarkdown(markdown, [1, 2, 3])
check('轻量: 紧邻标题的正文不被并进标题', mdBlocks.length, 6)
check('轻量: markdown 标题被识别', mdBlocks.map((b) => b.headingLevel), [1, 0, 2, 0, 2, 0])
check('轻量: 标题文本去掉 #', mdBlocks[0].text, '第一章 操作系统概述')
check('轻量: 正文保留', mdBlocks[1].text, '操作系统是管理计算机硬件与软件资源的系统软件。')
check('轻量: 没有坐标', mdBlocks.map((b) => b.bbox), [null, null, null, null, null, null])
check('轻量: 页码覆盖 1..3 且不越界',
  [Math.min(...mdBlocks.map((b) => b.pageNo)), Math.max(...mdBlocks.map((b) => b.pageNo))], [1, 3])
check('轻量: 目录可建', buildToc(mdBlocks).map((t) => [t.level, t.title]), [[1, '第一章 操作系统概述'], [2, '1.1 操作系统的定义'], [2, '1.2 发展历程']])

check('有 layout 用 layout', blocksFromParse(JSON.stringify(layout), markdown, [1, 2, 3]).length, 7)
check('layout 解析不出块时退化', blocksFromParse(JSON.stringify({ pdf_info: [] }), markdown, [1, 2, 3]).length, 6)
check('无 layout 时退化', blocksFromParse(null, markdown, [1, 2, 3]).length, 6)
check('坏 JSON 不抛异常', blocksFromParse('{ not json', markdown, [1, 2, 3]).length, 6)

check('空 pdf_info 得空数组', blocksFromLayout({ pdf_info: [] }), [])
check('缺 bbox 的块被跳过', blocksFromLayout([{ type: 'text', text: '没有 bbox' }]), [])
check('空 markdown 得空数组', blocksFromMarkdown('', [1, 2, 3, 4, 5]), [])

// ── 分卷: 页码映射 (MinerU 传 page_ranges 时返回的是相对页码) ──
const twoPages = {
  pdf_info: [
    { para_blocks: [{ type: 'title', bbox: [0, 0, 10, 10], lines: [{ spans: [{ content: '第一页标题' }] }] }] },
    { para_blocks: [{ type: 'text', bbox: [0, 0, 10, 10], lines: [{ spans: [{ content: '第二页正文' }] }] }] },
  ],
}
check('不传页码映射时按 1..n', blocksFromLayout(twoPages).map((b) => b.pageNo), [1, 2])
check('整篇解析页码不变', blocksFromLayout(twoPages, [1, 2]).map((b) => b.pageNo), [1, 2])
// 第 2 卷: MinerU 返回相对 0,1, 映射到原文 201,202
check('第二卷页码偏移到原文页码', blocksFromLayout(twoPages, [201, 202]).map((b) => b.pageNo), [201, 202])
// 不连续页码范围 "1-30,50" 必须按映射表逐项对应; 固定偏移会把第 2 项错算成 31
check('不连续页码范围按映射逐项对应',
  blocksFromLayout(twoPages, [30, 50]).map((b) => b.pageNo), [30, 50])
check('分卷后目录页码也是原文页码',
  buildToc(blocksFromLayout(twoPages, [201, 202])).map((t) => t.pageNo), [201])
check('轻量路径也走页码映射', blocksFromMarkdown('甲\n\n乙', [201, 202]).map((b) => b.pageNo), [201, 202])

// ── 自动切卷 ──
check('295 页切成 2 卷(上界 199)', slicePageRanges(295).map(sliceToRange), ['1-199', '200-295'])
check('199 页整切 1 卷', slicePageRanges(199).map(sliceToRange), ['1-199'])
check('200 页切 2 卷(200 会被 MinerU 拒)', slicePageRanges(200).map(sliceToRange), ['1-199', '200-200'])
check('201 页切 2 卷', slicePageRanges(201).map(sliceToRange), ['1-199', '200-201'])
check('400 页切 3 卷(每卷都 <200)', slicePageRanges(400).map(sliceToRange), ['1-199', '200-398', '399-400'])
check('1 页切 1 卷', slicePageRanges(1).map(sliceToRange), ['1-1'])
check('选中页数: 空 = 全文', selectedPageCount(295, undefined), 295)
check('选中页数: 区间', selectedPageCount(295, '201-295'), 95)
check('选中页数: 不连续', selectedPageCount(295, '1-30,50'), 31)

// ── 每卷发给 MinerU 的页码范围 ──
// 回归: 曾把「从第 1 页开始且不超上限」当成「覆盖整篇」, 导致多卷的第一卷不传 range,
// MinerU 收到整本 295 页 → 报超过页数上限, 而错误标签还写着 1-199, 极具误导性。
const slices295 = planParts(295)
check('295 页计划 2 卷', slices295.map(sliceToRange), ['1-199', '200-295'])
check('多卷第一卷必须传 range —— 回归项', rangeForSlice(slices295, 0, 295), '1-199')
check('多卷第二卷必须传 range', rangeForSlice(slices295, 1, 295), '200-295')
check('单卷覆盖整篇时不传 range', rangeForSlice(planParts(195), 0, 195), undefined)
check('195 页单卷计划', planParts(195).map(sliceToRange), ['1-195'])
check('显式页码范围整段作为一卷', planParts(295, '10-60').map(sliceToRange), ['10-60'])
check('显式页码范围原样发给 MinerU',
  rangeForSlice(planParts(295, '10-60'), 0, 295, '10-60'), '10-60')
check('不连续的显式页码范围也原样发',
  rangeForSlice(planParts(295, '1-30,50'), 0, 295, '1-30,50'), '1-30,50')

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
