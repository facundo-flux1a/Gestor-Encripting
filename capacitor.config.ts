import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.muvail.app',
  appName: 'Muvail',
  webDir: 'public',
  server: {
    url: 'https://gestor.muvail.com',
    cleartext: true,
  },
};

export default config;
