/** WebGL 2, which the 3D scenes need. Without it the static SVG stays. */
export const supportsWebGL = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};
