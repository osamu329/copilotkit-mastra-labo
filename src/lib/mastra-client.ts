import { MastraClient } from '@mastra/client-js';

// ブラウザ環境では絶対URLを使用
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // ブラウザ環境
    return `${window.location.origin}/api/mastra`;
  }
  // サーバー環境（フォールバック）
  return '/api/mastra';
};

export const mastraClient = new MastraClient({
  baseUrl: getBaseUrl(),
});
