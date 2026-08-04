import { randomUUID } from 'crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const client = env.expenseReceiptBucket
    ? new S3Client({
        region: env.expenseReceiptRegion,
        ...(env.expenseReceiptEndpoint
            ? { endpoint: env.expenseReceiptEndpoint, forcePathStyle: true }
            : {}),
    })
    : null;

export const isExpenseReceiptStorageConfigured = () => Boolean(client && env.expenseReceiptBucket);

export const validateReceiptMetadata = (contentType: string, sizeBytes: number) =>
    ALLOWED_CONTENT_TYPES.has(contentType) && Number.isInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_RECEIPT_BYTES;

export const createReceiptObjectKey = (organizationId: string, userId: string, fileName: string) => {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'receipt';
    return `expenses/${organizationId}/${userId}/${randomUUID()}-${safeName}`;
};

export const signReceiptUpload = async (objectKey: string, contentType: string) => {
    if (!client || !env.expenseReceiptBucket) throw new Error('RECEIPT_STORAGE_NOT_CONFIGURED');
    const command = new PutObjectCommand({
        Bucket: env.expenseReceiptBucket,
        Key: objectKey,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
    });
    return getSignedUrl(client, command, { expiresIn: 300 });
};

export const signReceiptDownload = async (objectKey: string) => {
    if (!client || !env.expenseReceiptBucket) throw new Error('RECEIPT_STORAGE_NOT_CONFIGURED');
    return getSignedUrl(client, new GetObjectCommand({ Bucket: env.expenseReceiptBucket, Key: objectKey }), { expiresIn: 300 });
};
