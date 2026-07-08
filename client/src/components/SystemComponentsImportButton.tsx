import { memo, useCallback, useState } from 'react';
import { Button } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import DataComponentUploadModal from './DataComponentUploadModal';

type Props = {
  neighborhoodName: string;
  onUploaded: (dataType: string) => Promise<void> | void;
};

function SystemComponentsImportButton({ neighborhoodName, onUploaded }: Props) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <Button size="small" type="primary" icon={<CloudUploadOutlined />} onClick={handleOpen}>
        Import System Components
      </Button>
      <DataComponentUploadModal
        open={open}
        neighborhoodName={neighborhoodName}
        onClose={handleClose}
        onUploaded={onUploaded}
      />
    </>
  );
}

export default memo(SystemComponentsImportButton);