import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quanwen.app',
  appName: '券問 QuanWen',
  webDir: 'www',
  // 直接指向已部署的 web app（不加 path，避免 bridge 注入問題）
  server: {
    url: 'https://quanwen.vercel.app',
    cleartext: true,
  },
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
