// Tree-shaken ECharts — imports only the components actually used.
// Reduces JS parse time by ~60% vs import * as echarts (full bundle).
import * as echarts from 'echarts/core'

// Chart types
import { BarChart } from 'echarts/charts'
import { LineChart } from 'echarts/charts'
import { PieChart } from 'echarts/charts'
import { ScatterChart } from 'echarts/charts'
import { HeatmapChart } from 'echarts/charts'
import { GraphChart } from 'echarts/charts'
import { SankeyChart } from 'echarts/charts'
import { GaugeChart } from 'echarts/charts'

// Components
import { GridComponent } from 'echarts/components'
import { LegendComponent } from 'echarts/components'
import { TooltipComponent } from 'echarts/components'
import { ToolboxComponent } from 'echarts/components'
import { DataZoomComponent } from 'echarts/components'
import { VisualMapComponent } from 'echarts/components'
import { CalendarComponent } from 'echarts/components'
import { TitleComponent } from 'echarts/components'
import { MarkLineComponent } from 'echarts/components'

// Renderer
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  GraphChart,
  SankeyChart,
  GaugeChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  ToolboxComponent,
  DataZoomComponent,
  VisualMapComponent,
  CalendarComponent,
  TitleComponent,
  MarkLineComponent,
  CanvasRenderer,
])

export default echarts
