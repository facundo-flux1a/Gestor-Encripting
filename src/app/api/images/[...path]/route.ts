import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    const { path } = params;

    if (!path || path.length === 0) {
        return new NextResponse('Path missing', { status: 400 });
    }

    // Build the target MinIO URL
    const minioBaseUrl = 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000';
    const targetUrl = `${minioBaseUrl}/${path.join('/')}`;

    try {
        const response = await fetch(targetUrl, {
            // Avoid cache issues in dev if needed, but for assets it's fine
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            return new NextResponse(`Error fetching image: ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const blob = await response.arrayBuffer();

        return new NextResponse(blob, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        });
    } catch (error) {
        console.error('❌ [ImageProxy] Error proxying image:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
