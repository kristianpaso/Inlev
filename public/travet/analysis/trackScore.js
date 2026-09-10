import { getTrackContext } from './trackContext.js';

export function calculateTrackScore({ horse, race, track, historicalTrackStats, tracks = [] } = {}) {
  const context = getTrackContext({
    track,
    trackName: track?.name,
    trackSlug: track?.slug || track?.atg_slug,
    distance: race?.distance,
    startMethod: race?.startMethod || race?.start_method,
    postPosition: horse?.number || horse?.postPosition,
    tracks,
  });

  // V1 exposes objective context but deliberately has no automatic betting bonus.
  return {
    score: 0,
    reasons: [],
    features: context.features,
    context,
    historicalTrackStats: historicalTrackStats || null,
  };
}
