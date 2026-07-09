import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ChartDatum } from '../types/contracts';

export interface DonutChartProps {
  data: ChartDatum[];
  height?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

/**
 * Donut chart for categorical distribution (e.g. project status, opportunity
 * stage). Wraps Recharts PieChart in donut mode (innerRadius=60, outerRadius=90)
 * with a 2° paddingAngle between slices for visual separation.
 *
 * Colors cycle through the `--chart-1..--chart-6` CSS variables unless an
 * explicit `colors` prop is provided.
 */
export default function DonutChart({
  data,
  height = 280,
  colors = DEFAULT_COLORS,
}: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          isAnimationActive
        >
          {data.map((entry, idx) => (
            <Cell key={entry.label} fill={colors[idx % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => Math.round(v).toLocaleString('zh-CN')} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}