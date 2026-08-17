import { getDb, nowIso } from '../client';
import { contactSubmissions } from '../schema';

export async function insertContactSubmission(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ id: string }> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.insert(contactSubmissions).values({
    id,
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    submitted_at: now,
    created_at: now,
  });
  return { id };
}
