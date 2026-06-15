import { describe, expect, it } from 'vitest';
import type { ApplicationItem } from '../types';
import { computeAppMatches } from './AppMatchModal';

const referenceApplications: ApplicationItem[] = [
  { _id: '1', name: 'CSI Customer Care', acronym: 'CSI', correlationId: '1001' },
  { _id: '2', name: 'Platform Data Exchange', acronym: 'PDX', correlationId: '1002' },
];

describe('computeAppMatches', () => {
  it('matches applications exactly by correlationId, acronym, then name', () => {
    expect(computeAppMatches(['1001'], referenceApplications)[0]).toMatchObject({
      refMatch: 'CSI Customer Care',
      exact: true,
      matchedOn: 'correlationId',
    });

    expect(computeAppMatches(['PDX'], referenceApplications)[0]).toMatchObject({
      refMatch: 'Platform Data Exchange',
      displayMatch: 'PDX',
      exact: true,
      matchedOn: 'acronym',
    });

    expect(computeAppMatches(['CSI Customer Care'], referenceApplications)[0]).toMatchObject({
      refMatch: 'CSI Customer Care',
      displayMatch: 'CSI Customer Care',
      exact: true,
      matchedOn: 'name',
    });
  });

  it('chooses the stronger fuzzy score between acronym and full name', () => {
    const result = computeAppMatches(['CSI Customer'], referenceApplications)[0];

    expect(result.refMatch).toBe('CSI Customer Care');
    expect(result.displayMatch).toBe('CSI Customer Care');
    expect(result.exact).toBe(false);
    expect(result.matchedOn).toBe('name');
    expect(result.score).toBeGreaterThan(0.4);
  });

  it('uses acronym as display when acronym is the strongest fuzzy match', () => {
    const result = computeAppMatches(['pdxx'], referenceApplications)[0];

    expect(result.refMatch).toBe('Platform Data Exchange');
    expect(result.displayMatch).toBe('PDX');
    expect(result.matchedOn).toBe('acronym');
  });
});