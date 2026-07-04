package com.quanwen.app;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 等 WebView 建好後強制關閉字體縮放，防止系統字體大小影響版面
        bridge.getWebView().post(() -> {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                // 關閉文字縮放（預設會跟隨系統字體大小）
                settings.setTextZoom(100);
                // 支援 viewport meta tag
                settings.setSupportZoom(false);
                settings.setBuiltInZoomControls(false);
            }
        });
    }
}
