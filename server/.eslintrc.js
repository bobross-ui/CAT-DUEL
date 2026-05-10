module.exports = {
  extends: ['../.eslintrc.js'],
  rules: {
    'no-console': 'error',
  },
  overrides: [
    {
      files: ['scripts/**/*.ts', 'prisma/**/*.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
