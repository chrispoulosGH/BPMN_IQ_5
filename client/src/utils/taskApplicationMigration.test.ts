import { describe, expect, it } from 'vitest';
import { mergeTaskApplicationNames } from './taskApplicationMigration';

describe('mergeTaskApplicationNames', () => {
  it('appends unique incoming application names while preserving existing order', () => {
    expect(
      mergeTaskApplicationNames(
        ['CSI Customer Care'],
        ['IDP IDM', 'IDP Cloud CG', 'CCMULE', 'T Data', 'CCSF']
      )
    ).toEqual([
      'CSI Customer Care',
      'IDP IDM',
      'IDP Cloud CG',
      'CCMULE',
      'T Data',
      'CCSF',
    ]);
  });

  it('deduplicates names case-insensitively across existing and incoming annotations', () => {
    expect(
      mergeTaskApplicationNames(
        ['CSI Customer Care', 'IDP IDM'],
        ['csi customer care', '  IDP IDM  ', 'CCSF']
      )
    ).toEqual(['CSI Customer Care', 'IDP IDM', 'CCSF']);
  });
});