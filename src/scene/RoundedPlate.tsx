import { useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';

/** A thin plate with rounded XY corners; corner radius is independent of its Z thickness. */
export function RoundedPlate({ width, height, thickness, radius, ...props }: ThreeElements['mesh'] & { width: number; height: number; thickness: number; radius: number }) {
  const geometry = useMemo(() => {
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const result = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 6, steps: 1 });
    result.translate(0, 0, -thickness / 2);
    return result;
  }, [width, height, thickness, radius]);
  return <mesh geometry={geometry} {...props} />;
}
