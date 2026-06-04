import { describe, expect, it } from 'vitest';
import type { ApplicationItem } from '../types';
import {
  buildExactApplicationIdentifierSet,
  findBestFuzzyApplicationMatch,
  findExactApplicationMatches,
  getPreferredApplicationIdentifier,
} from './applicationMatching';

const applications: ApplicationItem[] = [
  { _id: '1', name: 'CSI Customer Care', acronym: 'CSI', correlationId: '1001' },
  { _id: '2', name: 'T Data', acronym: 'TDATA', correlationId: '1002' },
  { _id: '3', name: 'IDP Customer Graph Cloud', acronym: 'IDP CG' },
];

describe('applicationMatching', () => {
  it('matches exact correlationId before acronym', () => {
    const result = findExactApplicationMatches(applications, '1001');
    expect(result.mode).toBe('correlationId');
    expect(result.selected?._id).toBe('1');
  });

  it('matches exact acronym when correlationId does not match', () => {
    const result = findExactApplicationMatches(applications, 'tdata');
    expect(result.mode).toBe('acronym');
    expect(result.selected?._id).toBe('2');
  });

  it('matches exact name when correlationId and acronym do not match', () => {
    const result = findExactApplicationMatches(applications, 'idp customer graph cloud');
    expect(result.mode).toBe('name');
    expect(result.selected?._id).toBe('3');
  });

  it('builds the exact identifier set from correlationId, acronym, and name', () => {
    expect([...buildExactApplicationIdentifierSet(applications)].sort()).toEqual([
      '1001',
      '1002',
      'csi',
      'csi customer care',
      'idp cg',
      'idp customer graph cloud',
      't data',
      'tdata',
    ]);
  });

  it('returns the preferred identifier from correlationId, then acronym', () => {
    expect(getPreferredApplicationIdentifier(applications[0])).toBe('1001');
    expect(getPreferredApplicationIdentifier(applications[2])).toBe('IDP CG');
  });

  it('finds a BPMN-only fuzzy match against reference data', () => {
    const result = findBestFuzzyApplicationMatch(applications, 'CSI Customer Care');
    expect(result?.app._id).toBe('1');
    expect(result?.identifier).toBe('1001');
    expect(result?.matchedOn).toBe('name');
  });
});