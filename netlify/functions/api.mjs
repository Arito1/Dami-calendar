import { handleApi } from '../../server/core.mjs';
import { blobStore, envVars } from './blobs.mjs';

export default async (req) => handleApi(req, blobStore(), envVars());

export const config = { path: '/api/*' };
