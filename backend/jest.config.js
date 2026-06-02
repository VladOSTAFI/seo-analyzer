/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  // Keep the default `npm test` suite pure-unit and DB-free: integration specs
  // (`*.int-spec.ts`) ALSO match `.spec.ts$`, so explicitly ignore them here.
  // They run via `npm run test:int` (jest-int.config.js) against a live DB.
  testPathIgnorePatterns: ['/node_modules/', '\\.int-spec\\.ts$'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
