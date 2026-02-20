import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/authMiddleware';
import { importXlsxFile, importZoneFile, importArticleFile, importABCFile, detectFileType } from '../services/importService';
import { getImportHistory } from '../db/queries';

const router = Router();

// Configure multer for xlsx uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../data/inbox');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `upload_${timestamp}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      cb(new Error('Apenas ficheiros .xlsx são aceites'));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.use(authMiddleware);

// Upload and import xlsx files
router.post('/import', upload.array('files', 10), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Nenhum ficheiro enviado' });
      return;
    }

    const results = files.map((file) => {
      try {
        const fileType = detectFileType(file.path);
        if (fileType === 'abc') {
          return importABCFile(file.path);
        }
        if (fileType === 'zonas') {
          return importZoneFile(file.path);
        }
        if (fileType === 'artigos') {
          return importArticleFile(file.path);
        }
        return importXlsxFile(file.path);
      } catch (err: any) {
        return {
          filename: file.originalname,
          fileType: 'unknown' as const,
          dateFrom: null,
          dateTo: null,
          recordsInserted: 0,
          recordsUpdated: 0,
          errors: [`Erro ao processar: ${err.message}`],
          stores: [],
        };
      }
    });

    const totalInserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.recordsUpdated, 0);
    const allErrors = results.flatMap((r) => r.errors);

    res.json({
      success: true,
      summary: {
        filesProcessed: files.length,
        totalInserted,
        totalUpdated,
        errors: allErrors,
      },
      details: results,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: `Erro no upload: ${err.message}` });
  }
});

// Preview xlsx file without importing
router.post('/preview', upload.single('file'), (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Nenhum ficheiro enviado' });
      return;
    }

    const { parseXlsxFile } = require('../services/xlsxParser');
    const result = parseXlsxFile(file.path);
    fs.unlinkSync(file.path);
    res.json({
      filename: file.originalname,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      stores: result.stores,
      rowCount: result.rows.length,
      errors: result.errors,
      sample: result.rows.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Erro na preview: ${err.message}` });
  }
});

// Get import history
router.get('/history', (req: Request, res: Response) => {
  try {
    const history = getImportHistory();
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao obter histórico' });
  }
});

export default router;
