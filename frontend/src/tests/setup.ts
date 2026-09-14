import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// Mock leaflet.heat
vi.mock('leaflet.heat', () => ({
  default: () => ({ addTo: () => ({}) }),
}));
