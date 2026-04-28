/**
 * Geographic clustering utilities for assigning location groups to drivers.
 *
 * These functions are currently written and exported for future use in the
 * route generation pipeline.  They are not yet called by generateRoutesForBatch
 * (which uses postcode-area allocation instead), but are preserved here.
 */

/** Squared Euclidean distance between two lat/lng points (avoids sqrt). */
function distanceSq(aLat, aLng, bLat, bLng) {
  const dLat = aLat - bLat;
  const dLng = aLng - bLng;
  return dLat * dLat + dLng * dLng;
}

function totalOrdersInGroup(group) {
  return Array.isArray(group.orders) ? group.orders.length : 0;
}

/**
 * Builds an adjacency graph where each node is connected to its
 * `neighborCount` nearest neighbours (edges are bidirectional).
 */
function buildNearestNeighborGraph(groups, neighborCount = 6) {
  const graph = groups.map(() => new Set());

  for (let i = 0; i < groups.length; i++) {
    const distances = [];

    for (let j = 0; j < groups.length; j++) {
      if (i === j) continue;
      distances.push({
        index: j,
        dist: distanceSq(
          groups[i].lat,
          groups[i].lng,
          groups[j].lat,
          groups[j].lng,
        ),
      });
    }

    distances.sort((a, b) => a.dist - b.dist);

    for (const item of distances.slice(0, neighborCount)) {
      graph[i].add(item.index);
      graph[item.index].add(i);
    }
  }

  return graph;
}

/**
 * Picks `k` territory seed points by maximising the weighted distance
 * from existing seeds (k-means++ style), biased toward high-order groups.
 */
function pickTerritorySeeds(groups, k) {
  const seeds = [];
  const sorted = [...groups]
    .map((group, index) => ({
      index,
      orders: totalOrdersInGroup(group),
      lat: group.lat,
      lng: group.lng,
    }))
    .sort((a, b) => b.orders - a.orders);

  if (!sorted.length) return seeds;

  seeds.push(sorted[0].index);

  while (seeds.length < k && seeds.length < groups.length) {
    let bestIndex = null;
    let bestScore = -1;

    for (let i = 0; i < groups.length; i++) {
      if (seeds.includes(i)) continue;

      const minDistToSeed = Math.min(
        ...seeds.map((seedIndex) =>
          distanceSq(
            groups[i].lat,
            groups[i].lng,
            groups[seedIndex].lat,
            groups[seedIndex].lng,
          ),
        ),
      );

      const weightedScore =
        minDistToSeed * Math.max(1, totalOrdersInGroup(groups[i]));

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestIndex = i;
      }
    }

    if (bestIndex === null) break;
    seeds.push(bestIndex);
  }

  return seeds;
}

/**
 * Assigns each location group to a driver using flood-fill from seed points,
 * with an order-count penalty to balance loads across drivers.
 */
function clusterGroupedOrdersGeographically(groupedOrders, drivers) {
  const k = drivers.length;

  if (k === 1) {
    return [
      {
        driver: drivers[0],
        groups: groupedOrders,
        totalOrders: groupedOrders.reduce(
          (sum, group) => sum + totalOrdersInGroup(group),
          0,
        ),
      },
    ];
  }

  if (groupedOrders.length < k) {
    return drivers.map((driver, index) => ({
      driver,
      groups: groupedOrders[index] ? [groupedOrders[index]] : [],
      totalOrders: groupedOrders[index]
        ? totalOrdersInGroup(groupedOrders[index])
        : 0,
    }));
  }

  const graph = buildNearestNeighborGraph(groupedOrders, 6);
  const seeds = pickTerritorySeeds(groupedOrders, k);

  const assignments = new Array(groupedOrders.length).fill(-1);

  const buckets = drivers.map((driver, bucketIndex) => ({
    driver,
    bucketIndex,
    groups: [],
    totalOrders: 0,
    frontier: [],
  }));

  const totalOrdersAll = groupedOrders.reduce(
    (sum, group) => sum + totalOrdersInGroup(group),
    0,
  );
  const targetOrdersPerDriver = totalOrdersAll / k;

  for (let bucketIndex = 0; bucketIndex < seeds.length; bucketIndex++) {
    const seedIndex = seeds[bucketIndex];
    assignments[seedIndex] = bucketIndex;
    buckets[bucketIndex].groups.push(groupedOrders[seedIndex]);
    buckets[bucketIndex].totalOrders += totalOrdersInGroup(
      groupedOrders[seedIndex],
    );
    buckets[bucketIndex].frontier.push(seedIndex);
  }

  const unassigned = new Set(
    groupedOrders
      .map((_, index) => index)
      .filter((index) => assignments[index] === -1),
  );

  function addNeighborsToFrontier(bucketIndex, fromIndex) {
    for (const neighborIndex of graph[fromIndex]) {
      if (assignments[neighborIndex] === -1) {
        buckets[bucketIndex].frontier.push(neighborIndex);
      }
    }
  }

  for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
    const seedIndex = seeds[bucketIndex];
    if (seedIndex !== undefined) {
      addNeighborsToFrontier(bucketIndex, seedIndex);
    }
  }

  // Flood-fill: repeatedly assign the best frontier candidate to the
  // bucket that currently has the fewest orders.
  while (unassigned.size > 0) {
    let progress = false;

    const bucketOrder = [...buckets].sort(
      (a, b) => a.totalOrders - b.totalOrders,
    );

    for (const bucket of bucketOrder) {
      let bestIndex = null;
      let bestScore = Number.POSITIVE_INFINITY;

      const seen = new Set();

      for (const candidateIndex of bucket.frontier) {
        if (seen.has(candidateIndex)) continue;
        seen.add(candidateIndex);
        if (assignments[candidateIndex] !== -1) continue;

        const candidateGroup = groupedOrders[candidateIndex];

        const nearestAssignedDist = bucket.groups.length
          ? Math.min(
              ...bucket.groups.map((assignedGroup) =>
                distanceSq(
                  candidateGroup.lat,
                  candidateGroup.lng,
                  assignedGroup.lat,
                  assignedGroup.lng,
                ),
              ),
            )
          : 0;

        const overloadPenalty =
          Math.max(
            0,
            bucket.totalOrders +
              totalOrdersInGroup(candidateGroup) -
              targetOrdersPerDriver,
          ) * 0.0008;

        const score = nearestAssignedDist + overloadPenalty;

        if (score < bestScore) {
          bestScore = score;
          bestIndex = candidateIndex;
        }
      }

      // If frontier is exhausted, fall back to any remaining unassigned group.
      if (bestIndex === null) {
        for (const candidateIndex of unassigned) {
          const candidateGroup = groupedOrders[candidateIndex];

          const nearestAssignedDist = bucket.groups.length
            ? Math.min(
                ...bucket.groups.map((assignedGroup) =>
                  distanceSq(
                    candidateGroup.lat,
                    candidateGroup.lng,
                    assignedGroup.lat,
                    assignedGroup.lng,
                  ),
                ),
              )
            : 0;

          const overloadPenalty =
            Math.max(
              0,
              bucket.totalOrders +
                totalOrdersInGroup(candidateGroup) -
                targetOrdersPerDriver,
            ) * 0.0008;

          const score = nearestAssignedDist + overloadPenalty;

          if (score < bestScore) {
            bestScore = score;
            bestIndex = candidateIndex;
          }
        }
      }

      if (bestIndex !== null) {
        assignments[bestIndex] = bucket.bucketIndex;
        bucket.groups.push(groupedOrders[bestIndex]);
        bucket.totalOrders += totalOrdersInGroup(groupedOrders[bestIndex]);
        unassigned.delete(bestIndex);
        addNeighborsToFrontier(bucket.bucketIndex, bestIndex);
        progress = true;
      }
    }

    if (!progress) break;
  }

  // Force-assign any remaining unassigned groups to the closest bucket.
  for (const index of unassigned) {
    const group = groupedOrders[index];

    let bestBucketIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const bucket of buckets) {
      const nearestAssignedDist = bucket.groups.length
        ? Math.min(
            ...bucket.groups.map((assignedGroup) =>
              distanceSq(
                group.lat,
                group.lng,
                assignedGroup.lat,
                assignedGroup.lng,
              ),
            ),
          )
        : 0;

      const overloadPenalty =
        Math.max(
          0,
          bucket.totalOrders +
            totalOrdersInGroup(group) -
            targetOrdersPerDriver,
        ) * 0.0008;

      const score = nearestAssignedDist + overloadPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestBucketIndex = bucket.bucketIndex;
      }
    }

    buckets[bestBucketIndex].groups.push(group);
    buckets[bestBucketIndex].totalOrders += totalOrdersInGroup(group);
  }

  return buckets.map((bucket, index) => ({
    driver: drivers[index],
    groups: bucket.groups,
    totalOrders: bucket.totalOrders,
  }));
}

/**
 * Post-processes cluster assignments by voting: each group checks its 6
 * nearest neighbours and moves to the majority bucket if it would not
 * empty its current bucket.  Runs up to `iterations` passes.
 */
function improveClusterBoundaries(buckets, iterations = 4) {
  const allGroups = [];
  const ownership = new Map();

  buckets.forEach((bucket, bucketIndex) => {
    bucket.groups.forEach((group) => {
      allGroups.push(group);
      ownership.set(group, bucketIndex);
    });
  });

  for (let iter = 0; iter < iterations; iter++) {
    let movedAny = false;

    for (const group of allGroups) {
      const currentBucketIndex = ownership.get(group);

      const neighbors = allGroups
        .filter((other) => other !== group)
        .map((other) => ({
          group: other,
          bucketIndex: ownership.get(other),
          dist: distanceSq(group.lat, group.lng, other.lat, other.lng),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6);

      const votes = new Map();
      for (const neighbor of neighbors) {
        votes.set(
          neighbor.bucketIndex,
          (votes.get(neighbor.bucketIndex) || 0) + 1,
        );
      }

      let bestBucketIndex = currentBucketIndex;
      let bestVotes = votes.get(currentBucketIndex) || 0;

      for (const [bucketIndex, count] of votes.entries()) {
        if (count > bestVotes) {
          bestVotes = count;
          bestBucketIndex = bucketIndex;
        }
      }

      if (bestBucketIndex !== currentBucketIndex) {
        const fromBucket = buckets[currentBucketIndex];
        const toBucket = buckets[bestBucketIndex];

        if (!fromBucket || !toBucket) continue;
        if (fromBucket.groups.length <= 1) continue;

        fromBucket.groups = fromBucket.groups.filter((g) => g !== group);
        fromBucket.totalOrders -= totalOrdersInGroup(group);

        toBucket.groups.push(group);
        toBucket.totalOrders += totalOrdersInGroup(group);

        ownership.set(group, bestBucketIndex);
        movedAny = true;
      }
    }

    if (!movedAny) break;
  }

  return buckets;
}

module.exports = {
  distanceSq,
  totalOrdersInGroup,
  buildNearestNeighborGraph,
  pickTerritorySeeds,
  clusterGroupedOrdersGeographically,
  improveClusterBoundaries,
};
