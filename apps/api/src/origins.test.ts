import { describe, expect, it } from 'vitest';
import { allowedWebOrigins } from './origins.js';

describe('allowedWebOrigins', () => {
  it('pairs localhost with 127.0.0.1', () => {
    expect(allowedWebOrigins('http://localhost:5173').sort()).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ]);
  });

  it('pairs 127.0.0.1 with localhost', () => {
    expect(allowedWebOrigins('http://127.0.0.1:5173').sort()).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ]);
  });
});
