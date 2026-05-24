import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Select, Spin, Empty, Button } from 'antd';
import Plot from 'react-plotly.js';
import { getDashboardFlow3D } from '../api';

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
  const [data, setData] = useState<Flow3DData | null>(null);
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
    getDashboardFlow3D()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // Filter points to selected flows only
  const filteredPoints = useMemo(() => {
    if (!data || !selectedFlows.length) return [];
    return data.points.filter(p => selectedFlows.includes(p.businessFlow));
  }, [data, selectedFlows]);

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
    if (!data || !selectedFlows.length) return { vals: [] as number[], labels: [] as string[] };
    // Combine tasks from all selected flows
    const allTasks: string[] = [];
    for (const flow of selectedFlows) {
      const order = data.taskOrders[flow] || [];
      order.forEach((name, idx) => {
        if (!allTasks[idx] || allTasks[idx] === name) allTasks[idx] = name;
      });
    }
    // If only one flow, use its task order directly — reversed so first task = highest X position
    if (selectedFlows.length === 1) {
      const order = data.taskOrders[selectedFlows[0]] || [];
      const n = order.length;
      return { vals: order.map((_, i) => n - 1 - i), labels: order };
    }
    // For multiple flows, show numeric indices (reversed)
    const maxLen = Math.max(...selectedFlows.map(f => (data.taskOrders[f] || []).length));
    return {
      vals: Array.from({ length: maxLen }, (_, i) => maxLen - 1 - i),
      labels: Array.from({ length: maxLen }, (_, i) => `Step ${i + 1}`),
    };
  }, [data, selectedFlows]);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  if (!data) return <Empty description="Failed to load 3D data" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>Business Flows:</span>
        <Select
          mode="multiple"
          placeholder="Select business flows to visualize…"
          style={{ minWidth: 350, flex: 1, maxWidth: 600 }}
          size="small"
          value={selectedFlows}
          onChange={v => { setSelectedFlows(v); setCameraReset(0); }}
          options={data.businessFlows.map(f => ({ label: f, value: f }))}
          allowClear
          maxTagCount={3}
          showSearch
          filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        />
        <Button size="small" onClick={resetView} title="Reset to default view">⟳ Reset View</Button>
        <Button size="small" onClick={saveDefaultView} title="Save current view as default for this diagram selection">📌 Set Default View</Button>
      </div>

      {!selectedFlows.length ? (
        <Empty description="Select one or more business flows to see applications in 3D space" style={{ marginTop: 64 }} />
      ) : (
        <div style={{ flex: 1, minHeight: 500 }}>
          <Plot
            data={traces}
            layout={{
              autosize: true,
              uirevision: `${selectedFlows.join(',')}-${cameraReset}`,
              margin: { l: 0, r: 0, t: 0, b: 80 },
              scene: {
                xaxis: {
                  title: { text: 'Task (E2EUX)', font: { size: 14, color: '#52c41a' } },
                  tickvals: taskTickLabels.vals,
                  ticktext: taskTickLabels.labels,
                  tickangle: -45,
                  tickfont: { size: 11.5 },
                },
                yaxis: {
                  title: { text: 'Criticality', font: { size: 14, color: '#52c41a' } },
                  tickvals: CRITICALITY_LABELS.map((_, i) => i),
                  ticktext: CRITICALITY_LABELS,
                  tickfont: { size: 11.5 },
                },
                zaxis: {
                  title: { text: 'Lifecycle', font: { size: 14, color: '#52c41a' } },
                  tickvals: LIFECYCLE_LABELS.map((_, i) => i),
                  ticktext: LIFECYCLE_LABELS,
                  tickfont: { size: 11.5 },
                },
                camera: {
                  eye: defaultCamera,
                },
              },
              legend: { orientation: 'h', y: -0.05 },
              paper_bgcolor: 'transparent',
            }}
            config={{
              displayModeBar: false,
              scrollZoom: true,
            }}
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
