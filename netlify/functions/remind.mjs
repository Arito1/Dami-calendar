// Каждые 2 минуты рассылает наступившие напоминания (Netlify Scheduled Function).
import { runReminders, vapidFrom } from '../../server/push.mjs';
import { blobStore, envVars } from './blobs.mjs';

export default async () => {
  const sent = await runReminders(blobStore(), vapidFrom(envVars()));
  if (sent) console.log(`Отправлено уведомлений: ${sent}`);
};

export const config = { schedule: '*/2 * * * *' };
