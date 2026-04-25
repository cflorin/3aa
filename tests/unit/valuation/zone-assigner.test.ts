// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-006: Unit tests — ZoneAssigner (assignZone)

import { assignZone } from '../../../src/domain/valuation/zone-assigner';

// Reference thresholds for most tests (ascending): steal=5, veryGood=8, comfortable=12, max=16
const STEAL = 5;
const VERY_GOOD = 8;
const COMFORTABLE = 12;
const MAX = 16;

function zone(multiple: number | null) {
  return assignZone(multiple, MAX, COMFORTABLE, VERY_GOOD, STEAL);
}

describe('EPIC-005/STORY-075/TASK-075-006: assignZone()', () => {
  // ── Zone boundaries ──────────────────────────────────────────────────────────

  describe('steal_zone', () => {
    it('multiple well below steal → steal_zone', () => {
      expect(zone(2)).toBe('steal_zone');
    });

    it('multiple exactly at steal threshold → steal_zone', () => {
      expect(zone(STEAL)).toBe('steal_zone');
    });

    it('multiple = steal (5) → steal_zone', () => {
      expect(assignZone(5, 16, 12, 8, 5)).toBe('steal_zone');
    });
  });

  describe('very_good_zone', () => {
    it('multiple just above steal → very_good_zone', () => {
      expect(zone(STEAL + 0.01)).toBe('very_good_zone');
    });

    it('multiple exactly at veryGood threshold → very_good_zone', () => {
      expect(zone(VERY_GOOD)).toBe('very_good_zone');
    });

    it('multiple = 8 (exactly veryGood) → very_good_zone', () => {
      expect(assignZone(8, 16, 12, 8, 5)).toBe('very_good_zone');
    });

    it('multiple in middle of very_good range → very_good_zone', () => {
      expect(zone(6.5)).toBe('very_good_zone');
    });
  });

  describe('comfortable_zone', () => {
    it('multiple just above veryGood → comfortable_zone', () => {
      expect(zone(VERY_GOOD + 0.01)).toBe('comfortable_zone');
    });

    it('multiple exactly at comfortable threshold → comfortable_zone', () => {
      expect(zone(COMFORTABLE)).toBe('comfortable_zone');
    });

    it('multiple = 12 (exactly comfortable) → comfortable_zone', () => {
      expect(assignZone(12, 16, 12, 8, 5)).toBe('comfortable_zone');
    });

    it('multiple in middle of comfortable range → comfortable_zone', () => {
      expect(zone(10)).toBe('comfortable_zone');
    });
  });

  describe('max_zone', () => {
    it('multiple just above comfortable → max_zone', () => {
      expect(zone(COMFORTABLE + 0.01)).toBe('max_zone');
    });

    it('multiple exactly at max threshold → max_zone', () => {
      expect(zone(MAX)).toBe('max_zone');
    });

    it('multiple = 16 (exactly max) → max_zone', () => {
      expect(assignZone(16, 16, 12, 8, 5)).toBe('max_zone');
    });

    it('multiple in middle of max range → max_zone', () => {
      expect(zone(14)).toBe('max_zone');
    });
  });

  describe('above_max', () => {
    it('multiple just above max → above_max', () => {
      expect(zone(MAX + 0.01)).toBe('above_max');
    });

    it('multiple well above max → above_max', () => {
      expect(zone(30)).toBe('above_max');
    });

    it('multiple = 16.01 → above_max', () => {
      expect(assignZone(16.01, 16, 12, 8, 5)).toBe('above_max');
    });
  });

  // ── not_applicable: null cases ───────────────────────────────────────────────

  describe('not_applicable', () => {
    it('null multiple → not_applicable', () => {
      expect(assignZone(null, MAX, COMFORTABLE, VERY_GOOD, STEAL)).toBe('not_applicable');
    });

    it('null maxThreshold → not_applicable', () => {
      expect(assignZone(10, null, COMFORTABLE, VERY_GOOD, STEAL)).toBe('not_applicable');
    });

    it('null comfortableThreshold → not_applicable', () => {
      expect(assignZone(10, MAX, null, VERY_GOOD, STEAL)).toBe('not_applicable');
    });

    it('null veryGoodThreshold → not_applicable', () => {
      expect(assignZone(10, MAX, COMFORTABLE, null, STEAL)).toBe('not_applicable');
    });

    it('null stealThreshold → not_applicable', () => {
      expect(assignZone(10, MAX, COMFORTABLE, VERY_GOOD, null)).toBe('not_applicable');
    });

    it('all null → not_applicable', () => {
      expect(assignZone(null, null, null, null, null)).toBe('not_applicable');
    });
  });

  // ── Exact boundary values ────────────────────────────────────────────────────

  describe('Exact boundary transitions', () => {
    it('steal boundary: multiple=steal → steal_zone; multiple=steal+0.01 → very_good_zone', () => {
      expect(zone(STEAL)).toBe('steal_zone');
      expect(zone(STEAL + 0.01)).toBe('very_good_zone');
    });

    it('veryGood boundary: multiple=veryGood → very_good_zone; multiple=veryGood+0.01 → comfortable_zone', () => {
      expect(zone(VERY_GOOD)).toBe('very_good_zone');
      expect(zone(VERY_GOOD + 0.01)).toBe('comfortable_zone');
    });

    it('comfortable boundary: multiple=comfortable → comfortable_zone; multiple=comfortable+0.01 → max_zone', () => {
      expect(zone(COMFORTABLE)).toBe('comfortable_zone');
      expect(zone(COMFORTABLE + 0.01)).toBe('max_zone');
    });

    it('max boundary: multiple=max → max_zone; multiple=max+0.01 → above_max', () => {
      expect(zone(MAX)).toBe('max_zone');
      expect(zone(MAX + 0.01)).toBe('above_max');
    });
  });

  // ── Real threshold values from anchored set ──────────────────────────────────

  describe('Real threshold values', () => {
    it('4AA thresholds (22/20/18/16): forward_pe=18 → very_good_zone', () => {
      // steal=16, veryGood=18, comfortable=20, max=22
      expect(assignZone(18, 22, 20, 18, 16)).toBe('very_good_zone');
    });

    it('4AA thresholds: forward_pe=21 → max_zone', () => {
      expect(assignZone(21, 22, 20, 18, 16)).toBe('max_zone');
    });

    it('4AA thresholds: forward_pe=23 → above_max', () => {
      expect(assignZone(23, 22, 20, 18, 16)).toBe('above_max');
    });

    it('6BA thresholds (9/7/5.5/4): ev_sales=4.5 → very_good_zone', () => {
      // steal=4, veryGood=5.5, comfortable=7, max=9
      expect(assignZone(4.5, 9, 7, 5.5, 4)).toBe('very_good_zone');
    });

    it('6BA thresholds: ev_sales=4.0 → steal_zone', () => {
      expect(assignZone(4.0, 9, 7, 5.5, 4)).toBe('steal_zone');
    });

    it('7BA thresholds (14/11/8.5/6): ev_sales=7 → very_good_zone', () => {
      // steal=6, veryGood=8.5, comfortable=11, max=14
      expect(assignZone(7, 14, 11, 8.5, 6)).toBe('very_good_zone');
    });
  });
});
