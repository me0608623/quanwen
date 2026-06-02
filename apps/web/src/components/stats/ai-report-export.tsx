'use client';

import { jsPDF } from 'jspdf';
import type { SurveyAiInsights } from '@/hooks/use-surveys';

interface AiReportExportProps {
  insights: SurveyAiInsights;
  surveyTitle?: string;
}

/**
 * AI 洞察報告 PDF 匯出按鈕
 * 使用 jspdf 將 AI 報告文字內容產出為 PDF 並下載
 */
export function AiReportExport({ insights, surveyTitle }: AiReportExportProps) {
  const handleExport = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addText = (text: string, fontSize: number, isBold = false) => {
      doc.setFontSize(fontSize);
      if (isBold) {
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setFont('helvetica', 'normal');
      }
      const lines = doc.splitTextToSize(text, contentWidth);
      const lineHeight = fontSize * 0.5;
      for (const line of lines) {
        if (y + lineHeight > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
    };

    // 標題
    const title = surveyTitle ?? 'AI Insights Report';
    addText(title, 16, true);
    y += 4;

    // Meta
    addText(`Report Type: ${insights.reportType} | Sample Size: ${insights.sampleSize} | Generated: ${insights.generatedAt}`, 9);
    y += 6;

    // Summary
    addText('Summary', 13, true);
    y += 2;
    addText(insights.summary, 10);
    y += 6;

    // Key Findings
    if (insights.keyFindings.length > 0) {
      addText('Key Findings', 13, true);
      y += 2;
      for (const finding of insights.keyFindings) {
        addText(`• ${finding}`, 10);
      }
      y += 4;
    }

    // Concerns
    if (insights.concerns.length > 0) {
      addText('Concerns', 13, true);
      y += 2;
      for (const concern of insights.concerns) {
        addText(`• ${concern}`, 10);
      }
      y += 4;
    }

    // Recommendations
    if (insights.recommendations.length > 0) {
      addText('Recommendations', 13, true);
      y += 2;
      for (const rec of insights.recommendations) {
        addText(`• ${rec}`, 10);
      }
      y += 4;
    }

    // Question Breakdown (detailed)
    if (insights.questionBreakdown && insights.questionBreakdown.length > 0) {
      addText('Question Breakdown', 13, true);
      y += 2;
      for (const qb of insights.questionBreakdown) {
        addText(`Q: ${qb.question}`, 10, true);
        addText(qb.insight, 10);
        y += 2;
      }
    }

    // Cross Findings (detailed)
    if (insights.crossFindings && insights.crossFindings.length > 0) {
      addText('Cross Findings', 13, true);
      y += 2;
      for (const cf of insights.crossFindings) {
        addText(`• ${cf}`, 10);
      }
      y += 4;
    }

    // Methodology (detailed)
    if (insights.methodology) {
      addText('Methodology', 13, true);
      y += 2;
      addText(insights.methodology, 10);
    }

    doc.save(`${title.replace(/\s+/g, '_')}_AI_Report.pdf`);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-md bg-[#126b8a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0e5a73] transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
      </svg>
      匯出 PDF
    </button>
  );
}
