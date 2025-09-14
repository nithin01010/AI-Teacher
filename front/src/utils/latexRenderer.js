// Updated latexRenderer.js
// frontend/src/utils/latexRenderer.js
import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

const MathRenderer = ({ latex, x = 0, y = 0, fontSize = 20, scale = 1 }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(latex, containerRef.current, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (err) {
        console.error("KaTeX render error:", err);
      }
    }
  }, [latex]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        fontSize: `${fontSize * scale}px`, // scale font
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        pointerEvents: "none", // prevents dragging/selection
        whiteSpace: "nowrap",
      }}
    />
  );
};

export default MathRenderer;