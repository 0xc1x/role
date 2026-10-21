// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', '**/*.spec.ts', 'test/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      /**
       * Un argumento con guion bajo es un argumento que NO se usa a propósito.
       *
       * El caso de la casa es el body vacío de las rutas cuyo único propósito
       * es que el pipe de validación corra: Nest exige el parámetro para que
       * `ZodValidationPipe` reciba el cuerpo, y el servicio no lo mira. El
       * guion bajo lo dice —igual que en TypeScript y en el resto del repo— y
       * sin esta regla el lint falla por un parámetro que el framework exige.
       *
       * `argsIgnorePattern` y no `varsIgnorePattern`: la regla sigue marcando
       * las variables sin usar, que es donde está el error de verdad.
       */
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
