import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { Card, Select, Typography } from 'antd';
import { buildCostGroups } from '../utils/costGroups';

const { Text } = Typography;

const DEFAULT_VISIBLE_ROWS = 12;

const SERIES_COLORS = [
  '#4096ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb',
  '#08979c', '#d4380d',
];

interface CostGroupChartsProps {
  dataColumns?: string[];
  dataRows?: Array<{ values?: Record<string, unknown> } | Record<string, unknown>>;
}

function CostGroupCard({ group }: { group: ReturnType<typeof buildCostGroups>[number] }) {
  const allLabels = useMemo(() => group.rows.map((r) => r.label), [group.rows]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(() => allLabels.slice(0, DEFAULT_VISIBLE_ROWS));

  const visibleRows = useMemo(
    () => group.rows.filter((r) => selectedLabels.includes(r.label)),
    [group.rows, selectedLabels],
  );

  const hasYears = group.years.length > 0;

  return (
    <Card
      size="small"
      title={<span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>Cost Structure {group.groupId}</span>}
      style={{ minWidth: 0 }}
      styles={{ body: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 } }}
      extra={
        <Select
          mode="multiple"
          size="small"
          value={selectedLabels}
          onChange={setSelectedLabels}
          options={allLabels.map((label) => ({ value: label, label }))}
          style={{ minWidth: 260, maxWidth: 480 }}
          maxTagCount={3}
          placeholder="Select items to compare"
        />
      }
    >
      {!visibleRows.length ? (
        <Text style={{ fontSize: 12, color: '#9ca3af' }}>Select at least one item to compare.</Text>
      ) : (
        <>
          {hasYears && (
            <Plot
              data={visibleRows.map((row, idx) => ({
                type: 'scatter' as const,
                mode: 'lines+markers' as const,
                name: row.label,
                x: group.years,
                y: group.years.map((year) => row.byYear[year] ?? 0),
                line: { color: SERIES_COLORS[idx % SERIES_COLORS.length], width: 2 },
                marker: { size: 6 },
                hovertemplate: `<b>${row.label}</b><br>%{x}: %{y:,.0f}<extra></extra>`,
              }))}
              layout={{
                title: { text: 'Cost by year', font: { size: 12 } },
                margin: { t: 32, b: 36, l: 56, r: 12 },
                height: 300,
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                legend: { orientation: 'h', y: -0.2, font: { size: 10 } },
                xaxis: { title: { text: 'Year' }, dtick: 1 },
                yaxis: { title: { text: 'Cost' }, tickformat: ',.0f' },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
              useResizeHandler
            />
          )}

          <Plot
            data={group.metrics.map((metric, idx) => ({
              type: 'bar' as const,
              name: metric,
              x: visibleRows.map((r) => r.label),
              y: visibleRows.map((r) => r.byMetric[metric] ?? 0),
              marker: { color: SERIES_COLORS[idx % SERIES_COLORS.length] },
              hovertemplate: `<b>%{x}</b><br>${metric}: %{y:,.0f}<extra></extra>`,
            }))}
            layout={{
              title: { text: 'Cost by metric (totaled across years)', font: { size: 12 } },
              barmode: 'stack',
              margin: { t: 32, b: 70, l: 56, r: 12 },
              height: 300,
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              legend: { orientation: 'h', y: -0.35, font: { size: 10 } },
              xaxis: { tickangle: -35, automargin: true },
              yaxis: { title: { text: 'Cost' }, tickformat: ',.0f' },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
          />
        </>
      )}
    </Card>
  );
}

export default function CostGroupCharts({ dataColumns, dataRows }: CostGroupChartsProps) {
  const groups = useMemo(
    () => buildCostGroups(dataColumns || [], dataRows || []),
    [dataColumns, dataRows],
  );

  if (!groups.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((group) => (
        <CostGroupCard key={group.groupId} group={group} />
      ))}
    </div>
  );
}
