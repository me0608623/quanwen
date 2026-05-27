"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Three.js hero 3D 背景 — 緩慢旋轉的暖色 wireframe 多面體 + 頂點光點。
 * 置於 hero 背後(透明畫布、低透明度),營造「科技感 AI 首頁」氛圍。
 * client-only(useEffect 內初始化),尊重 prefers-reduced-motion。
 */
export function HeroThree({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(dpr);
    renderer.setClearAlpha(0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    // 暖色 wireframe 多面體
    const geometry = new THREE.IcosahedronGeometry(1.9, 1);
    const wire = new THREE.MeshBasicMaterial({
      color: 0xcc785c,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, wire);
    scene.add(mesh);

    // 頂點光點
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0x5db8a6, size: 0.07, transparent: true, opacity: 0.8 }),
    );
    scene.add(points);

    const group = new THREE.Group();
    group.add(mesh, points);
    scene.add(group);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // 滑鼠視差(桌機)
    let targetX = 0;
    let targetY = 0;
    const onPointer = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.4;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.4;
    };
    if (!reduce) window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    const render = () => {
      group.rotation.y += 0.0024;
      group.rotation.x += 0.0011;
      group.position.x += (targetX - group.position.x) * 0.04;
      group.position.y += (-targetY - group.position.y) * 0.04;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };

    if (reduce) {
      renderer.render(scene, camera); // 單格靜態
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      geometry.dispose();
      wire.dispose();
      (points.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} aria-hidden className={className} />;
}
