import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quanwen.app',
  appName: '券問 QuanWen',
  webDir: 'www',
  // 不使用 server.url —— 改由 www/index.html 做 redirect
  // 這樣 bridge.js 只注入到本地頁面，不會干擾遠端 Next.js 的 JS 環境
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
