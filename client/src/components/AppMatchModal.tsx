import { useState, useMemo } from 'react';
import { Modal, Checkbox, Table, Tag, Typography } from 'antd';
import { compareTwoStrings } from 'string-similarity';

const { Text } = Typography;

export interface AppMatchResult {
  /** Original application name from the diagram */
  original: string;
  /** Best matching reference application name (null if no good match) */
  refMatch: string | null;
  /** Similarity score 0-1 */
  score: number;
  /** Whether this was an exact match */
  exact: boolean;
}

interface AppMatchModalProps {
  open: boolean;
  matches: AppMatchResult[];
  title?: string;
  onApprove: (approved: AppMatchResult[]) => void;
  onClose: () => void;
}

const FUZZY_THRESHOLD = 0.4;

/**
 * Given a list of application names from a diagram and the canonical reference list,
 * returns match results with fuzzy scoring.
 */
export function computeAppMatches(
  diagramApps: string[],
  referenceApps: string[],
): AppMatchResult[] {
  if (!diagramApps.length || !referenceApps.length) return [];

  const refLower = referenceApps.map((r) => r.toLowerCase().trim());
  const results: AppMatchResult[] = [];

  for (const app of diagramApps) {
    const appLower = app.toLowerCase().trim();
    // Check exact match first
    const exactIdx = refLower.indexOf(appLower);
    if (exactIdx >= 0) {
      results.push({ original: app, refMatch: referenceApps[exactIdx], score: 1, exact: true });
      continue;
    }
    // Fuzzy match
    let bestScore = 0;
    let bestRef: string | null = null;
    for (let i = 0; i < referenceApps.length; i++) {
      const score = compareTwoStrings(appLower, refLower[i]);
      if (score > bestScore) {
        bestScore = score;
        bestRef = referenceApps[i];
      }
    }
    if (bestScore >= FUZZY_THRESHOLD && bestRef) {
      results.push({ original: app, refMatch: bestRef, score: bestScore, exact: false });
    } else {
      results.push({ original: app, refMatch: null, score: bestScore, exact: false });
    }
  }

  return results;
}

export default function AppMatchModal({ open, matches, title, onApprove, onClose }: AppMatchModalProps) {
  // Track which rows are checked (pre-select all that have a match)
  const [checked, setChecked] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    matches.forEach((m, i) => {
      if (m.refMatch) initial.add(i);
    });
    return initial;
  });

  // Reset checked when matches change
  useMemo(() => {
    const initial = new Set<number>();
    matches.forEach((m, i) => {
      if (m.refMatch) initial.add(i);
    });
    setChecked(initial);
  }, [matches]);

  const toggle = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleOk = () => {
    const approved = matches.filter((_, i) => checked.has(i) && matches[i].refMatch);
    onApprove(approved);
  };

  const exactCount = matches.filter((m) => m.exact).length;
  const fuzzyCount = matches.filter((m) => !m.exact && m.refMatch).length;
  const unmatchedCount = matches.filter((m) => !m.refMatch).length;

  const columns = [
    {
      title: '',
      dataIndex: 'check',
      width: 40,
      render: (_: any, _record: any, idx: number) => (
        <Checkbox
          checked={checked.has(idx)}
          onChange={() => toggle(idx)}
          disabled={!matches[idx].refMatch}
        />
      ),
    },
    {
      title: 'Diagram Application',
      dataIndex: 'original',
      render: (text: string) => <Text>{text}</Text>,
    },
    {
      title: 'Reference Match',
      dataIndex: 'refMatch',
      render: (text: string | null, record: AppMatchResult) => {
        if (!text) return <Tag color="red">No match</Tag>;
        if (record.exact) return <Tag color="green">{text}</Tag>;
        return <Tag color="orange">{text}</Tag>;
      },
    },
    {
      title: 'Score',
      dataIndex: 'score',
      width: 80,
      render: (score: number, record: AppMatchResult) => {
        if (record.exact) return <Tag color="green">Exact</Tag>;
        if (!record.refMatch) return <Tag color="red">—</Tag>;
        return <Tag color="orange">{Math.round(score * 100)}%</Tag>;
      },
    },
  ];

  return (
    <Modal
      title={title || "Application Name Matching"}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="Apply Selected"
      width={700}
      destroyOnClose
    >
      <div className="mb-3 text-sm text-gray-500">
        Matching diagram applications against the reference list.
        Checked entries will replace the original names with the canonical reference names.
      </div>
      <div className="mb-2 flex gap-2">
        <Tag color="green">{exactCount} exact</Tag>
        <Tag color="orange">{fuzzyCount} fuzzy</Tag>
        <Tag color="red">{unmatchedCount} unmatched</Tag>
      </div>
      <Table
        dataSource={matches.map((m, i) => ({ ...m, key: i }))}
        columns={columns}
        pagination={false}
        size="small"
        scroll={{ y: 400 }}
      />
    </Modal>
  );
}
