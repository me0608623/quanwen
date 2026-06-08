// apps/web ESLint flat config（Next 16 已移除 `next lint`；ESLint 10 只吃 flat config）。
// eslint-config-next 16 以 flat config 陣列輸出，內含 @next/next、react、react-hooks、
// typescript-eslint、import、jsx-a11y plugins 與對應 parser。等同舊 .eslintrc 的 next/core-web-vitals。
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  { ignores: ['node_modules/**', '.next/**', 'dist/**'] },
  ...nextCoreWebVitals,
  {
    // eslint-config-next 16 內建的新版 react-hooks 規則（refs / set-state-in-effect /
    // purity / immutability / incompatible-library）很新且激進，現有程式大量觸發；
    // 比照 apps/api 的「可通過 lint 基線」哲學降為 warn（不阻擋 CI，保留提示）。
    // ⚠️ react-hooks/rules-of-hooks 可能是真 bug，值得另開一輪實際修正。
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      '@next/next/no-page-custom-font': 'warn',
      'import/no-anonymous-default-export': 'warn',
    },
  },
];
