export default {
  '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{js,cjs,mjs}': ['prettier --write'],
  '*.{json,yml,yaml,css}': ['prettier --write'],
};
