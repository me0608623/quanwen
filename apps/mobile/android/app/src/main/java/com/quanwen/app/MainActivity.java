package com.quanwen.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 只保留 WebView 設定；不要在這裡 loadUrl，否則會干擾 Capacitor Bridge 初始化。
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;

        webView.post(() -> {
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
        });
    }
}
