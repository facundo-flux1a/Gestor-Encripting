'use server';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import db from '@/lib/db';
import { getSession } from '@/services/auth-service';
import crypto from 'crypto';

const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;

const s3Client = new S3Client({
    region: process.env.MINIO_REGION || "us-east-1",
    endpoint: MINIO_ENDPOINT,
    credentials: {
        accessKeyId: MINIO_ACCESS_KEY || '',
        secretAccessKey: MINIO_SECRET_KEY || '',
    },
    forcePathStyle: true,
});

export async function uploadSuggestionMedia(formData: FormData) {
    try {
        const session = await getSession();
        if (!session) throw new Error('No autorizado');

        const file = formData.get('file') as File;
        if (!file) throw new Error('No se proporcionó ningún archivo');

        const buffer = await file.arrayBuffer();
        const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const filePath = `sugerencias/${session.userId}/${fileName}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: MINIO_BUCKET_NAME,
            Key: filePath,
            Body: Buffer.from(buffer),
            ContentType: file.type,
            ACL: 'public-read',
        }));

        const publicUrl = `${MINIO_ENDPOINT?.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
        return { success: true, url: publicUrl };
    } catch (error: any) {
        console.error('❌ [SuggestionService] Upload error:', error);
        return { success: false, error: error.message };
    }
}

export async function submitSuggestion(mensaje: string, mediaUrls: string[]) {
    try {
        const session = await getSession();
        if (!session) throw new Error('No autorizado');

        await db.query(
            'INSERT INTO sugerencias (id_usuario, mensaje, media_urls) VALUES (?, ?, ?)',
            [session.userId, mensaje, JSON.stringify(mediaUrls)]
        );

        return { success: true };
    } catch (error: any) {
        console.error('❌ [SuggestionService] Submit error:', error);
        return { success: false, error: error.message };
    }
}
