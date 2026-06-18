
 function hasArbitrage(localOdds, drawOdds, awayOdds) {
 
  return ((1 / localOdds) + (1 / drawOdds) + (1 / awayOdds)) < 1;
}

function calculateStakeDistribution(localOdds, drawOdds, awayOdds, totalStake) {
  const sumOfInverses = (1 / localOdds) + (1 / drawOdds) + (1 / awayOdds);
  const localStake = (totalStake / localOdds) / sumOfInverses;
  const drawStake = (totalStake / drawOdds) / sumOfInverses;
  const awayStake = (totalStake / awayOdds) / sumOfInverses;
  const guaranteedValue = (totalStake / sumOfInverses) - totalStake

  return {
    localStake,
    drawStake,
    awayStake,
    guaranteedValue
  };
}

export { hasArbitrage, calculateStakeDistribution };