import { FAKE_ANTHROPIC_URL } from './env';

export interface FakeCall { writer: string; at: string; stream: boolean; user: string }

export async function fakeCalls(): Promise<FakeCall[]> {
  const response = await fetch(`${FAKE_ANTHROPIC_URL}/__calls`);
  return (await response.json()) as FakeCall[];
}

export async function fakeReset(): Promise<void> {
  await fetch(`${FAKE_ANTHROPIC_URL}/__reset`);
}

export async function fakeControl(body: { failWriter?: string | string[] | null; delayMs?: number }): Promise<void> {
  const response = await fetch(`${FAKE_ANTHROPIC_URL}/__control`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error('fake model control call failed');
}
