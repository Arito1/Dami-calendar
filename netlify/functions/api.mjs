import { getStore } from '@netlify/blobs';
import { handleApi } from '../../server/core.mjs';

export default async (req) => {
  const blobs = getStore({ name: 'damical', consistency: 'strong' });
  const store = {
    get: (key) => blobs.get(key, { type: 'json' }),
    set: (key, value) => blobs.setJSON(key, value),
    del: (key) => blobs.delete(key),
  };
  return handleApi(req, store, { REGISTRATION_CODE: process.env.REGISTRATION_CODE });
};

export const config = { path: '/api/*' };
