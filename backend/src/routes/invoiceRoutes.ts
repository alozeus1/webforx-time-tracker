import { Router } from 'express';
import { listInvoices, createInvoice, createAutopilotInvoice, getInvoice, updateInvoiceStatus, deleteInvoice } from '../controllers/invoiceController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['Admin', 'Manager']));

router.get('/', listInvoices);
router.post('/autopilot', createAutopilotInvoice);
router.post('/', createInvoice);
router.get('/:id', getInvoice);
router.patch('/:id/status', updateInvoiceStatus);
router.delete('/:id', deleteInvoice);

export default router;
