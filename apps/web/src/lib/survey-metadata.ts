import type { Metadata } from 'next';

// 伺服器端用內部 API URL（docker 服務名）；失敗則優雅回退到站台預設標題
const INTERNAL_API =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001/api/v1';

/**
 * 由公開問卷 API 取標題，組成分頁/社群 metadata。
 * fetch 失敗或無效 id 時回傳 {}（頁面沿用站台預設標題，不影響渲染）。
 */
export async function surveyMetadata(id: string): Promise<Metadata> {
  try {
    const res = await fetch(`${INTERNAL_API}/public/tasks/${id}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const survey = (await res.json()) as { title?: unknown; description?: unknown };
    const title = typeof survey.title === 'string' ? survey.title.trim() : '';
    if (!title) return {};
    const description =
      typeof survey.description === 'string' ? survey.description.slice(0, 160) : undefined;
    const full = `${title} · 券問 QuanWen`;
    return {
      // 用 absolute 確保不受父層(如 /tasks)純 title 阻斷 root template
      title: { absolute: full },
      description,
      openGraph: { title: full, description, type: 'website' },
      twitter: { card: 'summary', title: full, description },
    };
  } catch {
    return {};
  }
}
