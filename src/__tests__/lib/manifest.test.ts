import { test, expect } from 'bun:test';
import {
  hexToIconColor,
  solidFill,
  createManifest,
  addGroup,
  addLayer,
  resolveFill,
} from '../../lib/manifest';

// hexToIconColor
test('hexToIconColor #FF0000 -> srgb red', () => {
  expect(hexToIconColor('#FF0000')).toBe('srgb:1.00000,0.00000,0.00000,1.00000');
});

test('hexToIconColor #0A66C2 -> correct values', () => {
  expect(hexToIconColor('#0A66C2')).toBe('srgb:0.03922,0.40000,0.76078,1.00000');
});

test('hexToIconColor #FFF shorthand -> white', () => {
  expect(hexToIconColor('#FFF')).toBe('srgb:1.00000,1.00000,1.00000,1.00000');
});

test('hexToIconColor without leading # works', () => {
  expect(hexToIconColor('FF0000')).toBe('srgb:1.00000,0.00000,0.00000,1.00000');
});

test('hexToIconColor with custom colorSpace', () => {
  const result = hexToIconColor('#FF0000', 'display-p3');
  expect(result.startsWith('display-p3:')).toBe(true);
});

test('hexToIconColor empty string returns black default', () => {
  expect(hexToIconColor('')).toBe('srgb:0.00000,0.00000,0.00000,1.00000');
});

test('hexToIconColor single char returns black default', () => {
  expect(hexToIconColor('#f')).toBe('srgb:0.00000,0.00000,0.00000,1.00000');
});

test('hexToIconColor two chars returns black default', () => {
  expect(hexToIconColor('ab')).toBe('srgb:0.00000,0.00000,0.00000,1.00000');
});

test('hexToIconColor invalid hex chars returns black default', () => {
  expect(hexToIconColor('#ZZZZZZ')).toBe('srgb:0.00000,0.00000,0.00000,1.00000');
});

test('hexToIconColor 4 chars returns black default', () => {
  expect(hexToIconColor('#abcd')).toBe('srgb:0.00000,0.00000,0.00000,1.00000');
});

// solidFill
test('solidFill returns correct object', () => {
  expect(solidFill('#FF0000')).toEqual({ solid: 'srgb:1.00000,0.00000,0.00000,1.00000' });
});

// createManifest
test('createManifest default has groups=[] and squares=shared, no fill', () => {
  const m = createManifest();
  expect(m.groups).toEqual([]);
  expect(m['supported-platforms'].squares).toBe('shared');
  expect(m.fill).toBeUndefined();
  expect(m['fill-specializations']).toBeUndefined();
});

test('createManifest with fill sets fill, no specializations', () => {
  const m = createManifest({ fill: '#0A66C2' });
  expect(m.fill).toEqual(solidFill('#0A66C2'));
  expect(m['fill-specializations']).toBeUndefined();
});

test('createManifest with fill and darkFill uses specializations', () => {
  const m = createManifest({ fill: '#FFF', darkFill: '#000' });
  expect(m.fill).toBeUndefined();
  const specs = m['fill-specializations'];
  expect(specs).toBeDefined();
  expect(specs!.length).toBe(2);
  expect(specs![1].appearance).toBe('dark');
});

test('createManifest platforms squares false removes squares key', () => {
  const m = createManifest({ platforms: { squares: false } });
  expect(Object.keys(m['supported-platforms'])).not.toContain('squares');
});

test('createManifest darkFill alone is no-op', () => {
  const m = createManifest({ darkFill: '#000' });
  expect(m.fill).toBeUndefined();
  expect(m['fill-specializations']).toBeUndefined();
});

test('createManifest platforms circles true sets circles', () => {
  const m = createManifest({ platforms: { circles: true } });
  expect(m['supported-platforms'].circles).toEqual(['watchOS']);
});

// addGroup
test('addGroup pushes group with layers:[] and increases length', () => {
  const m = createManifest();
  addGroup(m);
  expect(m.groups.length).toBe(1);
  expect(m.groups[0].layers).toEqual([]);
});

test('addGroup with specular:false writes specular:false', () => {
  const m = createManifest();
  const g = addGroup(m, { specular: false });
  expect(g.specular).toBe(false);
});

test('addGroup with blurMaterial:null writes null', () => {
  const m = createManifest();
  const g = addGroup(m, { blurMaterial: null });
  expect(g['blur-material']).toBeNull();
});

test('addGroup with opacity:0 writes opacity:0', () => {
  const m = createManifest();
  const g = addGroup(m, { opacity: 0 });
  expect(g.opacity).toBe(0);
});

test('addGroup with name sets name', () => {
  const m = createManifest();
  const g = addGroup(m, { name: 'bg' });
  expect(g.name).toBe('bg');
});

test('addGroup returns the group that was pushed', () => {
  const m = createManifest();
  const g = addGroup(m);
  expect(m.groups[0]).toBe(g);
});

// addLayer
test('addLayer no position/scale: position key must be absent', () => {
  const m = createManifest();
  const g = addGroup(m);
  const l = addLayer(g, { imageName: 'a.png', name: 'x' });
  expect(Object.prototype.hasOwnProperty.call(l, 'position')).toBe(false);
});

test('addLayer with scale sets position.scale', () => {
  const m = createManifest();
  const g = addGroup(m);
  const l = addLayer(g, { imageName: 'a.png', name: 'x', scale: 0.65 });
  expect(l.position?.scale).toBe(0.65);
});

test('addLayer with glass:false writes glass:false', () => {
  const m = createManifest();
  const g = addGroup(m);
  const l = addLayer(g, { imageName: 'a.png', name: 'x', glass: false });
  expect(l.glass).toBe(false);
});

test('addLayer with offset sets translation-in-points', () => {
  const m = createManifest();
  const g = addGroup(m);
  const l = addLayer(g, { imageName: 'a.png', name: 'x', offset: [10, -5] });
  expect(l.position?.['translation-in-points']).toEqual([10, -5]);
});

test('addLayer pushes to group.layers', () => {
  const m = createManifest();
  const g = addGroup(m);
  addLayer(g, { imageName: 'a.png', name: 'x' });
  expect(g.layers.length).toBe(1);
});

test('addLayer with fill sets solidFill', () => {
  const m = createManifest();
  const g = addGroup(m);
  const l = addLayer(g, { imageName: 'a.png', name: 'x', fill: '#FF0000' });
  expect(l.fill).toEqual(solidFill('#FF0000'));
});

// resolveFill
test('resolveFill with no specializations returns manifest.fill', () => {
  const m = createManifest({ fill: '#FF0000' });
  expect(resolveFill(m)).toEqual(solidFill('#FF0000'));
});

test('resolveFill with dark specializations returns correct fill for dark appearance', () => {
  const m = createManifest({ fill: '#FFF', darkFill: '#000' });
  const darkFill = resolveFill(m, 'dark');
  expect(darkFill).toEqual(solidFill('#000'));
});

test('resolveFill with dark specializations returns default for no appearance', () => {
  const m = createManifest({ fill: '#FFF', darkFill: '#000' });
  const defaultFill = resolveFill(m);
  expect(defaultFill).toEqual(solidFill('#FFF'));
});

test('resolveFill with tinted but no tinted specialization falls back to default', () => {
  const m = createManifest({ fill: '#FFF', darkFill: '#000' });
  const tintedFill = resolveFill(m, 'tinted');
  // No tinted specialization, falls back to default (no appearance key) which is #FFF
  expect(tintedFill).toEqual(solidFill('#FFF'));
});

test('resolveFill with no fill returns undefined', () => {
  const m = createManifest();
  expect(resolveFill(m)).toBeUndefined();
});
