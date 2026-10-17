import { describe, expect, it } from 'vitest';
import { summarizePipeline } from '../lib/reporting';

describe('reporting totals', () => {
  it('keeps won revenue separate from the open pipeline and excludes lost deals', () => {
    expect(summarizePipeline([
      { stage: 'NEW LEAD', count: 2, value: 450 },
      { stage: 'NEGOTIATION', count: 1, value: 750 },
      { stage: 'WON', count: 1, value: 300 },
      { stage: 'LOST', count: 2, value: 500 },
    ])).toEqual({ openDeals: 3, pipelineValue: 1200, wonDeals: 1, revenueWon: 300 });
  });
});
