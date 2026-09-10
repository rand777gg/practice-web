// 学习路线 draw.io 路线图: 由阶段生成可编辑的 mxGraph 数据, 以及一段数据是否
// 是 draw.io 能加载的 XML 的判断/归一化。渲染交给 embed.diagrams.net iframe。

export interface DrawioStage {
  id: string
  label: string
  sublabel?: string
}

export interface DrawioRouteInput {
  title: string
  stages: DrawioStage[]
}

/** draw.io 编辑器/viewer 的嵌入地址(protocol 走 postMessage) */
export const DRAWIO_EMBED_ORIGIN = 'https://embed.diagrams.net'

const NODE_W = 300
const NODE_H = 64
const NODE_GAP = 56
const PAGE_W = 1169
const FIRST_NODE_Y = 120
const NODE_X = Math.round(PAGE_W / 2 - NODE_W / 2)

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** mxCell 的 value 是属性, 换行用实体; draw.io 侧 html=1 会把 <br> 当换行渲染 */
function escapeValue(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;')
}

function stageCellValue(label: string, sublabel: string | undefined, index: number): string {
  const head = `${index + 1}. ${label || `阶段 ${index + 1}`}`
  return sublabel ? `${head}<br>${sublabel}` : head
}

/**
 * 生成一条竖排阶段链路: 标题 + 每阶段一个圆角节点 + 顺序箭头。
 * 只在路线尚无保存过的图时用作兜底/初始内容, 之后由管理员自由编辑。
 */
export function buildRouteDiagramXml({ title, stages }: DrawioRouteInput): string {
  const cells: string[] = [
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
  ]

  cells.push(
    `        <mxCell id="route-title" value="${escapeValue(title || '学习路线')}" ` +
      'style="text;html=1;align=center;verticalAlign=middle;fontSize=22;fontStyle=1;fontColor=#1f2d3d;" ' +
      'vertex="1" parent="1">\n' +
      `          <mxGeometry x="${NODE_X - 200}" y="40" width="${NODE_W + 400}" height="44" as="geometry" />\n` +
      '        </mxCell>',
  )

  stages.forEach((stage, i) => {
    const y = FIRST_NODE_Y + i * (NODE_H + NODE_GAP)
    cells.push(
      `        <mxCell id="${escapeValue(stageNodeId(stage.id))}" value="${escapeValue(
        stageCellValue(stage.label, stage.sublabel, i),
      )}" ` +
        'style="rounded=1;arcSize=14;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;strokeWidth=2;fontSize=14;fontColor=#1f2d3d;" ' +
        'vertex="1" parent="1">\n' +
        `          <mxGeometry x="${NODE_X}" y="${y}" width="${NODE_W}" height="${NODE_H}" as="geometry" />\n` +
        '        </mxCell>',
    )
    if (i > 0) {
      cells.push(
        `        <mxCell id="edge-${i}" ` +
          'style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;strokeColor=#6c8ebf;strokeWidth=2;endArrow=block;endFill=1;" ' +
          `edge="1" parent="1" source="${escapeValue(stageNodeId(stages[i - 1].id))}" target="${escapeValue(
            stageNodeId(stage.id),
          )}">\n` +
          '          <mxGeometry relative="1" as="geometry" />\n' +
          '        </mxCell>',
      )
    }
  })

  const pageHeight = Math.max(826, FIRST_NODE_Y + stages.length * (NODE_H + NODE_GAP) + 40)
  return [
    '<mxfile host="practice-web" agent="practice-web" type="device">',
    '  <diagram id="route-map" name="学习路线">',
    `    <mxGraphModel dx="1100" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${PAGE_W}" pageHeight="${pageHeight}" math="0" shadow="0">`,
    '      <root>',
    ...cells,
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
  ].join('\n')
}

/** 阶段节点的 mxCell id, 与生成时的规则一致(重新生成时保持 id 稳定) */
export function stageNodeId(stageId: string): string {
  return `stage-${stageId}`
}

/** 一段数据是否像 draw.io 图(XML 而非空/损坏内容) */
export function isDiagramXml(xml: string | null | undefined): boolean {
  if (!xml) return false
  const trimmed = xml.trim()
  if (!trimmed.startsWith('<')) return false
  return /<mxfile[\s>]|<mxGraphModel[\s>]|<diagram[\s>]/.test(trimmed)
}

/** 把裸 mxGraphModel/<diagram> 补成 <mxfile> 外壳; draw.io 两者都能吃, 但存库统一 */
export function wrapDiagramXml(xml: string): string {
  const trimmed = xml.trim()
  if (/^<mxfile[\s>]/.test(trimmed)) return trimmed
  if (/^<diagram[\s>]/.test(trimmed)) return `<mxfile>${trimmed}</mxfile>`
  return `<mxfile><diagram id="route-map" name="学习路线">${trimmed}</diagram></mxfile>`
}

/** 下载 .drawio 文件用的文件名 */
export function diagramFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, '').trim() || '学习路线'
  return `${base}.drawio`
}
