import { handle } from '@/lib/api/router';

export const dynamic = 'force-dynamic';

const go = async (request, { params }) => handle(request, (await params).path || []);
export const GET = go;
export const POST = go;
export const PUT = go;
export const DELETE = go;
