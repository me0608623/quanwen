'use client';

import { toPng } from 'html-to-image';

/**
 * 將指定 DOM 元素匯出為 PNG 並下載
 * @param elementId - 要擷取的 DOM 元素 ID
 * @param filename - 下載的檔案名稱（不需副檔名）
 */
export async function exportChartToPng(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`[exportChartToPng] 找不到元素 #${elementId}`);
    return;
  }

  try {
    const dataUrl = await toPng(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
    });

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('[exportChartToPng] 匯出失敗:', err);
  }
}
