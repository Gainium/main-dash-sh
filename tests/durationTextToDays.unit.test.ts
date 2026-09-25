import { test, expect } from '@playwright/test';

import { durationTextToDays } from '@/lib/utils/durationText';

test('parses every duration format the tables print', () => {
  expect(durationTextToDays(' 3d 12h 30min')).toBeCloseTo(3.5208, 3);
  expect(durationTextToDays('1mo 3d')).toBe(33);
  expect(durationTextToDays('12h 6m')).toBeCloseTo(0.5042, 3);
  expect(durationTextToDays('3D 4H')).toBeCloseTo(3.1667, 3);
  expect(durationTextToDays('43200s')).toBe(0.5);
});

test('text with no duration is empty, not zero', () => {
  expect(durationTextToDays('–')).toBeNull();
  expect(durationTextToDays('N/A')).toBeNull();
  expect(durationTextToDays('')).toBeNull();
  expect(durationTextToDays(undefined)).toBeNull();
});
