package com.quanwen.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;

        webView.post(() -> {
            WebSettings settings = webView.getSettings();

            // 鎖定字體縮放
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);

            // 關鍵修復：清除 WebView cache，確保不會載入到舊版 JS chunks
            // 這是導致 hydration crash 的根因——舊 JS 跟新 HTML 不匹配
            webView.clearCache(true);
            webView.clearHistory();

            // 關閉 cache，每次都從 server 取最新版（開發期間用）
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        });
    }
}
