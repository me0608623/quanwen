import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quanwen.app',
  appName: '券問 QuanWen',
  webDir: 'www',
  // 回到 server.url 模式——搭配 fetch restore 腳本解決 hydration crash
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
