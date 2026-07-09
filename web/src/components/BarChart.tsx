import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartDatum } from '../types/contracts';

export interface BarChartProps {
  data: ChartDatum[];
  height?: number;
  /** Single fill color (used when `colors` is not supplied). */
  color?: string;
  /**
   * When provided, each bar takes its own color from this array
   * (cycled by index). Useful for SLA buckets (red/orange/green).
   */
  colors?: string[];
  layout?: 'vertical' | 'horizontal';
}

const DEFAULT_COLOR = 'var(--chart-1)';

/**
 * Bar chart for value comparisons. Default layout is `horizontal` so long
 * Chinese labels render along the Y axis without truncation.
 *
 * Pass `colors` (array) to give each bar its own color — otherwise all bars
 * use `color` (defaults to `--chart-1`).
 */
export default function BarChart({
  data,
  height = 280,
  color = DEFAULT_COLOR,
  colors,
  layout = 'horizontal',
}: BarChartProps) {
  const isVertical = layout === 'vertical';

  // For horizontal layout: X = numeric value, Y = category label.
  // For vertical layout:   X = category label, Y = numeric value.
  const valueAxis = isVertical ? (
    <YAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
  ) : (
    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
  );
  const categoryAxis = isVertical ? (
    <XAxis type="category" dataKey="label" tick={{ fontSize: 12 }} />
  ) : (
    <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} />
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        {categoryAxis}
        {valueAxis}
        <Tooltip formatter={(v: number) => Math.round(v).toLocaleString('zh-CN')} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" name="数量" fill={color} isAnimationActive>
          {data.map((entry, idx) => {
            const fill = colors ? colors[idx % colors.length] : color;
            return <Cell key={entry.label} fill={fill} />;
          })}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}