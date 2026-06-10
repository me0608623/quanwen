'use client';

import { useCallback, useRef, useState } from 'react';
import { useTabsKeyboard } from '@/hooks/use-tabs-keyboard';
import { useRouter } from 'next/navigation';
import { extractApiError } from '@/lib/extract-error';
import { useSubmitImportAppeal } from '@/hooks/use-import-appeals';
import {
  useImportJson,
  useImportXlsx,
  useImportCsv,
  useImportGoogleForms,
  useImportGoogleSheets,
  useImportPdf,
  useImportSurveyCake,
  useDownloadXlsxTemplate,
  type ImportResult,
  type GoogleFormsImportResult,
} from '@/hooks/use-surveys';

// ─── Tab type ────────────────────────────────────────────────────────────────

type ImportTab = 'excel' | 'csv' | 'json' | 'google-forms' | 'google-sheets' | 'pdf' | 'surveycake';

const TABS: { key: ImportTab; label: string; icon: string }[] = [
  { key: 'excel', label: 'Excel (.xlsx)', icon: '📊' },
  { key: 'csv', label: 'CSV', icon: '📃' },
  { key: 'json', label: 'JSON', icon: '{ }' },
  { key: 'google-forms', label: 'Google Forms', icon: '📋' },
  { key: 'google-sheets', label: 'Google Sheets', icon: '📈' },
  { key: 'pdf', label: 'PDF', icon: '📄' },
  { key: 'surveycake', label: 'SurveyCake', icon: '🎂' },
];

const IMPORT_TAB_KEYS = TABS.map((t) => t.key) as readonly ImportTab[];

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SurveyImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ImportTab>('excel');
  const { handleKeyDown: handleTabKeyDown, registerRef: registerTabRef } = useTabsKeyboard(IMPORT_TAB_KEYS, activeTab, setActiveTab);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">匯入問卷</h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← 返回
        </button>
      </div>

      {/* Tab selector */}
      <div role="tablist" aria-label="匯入格式" className="flex gap-1 rounded-lg border border-border p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            ref={(el) => registerTabRef(tab.key, el)}
            role="tab"
            id={`import-tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`import-panel-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            type="button"
            onClick={() => { setActiveTab(tab.key); setResult(null); setError(null); }}
            onKeyDown={handleTabKeyDown}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'excel' && (
        <div role="tabpanel" id="import-panel-excel" aria-labelledby="import-tab-excel">
          <ExcelImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}
      {activeTab === 'csv' && (
        <div role="tabpanel" id="import-panel-csv" aria-labelledby="import-tab-csv">
          <CsvImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}
      {activeTab === 'json' && (
        <div role="tabpanel" id="import-panel-json" aria-labelledby="import-tab-json">
          <JsonImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}
      {activeTab === 'google-forms' && (
        <div role="tabpanel" id="import-panel-google-forms" aria-labelledby="import-tab-google-forms">
          <GoogleFormsImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}
      {activeTab === 'google-sheets' && (
        <div role="tabpanel" id="import-panel-google-sheets" aria-labelledby="import-tab-google-sheets">
          <GoogleSheetsImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}
      {activeTab === 'pdf' && (
        <div role="tabpanel" id="import-panel-pdf" aria-labelledby="import-tab-pdf">
          <PdfImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}
      {activeTab === 'surveycake' && (
        <div role="tabpanel" id="import-panel-surveycake" aria-labelledby="import-tab-surveycake">
          <SurveyCakeImportPanel
            onSuccess={(r) => { setResult(r); setError(null); }}
            onError={(e) => { setError(e); setResult(null); }}
            disabled={!!result}
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">匯入失敗</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Success result */}
      {result && <ImportResultCard result={result} onEdit={() => router.push(`/dashboard/surveys/${result.id}`)} />}

      {/* 匯入失敗申訴 */}
      <ImportAppealSection highlight={!!error} />
    </main>
  );
}

// ─── 匯入失敗申訴 ──────────────────────────────────────────────────────────────

function ImportAppealSection({ highlight }: { highlight: boolean }) {
  const [open, setOpen] = useState(false);
  const [surveyUrl, setSurveyUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const submit = useSubmitImportAppeal();

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p className="font-semibold">✅ 申訴已送出</p>
        <p className="mt-1">管理員會盡快協助匯入，完成後你會收到通知，並可在「我的問卷」看到草稿。</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-border bg-muted/30'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">匯入失敗了？讓我們幫你匯入</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            貼上你的問卷連結（Google 表單等），送出申訴後管理員會直接幫你匯入成草稿。
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            匯入失敗申訴
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">問卷連結 *</label>
            <input
              type="url"
              value={surveyUrl}
              onChange={(e) => setSurveyUrl(e.target.value)}
              placeholder="https://forms.gle/..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">問卷主題（選填）</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：手機品牌使用習慣調查"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">說明（選填）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="匯入時遇到什麼問題、或有什麼要請管理員注意的"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!surveyUrl.trim() || submit.isPending}
              onClick={async () => {
                try {
                  await submit.mutateAsync({ surveyUrl: surveyUrl.trim(), title: title.trim() || undefined, note: note.trim() || undefined });
                  setDone(true);
                } catch (err) {
                  alert(extractApiError(err, '送出失敗，請稍後再試'));
                }
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submit.isPending ? '送出中…' : '送出申訴'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:underline">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CSV Import Panel ────────────────────────────────────────────────────────

function CsvImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importCsv = useImportCsv();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.txt')) {
      onError('請上傳 .csv 檔案');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      onError('檔案大小超過 5MB 限制');
      return;
    }
    setFile(f);
  }, [onError]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleImport = () => {
    if (!file) return;
    importCsv.mutate(file, {
      onSuccess: (r) => onSuccess(r),
      onError: (err) => onError(extractApiError(err, 'CSV 匯入失敗')),
    });
  };

  return (
    <div className="space-y-4">
      {/* Schema hint */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <p className="font-semibold">CSV 格式說明</p>
        <p className="mt-1">
          欄位：<code className="font-mono">sort_order, title, description, type, is_required, option_1…option_5, config_json</code>
        </p>
        <p className="mt-0.5">支援 UTF-8（含 BOM）、Big5、GBK 編碼自動偵測。</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB — 點擊更換檔案
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg">📃</p>
            <p className="mt-2 text-sm text-muted-foreground">
              拖曳 CSV 檔案到這裡，或點擊選擇檔案
            </p>
            <p className="mt-1 text-xs text-muted-foreground">支援 .csv（上限 5MB）</p>
          </div>
        )}
      </div>

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={!file || importCsv.isPending || disabled}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importCsv.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}

// ─── Excel Import Panel ──────────────────────────────────────────────────────

function ExcelImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importXlsx = useImportXlsx();
  const downloadTemplate = useDownloadXlsxTemplate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      onError('請上傳 .xlsx 或 .xls 檔案');
      return;
    }
    setFile(f);
  }, [onError]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleImport = () => {
    if (!file) return;
    importXlsx.mutate(file, {
      onSuccess: (r) => onSuccess(r),
      onError: (err) => onError(extractApiError(err, 'Excel 匯入失敗')),
    });
  };

  const handleDownloadTemplate = () => {
    downloadTemplate.mutate(undefined, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quanwen-template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      onError: () => onError('範本下載失敗'),
    });
  };

  return (
    <div className="space-y-4">
      {/* Download template */}
      <button
        type="button"
        onClick={handleDownloadTemplate}
        disabled={downloadTemplate.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
      >
        📥 下載 Excel 範本
      </button>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB — 點擊更換檔案
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg">📄</p>
            <p className="mt-2 text-sm text-muted-foreground">
              拖曳 Excel 檔案到這裡，或點擊選擇檔案
            </p>
            <p className="mt-1 text-xs text-muted-foreground">支援 .xlsx、.xls</p>
          </div>
        )}
      </div>

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={!file || importXlsx.isPending || disabled}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importXlsx.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}

// ─── JSON Import Panel ───────────────────────────────────────────────────────

function JsonImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const importJson = useImportJson();
  const inputRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleFile = useCallback(
    (f: File) => {
      if (!f.name.endsWith('.json')) {
        onError('請上傳 .json 檔案');
        return;
      }
      setFile(f);
      const reader = new FileReader();
      reader.onload = () => {
        setJsonText(reader.result as string);
      };
      reader.readAsText(f);
    },
    [onError],
  );

  const handleImport = () => {
    if (!jsonText.trim()) {
      onError('請貼上或上傳 JSON');
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      importJson.mutate(parsed, {
        onSuccess: (r) => onSuccess(r),
        onError: (err) =>
          onError(extractApiError(err, 'JSON 匯入失敗')),
      });
    } catch {
      onError('JSON 格式錯誤，請檢查語法');
    }
  };

  return (
    <div className="space-y-4">
      {/* File upload */}
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
        >
          📁 選擇 JSON 檔案
        </button>
        {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
      </div>

      {/* Text area */}
      <div>
        <label className="mb-1 block text-sm font-medium">或直接貼上 JSON</label>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='{"title": "我的問卷", "questions": [...]}'
          rows={10}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={!jsonText.trim() || importJson.isPending || disabled}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importJson.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}

// ─── Google Forms Import Panel ───────────────────────────────────────────────

function GoogleFormsImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const importGf = useImportGoogleForms();
  const [url, setUrl] = useState('');
  const [html, setHtml] = useState('');
  const [mode, setMode] = useState<'url' | 'html'>('url');

  const isValidGoogleFormsUrl = (u: string) =>
    /^https:\/\/forms\.gle\/.+/i.test(u) ||
    /^https:\/\/docs\.google\.com\/forms\/.+/i.test(u);

  const handleImport = () => {
    if (mode === 'url') {
      if (!url.trim()) {
        onError('請輸入 Google Forms 連結');
        return;
      }
      if (!isValidGoogleFormsUrl(url.trim())) {
        onError('請輸入有效的 Google Forms 連結（forms.gle 或 docs.google.com/forms）');
        return;
      }
      importGf.mutate(
        { url: url.trim() },
        {
          onSuccess: (r) => onSuccess(r),
          onError: (err) =>
            onError(extractApiError(err, 'Google Forms 匯入失敗')),
        },
      );
    } else {
      if (!html.trim()) {
        onError('請貼上 Google Forms 原始 HTML');
        return;
      }
      importGf.mutate(
        { html: html.trim() },
        {
          onSuccess: (r) => onSuccess(r),
          onError: (err) =>
            onError(extractApiError(err, 'Google Forms 匯入失敗')),
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'url' ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          貼上連結
        </button>
        <button
          type="button"
          onClick={() => setMode('html')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'html' ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          貼上 HTML 原始碼
        </button>
      </div>

      {mode === 'url' ? (
        <div>
          <label className="mb-1 block text-sm font-medium">Google Forms 連結</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://forms.gle/... 或 https://docs.google.com/forms/d/e/..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            輸入 Google Forms 的分享連結，系統會自動解析題目結構。部分進階題型（如日期選擇器、檔案上傳）可能無法匯入。
          </p>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium">Google Forms HTML 原始碼</label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="在瀏覽器開啟 Google Forms → 右鍵「檢視網頁原始碼」→ 全選複製貼上"
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            如果連結匯入失敗（例如表單設定為限制存取），可以手動貼上 HTML 原始碼。
          </p>
        </div>
      )}

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={
          (mode === 'url' ? !url.trim() : !html.trim()) ||
          importGf.isPending ||
          disabled
        }
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importGf.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}

// ─── Google Sheets Import Panel ─────────────────────────────────────────────

function GoogleSheetsImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const importGs = useImportGoogleSheets();
  const [url, setUrl] = useState('');
  const [gid, setGid] = useState('');

  const isValidGoogleSheetsUrl = (u: string) =>
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\//i.test(u);

  const handleImport = () => {
    if (!url.trim()) {
      onError('請輸入 Google Sheets 連結');
      return;
    }
    if (!isValidGoogleSheetsUrl(url.trim())) {
      onError('請輸入有效的 Google Sheets 連結（docs.google.com/spreadsheets/d/...）');
      return;
    }
    importGs.mutate(
      { url: url.trim(), gid: gid.trim() || undefined },
      {
        onSuccess: (r) => onSuccess(r),
        onError: (err) =>
          onError(extractApiError(err, 'Google Sheets 匯入失敗')),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Info hint */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <p className="font-semibold">Google Sheets 匯入說明</p>
        <p className="mt-1">
          將 Google Sheets 設為「知道連結的人都能查看」或「檔案 → 發布到網路」，
          系統會自動下載為 CSV 並解析。試算表結構需與 QuanWen Excel 範本相同。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Google Sheets 連結</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Sheet GID <span className="font-normal text-muted-foreground">（選填，預設第一個 sheet）</span>
        </label>
        <input
          type="text"
          value={gid}
          onChange={(e) => setGid(e.target.value)}
          placeholder="0"
          className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          可從 URL 的 <code className="font-mono">#gid=</code> 後方取得。
        </p>
      </div>

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={!url.trim() || importGs.isPending || disabled}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importGs.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}

// ─── Import Result Card ──────────────────────────────────────────────────────

function ImportResultCard({
  result,
  onEdit,
}: {
  result: ImportResult;
  onEdit: () => void;
}) {
  const gfResult = result as GoogleFormsImportResult;
  const hasSkipped = gfResult.skippedFromSource && gfResult.skippedFromSource.length > 0;

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">✅</span>
        <p className="font-semibold text-green-900">匯入成功</p>
      </div>

      <div className="text-sm text-green-800 space-y-1">
        <p>
          已建立問卷草稿，共 <span className="font-semibold">{result.questionsCount}</span> 題。
        </p>
        {result.warnings.length > 0 && (
          <div className="mt-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2">
            <p className="font-medium text-yellow-800">⚠️ 匯入警告</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-yellow-700">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {hasSkipped && (
          <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="font-medium text-amber-800">
              以下題型無法匯入（{gfResult.skippedFromSource.length} 題）：
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-amber-700">
              {gfResult.skippedFromSource.map((s, i) => (
                <li key={i}>
                  [{s.type}] {s.title || '（無標題）'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          編輯問卷
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
        >
          再匯入一個
        </button>
      </div>
    </div>
  );
}

// ─── PDF Import Panel ────────────────────────────────────────────────────────

function PdfImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importPdf = useImportPdf();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      onError('請上傳 .pdf 檔案');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      onError('檔案大小超過 10MB 限制');
      return;
    }
    setFile(f);
  }, [onError]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleImport = () => {
    if (!file) return;
    importPdf.mutate(file, {
      onSuccess: (r) => onSuccess(r),
      onError: (err) => onError(extractApiError(err, 'PDF 匯入失敗')),
    });
  };

  return (
    <div className="space-y-4">
      {/* Info hint */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <p className="font-semibold">PDF 匯入說明</p>
        <p className="mt-1">
          上傳包含問卷結構的 PDF 檔案，系統會自動辨識題號、題目與選項。
        </p>
        <p className="mt-0.5">
          支援阿拉伯數字/中文數字編號、A/B/C 選項、李克特量表等常見格式。
          掃描圖片式 PDF 無法解析（需含可選取文字）。
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB — 點擊更換檔案
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg">📄</p>
            <p className="mt-2 text-sm text-muted-foreground">
              拖曳 PDF 檔案到這裡，或點擊選擇檔案
            </p>
            <p className="mt-1 text-xs text-muted-foreground">支援 .pdf（上限 10MB）</p>
          </div>
        )}
      </div>

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={!file || importPdf.isPending || disabled}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importPdf.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}

// ─── SurveyCake Import Panel ─────────────────────────────────────────────────

function SurveyCakeImportPanel({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (r: ImportResult) => void;
  onError: (e: string) => void;
  disabled: boolean;
}) {
  const importSc = useImportSurveyCake();
  const [mode, setMode] = useState<'url' | 'json'>('url');
  const [url, setUrl] = useState('');
  const [jsonText, setJsonText] = useState('');

  const isValidSurveyCakeUrl = (u: string) =>
    /^https?:\/\/(www\.)?surveycake\.com\/s\//i.test(u) ||
    /^https?:\/\/app\.surveycake\.com\//i.test(u);

  const handleImport = () => {
    if (mode === 'url') {
      if (!url.trim()) {
        onError('請輸入 SurveyCake 連結');
        return;
      }
      if (!isValidSurveyCakeUrl(url.trim())) {
        onError('請輸入有效的 SurveyCake 連結（surveycake.com/s/...）');
        return;
      }
      importSc.mutate(
        { url: url.trim() },
        {
          onSuccess: (r) => onSuccess(r),
          onError: (err) =>
            onError(extractApiError(err, 'SurveyCake 匯入失敗')),
        },
      );
    } else {
      if (!jsonText.trim()) {
        onError('請貼上 SurveyCake JSON');
        return;
      }
      try {
        const parsed = JSON.parse(jsonText);
        importSc.mutate(
          { json: parsed },
          {
            onSuccess: (r) => onSuccess(r),
            onError: (err) =>
              onError(extractApiError(err, 'SurveyCake 匯入失敗')),
          },
        );
      } catch {
        onError('JSON 格式錯誤，請檢查語法');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'url' ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          貼上連結
        </button>
        <button
          type="button"
          onClick={() => setMode('json')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'json' ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          貼上 JSON
        </button>
      </div>

      {mode === 'url' ? (
        <div>
          <label className="mb-1 block text-sm font-medium">SurveyCake 連結</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.surveycake.com/s/..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            輸入 SurveyCake 的分享連結，系統會嘗試解析題目結構。
            若連結匯入失敗，建議從 SurveyCake 匯出 JSON 後使用「貼上 JSON」模式。
          </p>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium">SurveyCake JSON</label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='從 SurveyCake 匯出的 JSON，貼在這裡'
            rows={10}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            在 SurveyCake 後台匯出問卷 JSON，直接貼上即可。
            支援常見的題型：單選、多選、問答、評分等。
          </p>
        </div>
      )}

      {/* Import button */}
      <button
        type="button"
        onClick={handleImport}
        disabled={
          (mode === 'url' ? !url.trim() : !jsonText.trim()) ||
          importSc.isPending ||
          disabled
        }
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {importSc.isPending ? '匯入中…' : '開始匯入'}
      </button>
    </div>
  );
}
