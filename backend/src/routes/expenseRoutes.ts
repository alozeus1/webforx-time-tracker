import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { createExpense, deleteExpense, getExpenseReceiptUrl, getExpenseUploadCapability, listExpenses, reviewExpense, signExpenseReceiptUpload, updateExpense } from '../controllers/expenseController';

const router = Router();
router.use(authenticateToken);
router.get('/', listExpenses);
router.get('/receipt-capability', getExpenseUploadCapability);
router.post('/receipts/sign', signExpenseReceiptUpload);
router.post('/', createExpense);
router.put('/:expenseId', updateExpense);
router.post('/:expenseId/review', requireRole(['Manager', 'Admin']), reviewExpense);
router.get('/:expenseId/receipts/:attachmentId/url', getExpenseReceiptUrl);
router.delete('/:expenseId', deleteExpense);

export default router;
