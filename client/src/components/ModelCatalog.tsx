import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Card, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { getModelCatalog, type ModelCatalogRow } from '../api';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';

interface ModelCatalogProps {
  modelName: string;
}

export default function ModelCatalog({ modelName }: ModelCatalogProps) {
  const { message } = AntApp.useApp();
  const [catalog, setCatalog] = useState<{ columns: string[]; rows: ModelCatalogRow[]; rowCount: number; sourceFileName?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setLoading(true);
      try {
        const nextCatalog = await getModelCatalog(modelName);
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      } catch (error: any) {
        if (!cancelled) {
          setCatalog(null);
          message.error(error.response?.data?.error || error.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCatalog();
    return () => { cancelled = true; };
  }, [message, modelName]);

  const columns = useMemo<ColumnsType<ModelCatalogRow>>(() => (catalog?.columns || []).map((column) => ({
    title: column,
    key: column,
    dataIndex: ['values', column],
    ellipsis: true,
    render: (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value)),
  })), [catalog]);

  return (
    <Card
      title="Model Catalog"
      size="small"
      style={{ minHeight: '100%' }}
      extra={catalog ? <span style={{ color: '#64748b', fontSize: 12 }}>{catalog.rowCount} rows · {catalog.sourceFileName || 'No source file'}</span> : null}
    >
      {loading ? <Spin /> : null}
      {!loading && !catalog ? <div style={{ color: '#64748b' }}>No model catalog data available.</div> : null}
      {!loading && catalog ? (
        <Table
          rowKey={(_row, index) => `${modelName}-${index}`}
          dataSource={catalog.rows}
          columns={enhanceColumnsWithSortAndFilters(columns as any, catalog.rows)}
          size="small"
          pagination={{ pageSize: 25, showSizeChanger: true, position: ['topRight'] }}
          scroll={{ x: 'max-content' }}
        />
      ) : null}
    </Card>
  );
}