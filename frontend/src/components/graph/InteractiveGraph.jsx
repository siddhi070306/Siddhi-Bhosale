import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Zap } from 'lucide-react';

export default function InteractiveGraph({ data, selectedNode, onSelectNode }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.6));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'circle' || e.target.tagName === 'text') return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const centerNode = data?.centerNode || {
    id: 'crude-oil',
    label: 'Crude Oil\n+12%',
    type: 'root',
    x: 450,
    y: 350,
  };

  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  const getNodePos = (id) => {
    if (id === centerNode.id) return { x: 450, y: 350 };
    const n = nodes.find((item) => item.id === id);
    return n ? { x: n.x, y: n.y } : { x: 450, y: 350 };
  };

  return (
    <div className="graph-canvas-wrapper" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <svg
        className="graph-canvas-svg"
        viewBox="0 0 900 680"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Arrowhead marker */}
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="18"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#18181b" />
          </marker>

          {/* Dashed arrowhead */}
          <marker
            id="arrow-dashed"
            viewBox="0 0 10 10"
            refX="18"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#71717a" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Background grid subtle dots */}
          <pattern id="graph-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#e4e4e7" />
          </pattern>
          <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#graph-dots)" />

          {/* Edges */}
          {edges.map((edge, idx) => {
            const p1 = getNodePos(edge.from);
            const p2 = getNodePos(edge.to);
            const isDashed = edge.type === 'indirect' || edge.style === 'dashed';

            return (
              <line
                key={`edge-${idx}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isDashed ? '#71717a' : '#18181b'}
                strokeWidth={isDashed ? '1.5' : '2'}
                strokeDasharray={isDashed ? '4,4' : 'none'}
                markerEnd={isDashed ? 'url(#arrow-dashed)' : 'url(#arrow)'}
                opacity={0.85}
              />
            );
          })}

          {/* Peripheral Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelectNode(node)}
                style={{ cursor: 'pointer' }}
              >
                {/* Node Outer Ring */}
                <circle
                  r={isSelected ? 26 : 22}
                  fill="#ffffff"
                  stroke="#18181b"
                  strokeWidth={isSelected ? '3' : '1.8'}
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))"
                />

                {/* Inner Icon or Dot */}
                <circle r={6} fill="#18181b" />

                {/* Node Label */}
                <text
                  y={34}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight="600"
                  fill="#09090b"
                >
                  {node.label}
                </text>

                {/* Change pill */}
                {node.change && (
                  <text
                    y={47}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill={node.change.startsWith('+') ? '#166534' : '#991b1b'}
                  >
                    {node.change}
                  </text>
                )}
              </g>
            );
          })}

          {/* Central Root Node (Crude Oil +12%) */}
          <g
            transform="translate(450, 350)"
            onClick={() => onSelectNode(centerNode)}
            style={{ cursor: 'pointer' }}
          >
            {/* Outer pulse */}
            <circle r={48} fill="rgba(24, 24, 27, 0.06)" />
            <circle
              r={40}
              fill="#18181b"
              stroke="#09090b"
              strokeWidth="2"
              filter="drop-shadow(0 4px 10px rgba(0,0,0,0.2))"
            />
            <text
              y={-4}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#ffffff"
            >
              Crude Oil
            </text>
            <text
              y={14}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#4ade80"
            >
              +12%
            </text>
          </g>
        </g>
      </svg>

      {/* Legend Matching Image 3 */}
      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-line-solid"></span>
          <span>Direct Impact</span>
        </div>
        <div className="legend-item">
          <span className="legend-line-dashed"></span>
          <span>Indirect Impact</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot-observed"></span>
          <span>Observed</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot-inferred"></span>
          <span>Inferred</span>
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="graph-zoom-controls">
        <button className="graph-zoom-btn" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="graph-zoom-btn" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="graph-zoom-btn" onClick={handleResetZoom} title="Reset View">
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}
