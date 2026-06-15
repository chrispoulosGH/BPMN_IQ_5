import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Card, Input, Select, Space, Spin, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';

import { getModelCatalog, type ModelCatalogRow } from '../api';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';

interface ModelCatalogProps {
  modelName: string;
  requestedSearch?: {
    text: string;
    column?: string;
    exact?: boolean;
    trigger: number;
  } | null;
}

export default function ModelCatalog({ modelName, requestedSearch = null }: ModelCatalogProps) {
  const { message } = AntApp.useApp();
  const ALL_COLUMNS_OPTION = '__all__';
  const SEARCH_SETTINGS_STORAGE_PREFIX = 'modelCatalogSearch:';
  const [catalog, setCatalog] = useState<{ columns: string[]; rows: ModelCatalogRow[]; rowCount: number; sourceFileName?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchColumn, setSearchColumn] = useState<string>(ALL_COLUMNS_OPTION);
  const [searchText, setSearchText] = useState('');
  const [exactSearch, setExactSearch] = useState(false);

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

  useEffect(() => {
    const storageKey = `${SEARCH_SETTINGS_STORAGE_PREFIX}${modelName}`;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        setSearchColumn(ALL_COLUMNS_OPTION);
        setSearchText('');
        setExactSearch(false);
        return;
      }
      const parsed = JSON.parse(raw) as { searchColumn?: string; searchText?: string; exactSearch?: boolean };
      setSearchColumn(parsed.searchColumn || ALL_COLUMNS_OPTION);
      setSearchText(String(parsed.searchText || ''));
      setExactSearch(Boolean(parsed.exactSearch));
    } catch {
      setSearchColumn(ALL_COLUMNS_OPTION);
      setSearchText('');
      setExactSearch(false);
    }
  }, [ALL_COLUMNS_OPTION, SEARCH_SETTINGS_STORAGE_PREFIX, modelName]);

  useEffect(() => {
    const storageKey = `${SEARCH_SETTINGS_STORAGE_PREFIX}${modelName}`;
    const payload = JSON.stringify({ searchColumn, searchText, exactSearch });
    window.sessionStorage.setItem(storageKey, payload);
  }, [SEARCH_SETTINGS_STORAGE_PREFIX, exactSearch, modelName, searchColumn, searchText]);

  useEffect(() => {
    if (!requestedSearch) return;
    setSearchColumn(requestedSearch.column || ALL_COLUMNS_OPTION);
    setSearchText(requestedSearch.text || '');
    setExactSearch(Boolean(requestedSearch.exact));
  }, [ALL_COLUMNS_OPTION, requestedSearch]);

  const columns = useMemo<ColumnsType<ModelCatalogRow>>(() => (catalog?.columns || []).map((column) => ({
    title: column,
    key: column,
    dataIndex: ['values', column],
    ellipsis: true,
    render: (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value)),
  })), [catalog]);

  const filteredRows = useMemo(() => {
    if (!catalog) return [];
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) return catalog.rows;

    const columnsToSearch = searchColumn === ALL_COLUMNS_OPTION
      ? catalog.columns
      : [searchColumn];

    return catalog.rows.filter((row) => columnsToSearch.some((column) => {
      const value = row?.values?.[column];
      const normalizedValue = String(value ?? '').toLowerCase().trim();
      return exactSearch ? normalizedValue === normalizedSearch : normalizedValue.includes(normalizedSearch);
    }));
  }, [ALL_COLUMNS_OPTION, catalog, exactSearch, searchColumn, searchText]);

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
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Select
              value={searchColumn}
              style={{ width: 220 }}
              onChange={setSearchColumn}
              options={[
                { label: 'All columns', value: ALL_COLUMNS_OPTION },
                ...catalog.columns.map((column) => ({ label: column, value: column })),
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search model catalog"
              style={{ width: 300 }}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Space size={6}>
              <Switch size="small" checked={exactSearch} onChange={setExactSearch} />
              <span style={{ color: '#64748b', fontSize: 12 }}>Exact</span>
            </Space>
            <span style={{ color: '#64748b', fontSize: 12 }}>
              Showing {filteredRows.length} of {catalog.rowCount} rows
            </span>
          </Space>

          <Table
            rowKey={(_row, index) => `${modelName}-${index}`}
            dataSource={filteredRows}
            columns={enhanceColumnsWithSortAndFilters(columns as any, filteredRows)}
            size="small"
            pagination={{ pageSize: 25, showSizeChanger: true, position: ['topRight'] }}
            scroll={{ x: 'max-content' }}
          />
        </>
      ) : null}
    </Card>
  );
}