import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Select, Spin, Empty, Button, Segmented } from 'antd';
import Plot from 'react-plotly.js';
import { getDashboardFlow3D, getDashboardFlowCost3D } from '../api';

type ChartMode = 'criticality' | 'cost';

interface Point3D {
  appName: string;
  businessCriticality: string;
  lifecycleStatus: string;
  task: string;
  businessFlow: string;
  taskOrder: number;
}

interface Flow3DData {
  businessFlows: string[];
  points: Point3D[];
  taskOrders: Record<string, string[]>;
}

interface CostPoint {
  businessFlow: string;
  task: string;
  taskOrder: number;
  year: number;
  totalCost: number;
  opCost: number;
  devCost: number;
}

interface FlowCost3DData {
  businessFlows: string[];
  points: CostPoint[];
  taskOrders: Record<string, string[]>;
}

// Y axis: Criticality from low (0) to high (5)
const CRITICALITY_LABELS = [
  'Deferrable',
  'Non-Essential',
  'Admin',
  'Business Operational',
  'Business Critical',
  'Mission Critical',
];

// Z axis: Lifecycle status
const LIFECYCLE_LABELS = [
  'Under Evaluation',
  'Build',
  'In Use',
  'Tracking',
  'In Maintenance',
  'Propose to Retire',
  'Funded to Retire',
];

function criticalityIndex(val: string): number {
  const v = (val || '').toLowerCase().replace(/_/g, ' ');
  if (v.includes('defer')) return 0;
  if (v.includes('non') && v.includes('essential')) return 1;
  if (v.includes('admin')) return 2;
  if (v.includes('operational')) return 3;
  if (v.includes('mission')) return 5;
  if (v.includes('business') && v.includes('critical')) return 4;
  if (v.includes('critical')) return 4;
  return 0; // Unknown/unclassified → lowest bucket
}

function lifecycleIndex(val: string): number {
  const v = (val || '').toLowerCase().replace(/_/g, ' ');
  if (v.includes('under') || v.includes('eval')) return 0;
  if (v.includes('build') || v.includes('phasing in')) return 1;
  if (v.includes('in use') || v.includes('active')) return 2;
  if (v.includes('track')) return 3;
  if (v.includes('maintenance') || v.includes('phasing out')) return 4;
  if (v.includes('propose') && v.includes('retire')) return 5;
  if (v.includes('funded') && v.includes('retire')) return 6;
  if (v.includes('end of life') || v.includes('retired')) return 6;
  return 0; // Unknown/unclassified → lowest bucket
}

const FLOW_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb',
  '#ff7a45', '#36cfc9', '#9254de', '#ffc53d', '#ff4d4f',
];

const HARDCODED_CAMERA = { x: -1.8, y: -1.8, z: 0.8 };

function cameraStorageKey(flows: string[]) {
  return `flow3d-camera-${[...flows].sort().join(',')}`;
}

export default function Flow3DChart() {
  const [mode, setMode] = useState<ChartMode>('criticality');
  const [data, setData] = useState<Flow3DData | null>(null);
  const [costData, setCostData] = useState<FlowCost3DData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [cameraReset, setCameraReset] = useState(0);
  const [defaultCamera, setDefaultCamera] = useState(HARDCODED_CAMERA);
  const liveCameraRef = useRef<{ x: number; y: number; z: number } | null>(null);

  // Load saved default camera for the current flow selection
  useEffect(() => {
    if (!selectedFlows.length) return;
    const saved = localStorage.getItem(cameraStorageKey(selectedFlows));
    if (saved) {
      try { setDefaultCamera(JSON.parse(saved)); } catch { setDefaultCamera(HARDCODED_CAMERA); }
    } else {
      setDefaultCamera(HARDCODED_CAMERA);
    }
  }, [selectedFlows]);

  const resetView = useCallback(() => setCameraReset(n => n + 1), []);

  const saveDefaultView = useCallback(() => {
    const cam = liveCameraRef.current ?? defaultCamera;
    localStorage.setItem(cameraStorageKey(selectedFlows), JSON.stringify(cam));
    setDefaultCamera(cam);
    // No reset needed — we're already at the current view
  }, [defaultCamera, selectedFlows]);

  const handleRelayout = useCallback((e: any) => {
    const cam = e['scene.camera'];
    if (cam?.eye) liveCameraRef.current = cam.eye; // ref: no re-render
  }, []);

  // Also capture camera from full figure on any update (more reliable for 3D)
  const handleUpdate = useCallback((figure: any) => {
    const eye = figure?.layout?.scene?.camera?.eye;
    if (eye) liveCameraRef.current = eye;
  }, []);

  useEffect(() => {
    setLoading(true);
    if (mode === 'criticality') {
      getDashboardFlow3D()
        .then(setData)
        .finally(() => setLoading(false));
    } else {
      getDashboardFlowCost3D()
        .then(setCostData)
        .finally(() => setLoading(false));
    }
  }, [mode]);

  // Active dataset switches by mode
  const activeData = mode === 'criticality' ? data : costData;

  // Filter points to selected flows only
  const filteredPoints = useMemo(() => {
    if (!data || !selectedFlows.length) return [];
    return data.points.filter(p => selectedFlows.includes(p.businessFlow));
  }, [data, selectedFlows]);

  // ── Cost traces ───────────────────────────────────────────
  const costTraces = useMemo(() => {
    if (mode !== 'cost' || !costData || !selectedFlows.length) return [];

    const plotTraces: any[] = [];

    // Two series definitions: operation cost (base) and development cost (stacked on top)
    const SERIES = [
      {
        key: 'opCost' as const,
        label: 'Operation Cost',
        color: '#58a6ff',       // blue
        lineColor: '#58a6ff',
        colorscale: [[0,'#1c2128'],[0.3,'#1d4ed8'],[1,'#58a6ff']] as [number,string][],
        stacked: false,
      },
      {
        key: 'devCost' as const,
        label: 'Development Cost',
        color: '#3fb950',       // green
        lineColor: '#3fb950',
        colorscale: [[0,'#1c2128'],[0.3,'#175c2e'],[1,'#3fb950']] as [number,string][],
        stacked: true,
      },
    ] as const;

    selectedFlows.forEach((flowName, flowIdx) => {
      const flowPoints = costData.points.filter(p => p.businessFlow === flowName);
      const taskOrder = costData.taskOrders[flowName] || [];
      if (!flowPoints.length) return;

      const taskCount = taskOrder.length || 1;
      const taskIndexMap: Record<string, number> = {};
      taskOrder.forEach((name, idx) => {
        taskIndexMap[name.toLowerCase().trim()] = taskCount - 1 - idx;
      });

      const shownLegendGroups = new Set<string>();

      SERIES.forEach((series) => {
        // Trend lines per task across years (lines only, no marker points)
        const taskGroups = new Map<string, typeof flowPoints>();
        flowPoints.forEach(p => {
          if (!taskGroups.has(p.task)) taskGroups.set(p.task, []);
          taskGroups.get(p.task)!.push(p);
        });

        for (const [, pts] of taskGroups) {
          if (pts.length < 2) continue;
          const sorted = [...pts].sort((a, b) => a.year - b.year);
          const lx = sorted.map(p => taskIndexMap[p.task.toLowerCase().trim()] ?? p.taskOrder);
          const ly = sorted.map(p => p.year);
          // For stacked devCost: line sits at opCost + devCost height; curtain bottom = opCost
          const lz = series.stacked
            ? sorted.map(p => p.opCost + p.devCost)
            : sorted.map(p => p[series.key]);
          const lzBottom = series.stacked
            ? sorted.map(p => p.opCost)
            : Array(sorted.length).fill(0);
          const n = sorted.length;

          const legendKey = selectedFlows.length > 1 ? `${flowName}—${series.label}` : series.label;
          const isFirstOfGroup = !shownLegendGroups.has(legendKey);
          if (isFirstOfGroup) shownLegendGroups.add(legendKey);

          // Line
          plotTraces.push({
            type: 'scatter3d',
            mode: 'lines',
            name: selectedFlows.length > 1
              ? `${flowName} — ${series.label}`
              : series.label,
            legendgroup: legendKey,
            showlegend: isFirstOfGroup,
            x: lx,
            y: ly,
            z: lz,
            hovertemplate: sorted.map(p =>
              `<b>${p.task}</b><br>Year: ${p.year}<br>${series.label}: $${(p[series.key] / 1_000_000).toFixed(2)}M<extra></extra>`
            ),
            line: { color: series.lineColor, width: 3 },
          });

          // Translucent curtain/plane between top line and bottom baseline
          const meshX = [...lx, ...lx];
          const meshY = [...ly, ...ly];
          const meshZ = [...lz, ...lzBottom];
          const fi: number[] = [], fj: number[] = [], fk: number[] = [];
          for (let s = 0; s < n - 1; s++) {
            // Two triangles per segment forming a quad
            fi.push(s,     s + 1);
            fj.push(s + 1, n + s + 1);
            fk.push(n + s, n + s);
          }
          plotTraces.push({
            type: 'mesh3d',
            x: meshX, y: meshY, z: meshZ,
            i: fi, j: fj, k: fk,
            color: series.lineColor,
            opacity: 0.18,
            showlegend: false,
            hoverinfo: 'skip',
            flatshading: true,
            lighting: { ambient: 1, diffuse: 0 },
            name: `${series.label} (plane)`,
          });
        }
      });
    });

    return plotTraces;
  }, [mode, costData, selectedFlows]);

  // Build Plotly traces
  const traces = useMemo(() => {
    if (!data || !selectedFlows.length) return [];

    const plotTraces: any[] = [];

    selectedFlows.forEach((flowName, flowIdx) => {
      const color = FLOW_COLORS[flowIdx % FLOW_COLORS.length];
      const flowPoints = filteredPoints.filter(p => p.businessFlow === flowName);
      const taskOrder = data.taskOrders[flowName] || [];

      if (!flowPoints.length) return;

      // Build task name → execution index lookup (reversed so first task = highest X = appears on LEFT)
      const taskCount = taskOrder.length || 1;
      const taskIndexMap: Record<string, number> = {};
      taskOrder.forEach((name, idx) => {
        taskIndexMap[name.toLowerCase().trim()] = taskCount - 1 - idx;
      });

      // X = reversed task execution index, Y = criticality, Z = lifecycle
      const x = flowPoints.map(p => taskIndexMap[p.task.toLowerCase().trim()] ?? p.taskOrder);
      const y = flowPoints.map(p => criticalityIndex(p.businessCriticality));
      const z = flowPoints.map(p => lifecycleIndex(p.lifecycleStatus));
      // Full application name as label
      const labelText = flowPoints.map(p => p.appName);
      const hoverTemplate = flowPoints.map(p =>
        `<b>${p.appName}</b><br>Task: ${p.task}<br>Criticality: ${p.businessCriticality}<br>Lifecycle: ${p.lifecycleStatus}<extra></extra>`
      );

      plotTraces.push({
        type: 'scatter3d',
        mode: 'markers+text',
        name: flowName,
        x,
        y,
        z,
        text: labelText,
        hovertemplate: hoverTemplate,
        textposition: 'top center',
        textfont: { size: 12, color: '#1890ff' },
        marker: {
          size: 5,
          color,
          opacity: 0.85,
        },
      });

      // Draw filled polygon + outline connecting apps within each task (same X, vary Y/Z)
      const taskGroups = new Map<string, typeof flowPoints>();
      flowPoints.forEach(p => {
        const key = p.task;
        if (!taskGroups.has(key)) taskGroups.set(key, []);
        taskGroups.get(key)!.push(p);
      });

      for (const [, pts] of taskGroups) {
        if (pts.length < 2) continue;
        const xVal = taskIndexMap[pts[0].task.toLowerCase().trim()] ?? pts[0].taskOrder;
        const ys = pts.map(p => criticalityIndex(p.businessCriticality));
        const zs = pts.map(p => lifecycleIndex(p.lifecycleStatus));

        // Sort by angle around centroid in YZ plane
        const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
        const cz = zs.reduce((a, b) => a + b, 0) / zs.length;
        const indices = ys.map((_, i) => i).sort((a, b) =>
          Math.atan2(zs[a] - cz, ys[a] - cy) - Math.atan2(zs[b] - cz, ys[b] - cy)
        );
        const sortedY = indices.map(i => ys[i]);
        const sortedZ = indices.map(i => zs[i]);
        const lineX = sortedY.map(() => xVal);

        // Filled polygon using mesh3d (fan triangulation from vertex 0)
        if (pts.length >= 3) {
          const triI: number[] = [], triJ: number[] = [], triK: number[] = [];
          for (let t = 1; t < sortedY.length - 1; t++) {
            triI.push(0); triJ.push(t); triK.push(t + 1);
          }
          plotTraces.push({
            type: 'mesh3d',
            name: `${flowName} (fill)`,
            showlegend: false,
            x: lineX,
            y: sortedY,
            z: sortedZ,
            i: triI,
            j: triJ,
            k: triK,
            color: '#1890ff',
            opacity: 0.18,
            hoverinfo: 'skip',
          });
        }

        // Outline (closed loop)
        plotTraces.push({
          type: 'scatter3d',
          mode: 'lines',
          name: `${flowName} (task outline)`,
          showlegend: false,
          x: [...lineX, xVal],
          y: [...sortedY, sortedY[0]],
          z: [...sortedZ, sortedZ[0]],
          hoverinfo: 'skip',
          line: { color, width: 2, dash: 'dot' },
        });
      }
    });

    return plotTraces;
  }, [data, selectedFlows, filteredPoints]);

  // Compute X-axis tick labels (task names in execution order for the first selected flow)
  const taskTickLabels = useMemo(() => {
    const src = mode === 'cost' ? costData : data;
    if (!src || !selectedFlows.length) return { vals: [] as number[], labels: [] as string[] };
    if (selectedFlows.length === 1) {
      const order = src.taskOrders[selectedFlows[0]] || [];
      const n = order.length;
      return { vals: order.map((_, i) => n - 1 - i), labels: order };
    }
    const maxLen = Math.max(...selectedFlows.map(f => (src.taskOrders[f] || []).length));
    return {
      vals: Array.from({ length: maxLen }, (_, i) => maxLen - 1 - i),
      labels: Array.from({ length: maxLen }, (_, i) => `Step ${i + 1}`),
    };
  }, [mode, data, costData, selectedFlows]);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  if (mode === 'criticality' && !data) return <Empty description="Failed to load 3D data" />;
  if (mode === 'cost' && !costData) return <Empty description="Failed to load cost data" />;

  const activeFlows = (activeData?.businessFlows ?? []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented
          size="small"
          value={mode}
          onChange={v => { setMode(v as ChartMode); setSelectedFlows([]); setCameraReset(0); }}
          options={[
            { label: 'Lifecycle Criticality by Business Flow', value: 'criticality' },
            { label: 'Cost by Business Flow', value: 'cost' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>Business Flows:</span>
        <Select
          mode="multiple"
          placeholder="Select business flows to visualize…"
          style={{ minWidth: 350, flex: 1, maxWidth: 600 }}
          size="small"
          value={selectedFlows}
          onChange={v => { setSelectedFlows(v); setCameraReset(0); }}
          options={activeFlows.map(f => ({ label: f, value: f }))}
          allowClear
          maxTagCount={3}
          showSearch
          filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        />
        <Button size="small" onClick={resetView} title="Reset to default view">⟳ Reset View</Button>
        <Button size="small" onClick={saveDefaultView} title="Save current view as default for this diagram selection">📌 Set Default View</Button>
      </div>

      {!selectedFlows.length ? (
        <Empty description="Select one or more business flows to see data in 3D space" style={{ marginTop: 64 }} />
      ) : (
        <div style={{ flex: 1, minHeight: 500 }}>
          <Plot
            data={mode === 'cost' ? costTraces : traces}
            layout={{
              autosize: true,
              uirevision: `${mode}-${selectedFlows.join(',')}-${cameraReset}`,
              title: {
                text: selectedFlows.join(' | '),
                font: { size: 38, color: '#ffffff', family: 'Arial Black, sans-serif' },
                x: 0.5,
                xanchor: 'center',
                y: 0.98,
                yanchor: 'top',
              },
              margin: { l: 0, r: 0, t: 60, b: 80 },
              scene: {
                aspectmode: 'manual',
                aspectratio: { x: 3, y: 1, z: 1 },
                xaxis: {
                  title: { text: 'Task (E2EUX)', font: { size: 14, color: '#52c41a' } },
                  tickvals: taskTickLabels.vals,
                  ticktext: taskTickLabels.labels,
                  tickangle: -45,
                  tickfont: { size: 11.5 },
                },
                yaxis: mode === 'cost'
                  ? { title: { text: 'Year', font: { size: 14, color: '#58a6ff' } }, tickfont: { size: 11.5 }, autorange: 'reversed' }
                  : {
                      title: { text: 'Criticality', font: { size: 14, color: '#52c41a' } },
                      tickvals: CRITICALITY_LABELS.map((_, i) => i),
                      ticktext: CRITICALITY_LABELS,
                      tickfont: { size: 11.5 },
                    },
                zaxis: mode === 'cost'
                  ? { title: { text: 'Cost ($)', font: { size: 14, color: '#58a6ff' } }, tickfont: { size: 11.5 } }
                  : {
                      title: { text: 'Lifecycle', font: { size: 14, color: '#52c41a' } },
                      tickvals: LIFECYCLE_LABELS.map((_, i) => i),
                      ticktext: LIFECYCLE_LABELS,
                      tickfont: { size: 11.5 },
                    },
                camera: { eye: defaultCamera },
              },
              legend: mode === 'cost'
                ? { orientation: 'v', x: 1, xanchor: 'right', y: 1, yanchor: 'top', bgcolor: 'rgba(22,27,34,0.75)', bordercolor: '#444', borderwidth: 1, font: { size: 11, color: '#e6edf3' } }
                : { orientation: 'h', y: -0.05 },
              showlegend: mode === 'cost',
              paper_bgcolor: 'transparent',
            }}
            config={{ displayModeBar: false, scrollZoom: true }}
            onRelayout={handleRelayout}
            onUpdate={handleUpdate}
            useResizeHandler
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  );
}
