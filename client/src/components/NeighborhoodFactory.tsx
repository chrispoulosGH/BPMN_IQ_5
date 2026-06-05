import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, List, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Tooltip, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, FolderAddOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import {
  createFactoryNeighborhood,
  deleteCustomFactoryRow,
  getCustomFactories,
  getCustomFactory,
  getFactoryNeighborhoods,
  updateCustomFactoryRow,
  uploadCustomFactory,
  type CustomFactory,
  type CustomFactoryRow,
  type FactoryNeighborhoodSummary,
} from '../api';

interface NeighborhoodFactoryProps {
  canManageFactories: boolean;
  fixedNeighborhoodName?: string;
  onNeighborhoodsChanged?: () => void | Promise<void>;
  mode?: 'panel' | 'action';
}

interface FactoryRowViewState {
  searchColumn: string;
  searchText: string;
  statusFilter?: string;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function NeighborhoodFactory({ canManageFactories, fixedNeighborhoodName, onNeighborhoodsChanged, mode = 'panel' }: NeighborhoodFactoryProps) {
  const { message } = AntApp.useApp();
  const ALL_COLUMNS_OPTION = '__all__';
  const PRIMARY_KEY_COLUMN = 'name';
  const DEFAULT_NEIGHBORHOOD_NAME = 'AT&T Journey';
  const [neighborhoods, setNeighborhoods] = useState<FactoryNeighborhoodSummary[]>([]);
  const [factories, setFactories] = useState<CustomFactory[]>([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [selectedFactory, setSelectedFactory] = useState<CustomFactory | null>(null);
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingFactoryDetail, setLoadingFactoryDetail] = useState(false);
  const [showNeighborhoodModal, setShowNeighborhoodModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingRow, setEditingRow] = useState<CustomFactoryRow | null>(null);
  const [showRowModal, setShowRowModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
  const [rowSearchColumn, setRowSearchColumn] = useState<string>(ALL_COLUMNS_OPTION);
  const [rowSearchText, setRowSearchText] = useState('');
  const [rowStatusFilter, setRowStatusFilter] = useState<string | undefined>(undefined);
  const [factoryRowViewState, setFactoryRowViewState] = useState<Record<string, FactoryRowViewState>>({});
  const [neighborhoodForm] = Form.useForm();
  const [uploadForm] = Form.useForm();
  const [rowForm] = Form.useForm();
  const deferredRowSearchText = useDeferredValue(rowSearchText);

  const updateFactoryViewState = useCallback((factoryId: string, nextState: Partial<FactoryRowViewState>) => {
    setFactoryRowViewState((current) => ({
      ...current,
      [factoryId]: {
        searchColumn: current[factoryId]?.searchColumn || ALL_COLUMNS_OPTION,
        searchText: current[factoryId]?.searchText || '',
        statusFilter: current[factoryId]?.statusFilter,
        ...nextState,
      },
    }));
  }, [ALL_COLUMNS_OPTION]);

  const loadNeighborhoods = useCallback(async () => {
    setLoadingNeighborhoods(true);
    try {
      const data = await getFactoryNeighborhoods();
      setNeighborhoods(data);
      setSelectedNeighborhood((current) => {
        if (fixedNeighborhoodName && data.some((item) => item.name === fixedNeighborhoodName)) return fixedNeighborhoodName;
        if (current && data.some((item) => item.name === current)) return current;
        if (data.some((item) => item.name === DEFAULT_NEIGHBORHOOD_NAME)) return DEFAULT_NEIGHBORHOOD_NAME;
        return data[0]?.name ?? null;
      });
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setLoadingNeighborhoods(false);
    }
  }, [DEFAULT_NEIGHBORHOOD_NAME, fixedNeighborhoodName, message]);

  const loadFactories = useCallback(async (neighborhoodName: string) => {
    setLoadingFactories(true);
    try {
      const data = await getCustomFactories(neighborhoodName);
      setFactories(data);
      setSelectedFactoryId((current) => {
        if (current && data.some((factory) => factory._id === current)) return current;
        return data[0]?._id ?? null;
      });
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setLoadingFactories(false);
    }
  }, [message]);

  const loadFactoryDetail = useCallback(async (factoryId: string) => {
    setLoadingFactoryDetail(true);
    try {
      const data = await getCustomFactory(factoryId);
      setSelectedFactory(data);
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setLoadingFactoryDetail(false);
    }
  }, [message]);

  useEffect(() => {
    loadNeighborhoods();
  }, [loadNeighborhoods]);

  useEffect(() => {
    if (!fixedNeighborhoodName) return;
    setSelectedNeighborhood(fixedNeighborhoodName);
  }, [fixedNeighborhoodName]);

  useEffect(() => {
    if (mode !== 'panel') return;
    if (!selectedNeighborhood) {
      setFactories([]);
      setSelectedFactory(null);
      setSelectedFactoryId(null);
      return;
    }
    loadFactories(selectedNeighborhood);
  }, [loadFactories, mode, selectedNeighborhood]);

  useEffect(() => {
    if (mode !== 'panel') return;
    if (!selectedFactoryId) {
      setSelectedFactory(null);
      return;
    }
    loadFactoryDetail(selectedFactoryId);
  }, [loadFactoryDetail, mode, selectedFactoryId]);

  useEffect(() => {
    if (!selectedFactoryId) {
      setRowSearchColumn(ALL_COLUMNS_OPTION);
      setRowSearchText('');
      setRowStatusFilter(undefined);
      return;
    }

    const nextViewState = factoryRowViewState[selectedFactoryId];
    setRowSearchColumn(nextViewState?.searchColumn || ALL_COLUMNS_OPTION);
    setRowSearchText(nextViewState?.searchText || '');
    setRowStatusFilter(nextViewState?.statusFilter);
  }, [ALL_COLUMNS_OPTION, factoryRowViewState, selectedFactoryId]);

  const handleCreateNeighborhood = async (values: { name: string }) => {
    try {
      const created = await createFactoryNeighborhood(values.name);
      message.success(`Neighborhood created: ${created.name}`);
      setShowNeighborhoodModal(false);
      neighborhoodForm.resetFields();
      await loadNeighborhoods();
      if (!fixedNeighborhoodName) {
        setSelectedNeighborhood(created.name);
      }
      uploadForm.setFieldValue('neighborhoodName', created.name);
      await onNeighborhoodsChanged?.();
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    }
  };

  const handleUploadFactory = async (values: { neighborhoodName: string; factoryName: string }) => {
    if (!uploadFile) {
      message.error('Spreadsheet file is required');
      return;
    }
    setUploading(true);
    try {
      const neighborhoodName = fixedNeighborhoodName || values.neighborhoodName;
      const created = await uploadCustomFactory({ neighborhoodName, factoryName: values.factoryName, file: uploadFile });
      message.success(`Factory created: ${created.name}`);
      setShowUploadModal(false);
      uploadForm.resetFields();
      setUploadFile(null);
      await loadNeighborhoods();
      await onNeighborhoodsChanged?.();
      if (mode === 'panel' && (!fixedNeighborhoodName || created.neighborhoodName === fixedNeighborhoodName)) {
        setSelectedNeighborhood(created.neighborhoodName);
        await loadFactories(created.neighborhoodName);
        setSelectedFactoryId(created._id);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleEditRow = (row: CustomFactoryRow) => {
    if (!selectedFactory) return;
    setEditingRow(row);
    rowForm.setFieldsValue({
      owner: row.owner || '',
      state: row.state || 'staged',
      ...Object.fromEntries(selectedFactory.columns.map((column) => [column, row.values?.[column] ?? ''])),
    });
    setShowRowModal(true);
  };

  const handleSaveRow = async (values: Record<string, unknown>) => {
    if (!selectedFactory || !editingRow) return;
    setSavingRow(true);
    try {
      const nextFactory = await updateCustomFactoryRow(selectedFactory._id, editingRow._id, {
        owner: String(values.owner || ''),
        state: String(values.state || 'staged'),
        values: Object.fromEntries(selectedFactory.columns.map((column) => [column, values[column] ?? ''])),
      });
      setSelectedFactory(nextFactory);
      setFactories((current) => current.map((factory) => (factory._id === nextFactory._id ? nextFactory : factory)));
      setShowRowModal(false);
      setEditingRow(null);
      rowForm.resetFields();
      message.success('Factory row updated');
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setSavingRow(false);
    }
  };

  const handleDeleteRow = async (row: CustomFactoryRow) => {
    if (!selectedFactory) return;
    try {
      const nextFactory = await deleteCustomFactoryRow(selectedFactory._id, row._id);
      setSelectedFactory(nextFactory);
      setFactories((current) => current.map((factory) => (factory._id === nextFactory._id ? nextFactory : factory)));
      message.success('Factory row deleted');
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    }
  };

  const rowColumns: ColumnsType<CustomFactoryRow> = useMemo(() => {
    const dynamicColumns = (selectedFactory?.columns || []).map((column) => ({
      title: column,
      key: column,
      dataIndex: ['values', column],
      ellipsis: true,
      sorter: (left: CustomFactoryRow, right: CustomFactoryRow) => String(left.values?.[column] ?? '').localeCompare(String(right.values?.[column] ?? ''), undefined, { sensitivity: 'base', numeric: true }),
      render: (value: unknown) => displayValue(value),
    }));

    return [
      ...dynamicColumns,
      {
        title: 'Owner',
        key: 'owner',
        dataIndex: 'owner',
        width: 140,
        render: (value: string) => displayValue(value),
      },
      {
        title: 'Created',
        key: 'createdAt',
        dataIndex: 'createdAt',
        width: 130,
        render: (value: string) => (value ? new Date(value).toLocaleDateString() : '—'),
      },
      {
        title: 'Status',
        key: 'state',
        dataIndex: 'state',
        width: 110,
        render: (value: string) => <Tag color="blue">{value || 'staged'}</Tag>,
      },
      {
        title: '',
        key: 'actions',
        width: 90,
        render: (_value: unknown, row: CustomFactoryRow) => canManageFactories ? (
          <Space size="small">
            <Tooltip title="Edit row"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEditRow(row)} /></Tooltip>
            <Popconfirm title="Delete this row?" onConfirm={() => handleDeleteRow(row)} okText="Delete" okButtonProps={{ danger: true }}>
              <Tooltip title="Delete row"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </Space>
        ) : null,
      },
    ];
  }, [canManageFactories, selectedFactory]);

  const filteredRows = useMemo(() => {
    if (!selectedFactory) return [];

    const normalizedSearch = deferredRowSearchText.trim().toLowerCase();

    return selectedFactory.rows.filter((row) => {
      const matchesStatus = !rowStatusFilter || (row.state || 'staged') === rowStatusFilter;
      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;

      const columnsToSearch = rowSearchColumn === ALL_COLUMNS_OPTION
        ? selectedFactory.columns
        : [rowSearchColumn];

      return columnsToSearch.some((column) => String(row.values?.[column] ?? '').toLowerCase().includes(normalizedSearch));
    });
  }, [ALL_COLUMNS_OPTION, deferredRowSearchText, rowSearchColumn, rowStatusFilter, selectedFactory]);

  if (mode === 'action') {
    return (
      <>
        {canManageFactories ? (
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              uploadForm.setFieldsValue({ neighborhoodName: fixedNeighborhoodName || selectedNeighborhood || undefined, factoryName: '' });
              setShowUploadModal(true);
            }}
          >
            Add Factory
          </Button>
        ) : null}

        <Modal
          title="Create Factory from CSV"
          open={showUploadModal}
          onCancel={() => { setShowUploadModal(false); setUploadFile(null); }}
          onOk={() => uploadForm.submit()}
          okText={uploading ? 'Creating…' : 'Create'}
          confirmLoading={uploading}
        >
          <Form form={uploadForm} layout="vertical" onFinish={handleUploadFactory} className="mt-4">
            {fixedNeighborhoodName ? (
              <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
                Creating a factory in <strong>{fixedNeighborhoodName}</strong>
              </div>
            ) : (
              <Form.Item
                name="neighborhoodName"
                label={(
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span>Neighborhood</span>
                    {canManageFactories ? (
                      <Button size="small" type="link" icon={<FolderAddOutlined />} onClick={() => setShowNeighborhoodModal(true)}>
                        Create Neighborhood
                      </Button>
                    ) : null}
                  </div>
                )}
                rules={[{ required: true, message: 'Neighborhood is required' }]}
              >
                <Select
                  placeholder="Select an existing neighborhood"
                  options={neighborhoods.map((item) => ({ label: item.name, value: item.name }))}
                />
              </Form.Item>
            )}
            <Form.Item name="factoryName" label="Factory Name" rules={[{ required: true, message: 'Factory name is required' }]}>
              <Input autoFocus />
            </Form.Item>
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
              The CSV must include a unique <strong>{PRIMARY_KEY_COLUMN}</strong> column. That column is treated as the factory row primary key.
            </div>
            <Form.Item label="CSV File" required>
              <Upload.Dragger
                accept=".csv"
                maxCount={1}
                beforeUpload={(file) => {
                  setUploadFile(file);
                  return false;
                }}
                onRemove={() => {
                  setUploadFile(null);
                }}
                fileList={uploadFile ? [uploadFile as any] : []}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Upload a CSV file to create the factory and staged rows</p>
              </Upload.Dragger>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Create Neighborhood"
          open={showNeighborhoodModal}
          onCancel={() => setShowNeighborhoodModal(false)}
          onOk={() => neighborhoodForm.submit()}
          okText="Create"
        >
          <Form form={neighborhoodForm} layout="vertical" onFinish={handleCreateNeighborhood} className="mt-4">
            <Form.Item name="name" label="Neighborhood Name" rules={[{ required: true, message: 'Neighborhood name is required' }]}>
              <Input />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  return (
    <div className="flex h-full gap-3 p-3 min-h-0">
      <Card
        title={fixedNeighborhoodName ? `${fixedNeighborhoodName} Uploaded Factories` : 'Neighborhoods'}
        size="small"
        style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, height: '100%' }}
        extra={canManageFactories ? (
          <Space>
            <Button size="small" icon={<FolderAddOutlined />} onClick={() => setShowNeighborhoodModal(true)}>Neighborhood</Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => {
              uploadForm.setFieldsValue({ neighborhoodName: selectedNeighborhood || undefined });
              setShowUploadModal(true);
            }}>Factory</Button>
          </Space>
        ) : null}
      >
        {!fixedNeighborhoodName ? (
          <Select
            placeholder="Select a neighborhood"
            value={selectedNeighborhood || undefined}
            onChange={setSelectedNeighborhood}
            loading={loadingNeighborhoods}
            options={neighborhoods.map((neighborhood) => ({
              label: `${neighborhood.name} (${neighborhood.factoryCount})`,
              value: neighborhood.name,
            }))}
          />
        ) : (
          <div style={{ color: '#64748b', fontSize: 12 }}>
            Viewing uploaded factories for <strong>{fixedNeighborhoodName}</strong>
          </div>
        )}

        <div style={{ minHeight: 0, overflowY: 'auto' }}>
          <List
            loading={loadingFactories}
            dataSource={factories}
            locale={{ emptyText: selectedNeighborhood ? 'No factories in this neighborhood yet' : 'No neighborhoods available' }}
            renderItem={(factory) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  borderRadius: 8,
                  paddingInline: 12,
                  background: selectedFactoryId === factory._id ? '#eff6ff' : undefined,
                  border: selectedFactoryId === factory._id ? '1px solid #bfdbfe' : '1px solid transparent',
                  marginBottom: 8,
                }}
                onClick={() => setSelectedFactoryId(factory._id)}
              >
                <List.Item.Meta
                  title={<span style={{ fontWeight: 700 }}>{factory.name}</span>}
                  description={`${factory.rowCount} rows · ${factory.columns.length} spreadsheet columns`}
                />
              </List.Item>
            )}
          />
        </div>
      </Card>

      <Card
        title={selectedFactory ? `${selectedFactory.name} Factory` : 'Factory'}
        size="small"
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, height: '100%' }}
        extra={selectedFactory ? <span style={{ color: '#64748b', fontSize: 12 }}>{selectedFactory.neighborhoodName} · status defaults to staged</span> : null}
      >
        {!selectedFactory && (loadingFactories || loadingFactoryDetail) ? <Spin /> : null}

        {!selectedFactory && !(loadingFactories || loadingFactoryDetail) ? (
          <div style={{ color: '#64748b' }}>Select a factory to view spreadsheet-derived rows.</div>
        ) : null}

        {selectedFactory ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#64748b', fontSize: 12 }}>
              <span><strong>Owner:</strong> {selectedFactory.owner || '—'}</span>
              <span><strong>Created:</strong> {selectedFactory.createdAt ? new Date(selectedFactory.createdAt).toLocaleDateString() : '—'}</span>
              <span><strong>Spreadsheet:</strong> {selectedFactory.sourceFileName || '—'}</span>
            </div>

            <Space wrap>
              <Select
                value={rowSearchColumn}
                style={{ width: 220 }}
                onChange={(value) => {
                  setRowSearchColumn(value);
                  if (selectedFactory?._id) updateFactoryViewState(selectedFactory._id, { searchColumn: value });
                }}
                options={[
                  { label: 'All uploaded columns', value: ALL_COLUMNS_OPTION },
                  ...selectedFactory.columns.map((column) => ({ label: column, value: column })),
                ]}
              />
              <Input.Search
                allowClear
                placeholder="Search uploaded factory rows"
                style={{ width: 280 }}
                value={rowSearchText}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  startTransition(() => {
                    setRowSearchText(nextValue);
                    if (selectedFactory?._id) updateFactoryViewState(selectedFactory._id, { searchText: nextValue });
                  });
                }}
              />
              <Select
                allowClear
                placeholder="Filter by status"
                style={{ width: 180 }}
                value={rowStatusFilter}
                onChange={(value) => {
                  setRowStatusFilter(value);
                  if (selectedFactory?._id) updateFactoryViewState(selectedFactory._id, { statusFilter: value });
                }}
                options={[{ label: 'staged', value: 'staged' }]}
              />
              <Button onClick={() => {
                setRowSearchColumn(ALL_COLUMNS_OPTION);
                setRowSearchText('');
                setRowStatusFilter(undefined);
                if (selectedFactory?._id) {
                  updateFactoryViewState(selectedFactory._id, {
                    searchColumn: ALL_COLUMNS_OPTION,
                    searchText: '',
                    statusFilter: undefined,
                  });
                }
              }}>
                Clear Filters
              </Button>
              <span style={{ color: '#64748b', fontSize: 12 }}>
                Showing {filteredRows.length} of {selectedFactory.rows.length} rows
              </span>
            </Space>

            <Table
              rowKey="_id"
              dataSource={filteredRows}
              columns={rowColumns}
              size="small"
              pagination={{ pageSize: 25, showSizeChanger: true }}
              scroll={{ x: 'max-content', y: 'calc(100vh - 320px)' }}
            />
          </>
        ) : null}
      </Card>

      <Modal
        title="Create Neighborhood"
        open={showNeighborhoodModal}
        onCancel={() => setShowNeighborhoodModal(false)}
        onOk={() => neighborhoodForm.submit()}
        okText="Create"
      >
        <Form form={neighborhoodForm} layout="vertical" onFinish={handleCreateNeighborhood} className="mt-4">
          <Form.Item name="name" label="Neighborhood Name" rules={[{ required: true, message: 'Neighborhood name is required' }]}>
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create Factory from Spreadsheet"
        open={showUploadModal}
        onCancel={() => { setShowUploadModal(false); setUploadFile(null); }}
        onOk={() => uploadForm.submit()}
        okText={uploading ? 'Creating…' : 'Create'}
        confirmLoading={uploading}
      >
        <Form form={uploadForm} layout="vertical" onFinish={handleUploadFactory} className="mt-4">
          <Form.Item
            name="neighborhoodName"
            label={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>Neighborhood</span>
                {canManageFactories ? (
                  <Button size="small" type="link" icon={<FolderAddOutlined />} onClick={() => setShowNeighborhoodModal(true)}>
                    Create Neighborhood
                  </Button>
                ) : null}
              </div>
            )}
            rules={[{ required: true, message: 'Neighborhood is required' }]}
          >
            <Select
              placeholder="Select an existing neighborhood"
              options={neighborhoods.map((item) => ({ label: item.name, value: item.name }))}
            />
          </Form.Item>
          <Form.Item name="factoryName" label="Factory Name" rules={[{ required: true, message: 'Factory name is required' }]}>
            <Input />
          </Form.Item>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
            The spreadsheet must include a unique <strong>{PRIMARY_KEY_COLUMN}</strong> column. That column is treated as the factory row primary key.
          </div>
          <Form.Item label="Spreadsheet" required>
            <Upload.Dragger
              accept=".xlsx,.xls,.csv"
              maxCount={1}
              beforeUpload={(file) => {
                setUploadFile(file);
                return false;
              }}
              onRemove={() => {
                setUploadFile(null);
              }}
              fileList={uploadFile ? [uploadFile as any] : []}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Upload spreadsheet to create factory columns and staged rows</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Factory Row"
        open={showRowModal}
        onCancel={() => { setShowRowModal(false); setEditingRow(null); }}
        onOk={() => rowForm.submit()}
        okText={savingRow ? 'Saving…' : 'Save'}
        confirmLoading={savingRow}
        width={720}
      >
        <Form form={rowForm} layout="vertical" onFinish={handleSaveRow} className="mt-4">
          {(selectedFactory?.columns || []).map((column) => (
            <Form.Item
              key={column}
              name={column}
              label={column}
              rules={column === PRIMARY_KEY_COLUMN ? [{ required: true, whitespace: true, message: 'name is required' }] : undefined}
            >
              <Input />
            </Form.Item>
          ))}
          <Form.Item name="owner" label="Owner">
            <Input />
          </Form.Item>
          <Form.Item name="state" label="Status">
            <Select options={[{ label: 'staged', value: 'staged' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}