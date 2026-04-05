/**
 * Split a multi-path SVG into individual SVG layers.
 * Each <path>, <circle>, <rect>, <ellipse>, <polygon> becomes its own SVG.
 * Resolves fill colors from <style> class definitions or inline attributes.
 */
export function splitSvgLayers(svgContent: string): { name: string; svg: string; color: string }[] {
  // Extract viewBox
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch?.[1] ?? '0 0 400 400';

  const widthMatch = svgContent.match(/width="([^"]+)"/);
  const heightMatch = svgContent.match(/height="([^"]+)"/);
  const width = widthMatch?.[1] ?? '400';
  const height = heightMatch?.[1] ?? '400';

  // Extract style class → fill mappings
  const classColors: Record<string, string> = {};
  const styleMatch = svgContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (styleMatch) {
    const styleContent = styleMatch[1];
    const classRegex = /\.(\w+)\s*\{\s*fill:\s*(#[0-9a-fA-F]+)\s*\}/g;
    let m;
    while ((m = classRegex.exec(styleContent)) !== null) {
      classColors[m[1]] = m[2];
    }
  }

  // Extract all shape elements
  const shapeRegex = /<(path|circle|rect|ellipse|polygon)\s+([^>]*?)\/>/g;
  const layers: { name: string; svg: string; color: string }[] = [];
  let match;
  let index = 0;

  while ((match = shapeRegex.exec(svgContent)) !== null) {
    const tag = match[1];
    const attrs = match[2];

    // Get fill color
    let color = '#000000';
    const classMatch = attrs.match(/class="(\w+)"/);
    if (classMatch && classColors[classMatch[1]]) {
      color = classColors[classMatch[1]];
    }
    const fillMatch = attrs.match(/fill="(#[0-9a-fA-F]+)"/);
    if (fillMatch) {
      color = fillMatch[1];
    }

    // Get name from id or generate one
    const idMatch = attrs.match(/id="([^"]+)"/);
    const name = idMatch ? idMatch[1].replace(/\s+/g, '-').toLowerCase() : `layer-${index}`;

    // Build standalone SVG with just this shape
    // Keep fill-rule if present, set fill color explicitly
    const fillRuleMatch = attrs.match(/fill-rule="([^"]+)"/);
    const fillRule = fillRuleMatch ? ` fill-rule="${fillRuleMatch[1]}"` : '';

    let shapeAttrs = '';
    if (tag === 'path') {
      const d = attrs.match(/(?:^|\s)d="([^"]+)"/)?.[1] ?? '';
      shapeAttrs = `d="${d}"`;
    } else {
      // For other shapes, keep all attributes except class/id/style
      shapeAttrs = attrs
        .replace(/class="[^"]*"/g, '')
        .replace(/id="[^"]*"/g, '')
        .replace(/fill="[^"]*"/g, '')
        .replace(/fill-rule="[^"]*"/g, '')
        .trim();
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}"><${tag} ${shapeAttrs} fill="${color}"${fillRule}/></svg>`;

    layers.push({ name, svg, color });
    index++;
  }

  return layers;
}
