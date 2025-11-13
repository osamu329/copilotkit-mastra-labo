import { MastraClient } from '@mastra/client-js';

// NOTE: MastraClient automatically adds /api/ prefix to all endpoints
// So baseUrl should be just the server root
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // ブラウザ環境: window.location.origin (e.g., "http://localhost:3000")
    return window.location.origin;
  }
  // サーバー環境（フォールバック）
  return '';
};

export const mastraClient = new MastraClient({
  baseUrl: getBaseUrl(),
});
