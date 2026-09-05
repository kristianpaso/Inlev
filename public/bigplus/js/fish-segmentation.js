const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function quantile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function point(x, y) {
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function pixelScore(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const luminance = (r * 0.299) + (g * 0.587) + (b * 0.114);
  const warm = clamp((r - b + 28) / 150, 0, 1);
  const neutral = 1 - clamp(Math.abs(r - g) / 105, 0, 1);
  const midTone = 1 - clamp(Math.abs(luminance - 128) / 165, 0, 1);
  const bluePenalty = clamp((b - Math.max(r, g)) / 90, 0, 1);
  const greenPenalty = clamp((g - Math.max(r, b)) / 115, 0, 1);
  return clamp((warm * 0.38) + (neutral * 0.27) + (midTone * 0.25) + ((1 - bluePenalty) * 0.1) - (greenPenalty * 0.12), 0, 1);
}

function dilate(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      output[index] = mask[index] || mask[index - 1] || mask[index + 1] || mask[index - width] || mask[index + width] ? 1 : 0;
    }
  }
  return output;
}

function erode(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      output[index] = mask[index] && mask[index - 1] && mask[index + 1] && mask[index - width] && mask[index + width] ? 1 : 0;
    }
  }
  return output;
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = new Int32Array(mask.length);
  const neighbours = [-1, 1, -width - 1, -width, -width + 1, width - 1, width, width + 1];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const offset of neighbours) {
        const next = index + offset;
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail > 8) components.push({ pixels: queue.slice(0, tail), area: tail, minX, minY, maxX, maxY });
  }
  return components;
}

function componentOutline(component, width, height, sourceWidth, sourceHeight) {
  const columns = new Map();
  component.pixels.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const current = columns.get(x) || { minY: y, maxY: y };
    current.minY = Math.min(current.minY, y);
    current.maxY = Math.max(current.maxY, y);
    columns.set(x, current);
  });
  const xs = [...columns.keys()].sort((a, b) => a - b);
  if (xs.length < 2) return [];
  const top = xs.map((x) => point(x / width * sourceWidth, columns.get(x).minY / height * sourceHeight));
  const bottom = xs.slice().reverse().map((x) => point(x / width * sourceWidth, columns.get(x).maxY / height * sourceHeight));
  return [...top, ...bottom];
}

function geodesicComponentLandmarks(component, width, height, sourceWidth, sourceHeight) {
  if (!component?.pixels?.length) return null;
  const membership = new Uint8Array(width * height);
  component.pixels.forEach((index) => { membership[index] = 1; });
  const mean = component.pixels.reduce((sum, index) => ({
    x: sum.x + (index % width),
    y: sum.y + Math.floor(index / width)
  }), { x: 0, y: 0 });
  mean.x /= component.pixels.length;
  mean.y /= component.pixels.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  component.pixels.forEach((index) => {
    const dx = (index % width) - mean.x;
    const dy = Math.floor(index / width) - mean.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  });
  const trace = xx + yy;
  const eigenvalue = (trace + Math.sqrt(Math.max(0, ((xx - yy) ** 2) + (4 * xy * xy)))) / 2;
  let axisX = xy;
  let axisY = eigenvalue - xx;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  axisX /= axisLength;
  axisY /= axisLength;
  if (Math.abs(axisX) < 0.001 && Math.abs(axisY) < 0.001) axisX = 1;
  const profiles = component.pixels.map((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const dx = x - mean.x;
    const dy = y - mean.y;
    return {
      index,
      projection: (dx * axisX) + (dy * axisY),
      perpendicular: (-dx * axisY) + (dy * axisX)
    };
  });
  const minProjection = profiles.reduce((minimum, item) => Math.min(minimum, item.projection), Infinity);
  const maxProjection = profiles.reduce((maximum, item) => Math.max(maximum, item.projection), -Infinity);
  const projectionRange = Math.max(1, maxProjection - minProjection);
  // The tail fan can bend away from the main body axis. Keep a wider end
  // zone for endpoint selection so the far fin tip is not mistaken for the
  // tail base, while the centerline still uses trimmed body cross-sections.
  const zoneFor = (side) => profiles.filter((item) => side === "min"
    ? item.projection <= minProjection + projectionRange * 0.30
    : item.projection >= maxProjection - projectionRange * 0.30);
  const profileFor = (zone) => {
    const perpendicular = zone.map((item) => item.perpendicular);
    return {
      zone,
      spread: perpendicular.reduce((maximum, value) => Math.max(maximum, value), -Infinity)
        - perpendicular.reduce((minimum, value) => Math.min(minimum, value), Infinity),
      area: zone.length
    };
  };
  const minSide = profileFor(zoneFor("min"));
  const maxSide = profileFor(zoneFor("max"));
  if (!minSide.zone.length || !maxSide.zone.length) return null;
  // A pike's pointed head occupies a narrower end zone than its tail fan.
  // This remains useful when the fish is vertical or bends away from x-axis.
  const endWidthScore = (profile) => profile.spread * 0.72 + Math.sqrt(profile.area) * 0.28;
  const noseProfile = endWidthScore(minSide) <= endWidthScore(maxSide) ? minSide : maxSide;
  const tailProfile = noseProfile === minSide ? maxSide : minSide;
  const localDensity = (index) => {
    const centerX = index % width;
    const centerY = Math.floor(index / width);
    const radius = Math.max(3, Math.round(Math.min(width, height) * 0.025));
    let count = 0;
    for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y += 1) {
      for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x += 1) {
        count += membership[(y * width) + x];
      }
    }
    return count;
  };
  const noseEndpoint = noseProfile.zone.reduce((best, candidate) => {
    const bestDensity = localDensity(best.index);
    const candidateDensity = localDensity(candidate.index);
    if (candidateDensity !== bestDensity) return candidateDensity < bestDensity ? candidate : best;
    return Math.abs(candidate.projection) > Math.abs(best.projection) ? candidate : best;
  }, noseProfile.zone[0]).index;
  const noseProfilePoint = profiles.find((item) => item.index === noseEndpoint);
  const noseX = noseEndpoint % width;
  const noseY = Math.floor(noseEndpoint / width);
  const tailEndpoint = tailProfile.zone.reduce((best, candidate) => {
    const candidateX = candidate.index % width;
    const candidateY = Math.floor(candidate.index / width);
    const bestX = best.index % width;
    const bestY = Math.floor(best.index / width);
    const candidateDistance = ((candidateX - noseX) ** 2) + ((candidateY - noseY) ** 2);
    const bestDistance = ((bestX - noseX) ** 2) + ((bestY - noseY) ** 2);
    return candidateDistance > bestDistance ? candidate : best;
  }, tailProfile.zone[0]).index;
  if (noseEndpoint === tailEndpoint) return null;
  const tailProfilePoint = profiles.find((item) => item.index === tailEndpoint);
  if (!noseProfilePoint || !tailProfilePoint) return null;
  const noseProjection = noseProfilePoint.projection;
  const tailProjection = tailProfilePoint.projection;
  const toPoint = (projection, perpendicular) => point(
    (mean.x + (projection * axisX) - (perpendicular * axisY)) / width * sourceWidth,
    (mean.y + (projection * axisY) + (perpendicular * axisX)) / height * sourceHeight
  );
  const centerAtProjection = (targetProjection, isEndpoint = false) => {
    if (isEndpoint) return toPoint(targetProjection, isEndpoint === "nose" ? noseProfilePoint.perpendicular : tailProfilePoint.perpendicular);
    const halfBin = Math.max(2, projectionRange / 48 * 0.78);
    let candidates = profiles.filter((item) => Math.abs(item.projection - targetProjection) <= halfBin);
    if (candidates.length < 5) {
      candidates = profiles.slice().sort((left, right) => Math.abs(left.projection - targetProjection) - Math.abs(right.projection - targetProjection)).slice(0, 20);
    }
    const perpendiculars = candidates.map((item) => item.perpendicular).sort((left, right) => left - right);
    const trimStart = Math.floor(perpendiculars.length * 0.18);
    const trimEnd = Math.max(trimStart + 1, Math.ceil(perpendiculars.length * 0.82));
    const trimmed = perpendiculars.slice(trimStart, trimEnd);
    const medianPerpendicular = trimmed[Math.floor(trimmed.length / 2)] || perpendiculars[Math.floor(perpendiculars.length / 2)] || 0;
    const selected = candidates.reduce((best, candidate) => {
      const bestDistance = Math.abs(best.perpendicular - medianPerpendicular) + Math.abs(best.projection - targetProjection) * 0.12;
      const candidateDistance = Math.abs(candidate.perpendicular - medianPerpendicular) + Math.abs(candidate.projection - targetProjection) * 0.12;
      return candidateDistance < bestDistance ? candidate : best;
    }, candidates[0]);
    return toPoint(selected.projection, selected.perpendicular);
  };
  // Use the median cross-section for the body. This deliberately ignores
  // narrow side fins, which a shortest-path route can incorrectly follow.
  const centerlineCount = Math.min(48, Math.max(8, Math.round(projectionRange / 5)));
  const centerline = Array.from({ length: centerlineCount }, (_, index) => {
    const fraction = index / Math.max(1, centerlineCount - 1);
    if (index === 0) return centerAtProjection(noseProjection, "nose");
    if (index === centerlineCount - 1) return centerAtProjection(tailProjection, "tail");
    return centerAtProjection(noseProjection + ((tailProjection - noseProjection) * fraction));
  });
  const sample = (fraction) => centerline[Math.round(fraction * (centerline.length - 1))];
  return {
    noseTip: sample(0),
    bodyCenter: sample(0.5),
    tailBase: sample(0.78),
    tailTip: sample(1),
    points: [sample(0), sample(0.5), sample(0.78), sample(1)],
    centerline
  };
}

function componentLandmarks(component, width, height, sourceWidth, sourceHeight) {
  const geodesic = geodesicComponentLandmarks(component, width, height, sourceWidth, sourceHeight);
  if (geodesic) return geodesic;
  const columns = new Map();
  component.pixels.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const current = columns.get(x) || { minY: y, maxY: y, count: 0 };
    current.minY = Math.min(current.minY, y);
    current.maxY = Math.max(current.maxY, y);
    current.count += 1;
    columns.set(x, current);
  });
  const xs = [...columns.keys()].sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const thickness = (range) => range.reduce((sum, x) => sum + (columns.get(x).maxY - columns.get(x).minY + 1), 0) / Math.max(1, range.length);
  const sampleSize = Math.max(2, Math.floor(xs.length * 0.14));
  const leftThickness = thickness(xs.slice(0, sampleSize));
  const rightThickness = thickness(xs.slice(-sampleSize));
  const leftIsTail = leftThickness < rightThickness;
  const tailXs = leftIsTail ? xs.slice(0, Math.max(2, Math.floor(xs.length * 0.12))) : xs.slice(-Math.max(2, Math.floor(xs.length * 0.12)));
  const noseXs = leftIsTail ? xs.slice(-Math.max(2, Math.floor(xs.length * 0.08))) : xs.slice(0, Math.max(2, Math.floor(xs.length * 0.08)));
  const middleXs = xs.slice(Math.floor(xs.length * 0.35), Math.ceil(xs.length * 0.7));
  const centerAt = (x) => {
    const range = columns.get(x);
    return point(x / width * sourceWidth, ((range.minY + range.maxY) / 2) / height * sourceHeight);
  };
  const averagePoint = (range) => point(
    range.reduce((sum, x) => sum + centerAt(x).x, 0) / range.length,
    range.reduce((sum, x) => sum + centerAt(x).y, 0) / range.length
  );
  const tailTip = averagePoint(tailXs);
  const noseTip = averagePoint(noseXs);
  const bodyCenter = averagePoint(middleXs.length ? middleXs : xs);
  const tailBaseXs = leftIsTail ? xs.slice(Math.floor(xs.length * 0.15), Math.floor(xs.length * 0.28)) : xs.slice(Math.floor(xs.length * 0.72), Math.floor(xs.length * 0.85));
  const tailBase = averagePoint(tailBaseXs.length ? tailBaseXs : tailXs);
  const ordered = leftIsTail ? [noseTip, bodyCenter, tailBase, tailTip] : [noseTip, bodyCenter, tailBase, tailTip];
  const orderedXs = leftIsTail ? xs.slice().reverse() : xs;
  const centerlineCount = Math.min(32, orderedXs.length);
  const centerline = Array.from({ length: centerlineCount }, (_, index) => {
    const sourceIndex = Math.round(index * (orderedXs.length - 1) / Math.max(1, centerlineCount - 1));
    return centerAt(orderedXs[sourceIndex]);
  });
  return {
    noseTip,
    bodyCenter,
    tailBase,
    tailTip,
    points: ordered,
    centerline
  };
}

function encodeMask(mask) {
  const runs = [];
  let current = mask[0] || 0;
  let count = 0;
  mask.forEach((value) => {
    if (value === current) {
      count += 1;
      return;
    }
    runs.push(`${current}:${count}`);
    current = value;
    count = 1;
  });
  if (count) runs.push(`${current}:${count}`);
  return runs.join(",");
}

function buildModelSegmentation(mask, width, height, sourceWidth, sourceHeight, metadata = {}) {
  const components = connectedComponents(mask, width, height);
  const imageArea = width * height;
  const largestArea = components.reduce((maximum, component) => Math.max(maximum, component.area), 0);
  const ranked = components.map((component) => {
    const componentWidth = component.maxX - component.minX + 1;
    const componentHeight = component.maxY - component.minY + 1;
    const aspect = componentWidth / Math.max(1, componentHeight);
    const areaRatio = component.area / imageArea;
    const centerY = ((component.minY + component.maxY) / 2) / height;
    const elongated = clamp((aspect - 1.1) / 5, 0, 1);
    const usefulArea = clamp(areaRatio / 0.28, 0, 1) * clamp(1 - Math.max(0, areaRatio - 0.62) / 0.35, 0, 1);
    const position = 1 - clamp(Math.abs(centerY - 0.58) / 0.45, 0, 1);
    const dominance = largestArea > 0 ? component.area / largestArea : 0;
    const dominanceBonus = clamp((dominance - 0.25) / 0.75, 0, 1) * 0.18;
    return { component, score: (elongated * 0.42) + (usefulArea * 0.26) + (position * 0.14) + dominanceBonus, aspect, areaRatio };
  }).filter((item) => item.areaRatio > 0.006 && item.areaRatio < 0.72).sort((a, b) => b.score - a.score);
  const selected = ranked[0];
  if (!selected) return null;
  const { component } = selected;
  const landmarks = componentLandmarks(component, width, height, sourceWidth, sourceHeight);
  if (!landmarks) return null;
  return {
    adapter: "fish-segmentation-model",
    modelAvailable: true,
    modelBacked: true,
    modelVersion: metadata.modelVersion || "fish_segmenter_v1",
    mode: "ai_model",
    maskAvailable: true,
    mask: encodeMask(mask),
    confidence: clamp(0.55 + (selected.score * 0.4), 0.55, 0.96),
    visiblePercentage: clamp(selected.areaRatio * 3.2, 0.35, 0.98),
    boundingBox: {
      x: Math.round(component.minX / width * sourceWidth),
      y: Math.round(component.minY / height * sourceHeight),
      width: Math.round((component.maxX - component.minX + 1) / width * sourceWidth),
      height: Math.round((component.maxY - component.minY + 1) / height * sourceHeight)
    },
    outline: componentOutline(component, width, height, sourceWidth, sourceHeight),
    fishLandmarks: landmarks,
    diagnostics: {
      ...(metadata.diagnostics || { method: "MediaPipe ImageSegmenter foreground mask" }),
      componentCount: components.length,
      selectedComponentAreaRatio: selected.areaRatio,
      selectedComponentExtentRatio: Math.max(
        (component.maxX - component.minX + 1) / Math.max(1, width),
        (component.maxY - component.minY + 1) / Math.max(1, height)
      )
    }
  };
}

const FISH_SEGMENTER_MODEL_PATHS = [
  "/bigplus/vendor/fish/fish_segmenter.task",
  "/bigplus/vendor/fish/fish_segmenter.tflite",
];
let fishSegmenterPromise;

async function findFishSegmenterModelPath() {
  for (const path of FISH_SEGMENTER_MODEL_PATHS) {
    try {
      const response = await fetch(path, { method: "HEAD", cache: "no-store" });
      if (response.ok) return path;
    } catch {
      // The local fallback remains available when no model has been deployed.
    }
  }
  return null;
}

async function loadFishSegmenter() {
  if (!fishSegmenterPromise) {
    fishSegmenterPromise = (async () => {
      const modelPath = await findFishSegmenterModelPath();
      if (!modelPath) return null;
      const { FilesetResolver, ImageSegmenter } = await import("/bigplus/vendor/face/vision_bundle.js");
      const vision = await FilesetResolver.forVisionTasks("/bigplus/vendor/face/wasm");
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true
      });
    })().catch(() => null);
  }
  return fishSegmenterPromise;
}

function modelMaskToBinary(mask, width, height) {
  const values = mask?.getAsFloat32Array?.() || mask?.getAsUint8Array?.() || mask?.data;
  if (!values?.length) return null;
  const maskWidth = Number(mask?.width ?? mask?.getWidth?.()) || width;
  const maskHeight = Number(mask?.height ?? mask?.getHeight?.()) || height;
  const byteMask = values instanceof Uint8Array || values instanceof Uint8ClampedArray;
  const binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(maskHeight - 1, Math.floor(y / height * maskHeight));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(maskWidth - 1, Math.floor(x / width * maskWidth));
      const value = values[sourceY * maskWidth + sourceX];
      binary[y * width + x] = (byteMask ? value / 255 : value) >= 0.5 ? 1 : 0;
    }
  }
  return binary;
}

async function segmentFishWithModel(image, width, height, sourceWidth, sourceHeight) {
  const segmenter = await loadFishSegmenter();
  if (!segmenter) return null;
  try {
    const result = segmenter.segment(image);
    const confidenceMasks = result?.confidenceMasks || [];
    const fishMask = confidenceMasks.length > 1 ? confidenceMasks[1] : confidenceMasks[0];
    const binary = modelMaskToBinary(fishMask, width, height);
    result?.close?.();
    return binary ? buildModelSegmentation(binary, width, height, sourceWidth, sourceHeight) : null;
  } catch {
    return null;
  }
}

const isLocalAiHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const hostedAiProxyOrigin = window.__BIGPLUS_AI_PROXY_ORIGIN__ || "https://sage-vacherin-aa5cd3.netlify.app";
const SAM2_MEASURE_ENDPOINT = isLocalAiHost
  ? "http://127.0.0.1:8200/api/annotation/sam2"
  : `${hostedAiProxyOrigin}/api/annotation/sam2`;

function createImageCanvas(image, maxEdge) {
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, maxEdge / Math.max(imageWidth, imageHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(32, Math.round(imageWidth * scale));
  canvas.height = Math.max(32, Math.round(imageHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, width: canvas.width, height: canvas.height, sourceWidth: imageWidth, sourceHeight: imageHeight };
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas) {
      resolve(null);
      return;
    }
    canvas.toBlob(resolve, "image/jpeg", 0.86);
  });
}

function loadMaskImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const maskImage = new Image();
    maskImage.onload = () => resolve(maskImage);
    maskImage.onerror = () => reject(new Error("SAM 2-masken kunde inte läsas."));
    maskImage.src = dataUrl;
  });
}

async function samMaskToBinary(dataUrl, width, height) {
  const maskImage = await loadMaskImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(maskImage, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const binary = new Uint8Array(width * height);
  for (let index = 0; index < binary.length; index += 1) {
    const pixel = index * 4;
    binary[index] = ((pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 3) >= 127 ? 1 : 0;
  }
  return binary;
}

function scoreSamMask(binary, segmentation, imageData, width, height, candidate) {
  let foreground = 0;
  let colorScore = 0;
  let touchesEdge = 0;
  for (let index = 0; index < binary.length; index += 1) {
    if (!binary[index]) continue;
    foreground += 1;
    colorScore += pixelScore(imageData, index * 4);
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge += 1;
  }
  if (!foreground || !segmentation?.boundingBox) return -1;
  const box = segmentation.boundingBox;
  const boxWidth = Math.max(1, box.width);
  const boxHeight = Math.max(1, box.height);
  const elongation = Math.max(boxWidth / boxHeight, boxHeight / boxWidth);
  const areaRatio = foreground / Math.max(1, width * height);
  const colorAverage = colorScore / foreground;
  const shapeScore = clamp((elongation - 1.05) / 3.6, 0, 1);
  const sizeScore = clamp(1 - Math.abs(areaRatio - 0.16) / 0.3, 0, 1);
  const componentCount = Math.max(1, Number(segmentation.diagnostics?.componentCount) || 1);
  const cohesionScore = clamp(1 - ((componentCount - 1) * 0.09), 0.2, 1);
  const componentExtent = clamp(
    Number(segmentation.diagnostics?.selectedComponentExtentRatio) || Math.max(boxWidth / width, boxHeight / height),
    0,
    1
  );
  const extentScore = clamp((componentExtent - 0.25) / 0.55, 0, 1);
  const componentAreaScore = clamp((Number(segmentation.diagnostics?.selectedComponentAreaRatio) || 0) / 0.08, 0, 1);
  const cohesionBonus = (cohesionScore * 0.11) + (extentScore * 0.05) + (componentAreaScore * 0.04);
  const edgePenalty = touchesEdge / Math.max(1, foreground) > 0.01 ? 0.18 : 0;
  return (
    clamp(Number(candidate?.score) || 0, 0, 1) * 0.18
    + clamp(Number(segmentation.confidence) || 0, 0, 1) * 0.18
    + shapeScore * 0.24
    + sizeScore * 0.18
    + colorAverage * 0.22
    + cohesionBonus
    - edgePenalty
  );
}

async function segmentFishWithSam2(image, analysis) {
  if (typeof fetch !== "function" || typeof window === "undefined") return null;
  const uploadCanvas = createImageCanvas(image, 1600)?.canvas;
  const upload = await canvasToJpegBlob(uploadCanvas);
  if (!upload) return null;
  const formData = new FormData();
  formData.append("image", upload, "bigplus-measure.jpg");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = window.setTimeout(() => controller?.abort(), 45000);
  try {
    const response = await fetch(`${SAM2_MEASURE_ENDPOINT}?candidates=12&fast=1`, {
      method: "POST",
      body: formData,
      signal: controller?.signal
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    if (!candidates.length) return null;
    const scored = [];
    for (const candidate of candidates) {
      if (!candidate?.maskDataUrl) continue;
      const binary = await samMaskToBinary(candidate.maskDataUrl, analysis.width, analysis.height);
      if (!binary) continue;
      const segmentation = buildModelSegmentation(
        binary,
        analysis.width,
        analysis.height,
        analysis.sourceWidth,
        analysis.sourceHeight,
        {
          modelVersion: "sam2_server_v1",
          diagnostics: {
            method: "SAM 2 automatic mask candidates",
            candidateScore: Number(candidate.score) || 0,
            candidateCount: candidates.length
          }
        }
      );
      const score = scoreSamMask(binary, segmentation, analysis.imageData, analysis.width, analysis.height, candidate);
      if (segmentation && score >= 0) scored.push({ segmentation, score });
    }
    scored.sort((left, right) => right.score - left.score);
    const selected = scored[0];
    if (!selected || selected.score < 0.34) return null;
    selected.segmentation.confidence = clamp(selected.score, 0.45, 0.92);
    selected.segmentation.diagnostics.selectionScore = Math.round(selected.score * 100) / 100;
    return selected.segmentation;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function segmentFishPixels({ data, width, height, sourceWidth = width, sourceHeight = height }) {
  if (!data || !width || !height) return { adapter: "heuristic_v2", modelVersion: "fallback_heuristic_v2", mode: "fallback", modelAvailable: false, modelBacked: false, confidence: 0, maskAvailable: false };
  const scores = new Float32Array(width * height);
  const scoreValues = [];
  for (let index = 0; index < scores.length; index += 1) {
    const score = pixelScore(data, index * 4);
    scores[index] = score;
    scoreValues.push(score);
  }
  const threshold = clamp(Math.max(0.43, quantile(scoreValues, 0.56)), 0.43, 0.74);
  const rawMask = new Uint8Array(scores.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      const verticalBand = y / height > 0.16 && y / height < 0.94;
      rawMask[index] = verticalBand && scores[index] >= threshold ? 1 : 0;
    }
  }
  const closedMask = erode(dilate(rawMask, width, height), width, height);
  const components = connectedComponents(closedMask, width, height);
  const imageArea = width * height;
  const ranked = components.map((component) => {
    const componentWidth = component.maxX - component.minX + 1;
    const componentHeight = component.maxY - component.minY + 1;
    const aspect = componentWidth / Math.max(1, componentHeight);
    const areaRatio = component.area / imageArea;
    const centerY = ((component.minY + component.maxY) / 2) / height;
    const elongated = clamp((aspect - 1.1) / 5, 0, 1);
    const usefulArea = clamp(areaRatio / 0.28, 0, 1) * clamp(1 - Math.max(0, areaRatio - 0.62) / 0.35, 0, 1);
    const position = 1 - clamp(Math.abs(centerY - 0.58) / 0.45, 0, 1);
    return { component, score: (elongated * 0.5) + (usefulArea * 0.32) + (position * 0.18), aspect, areaRatio };
  }).filter((item) => item.areaRatio > 0.006 && item.areaRatio < 0.72).sort((a, b) => b.score - a.score);
  const selected = ranked[0];
  if (!selected) return { adapter: "heuristic_v2", modelVersion: "fallback_heuristic_v2", mode: "fallback", modelAvailable: false, modelBacked: false, confidence: 0, maskAvailable: false };
  const { component } = selected;
  const landmarks = componentLandmarks(component, width, height, sourceWidth, sourceHeight);
  if (!landmarks) return { adapter: "heuristic_v2", modelVersion: "fallback_heuristic_v2", mode: "fallback", modelAvailable: false, modelBacked: false, confidence: 0, maskAvailable: false };
  const outline = componentOutline(component, width, height, sourceWidth, sourceHeight);
  const confidence = clamp(0.22 + (selected.score * 0.55) + clamp(selected.aspect / 10, 0, 0.2), 0.12, 0.72);
  return {
    adapter: "heuristic_v2",
    modelAvailable: false,
    modelBacked: false,
    modelVersion: "fallback_heuristic_v2",
    mode: "fallback",
    maskAvailable: true,
    mask: encodeMask(closedMask),
    confidence,
    visiblePercentage: clamp(selected.areaRatio * 3.2, 0.35, 0.95),
    boundingBox: {
      x: Math.round(component.minX / width * sourceWidth),
      y: Math.round(component.minY / height * sourceHeight),
      width: Math.round((component.maxX - component.minX + 1) / width * sourceWidth),
      height: Math.round((component.maxY - component.minY + 1) / height * sourceHeight)
    },
    outline,
    fishLandmarks: landmarks,
    diagnostics: {
      threshold,
      componentAreaRatio: selected.areaRatio,
      aspectRatio: selected.aspect,
      method: "färg- och formmask med sammanhängande komponent"
    }
  };
}

export async function segmentFish(image) {
  if (!image || typeof document === "undefined") return { adapter: "heuristic_v2", modelVersion: "fallback_heuristic_v2", mode: "fallback", modelAvailable: false, modelBacked: false, confidence: 0, maskAvailable: false };
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const maxEdge = 360;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(32, Math.round(sourceWidth * scale));
  const height = Math.max(32, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { adapter: "heuristic_v2", modelVersion: "fallback_heuristic_v2", mode: "fallback", modelAvailable: false, modelBacked: false, confidence: 0, maskAvailable: false };
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const samResult = await segmentFishWithSam2(image, {
    imageData: imageData.data,
    width,
    height,
    sourceWidth,
    sourceHeight
  });
  if (samResult) return samResult;
  // The bundled browser model is a useful offline fallback, but the server
  // candidate selector is better at separating a fish from the person/boat.
  const modelResult = await segmentFishWithModel(image, width, height, sourceWidth, sourceHeight);
  if (modelResult) return modelResult;
  return segmentFishPixels({ data: imageData.data, width, height, sourceWidth, sourceHeight });
}
