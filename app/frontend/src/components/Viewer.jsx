import { useCallback, useEffect, useRef, useState } from "react";
import { drawScene } from "../lib/annotate.js";

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

export default function Viewer({ image, detections, controls }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const drag = useRef(null);

  const { showBoxes, showMasks, maskOpacity } = controls;

  const fit = useCallback(() => {
    const c = containerRef.current;
    if (!c || !image) return;
    const cw = c.clientWidth,
      ch = c.clientHeight;
    const s = Math.min(cw / image.naturalWidth, ch / image.naturalHeight) * 0.98;
    viewRef.current = {
      scale: s,
      tx: (cw - image.naturalWidth * s) / 2,
      ty: (ch - image.naturalHeight * s) / 2,
    };
    rerender();
  }, [image]);

  // Draw whenever view/overlays/detections change.
  const draw = useCallback(() => {
    const canvas = canvasRef.current,
      c = containerRef.current;
    if (!canvas || !c || !image) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth,
      ch = c.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + "px";
      canvas.style.height = ch + "px";
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, {
      image,
      detections,
      transform: viewRef.current,
      showBoxes,
      showMasks,
      maskOpacity,
      dpr,
    });
  }, [image, detections, showBoxes, showMasks, maskOpacity]);

  useEffect(() => {
    draw();
  });

  // Fit on image change and on resize / fullscreen change.
  useEffect(() => {
    fit();
    const ro = new ResizeObserver(() => {
      // keep centered-ish: simplest is to redraw; refit only if nothing zoomed yet
      draw();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    const onFs = () => setTimeout(fit, 60);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      ro.disconnect();
      document.removeEventListener("fullscreenchange", onFs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  function zoomAt(px, py, factor) {
    const v = viewRef.current;
    let ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    const k = ns / v.scale;
    viewRef.current = {
      scale: ns,
      tx: px - (px - v.tx) * k,
      ty: py - (py - v.ty) * k,
    };
    rerender();
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }
  function onPointerDown(e) {
    drag.current = { x: e.clientX, y: e.clientY, ...viewRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    viewRef.current = {
      scale: drag.current.scale,
      tx: drag.current.tx + (e.clientX - drag.current.x),
      ty: drag.current.ty + (e.clientY - drag.current.y),
    };
    rerender();
  }
  function onPointerUp(e) {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }

  function centerZoom(factor) {
    const c = containerRef.current;
    zoomAt(c.clientWidth / 2, c.clientHeight / 2, factor);
  }
  function toggleFullscreen() {
    const el = containerRef.current;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  const pct = Math.round(viewRef.current.scale * 100);

  return (
    <section className="viewer">
      <div className="viewer-toolbar">
        <div className="tool-group">
          <button className="btn icon" title="Zoom out" onClick={() => centerZoom(1 / 1.2)}>−</button>
          <span className="zoom-label">{pct}%</span>
          <button className="btn icon" title="Zoom in" onClick={() => centerZoom(1.2)}>+</button>
          <button className="btn" title="Fit to screen" onClick={fit}>Fit</button>
          <button className="btn" title="Reset view" onClick={fit}>Reset</button>
          <button className="btn" title="Fullscreen" onClick={toggleFullscreen}>⛶ Fullscreen</button>
        </div>
        <div className="tool-group">
          <label className="toggle">
            <input type="checkbox" checked={showBoxes}
              onChange={(e) => controls.setShowBoxes(e.target.checked)} />
            Boxes
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showMasks}
              onChange={(e) => controls.setShowMasks(e.target.checked)} />
            Masks
          </label>
          <label className="slider-inline" title="Mask opacity">
            Opacity
            <input type="range" min="0" max="1" step="0.05" value={maskOpacity}
              disabled={!showMasks}
              onChange={(e) => controls.setMaskOpacity(parseFloat(e.target.value))} />
          </label>
        </div>
      </div>

      <div
        ref={containerRef}
        className="viewer-canvas-wrap"
        onWheel={onWheel}
      >
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    </section>
  );
}
