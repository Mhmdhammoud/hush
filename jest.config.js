module.exports = {
  preset: 'react-native',
  // mcp/ has its own runner (`npm test` in mcp/)
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/mcp/'],
};
