const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const BPMN_DIR = path.resolve(process.env.BPMN_FILES_DIR || './bpmn-files');

// Ensure directory exists
if (!fs.existsSync(BPMN_DIR)) {
  fs.mkdirSync(BPMN_DIR, { recursive: true });
}

// Sanitize file name to prevent path traversal
function safeFileName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
}

// GET /api/files — list all .bpmn files in directory
router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(BPMN_DIR).filter((f) => f.endsWith('.bpmn'));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:filename — read a specific BPMN file
router.get('/:filename', (req, res) => {
  const safe = safeFileName(req.params.filename);
  const filePath = path.join(BPMN_DIR, safe);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  try {
    const xml = fs.readFileSync(filePath, 'utf-8');
    res.type('application/xml').send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files — write/overwrite a BPMN file  { filename, xml }
router.post('/', (req, res) => {
  const { filename, xml } = req.body;
  if (!filename || !xml) {
    return res.status(400).json({ error: 'Fields "filename" and "xml" are required.' });
  }
  const safe = safeFileName(filename.endsWith('.bpmn') ? filename : `${filename}.bpmn`);
  const filePath = path.join(BPMN_DIR, safe);
  try {
    fs.writeFileSync(filePath, xml, 'utf-8');
    res.json({ message: `Saved to ${safe}`, filename: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/:filename
router.delete('/:filename', (req, res) => {
  const safe = safeFileName(req.params.filename);
  const filePath = path.join(BPMN_DIR, safe);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  try {
    fs.unlinkSync(filePath);
    res.json({ message: `Deleted ${safe}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
