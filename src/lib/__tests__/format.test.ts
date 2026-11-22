import { describe, expect, it } from 'vitest';
import { clockTime, fmtSpeed, fmtTemp } from '../format';

describe('fmtTemp', () => {
  it('shows whole degrees, as distances show whole units', () => {
    expect(fmtTemp(12.4, 'c')).toBe('12°');
    expect(fmtTemp(12.6, 'c')).toBe('13°');
  });

  it('converts to Fahrenheit', () => {
    expect(fmtTemp(0, 'f')).toBe('32°');
    expect(fmtTemp(100, 'f')).toBe('212°');
    expect(fmtTemp(-40, 'f')).toBe('-40°'); // the one place the scales meet
  });

  // Math.round(-0.2) is -0, which would render as "-0°" if it reached the
  // string directly. Template interpolation normalises it, so a hair below
  // freezing reads as 0° rather than a minus sign that means nothing.
  it('does not show a negative zero just below freezing', () => {
    expect(fmtTemp(-0.2, 'c')).toBe('0°');
    expect(fmtTemp(0, 'c')).toBe('0°');
    expect(fmtTemp(-0.6, 'c')).toBe('-1°'); // but a real negative still shows
  });
});

// Speed follows the DISTANCE preference, unlike temperature — someone reading
// miles wants mph, but a UK traveller reading miles still wants Celsius.
describe('fmtSpeed', () => {
  it('follows the distance preference', () => {
    expect(fmtSpeed(100, 'km')).toBe('100 km/h');
    expect(fmtSpeed(100, 'mi')).toBe('62 mph');
  });
});

describe('clockTime', () => {
  it('formats hours and minutes', () => {
    expect(clockTime(new Date('2026-04-10T09:05:00'))).toMatch(/\b9[:.]05\b|\b09[:.]05\b/);
  });
});
