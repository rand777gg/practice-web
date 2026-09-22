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
import { blocksFromLayout, blocksFromMarkdown, blocksFromParse, buildToc, imagesInMarkdown, layoutPageCount } from '../src/lib/resource-blocks.ts'
import { slicePageRanges, sliceToRange, selectedPageCount, planParts, rangeForSlice } from '../src/lib/page-slices.ts'
import {
  CATEGORY_ID_META, CONTENT_LIST_TYPES, CONTENT_LIST_V2_TYPES, FURNITURE_TYPES, MIDDLE_TYPES, TYPE_TABLES,
  isFurnitureType, typeLabel, typeTone,
} from '../src/lib/mineru-types.ts'

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

// ── 批量解析的页数校验 ──
// 多卷共用同一个 PDF URL 时, 如果服务端按 URL 命中缓存把整篇发回来, 页码映射会整体错位却
// 不报错(目录和 PDF 定位会指到别的页), 靠 layoutPageCount > 本卷页数 来发现。
const layoutOf = (n) => JSON.stringify({ pdf_info: Array.from({ length: n }, () => ({ para_blocks: [] })) })
check('layout 页数: 按 pdf_info 长度', layoutPageCount(layoutOf(199)), 199)
check('layout 页数: 整篇返回会被认出来', layoutPageCount(layoutOf(295)) > 96, true)
check('layout 页数: content_list 按 page_idx 去重', layoutPageCount(JSON.stringify([
  { page_idx: 0, category: 'text', bbox: [0, 0, 1, 1], text: 'a' },
  { page_idx: 0, category: 'text', bbox: [0, 0, 1, 1], text: 'b' },
  { page_idx: 1, category: 'text', bbox: [0, 0, 1, 1], text: 'c' },
])), 2)
check('layout 页数: 坏 JSON 当校验不了(0)', layoutPageCount('{oops'), 0)
check('layout 页数: 没有 json 当校验不了(0)', layoutPageCount(undefined), 0)

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

// ── 图片与表格 ──
// 图片块以前因为"自己没文字"被整块丢弃, 这就是图片一张都看不到的原因; 表格 HTML 以前
// 只当纯文本塞进 text, 逐段视图里就成了一行挤在一起的字。

const IMG_MD = [
  '# 第一章',
  '',
  '正文。',
  '',
  '![](images/a1.jpg)',
  '',
  '图 1-1 钻颅术',
  '',
  '![](images/b2.jpg)',
  '',
  '![](images/a1.jpg)',
].join('\n')

check('按出现顺序取图片路径', imagesInMarkdown(IMG_MD), ['images/a1.jpg', 'images/b2.jpg'])

// layout.json 的图片块长这样: 外层 image 容器 + image_body(空) + image_caption 子块
function figBlock(caption) {
  return {
    type: 'image',
    bbox: [72, 200, 520, 400],
    blocks: [
      { type: 'image_body', bbox: [72, 200, 520, 380], lines: [{ spans: [] }] },
      ...(caption ? [{ type: 'image_caption', bbox: [72, 382, 520, 398], lines: [{ spans: [{ content: caption }] }] }] : []),
    ],
  }
}
const figDoc = {
  pdf_info: [{
    para_blocks: [
      { type: 'text', bbox: [72, 60, 520, 90], lines: [{ spans: [{ content: '正文。' }] }] },
      figBlock('图 1-1 钻颅术'),
      figBlock(''),
      {
        type: 'table',
        bbox: [72, 410, 520, 520],
        blocks: [
          { type: 'table_caption', bbox: [72, 402, 520, 410], lines: [{ spans: [{ content: '表 1-1' }] }] },
          { type: 'table_body', bbox: [72, 412, 520, 520], lines: [{ spans: [{ content: '<table><tr><td>甲</td><td>乙</td></tr></table>' }] }] },
        ],
      },
    ],
  }],
}
const figUrls = { 'images/a1.jpg': 'https://r2/a1.jpg', 'images/b2.jpg': 'https://r2/b2.jpg' }
const figBlocks = blocksFromLayout(figDoc, [5], { markdown: IMG_MD, imageUrls: figUrls })

check('图片块不再被丢掉(含无图注的)', figBlocks.map((b) => b.blockType), ['text', 'image', 'image', 'table'])
check('图片块数量', figBlocks.filter((b) => b.blockType === 'image').length, 2)
check('图注成为图片块的文字', figBlocks[1].text, '图 1-1 钻颅术')
check('图片按顺序对齐到 R2 地址', [figBlocks[1].imageUrl, figBlocks[2].imageUrl], ['https://r2/a1.jpg', 'https://r2/b2.jpg'])
check('无图注的图片块文本为空但不丢', figBlocks[2].text, '')
check('表格 HTML 被留住', figBlocks[3].tableHtml, '<table><tr><td>甲</td><td>乙</td></tr></table>')

// 线上就是这么建的块: 解析流程先上传图片、把 markdown 里的引用改写成 R2 地址, 再建块。
// 所以建块时队列里已经是绝对地址, 再按相对路径查 imageUrls 必然查不到 —— 曾经整篇的图片块
// image_url 全是 NULL, 图在 R2 上却只剩一句图注。
const R2_A1 = 'https://r2-rpw.example.com/resources/doc/parts/0/images/a1.jpg'
const R2_B2 = 'https://r2-rpw.example.com/resources/doc/parts/0/images/b2.jpg'
const REWRITTEN_MD = IMG_MD.replaceAll('images/a1.jpg', R2_A1).replaceAll('images/b2.jpg', R2_B2)
check('markdown 已改写时队列里是绝对地址', imagesInMarkdown(REWRITTEN_MD), [R2_A1, R2_B2])
const rewrittenBlocks = blocksFromLayout(figDoc, [5], { markdown: REWRITTEN_MD, imageUrls: figUrls })
check('markdown 已改写成 R2 地址, 图片块照样拿到地址', [rewrittenBlocks[1].imageUrl, rewrittenBlocks[2].imageUrl], [R2_A1, R2_B2])
const mdFallback = blocksFromMarkdown(`正文。\n\n![](${R2_A1})`, [1], figUrls)
check('轻量兜底路径同理(独立图片直接用绝对地址)', mdFallback[1].imageUrl, R2_A1)
check('表格仍保留纯文本(检索用)', figBlocks[3].text, '表 1-1 <table><tr><td>甲</td><td>乙</td></tr></table>')
check('带脚本的表格 HTML 不要', blocksFromLayout({
  pdf_info: [{ para_blocks: [{ type: 'table', bbox: [1, 2, 3, 4], blocks: [{ type: 'table_body', lines: [{ spans: [{ content: '<table><script>x()</script></table>' }] }] }] }] }],
})[0].tableHtml, null)
check('图片块没有地址时也留着(降级成图注)', blocksFromLayout(figDoc, [5], { markdown: '# 无图' })[1].imageUrl, null)
check('图片块不吃掉后面的兄弟块', blocksFromLayout(figDoc, [5], { markdown: IMG_MD, imageUrls: figUrls }).length, 4)

// 轻量兜底路径: 独立成段的图片要成为图片块, 行内图片不动
const mdImgBlocks = blocksFromMarkdown('正文。\n\n![](images/c3.jpg)\n\n还有 ![行内](images/d4.jpg) 收尾。', [1], figUrls)
check('轻量路径: 独立图片成块', mdImgBlocks.map((b) => b.blockType), ['text', 'image', 'text'])
check('轻量路径: 图片地址对齐', mdImgBlocks[1].imageUrl, null)
check('轻量路径: 行内图片留在正文里', mdImgBlocks[2].text.includes('![行内](images/d4.jpg)'), true)

// ══════════════════════════════════════════════════════════════════════════════
// 全类型覆盖 —— MinerU 的 type 取值按文件分成四套, 每套都过一遍, 一个都不许漏
//   middle.json=BlockType / content_list.json=ContentType / content_list_v2.json=ContentTypeV2 / model.json=category_id
// ══════════════════════════════════════════════════════════════════════════════

const spans = (content) => [{ spans: [{ content }] }]

const MIDDLE_ALL = {
  pdf_info: [{
    para_blocks: [
      // 容器: 内容是"内容 + 标题 + 脚注"三个子块
      { type: 'image', bbox: [0, 100, 500, 260], blocks: [
        { type: 'image_body', bbox: [0, 100, 500, 220], lines: [{ spans: [] }] },
        { type: 'image_caption', bbox: [0, 225, 500, 240], lines: spans('图 1 图片标题') },
        { type: 'image_footnote', bbox: [0, 245, 500, 258], lines: spans('图片脚注') },
      ] },
      { type: 'table', bbox: [0, 270, 500, 360], blocks: [
        { type: 'table_body', bbox: [0, 270, 500, 330], lines: spans('<table><tr><td>单元</td></tr></table>') },
        { type: 'table_caption', bbox: [0, 332, 500, 346], lines: spans('表 1 表格标题') },
        { type: 'table_footnote', bbox: [0, 348, 500, 358], lines: spans('表格脚注') },
      ] },
      // 代码语言挂在 code 容器上, 成块的是子块
      { type: 'code', guess_lang: 'python', bbox: [0, 370, 500, 450], blocks: [
        { type: 'code_caption', bbox: [0, 370, 500, 384], lines: spans('代码标题') },
        { type: 'code_body', bbox: [0, 386, 500, 448], lines: spans('print("hi")') },
      ] },
      // 没有子块的 code 也成块, 语言照样带着
      { type: 'code', guess_lang: 'java', bbox: [0, 452, 500, 470], lines: spans('class A {}') },
      { type: 'title', bbox: [0, 480, 500, 500], lines: spans('标题一') },
      { type: 'text', bbox: [0, 505, 500, 530], lines: spans('正文一') },
      { type: 'list', bbox: [0, 535, 500, 560], lines: spans('列表一') },
      { type: 'index', bbox: [0, 565, 500, 590], lines: spans('目录项一') },
      { type: 'interline_equation', bbox: [0, 595, 500, 620], lines: spans('E = mc^2') },
      { type: 'algorithm', bbox: [0, 625, 500, 660], lines: spans('算法伪码') },
      { type: 'image_body', bbox: [0, 665, 500, 680], lines: spans('单独出现的图片内容') },
      { type: 'table_body', bbox: [0, 685, 500, 700], lines: spans('<table><tr><td>单独</td></tr></table>') },
      { type: 'image_caption', bbox: [0, 705, 500, 720], lines: spans('单独出现的图片标题') },
      { type: 'table_caption', bbox: [0, 725, 500, 740], lines: spans('单独出现的表格标题') },
      { type: 'image_footnote', bbox: [0, 745, 500, 760], lines: spans('单独出现的图片脚注') },
      { type: 'table_footnote', bbox: [0, 765, 500, 780], lines: spans('单独出现的表格脚注') },
      { type: 'ref_text', bbox: [0, 785, 500, 810], lines: spans('[1] 参考文献一') },
      { type: 'discarded', bbox: [0, 815, 500, 830], lines: spans('被丢弃的块') },
      { type: 'phonetic', bbox: [0, 835, 500, 850], lines: spans('zhù yīn') },
      { type: 'header', bbox: [0, 855, 500, 870], lines: spans('页眉(正文列里的)') },
      { type: 'footer', bbox: [0, 875, 500, 890], lines: spans('页脚(正文列里的)') },
      { type: 'page_number', bbox: [0, 895, 500, 910], lines: spans('12') },
      { type: 'aside_text', bbox: [0, 915, 500, 930], lines: spans('边注一') },
      { type: 'page_footnote', bbox: [0, 935, 500, 950], lines: spans('脚注一') },
    ],
    discarded_blocks: [
      { type: 'header', bbox: [0, 10, 500, 30], lines: spans('第 1 章 页眉(另给)') },
      { type: 'aside_text', bbox: [0, 40, 500, 60], lines: spans('边注(另给)') },
      { type: 'text', bbox: [0, 65, 500, 80], lines: spans('不该进来的水印文字') },
      { type: 'title', bbox: [0, 82, 500, 95], lines: spans('不该进来的假标题') },
      { type: 'page_footnote', bbox: [0, 955, 500, 975], lines: spans('脚注(另给)') },
      { type: 'page_number', bbox: [0, 978, 500, 995], lines: spans('13') },
    ],
  }],
}

const midBlocks = blocksFromLayout(MIDDLE_ALL)
check('middle: 25 个 BlockType 取值全部成块', [...new Set(midBlocks.map((b) => b.blockType))].sort(), Object.keys(MIDDLE_TYPES).sort())
check('middle: 页眉按纵坐标插回本页页首', [midBlocks[0].blockType, midBlocks[0].text], ['header', '第 1 章 页眉(另给)'])
check('middle: 页脚排在正文之后', midBlocks.findIndex((b) => b.text === '脚注(另给)') > midBlocks.findIndex((b) => b.text === '正文一'), true)
check('middle: discarded 里的 text/title 不收(MinerU 已判定不该抽取)', midBlocks.filter((b) => b.text.includes('不该进来的')).length, 0)
check('middle: 代码语言从容器带到子块', midBlocks.find((b) => b.blockType === 'code_body')?.codeLanguage, 'python')
check('middle: 没有子块的代码块也带语言', midBlocks.find((b) => b.blockType === 'code')?.codeLanguage, 'java')
const midTable = midBlocks.find((b) => b.blockType === 'table')
check('middle: 表格 HTML 留着', midTable.tableHtml.startsWith('<table>'), true)
check('middle: 表格题注与脚注都并进 text', [midTable.text.includes('表 1 表格标题'), midTable.text.includes('表格脚注')], [true, true])
check('middle: 图片容器把标题跟脚注一起收上来', midBlocks.find((b) => b.blockType === 'image')?.text, '图 1 图片标题 图片脚注')
check('middle: 块序号连续唯一', midBlocks.map((b) => b.blockIndex), midBlocks.map((_, i) => i))

// ② content_list.json (v1): 标题也是 text, 靠 text_level 区分 —— 这正是"同一概念不同模型取值不同"的例子
const CL1_ALL = [
  { type: 'text', text: '正文段', page_idx: 0, bbox: [0, 10, 100, 20] },
  { type: 'text', text: '一级标题', text_level: 1, page_idx: 0, bbox: [0, 30, 100, 40] },
  { type: 'image', img_path: 'images/a.jpg', img_caption: [{ content: '图注' }], page_idx: 0, bbox: [0, 50, 100, 60] },
  { type: 'table', table_body: '<table><tr><td>存</td></tr></table>', table_caption: [{ content: '表注' }], page_idx: 0, bbox: [0, 70, 100, 80] },
  { type: 'equation', text: 'a^2+b^2=c^2', text_format: 'latex', page_idx: 0, bbox: [0, 90, 100, 100] },
  { type: 'interline_equation', text: 'E=mc^2', page_idx: 0, bbox: [0, 110, 100, 120] },
  { type: 'inline_equation', text: 'x_i', page_idx: 0, bbox: [0, 130, 100, 140] },
  { type: 'code', text: 'printf("hi");', page_idx: 0, bbox: [0, 150, 100, 160] },
]
const cl1 = blocksFromLayout(CL1_ALL)
check('content_list v1: 7 个 ContentType 取值全部成块', [...new Set(cl1.map((b) => b.blockType))].sort(), Object.keys(CONTENT_LIST_TYPES).sort())
check('content_list v1: 标题是 text + text_level, 标签仍是正文', [cl1[1].blockType, cl1[1].headingLevel, typeLabel(cl1[1].blockType)], ['text', 1, '正文'])
check('content_list v1: 公式类型进 KaTeX(class = equation)', cl1[4].blockType, 'equation')
check('content_list v1: 表格 HTML 与图注都在', [cl1[3].tableHtml.startsWith('<table>'), cl1[2].text], [true, '图注'])

// ③ content_list_v2.json: type + content 结构, 块级/span 级各是一套取值
const v2page = (type, content, y) => ({ type, content, page_idx: 0, bbox: [0, y, 100, y + 8] })
const CL2_ALL = [
  v2page('title', { title_content: [{ type: 'text', content: '第一章' }], level: 1 }, 10),
  v2page('paragraph', { paragraph_content: [{ type: 'text', content: '正文段落' }, { type: 'equation_inline', content: 'x^2' }] }, 20),
  v2page('text', { paragraph_content: [{ type: 'text', content: '裸 span 也是正文' }] }, 30),
  v2page('md', { paragraph_content: [{ type: 'md', content: '| a | b |' }] }, 40),
  v2page('image', { image_source: { path: 'images/v2.jpg' }, image_caption: [{ type: 'text', content: 'v2 图注' }], image_footnote: [] }, 50),
  v2page('table', { html: '<table><tr><td>复</td></tr></table>', table_type: 'complex_table', table_caption: [{ type: 'text', content: 'v2 表注' }], table_footnote: [] }, 60),
  v2page('simple_table', { html: '<table><tr><td>简</td></tr></table>' }, 70),
  v2page('complex_table', { html: '<table><tr><td>杂</td></tr></table>' }, 80),
  v2page('equation_interline', { math_content: 'E=mc^2', math_type: 'latex', image_source: { path: 'images/eq.jpg' } }, 90),
  v2page('equation_inline', { math_content: 'a_i' }, 100),
  v2page('list', { list_type: 'text_list', list_items: [{ item_type: 'text', item_content: [{ type: 'text', content: '条目一' }] }] }, 110),
  v2page('text_list', { list_items: [{ item_type: 'text', item_content: [{ type: 'text', content: '条目二' }] }] }, 120),
  v2page('reference_list', { list_items: [{ item_type: 'text', item_content: [{ type: 'text', content: '[1] 条目三' }] }] }, 130),
  v2page('code', { code_content: [{ type: 'text', content: 'print(1)' }], code_caption: [{ type: 'text', content: 'v2 代码标题' }], code_language: 'python' }, 140),
  v2page('code_inline', { paragraph_content: [{ type: 'code_inline', content: 'x = 1' }] }, 150),
  v2page('algorithm', { algorithm_content: [{ type: 'text', content: 'while true' }], algorithm_caption: [] }, 160),
  v2page('phonetic', { paragraph_content: [{ type: 'phonetic', content: 'pīn yīn' }] }, 170),
  v2page('page_header', { page_header_content: [{ type: 'text', content: 'v2 页眉' }] }, 180),
  v2page('page_footer', { page_footer_content: [{ type: 'text', content: 'v2 页脚' }] }, 190),
  v2page('page_number', { page_number_content: [{ type: 'text', content: '7' }] }, 200),
  v2page('page_aside_text', { page_aside_text_content: [{ type: 'text', content: 'v2 边注' }] }, 210),
  v2page('page_footnote', { page_footnote_content: [{ type: 'text', content: 'v2 脚注' }] }, 220),
]
const cl2 = blocksFromLayout(CL2_ALL)
check('content_list v2: 22 个 ContentTypeV2 取值全部成块', [...new Set(cl2.map((b) => b.blockType))].sort(), Object.keys(CONTENT_LIST_V2_TYPES).sort())
check('content_list v2: 正文从 content 里取出来(含行内公式)', cl2.find((b) => b.blockType === 'paragraph')?.text, '正文段落 x^2')
check('content_list v2: 标题层级来自 content.level', [cl2[0].blockType, cl2[0].headingLevel, typeLabel(cl2[0].blockType)], ['title', 1, '标题'])
check('content_list v2: 行间公式取 math_content', cl2.find((b) => b.blockType === 'equation_interline')?.text, 'E=mc^2')
const v2Table = cl2.find((b) => b.blockType === 'table')
check('content_list v2: 表格 HTML 取 content.html, 类型不当正文', [v2Table.tableHtml.startsWith('<table>'), v2Table.text.includes('html'), v2Table.text], [true, false, 'v2 表注'])
const v2Code = cl2.find((b) => b.blockType === 'code')
check('content_list v2: 代码语言与内容', [v2Code.codeLanguage, v2Code.text], ['python', 'print(1)'])
check('content_list v2: 列表条目收进一条块', cl2.find((b) => b.blockType === 'list')?.text, '条目一')
check('content_list v2: 图片地址直接用产物里的相对路径', cl2.find((b) => b.blockType === 'image')?.imageUrl, null)

// ④ model.json: 类型是数字 category_id, 框是 poly(8 个坐标)
const det = (category_id, y, extra = {}) => ({ category_id, poly: [0, y, 100, y, 100, y + 10, 0, y + 10], ...extra })
const MODEL_ALL = {
  pdf_info: [{
    layout_dets: [
      det(0, 10, { text: '模型标题' }),
      det(1, 20, { text: '模型正文' }),
      det(2, 30, { text: '模型丢弃' }),
      det(3, 40, { text: '模型图片' }),
      det(4, 50, { text: '模型图片标题' }),
      det(5, 60, { html: '<table><tr><td>模</td></tr></table>' }),
      det(6, 70, { text: '模型表格标题' }),
      det(7, 80, { text: '模型表格脚注' }),
      det(8, 90, { latex: 'E=mc^2' }),
      det(9, 100, { latex: '(1)' }),
      det(13, 110, { latex: 'x^2' }),
      det(14, 120, { latex: 'a+b' }),
      det(15, 130, { text: 'OCR 出来的正文' }),
      det(16, 140, { text: '低置信正文' }),
      det(101, 150, { text: '模型图片脚注' }),
    ],
  }],
}
const modelBlocks = blocksFromLayout(MODEL_ALL)
check('model.json: 15 个 category_id 全部映射成名字', [...new Set(modelBlocks.map((b) => b.blockType))].sort(), Object.values(CATEGORY_ID_META).map((m) => m.name).sort())
check('model.json: 框从 poly 还原成 bbox', modelBlocks[0].bbox, [0, 10, 100, 20])
check('model.json: 公式取 latex, 表格取 html', [
  modelBlocks.find((b) => b.blockType === 'interline_equation')?.text,
  modelBlocks.find((b) => b.blockType === 'table')?.tableHtml,
], ['E=mc^2', '<table><tr><td>模</td></tr></table>'])

// ⑤ 标签: 四套表里每个取值都要有对应的中文名, 而且是"哪套取值就是哪个名字"
const badLabels = []
for (const [source, table] of Object.entries(TYPE_TABLES)) {
  for (const [value, meta] of Object.entries(table)) {
    const label = typeLabel(value, source)
    if (label !== meta.zh) badLabels.push(`${source}.${value} → ${label}`)
    if (!meta.zh || meta.zh === value) badLabels.push(`${source}.${value} 没有中文名`)
  }
}
check('四套 type 表每个取值都有中文标签', badLabels, [])
check('同一概念在不同模型里的取值名字不同, 标签一致', [
  typeLabel('table_caption', 'middle'), typeLabel('table_caption', 'model'),
  typeLabel('ref_text', 'middle'), typeLabel('reference_list', 'content_list_v2'),
  typeLabel('footer', 'middle'), typeLabel('page_footer', 'content_list_v2'),
  typeLabel('interline_equation', 'middle'), typeLabel('equation', 'content_list'), typeLabel('equation_interline', 'content_list_v2'),
], ['表格标题', '表格标题', '参考文献', '参考文献', '页脚', '页脚', '行间公式', '行间公式', '行间公式'])
check('不给来源也认得出(库里只存了 block_type)', [typeLabel('page_footer'), typeLabel('paragraph'), typeLabel('ref_text')], ['页脚', '正文', '参考文献'])
check('线上出现过的 chart 有中文名', typeLabel('chart'), '图表')
check('认不出来的类型原样显示, 不编名字', typeLabel('brand_new_type'), 'brand_new_type')
check('页面装饰标记', [
  'header', 'footer', 'page_number', 'aside_text', 'page_footnote', 'phonetic', 'discarded',
  'page_header', 'page_footer', 'page_number', 'page_aside_text', 'page_footnote', 'abandon', 'low_score_text',
].map(isFurnitureType), new Array(14).fill(true))
check('参考文献/图表题注/代码不算页面装饰', ['ref_text', 'table_caption', 'code_body', 'image'].map(isFurnitureType), [false, false, false, false])
check('FURNITURE_TYPES 覆盖四套来源', FURNITURE_TYPES, [
  'abandon', 'aside_text', 'discarded', 'footer', 'header', 'low_score_text',
  'page_aside_text', 'page_footer', 'page_footnote', 'page_header', 'page_number', 'phonetic',
])
check('配色按类型分组', [typeTone('title'), typeTone('table_caption'), typeTone('code_body'), typeTone('page_footer'), typeTone('brand_new_type')], ['title', 'caption', 'code', 'furniture', 'unknown'])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
