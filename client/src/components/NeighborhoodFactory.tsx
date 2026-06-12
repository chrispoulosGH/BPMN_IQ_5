import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, List, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Tooltip, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, ExclamationCircleOutlined, FolderAddOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';

import {
  createFactoryNeighborhood,
  deleteFactoryNeighborhood,
  deleteCustomFactory,
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
  fixedFactoryId?: string;
  hideFactoryList?: boolean;
  onNeighborhoodsChanged?: () => void | Promise<void>;
  onNeighborhoodCreated?: (name: string) => void;
  onFactoryDeleted?: (factoryId: string, neighborhoodName: string) => void | Promise<void>;
  onNeighborhoodDeleted?: (name: string) => void | Promise<void>;
  showCreateNeighborhood?: boolean;
  showAddFactory?: boolean;
  showDeleteNeighborhood?: boolean;
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

export default function NeighborhoodFactory({ canManageFactories, fixedNeighborhoodName, fixedFactoryId, hideFactoryList = false, onNeighborhoodsChanged, onNeighborhoodCreated, onFactoryDeleted, onNeighborhoodDeleted, showCreateNeighborhood = true, showAddFactory = true, showDeleteNeighborhood = true, mode = 'panel' }: NeighborhoodFactoryProps) {
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
  const [neighborhoodDraftName, setNeighborhoodDraftName] = useState('');
  const [neighborhoodUploadFile, setNeighborhoodUploadFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingNeighborhood, setCreatingNeighborhood] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
  const [rowSearchColumn, setRowSearchColumn] = useState<string>(ALL_COLUMNS_OPTION);
  const [rowSearchText, setRowSearchText] = useState('');
  const [rowStatusFilter, setRowStatusFilter] = useState<string | undefined>(undefined);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [factoryRowViewState, setFactoryRowViewState] = useState<Record<string, FactoryRowViewState>>({});
  const [uploadForm] = Form.useForm();
  const [rowForm] = Form.useForm();
  const deferredRowSearchText = useDeferredValue(rowSearchText);
  const canSubmitNeighborhood = neighborhoodDraftName.trim().length > 0 && Boolean(neighborhoodUploadFile);

  const openNeighborhoodModal = useCallback(() => {
    setNeighborhoodDraftName('');
    setNeighborhoodUploadFile(null);
    setShowNeighborhoodModal(true);
  }, []);

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
        if (fixedFactoryId && data.some((factory) => factory._id === fixedFactoryId)) return fixedFactoryId;
        if (current && data.some((factory) => factory._id === current)) return current;
        return data[0]?._id ?? null;
      });
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setLoadingFactories(false);
    }
  }, [fixedFactoryId, message]);

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
    if (mode !== 'panel' || !fixedFactoryId) return;
    setSelectedFactoryId(fixedFactoryId);
  }, [fixedFactoryId, mode]);

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

  const handleCreateNeighborhood = async () => {
    const name = neighborhoodDraftName.trim();
    if (!name) {
      message.error('Model name is required before upload');
      return;
    }
    if (!neighborhoodUploadFile) {
      message.error('Model CSV file is required');
      return;
    }
    setCreatingNeighborhood(true);
    try {
      const created = await createFactoryNeighborhood({ name, file: neighborhoodUploadFile });
      message.success(`Model created: ${created.name}`);
      setShowNeighborhoodModal(false);
      setNeighborhoodDraftName('');
      setNeighborhoodUploadFile(null);
      await loadNeighborhoods();
      if (!fixedNeighborhoodName) {
        setSelectedNeighborhood(created.name);
      }
      await onNeighborhoodsChanged?.();
      onNeighborhoodCreated?.(created.name);
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setCreatingNeighborhood(false);
    }
  };

  const handleUploadFactory = async (values: { neighborhoodName: string }) => {
    if (!uploadFile) {
      message.error('Spreadsheet file is required');
      return;
    }
    setUploading(true);
    try {
      const neighborhoodName = fixedNeighborhoodName || values.neighborhoodName;
      const result = await uploadCustomFactory({ neighborhoodName, file: uploadFile });
      const uploadedFactories = result.factories || [];
      message.success(uploadedFactories.length === 1
        ? `Component uploaded: ${uploadedFactories[0].name}`
        : `Components uploaded: ${uploadedFactories.length}`);
      setShowUploadModal(false);
      uploadForm.resetFields();
      setUploadFile(null);
      await loadNeighborhoods();
      await onNeighborhoodsChanged?.();
      const firstFactory = uploadedFactories[0];
      if (mode === 'panel' && firstFactory && (!fixedNeighborhoodName || firstFactory.neighborhoodName === fixedNeighborhoodName)) {
        setSelectedNeighborhood(firstFactory.neighborhoodName);
        await loadFactories(firstFactory.neighborhoodName);
        setSelectedFactoryId(firstFactory._id);
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
      message.success('Component row updated');
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
      message.success('Component row deleted');
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    }
  };

  const handleBulkDeleteRows = async () => {
    if (!selectedFactory || !selectedRowKeys.length) return;

    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} selected rows?`,
      content: `This will permanently remove ${selectedRowKeys.length} selected rows from ${selectedFactory.name}.`,
      okText: 'Delete Selected',
      okButtonProps: { danger: true },
      onOk: async () => {
        let nextFactory = selectedFactory;
        for (const rowId of selectedRowKeys) {
          nextFactory = await deleteCustomFactoryRow(selectedFactory._id, rowId);
        }
        setSelectedFactory(nextFactory);
        setFactories((current) => current.map((factory) => (factory._id === nextFactory._id ? nextFactory : factory)));
        setSelectedRowKeys([]);
        message.success(`Deleted ${selectedRowKeys.length} rows`);
      },
    });
  };

  const handleDeleteFactory = async (factory: CustomFactory) => {
    try {
      await deleteCustomFactory(factory._id);
      message.success(`Component deleted: ${factory.name}`);
      setSelectedFactory((current) => (current?._id === factory._id ? null : current));
      setSelectedFactoryId((current) => (current === factory._id ? null : current));
      await loadFactories(factory.neighborhoodName);
      await onNeighborhoodsChanged?.();
      await onFactoryDeleted?.(factory._id, factory.neighborhoodName);
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    }
  };

  const handleDeleteNeighborhood = useCallback((name: string) => {
    Modal.confirm({
      title: `Delete neighborhood ${name}?`,
      title: `Delete model ${name}?`,
      icon: <ExclamationCircleOutlined />,
      okText: 'Delete Model',
      okType: 'danger',
      centered: true,
      content: (
        <div style={{ display: 'grid', gap: 8 }}>
          <div>This will permanently delete the model and every component inside it.</div>
          <div style={{ color: '#b91c1c', fontWeight: 600 }}>This action cannot be undone.</div>
        </div>
      ),
      onOk: async () => {
        try {
          const result = await deleteFactoryNeighborhood(name);
          message.success(`Model deleted: ${result.name} (${result.deletedFactoryCount} components removed)`);
          setSelectedFactory(null);
          setSelectedFactoryId(null);
          setFactories([]);
          if (!fixedNeighborhoodName) {
            setSelectedNeighborhood(DEFAULT_NEIGHBORHOOD_NAME);
          }
          await onNeighborhoodsChanged?.();
          await onNeighborhoodDeleted?.(name);
        } catch (error: any) {
          message.error(error.response?.data?.error || error.message);
        }
      },
    });
  }, [DEFAULT_NEIGHBORHOOD_NAME, fixedNeighborhoodName, message, onNeighborhoodDeleted, onNeighborhoodsChanged]);

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
        title: 'Sourced From',
        key: 'sourcedFrom',
        dataIndex: 'sourcedFrom',
        width: 180,
        render: (value: string) => displayValue(value),
      },
      {
        title: 'Created By',
        key: 'createdBy',
        dataIndex: 'createdBy',
        width: 150,
        render: (value: string) => displayValue(value),
      },
      {
        title: 'Last Updated',
        key: 'updatedAt',
        dataIndex: 'updatedAt',
        width: 160,
        render: (value: string) => (value ? new Date(value).toLocaleString() : '—'),
      },
      {
        title: 'Updated By',
        key: 'updatedBy',
        dataIndex: 'updatedBy',
        width: 150,
        render: (value: string) => displayValue(value),
      },
      {
        title: 'Status',
        key: 'state',
        dataIndex: 'state',
        width: 110,
        render: (value: string) => {
          const nextValue = String(value || 'staged').toLowerCase();
          const color = nextValue === 'loaded'
            ? 'green'
            : nextValue === 'invalid'
              ? 'red'
              : 'blue';
          return <Tag color={color}>{value || 'staged'}</Tag>;
        },
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
          <Space>
            {showCreateNeighborhood ? (
              <Button
                size="small"
                icon={<FolderAddOutlined />}
                onClick={openNeighborhoodModal}
              >
                Create Model
              </Button>
            ) : null}
            {showAddFactory ? (
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  uploadForm.setFieldsValue({ neighborhoodName: fixedNeighborhoodName || selectedNeighborhood || undefined });
                  setShowUploadModal(true);
                }}
              >
                Add Components
              </Button>
            ) : null}
            {showDeleteNeighborhood && fixedNeighborhoodName ? (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteNeighborhood(fixedNeighborhoodName)}
              >
                Delete Model
              </Button>
            ) : null}
          </Space>
        ) : null}

        <Modal
          title="Add Components from CSV"
          open={showUploadModal}
          onCancel={() => { setShowUploadModal(false); setUploadFile(null); }}
          onOk={() => uploadForm.submit()}
          okText={uploading ? 'Uploading…' : 'Upload'}
          confirmLoading={uploading}
        >
          <Form form={uploadForm} layout="vertical" onFinish={handleUploadFactory} className="mt-4">
            {fixedNeighborhoodName ? (
              <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
                Adding components in <strong>{fixedNeighborhoodName}</strong>
              </div>
            ) : (
              <Form.Item
                name="neighborhoodName"
                label={(
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span>Model</span>
                    {canManageFactories ? (
                      <Button size="small" type="link" icon={<FolderAddOutlined />} onClick={openNeighborhoodModal}>
                        Create Model
                      </Button>
                    ) : null}
                  </div>
                )}
                rules={[{ required: true, message: 'Model is required' }]}
              >
                <Select
                  placeholder="Select an existing model"
                  options={neighborhoods.map((item) => ({ label: item.name, value: item.name }))}
                />
              </Form.Item>
            )}
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
              Component names are taken from spreadsheet column headings ending in <strong>Component</strong> or <strong>Components</strong>. Legacy <strong>Part</strong> headers are still accepted. Each derived component must include a unique <strong>{PRIMARY_KEY_COLUMN}</strong> value.
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
                <p className="ant-upload-text">Upload a CSV file to create or update model components from component columns</p>
              </Upload.Dragger>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Create Model from CSV"
          open={showNeighborhoodModal}
          onCancel={() => { setShowNeighborhoodModal(false); setNeighborhoodUploadFile(null); }}
          onOk={handleCreateNeighborhood}
          okText={creatingNeighborhood ? 'Creating…' : 'Create'}
          confirmLoading={creatingNeighborhood}
          okButtonProps={{ disabled: !canSubmitNeighborhood }}
        >
          <div className="mt-4">
            <div style={{ marginBottom: 8, fontWeight: 500 }}>Model Name</div>
            <Input value={neighborhoodDraftName} onChange={(event) => setNeighborhoodDraftName(event.target.value)} />
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
              Upload the model catalog reference data for this model. The first row is treated as headers and the remaining rows are stored as the model catalog.
            </div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>Model CSV</div>
            <Upload.Dragger
              accept=".csv"
              maxCount={1}
              beforeUpload={(file) => {
                setNeighborhoodUploadFile(file);
                return false;
              }}
              onRemove={() => {
                setNeighborhoodUploadFile(null);
              }}
              fileList={neighborhoodUploadFile ? [neighborhoodUploadFile as any] : []}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Upload a model CSV to store model catalog reference data</p>
            </Upload.Dragger>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <div className="flex h-full gap-3 p-3 min-h-0">
      {!hideFactoryList ? <Card
        title={fixedNeighborhoodName ? `${fixedNeighborhoodName} Components` : 'Models'}
        size="small"
        style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, height: '100%' }}
        extra={canManageFactories ? (
          <Space>
            <Button size="small" icon={<FolderAddOutlined />} onClick={openNeighborhoodModal}>Model</Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => {
              uploadForm.setFieldsValue({ neighborhoodName: selectedNeighborhood || undefined });
              setShowUploadModal(true);
            }}>Components</Button>
          </Space>
        ) : null}
      >
        {!fixedNeighborhoodName ? (
          <Select
            placeholder="Select a model"
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
            Viewing components for <strong>{fixedNeighborhoodName}</strong>
          </div>
        )}

        <div style={{ minHeight: 0, overflowY: 'auto' }}>
          <List
            loading={loadingFactories}
            dataSource={factories}
            locale={{ emptyText: selectedNeighborhood ? 'No components in this model yet' : 'No models available' }}
            renderItem={(factory) => (
              <List.Item
                actions={canManageFactories ? [
                  <Popconfirm
                    key="delete"
                    title={`Delete component ${factory.name}?`}
                    description="This removes the entire component and all of its rows."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeleteFactory(factory)}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Popconfirm>,
                ] : undefined}
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
      </Card> : null}

      <Card
        title={selectedFactory ? `${selectedFactory.name} Component` : 'Component'}
        size="small"
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, height: '100%' }}
        extra={selectedFactory ? (
          <Space>
            <span style={{ color: '#64748b', fontSize: 12 }}>{selectedFactory.neighborhoodName} · loaded and invalid statuses are generated during import validation</span>
            {canManageFactories ? (
              <Popconfirm
                title={`Delete component ${selectedFactory.name}?`}
                description="This removes the entire component and all of its rows."
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteFactory(selectedFactory)}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                  Remove Component
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null}
      >
        {!selectedFactory && (loadingFactories || loadingFactoryDetail) ? <Spin /> : null}

        {!selectedFactory && !(loadingFactories || loadingFactoryDetail) ? (
          <div style={{ color: '#64748b' }}>Select a component to view spreadsheet-derived rows.</div>
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
                placeholder="Search uploaded component rows"
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
                options={[
                  { label: 'loaded', value: 'loaded' },
                  { label: 'invalid', value: 'invalid' },
                  { label: 'staged', value: 'staged' },
                  { label: 'published', value: 'published' },
                ]}
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
              {canManageFactories ? (
                <Button danger size="small" icon={<DeleteOutlined />} disabled={!selectedRowKeys.length} onClick={handleBulkDeleteRows}>
                  Delete Selected ({selectedRowKeys.length})
                </Button>
              ) : null}
            </Space>

            <Table
              rowKey="_id"
              dataSource={filteredRows}
              columns={enhanceColumnsWithSortAndFilters(rowColumns as any, filteredRows)}
              size="small"
              className={hideFactoryList ? 'component-rows-table component-rows-table--nested' : 'component-rows-table'}
              pagination={{ pageSize: 25, showSizeChanger: true, position: ['topRight'] }}
              scroll={{ x: 'max-content', y: hideFactoryList ? 'calc(100dvh - 590px)' : 'calc(100dvh - 360px)' }}
              rowSelection={canManageFactories ? {
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
              } : undefined}
            />
          </>
        ) : null}
      </Card>

      <Modal
        title="Create Model from CSV"
        open={showNeighborhoodModal}
        onCancel={() => { setShowNeighborhoodModal(false); setNeighborhoodUploadFile(null); }}
        onOk={handleCreateNeighborhood}
        okText={creatingNeighborhood ? 'Creating…' : 'Create'}
        confirmLoading={creatingNeighborhood}
        okButtonProps={{ disabled: !canSubmitNeighborhood }}
      >
        <div className="mt-4">
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Model Name</div>
          <Input autoFocus value={neighborhoodDraftName} onChange={(event) => setNeighborhoodDraftName(event.target.value)} />
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
            Upload the model catalog reference data for this model. The first row is treated as headers and the remaining rows are stored as the model catalog.
          </div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Model CSV</div>
          <Upload.Dragger
            accept=".csv"
            maxCount={1}
            beforeUpload={(file) => {
              setNeighborhoodUploadFile(file);
              return false;
            }}
            onRemove={() => {
              setNeighborhoodUploadFile(null);
            }}
            fileList={neighborhoodUploadFile ? [neighborhoodUploadFile as any] : []}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Upload a model CSV to store model catalog reference data</p>
          </Upload.Dragger>
        </div>
      </Modal>

      <Modal
        title="Add Components from Spreadsheet"
        open={showUploadModal}
        onCancel={() => { setShowUploadModal(false); setUploadFile(null); }}
        onOk={() => uploadForm.submit()}
        okText={uploading ? 'Uploading…' : 'Upload'}
        confirmLoading={uploading}
      >
        <Form form={uploadForm} layout="vertical" onFinish={handleUploadFactory} className="mt-4">
          <Form.Item
            name="neighborhoodName"
            label={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>Model</span>
                {canManageFactories ? (
                  <Button size="small" type="link" icon={<FolderAddOutlined />} onClick={openNeighborhoodModal}>
                    Create Model
                  </Button>
                ) : null}
              </div>
            )}
            rules={[{ required: true, message: 'Model is required' }]}
          >
            <Select
              placeholder="Select an existing model"
              options={neighborhoods.map((item) => ({ label: item.name, value: item.name }))}
            />
          </Form.Item>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
            Component names are taken from spreadsheet column headings ending in <strong>Component</strong> or <strong>Components</strong>. Legacy <strong>Part</strong> headers are still accepted. Each derived component must include a unique <strong>{PRIMARY_KEY_COLUMN}</strong> value.
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
              <p className="ant-upload-text">Upload spreadsheet to create or update model components from component columns</p>
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
            <Select options={[
              { label: 'loaded', value: 'loaded' },
              { label: 'invalid', value: 'invalid' },
              { label: 'staged', value: 'staged' },
              { label: 'published', value: 'published' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}