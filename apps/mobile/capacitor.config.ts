import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quanwen.app',
  appName: '券問 QuanWen',
  webDir: 'www',
  // SSR mode: 直接指向已部署的 web app，不打包靜態檔
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
