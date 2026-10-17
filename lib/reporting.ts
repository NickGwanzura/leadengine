export type StageRow = { stage: string; count: number; value: number };

export function summarizePipeline(rows: StageRow[]) {
  const totals = rows.reduce((summary, row) => {
    if (row.stage === 'WON') {
      summary.wonDeals += row.count;
      summary.revenueWon += row.value;
    } else if (row.stage !== 'LOST') {
      summary.openDeals += row.count;
      summary.pipelineValue += row.value;
    }
    return summary;
  }, { openDeals: 0, pipelineValue: 0, wonDeals: 0, revenueWon: 0 });
  return totals;
}
