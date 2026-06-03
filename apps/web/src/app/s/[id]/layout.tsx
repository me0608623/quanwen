import type { Metadata } from 'next';
import { surveyMetadata } from '@/lib/survey-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return surveyMetadata(id);
}

export default function PublicSurveyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
