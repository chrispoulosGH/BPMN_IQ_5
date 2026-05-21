import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Table, Input, Button, App as AntApp, Space, Tooltip, Tag, Select, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';
import type { DiagramMeta } from '../types';
import { getDiagrams, deleteDiagram, updateDiagram, batchImportDiagrams } from '../api';

interface BpmnFactoryProps {
  onOpenDiagram?: (id: string) => void;
  onNavigateToFactory?: (tab: string, search: string) => void;
  readOnly?: boolean;
}

export default function BpmnFactory({ onOpenDiagram, onNavigateToFactory, readOnly }: BpmnFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ description?: string; status?: string; sourcedFrom?: string; owner?: string }>({});

  const loadDiagrams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDiagrams();
      setDiagrams(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { loadDiagrams(); }, [loadDiagrams]);

  const handleDelete = (diagram: DiagramMeta) => {
    modal.confirm({
      title: `Delete "${diagram.name}"?`,
      content: 'This will permanently remove this diagram.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteDiagram(diagram._id);
        message.success('Deleted');
        loadDiagrams();
      },
    });
  };

  const handleInlineEdit = (diagram: DiagramMeta) => {
    setEditingId(diagram._id);
    setEditFields({
      description: diagram.description || '',
      status: diagram.status || 'Draft',
      sourcedFrom: diagram.sourcedFrom || '',
      owner: diagram.owner || '',
    });
  };

  const handleInlineSave = async (id: string) => {
    try {
      await updateDiagram(id, editFields as any);
      message.success('Updated');
      setEditingId(null);
      loadDiagrams();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  // ─── Batch Import ─────────────────────────────────────────
  const handleBatchImport = () => {
    batchInputRef.current?.click();
  };

  const handleBatchFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;
    // Read file contents immediately before clearing the input
    const readFiles: { xml: string; fileName: string }[] = [];
    for (const file of Array.from(fileList)) {
      const xml = await file.text();
      readFiles.push({ xml, fileName: file.name });
    }
    e.target.value = '';
    modal.confirm({
      title: `Batch Import ${readFiles.length} file(s)`,
      content: (
        <div>
          <p>The following files will be imported with status <Tag color="orange">Staged</Tag>:</p>
          <ul style={{ maxHeight: 200, overflow: 'auto', paddingLeft: 16 }}>
            {readFiles.map((f) => <li key={f.fileName}>{f.fileName}</li>)}
          </ul>
        </div>
      ),
      okText: 'Import All',
      onOk: async () => {
        try {
          const result = await batchImportDiagrams(readFiles, 'cp1853');
          if (result.failed.length) {
            message.warning(`${result.success.length} imported, ${result.failed.length} failed`);
          } else {
            message.success(`All ${result.success.length} diagrams imported successfully as Staged`);
          }
          loadDiagrams();
        } catch (err: any) {
          message.error(err.response?.data?.error || err.message);
        }
      },
    });
  };

  const filtered = search
    ? diagrams.filter((d) => {
        const s = search.toLowerCase();
        return (
          (d.name || '').toLowerCase().includes(s) ||
          (d.lineOfBusiness || '').toLowerCase().includes(s) ||
          (d.channel || '').toLowerCase().includes(s) ||
          (d.domain || '').toLowerCase().includes(s) ||
          (d.subdomain || '').toLowerCase().includes(s) ||
          (d.product || '').toLowerCase().includes(s) ||
          (d.businessFlow || '').toLowerCase().includes(s) ||
          (d.status || '').toLowerCase().includes(s) ||
          (d.createdBy || '').toLowerCase().includes(s) ||
          (d.updatedBy || '').toLowerCase().includes(s) ||
          (d.sourcedFrom || '').toLowerCase().includes(s) ||
          (d.tasks || []).some((t) =>
            (t.name || '').toLowerCase().includes(s) ||
            (t.applications || []).some((a) => (a.name || '').toLowerCase().includes(s))
          )
        );
      })
    : diagrams;

  const statusOptions = ['Draft', 'In Progress', 'Review', 'Approved', 'Published'];

  // Compute unique filter values for column filters
  const nameFilters = useMemo(() => {
    const names = [...new Set(diagrams.map((d) => d.businessFlow || d.name).filter(Boolean))].sort();
    return names.map((n) => ({ text: n, value: n }));
  }, [diagrams]);
  const statusFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.status || 'Draft').filter(Boolean))].sort();
    return values.map((v) => ({ text: v, value: v }));
  }, [diagrams]);
  const createdByFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.createdBy).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);
  const updatedByFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.updatedBy).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);
  const lobFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.lineOfBusiness).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);
  const channelFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.channel).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);
  const domainFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.domain).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);
  const subdomainFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.subdomain).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);
  const productFilters = useMemo(() => {
    const values = [...new Set(diagrams.map((d) => d.product).filter(Boolean))].sort();
    return values.map((v) => ({ text: v!, value: v! }));
  }, [diagrams]);

  const columns = [
    {
      title: 'Diagram Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: DiagramMeta, b: DiagramMeta) => a.name.localeCompare(b.name),
      filters: nameFilters,
      onFilter: (value: any, record: DiagramMeta) => (record.businessFlow || record.name) === value,
      filterSearch: true,
      render: (name: string, record: DiagramMeta) => (
        <Button type="link" size="small" onClick={() => onOpenDiagram?.(record._id)}>
          {record.businessFlow || name}
        </Button>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (val: string, record: DiagramMeta) =>
        editingId === record._id ? (
          <Input
            size="small"
            value={editFields.description}
            onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
          />
        ) : (
          val || '—'
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      filters: statusFilters,
      onFilter: (value: any, record: DiagramMeta) => (record.status || 'Draft') === value,
      render: (val: string, record: DiagramMeta) =>
        editingId === record._id ? (
          <Select
            size="small"
            value={editFields.status}
            onChange={(v) => setEditFields((f) => ({ ...f, status: v }))}
            options={statusOptions.map((s) => ({ label: s, value: s }))}
            style={{ width: '100%' }}
          />
        ) : (
          <Tag color={val === 'Published' ? 'green' : val === 'Approved' ? 'blue' : val === 'Review' ? 'orange' : 'default'}>
            {val || 'Draft'}
          </Tag>
        ),
    },
    {
      title: 'Line of Business',
      dataIndex: 'lineOfBusiness',
      key: 'lineOfBusiness',
      width: 140,
      filters: lobFilters,
      filterSearch: true,
      onFilter: (value: any, record: DiagramMeta) => record.lineOfBusiness === value,
      render: (val: string) => val ? <Typography.Link onClick={() => onNavigateToFactory?.('linesOfBusiness', val)}>{val}</Typography.Link> : '—',
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 110,
      filters: channelFilters,
      onFilter: (value: any, record: DiagramMeta) => record.channel === value,
      render: (val: string) => val ? <Typography.Link onClick={() => onNavigateToFactory?.('channels', val)}>{val}</Typography.Link> : '—',
    },
    {
      title: 'Domain',
      dataIndex: 'domain',
      key: 'domain',
      width: 130,
      filters: domainFilters,
      filterSearch: true,
      onFilter: (value: any, record: DiagramMeta) => record.domain === value,
      render: (val: string) => val ? <Typography.Link onClick={() => onNavigateToFactory?.('domains', val)}>{val}</Typography.Link> : '—',
    },
    {
      title: 'Subdomain',
      dataIndex: 'subdomain',
      key: 'subdomain',
      width: 140,
      filters: subdomainFilters,
      filterSearch: true,
      onFilter: (value: any, record: DiagramMeta) => record.subdomain === value,
      render: (val: string) => val ? <Typography.Link onClick={() => onNavigateToFactory?.('subdomains', val)}>{val}</Typography.Link> : '—',
    },
    {
      title: 'Product',
      dataIndex: 'product',
      key: 'product',
      width: 120,
      filters: productFilters,
      filterSearch: true,
      onFilter: (value: any, record: DiagramMeta) => record.product === value,
      render: (val: string) => val ? <Typography.Link onClick={() => onNavigateToFactory?.('products', val)}>{val}</Typography.Link> : '—',
    },
    {
      title: 'Sourced From',
      dataIndex: 'sourcedFrom',
      key: 'sourcedFrom',
      width: 140,
      render: (val: string, record: DiagramMeta) =>
        editingId === record._id ? (
          <Input
            size="small"
            value={editFields.sourcedFrom}
            onChange={(e) => setEditFields((f) => ({ ...f, sourcedFrom: e.target.value }))}
          />
        ) : (
          val || '—'
        ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 100,
      render: (val: string) => val ? new Date(val).toLocaleDateString() : '—',
      sorter: (a: DiagramMeta, b: DiagramMeta) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 100,
      filters: createdByFilters,
      onFilter: (value: any, record: DiagramMeta) => record.createdBy === value,
      render: (val: string) => val || '—',
    },
    {
      title: 'Last Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 100,
      render: (val: string) => val ? new Date(val).toLocaleDateString() : '—',
      sorter: (a: DiagramMeta, b: DiagramMeta) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Updated By',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 100,
      filters: updatedByFilters,
      onFilter: (value: any, record: DiagramMeta) => record.updatedBy === value,
      render: (val: string) => val || '—',
    },
    {
      title: 'Owner',
      dataIndex: 'owner',
      key: 'owner',
      width: 120,
      render: (val: string, record: DiagramMeta) => {
        if (editingId === record._id) {
          return <Input size="small" value={editFields.owner || ''} onChange={(e) => setEditFields((f) => ({ ...f, owner: e.target.value }))} />;
        }
        return val || '—';
      },
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: DiagramMeta) => (
        <Space size="small">
          {editingId === record._id ? (
            <>
              <Button size="small" type="primary" onClick={() => handleInlineSave(record._id)}>Save</Button>
              <Button size="small" onClick={() => setEditingId(null)}>Cancel</Button>
            </>
          ) : (
            <>
              <Tooltip title="Open in Canvas">
                <Button size="small" icon={<FolderOpenOutlined />} onClick={() => onOpenDiagram?.(record._id)} />
              </Tooltip>
              {!readOnly && <Tooltip title="Edit">
                <Button size="small" icon={<EditOutlined />} onClick={() => handleInlineEdit(record)} />
              </Tooltip>}
              {!readOnly && <Tooltip title="Delete">
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
              </Tooltip>}
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="p-4">
      <input
        ref={batchInputRef}
        type="file"
        multiple
        accept=".bpmn,.xml"
        style={{ display: 'none' }}
        onChange={handleBatchFilesSelected}
      />
      <div className="flex items-center justify-between mb-3">
        <Input
          placeholder="Search diagrams..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
        <Button icon={<UploadOutlined />} onClick={handleBatchImport} disabled={readOnly}>
          Batch Import
        </Button>
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ y: 'calc(100vh - 260px)' }}
      />
    </div>
  );
}
