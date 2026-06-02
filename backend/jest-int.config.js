/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Integration specs live next to the code they exercise (src) and the harness
  // lives under test/int — root both so imports + discovery work.
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Only `*.int-spec.ts` files. Wave 2 names its tests `<name>.rule.int-spec.ts`.
  testMatch: ['**/*.int-spec.ts'],
  setupFiles: ['<rootDir>/test/int/setup-env.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
      },
    ],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Single live DB shared across files — avoid parallel schema churn surprises.
  maxWorkers: 1,
};
