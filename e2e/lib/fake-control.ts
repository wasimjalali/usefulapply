import { FAKE_ANTHROPIC_URL } from './env';

export interface FakeCall { writer: string; at: string; stream: boolean; user: string }

/** `url` picks the scripted model: the data lane's by default, the MCP lane's when given MCP_FAKE_URL. */
export async function fakeCalls(url: string = FAKE_ANTHROPIC_URL): Promise<FakeCall[]> {
  const response = await fetch(`${url}/__calls`);
  return (await response.json()) as FakeCall[];
}

export async function fakeReset(url: string = FAKE_ANTHROPIC_URL): Promise<void> {
  await fetch(`${url}/__reset`);
}

export async function fakeControl(body: { failWriter?: string | string[] | null; delayMs?: number }, url: string = FAKE_ANTHROPIC_URL): Promise<void> {
  const response = await fetch(`${url}/__control`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error('fake model control call failed');
}
