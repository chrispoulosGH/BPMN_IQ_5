import { useState } from 'react';
import { Select, Tag, Tooltip, Typography, Spin, Empty } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { CapabilityMatch } from '../types';

const { Text } = Typography;

interface Props {
  matches: CapabilityMatch[];
  loading: boolean;
  selected: CapabilityMatch[];
  onSelectionChange: (selected: CapabilityMatch[]) => void;
}

function confidenceColor(c: number) {
  if (c >= 80) return 'green';
  if (c >= 60) return 'blue';
  if (c >= 40) return 'orange';
  return 'default';
}

export default function CapabilityMatchPanel({ matches, loading, selected, onSelectionChange }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 gap-2">
        <Spin size="small" />
        <Text type="secondary" className="text-xs">Analysing process…</Text>
      </div>
    );
  }

  if (!matches.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Load a diagram to match capabilities" className="!my-2" />;
  }

  const selectedIds = new Set(selected.map((s) => s.capabilityId));

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        mode="multiple"
        placeholder="Select capabilities to save…"
        value={selected.map((s) => s.capabilityId)}
        onChange={(ids: number[]) => {
          const sel = ids.map((id) => matches.find((m) => m.capabilityId === id)!).filter(Boolean);
          onSelectionChange(sel);
        }}
        options={matches.map((m) => ({
          value: m.capabilityId,
          label: `${m.capabilityName} (${m.confidence}%)`,
        }))}
        className="w-full"
        size="small"
        maxTagCount={2}
        maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
      />
      {matches.map((m) => (
        <Tooltip key={m.capabilityId} title={m.justification} placement="left">
          <div
            className={`capability-match-item ${selectedIds.has(m.capabilityId) ? 'selected' : ''}`}
            onClick={() => {
              if (selectedIds.has(m.capabilityId)) {
                onSelectionChange(selected.filter((s) => s.capabilityId !== m.capabilityId));
              } else {
                onSelectionChange([...selected, m]);
              }
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {selectedIds.has(m.capabilityId) ? (
                <CheckCircleOutlined className="text-green-500 text-xs flex-shrink-0" />
              ) : (
                <ThunderboltOutlined className="text-gray-400 text-xs flex-shrink-0" />
              )}
              <Text ellipsis className="text-xs !leading-tight flex-1 min-w-0">
                {m.capabilityName}
              </Text>
            </div>
            <Tag color={confidenceColor(m.confidence)} className="!text-[10px] !px-1 !py-0 !m-0 !leading-4">
              {m.confidence}%
            </Tag>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
