// Хранилище на Netlify Blobs в том виде, который ждёт server/core.mjs.
import { getStore } from '@netlify/blobs';

export function blobStore() {
  const blobs = getStore({ name: 'damical', consistency: 'strong' });
  return {
    get: (key) => blobs.get(key, { type: 'json' }),
    set: (key, value) => blobs.setJSON(key, value),
    del: (key) => blobs.delete(key),
    list: async (prefix) => (await blobs.list({ prefix })).blobs.map((b) => b.key),
  };
}

export const envVars = () => ({
  REGISTRATION_CODE: process.env.REGISTRATION_CODE,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  URL: process.env.URL,
});
