import type { Metadata } from 'next';
import { GeoPage, geoMetadata } from '@/app/ai-job-application/_shared/GeoPage';
import { content } from './content';

export async function generateMetadata(): Promise<Metadata> {
  return geoMetadata(content);
}

export default function AIJobApplicationHub() {
  return <GeoPage content={content} />;
}
