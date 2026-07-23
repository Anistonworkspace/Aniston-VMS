import { describe, it, expect } from 'vitest';
import { OSM_RASTER_STYLE } from '../mapStyle';

describe('OSM_RASTER_STYLE', () => {
  it('credits OpenStreetMap through exactly one linked source', () => {
    const sources = Object.values(OSM_RASTER_STYLE.sources) as Array<{
      attribution?: string;
    }>;
    const attributed = sources.filter((s) => s.attribution);

    // A single attributed source means MapLibre renders the credit once.
    expect(attributed).toHaveLength(1);

    const attribution = attributed[0].attribution as string;
    expect(attribution).toContain('© ');
    expect(attribution).toContain('contributors');
    // "OpenStreetMap" must be the linked text pointing at the OSM copyright page.
    expect(attribution).toMatch(
      /<a[^>]+href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>OpenStreetMap<\/a>/,
    );
  });
});
