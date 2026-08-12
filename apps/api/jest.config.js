/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Project root so transformers (ts-jest) resolve from node_modules correctly.
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      require.resolve('ts-jest'),
      {
        tsconfig: {
          allowJs: true,
          esModuleInterop: true,
          // Specs are excluded from main tsconfig; give jest a usable compiler surface.
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: false,
        },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!@0xc1x/role-commons/)'],
  moduleNameMapper: {
    // Prefer source when linked package dist is stale / ESM-only under CJS jest.
    '^@0xc1x/role-commons$': '<rootDir>/../role-commons/src/index.ts',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/database/schema/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  testEnvironment: 'node',
  // Raise toward 70% as coverage grows; CI uses --coverage.
  // Phase 3 target: branches/lines >= 70 once guards + services are green.
};
