import { Tag, Tooltip, Typography, Spin, Empty, Alert } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined, CloseOutlined } from '@ant-design/icons';
import type { CapabilityMatch } from '../types';

const { Text } = Typography;

interface Props {
  matches: CapabilityMatch[];
  loading: boolean;
  selected: CapabilityMatch[];
  onSelectionChange: (selected: CapabilityMatch[]) => void;
  onCapabilityClick?: (capability: CapabilityMatch, nextSelected: CapabilityMatch[]) => void;
  onDelete?: (capabilityId: number) => void;
  error?: string | null;
  savedCaps?: CapabilityMatch[];
}

function confidenceColor(c: number) {
  if (c >= 80) return 'green';
  if (c >= 60) return 'blue';
  if (c >= 40) return 'orange';
  return 'default';
}

export default function CapabilityMatchPanel({ matches, loading, selected, onSelectionChange, onCapabilityClick, onDelete, error, savedCaps = [] }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 gap-2">
        <Spin size="small" />
        <Text type="secondary" className="text-xs">Analysing process…</Text>
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message="Match Failed" description={error} showIcon className="!text-xs" />;
  }

  if (!matches.length && !selected.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Load a diagram and click Match" className="!my-2" />;
  }

  // Show assigned capabilities when no fresh matches
  if (!matches.length && selected.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <Text type="secondary" className="text-xs">Assigned Capabilities:</Text>
        {selected.map((cap) => (
          <div key={cap.capabilityId} className="capability-match-item selected">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircleOutlined className="text-green-500 text-xs flex-shrink-0" />
              <Tooltip title={cap.capabilityName} placement="topLeft">
                <Text
                  ellipsis
                  className="text-xs !leading-tight flex-1 min-w-0 cursor-pointer"
                  onClick={() => onCapabilityClick?.(cap, selected)}
                >
                  {cap.capabilityName}
                </Text>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1">
              <Tag color={confidenceColor(cap.confidence)} className="!text-[10px] !px-1 !py-0 !m-0 !leading-4">
                {cap.confidence}%
              </Tag>
              <CloseOutlined
                className="text-red-400 hover:text-red-600 text-xs cursor-pointer"
                onClick={() => onDelete ? onDelete(cap.capabilityId) : onSelectionChange(selected.filter((s) => s.capabilityId !== cap.capabilityId))}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const selectedIds = new Set(selected.map((s) => s.capabilityId));
  const savedIds = new Set(savedCaps.map((s) => s.capabilityId));
  const top5 = [...matches].sort((a, b) => b.confidence - a.confidence).slice(0, 5);

  return (
    <div className="flex flex-col gap-1.5">
      {top5.map((m) => {
        const isSelected = selectedIds.has(m.capabilityId);
        const isSaved = savedIds.has(m.capabilityId);
        return (
          <Tooltip key={m.capabilityId} title={m.justification} placement="left">
            <div
              className={`capability-match-item ${isSelected ? 'selected' : 'cursor-pointer'}`}
              onClick={() => {
                const nextSelected = isSelected ? selected : [...selected, m];
                if (!isSelected) onSelectionChange(nextSelected);
                onCapabilityClick?.(m, nextSelected);
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isSelected ? (
                  <CheckCircleOutlined className="text-green-500 text-xs flex-shrink-0" />
                ) : (
                  <ThunderboltOutlined className="text-gray-400 text-xs flex-shrink-0" />
                )}
                <Tooltip title={m.capabilityName} placement="topLeft">
                  <Text ellipsis className="text-xs !leading-tight flex-1 min-w-0">
                    {m.capabilityName}
                  </Text>
                </Tooltip>
                {isSaved && (
                  <Tag color="purple" className="!text-[10px] !px-1 !py-0 !m-0 !leading-4">assigned</Tag>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tag color={confidenceColor(m.confidence)} className="!text-[10px] !px-1 !py-0 !m-0 !leading-4">
                  {m.confidence}%
                </Tag>
                {isSelected && (
                  <CloseOutlined
                    className="text-red-400 hover:text-red-600 text-xs cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); isSaved && onDelete ? onDelete(m.capabilityId) : onSelectionChange(selected.filter((s) => s.capabilityId !== m.capabilityId)); }}
                  />
                )}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
