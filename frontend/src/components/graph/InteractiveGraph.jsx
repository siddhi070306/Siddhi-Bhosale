import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function InteractiveGraph({ data, selectedNode, onSelectNode }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 10 });
  const [isPanning, setIsPanning] = useState(false);
  const rawNodes = data?.nodes || [];
  const rawEdges = data?.edges || [];

  const [nodePositions, setNodePositions] = useState(() => {
    const initialPos = {};
    (data?.nodes || []).forEach((n) => {
      initialPos[n.id] = { x: n.x, y: n.y };
    });
    return initialPos;
  });

  const [draggedNode, setDraggedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 20, y: 10 });
  };

  // Canvas Pan Handlers
  const handleMouseDown = (e) => {
    // If clicking directly on a node circle/text, dragging the node takes precedence
    if (e.target.closest('.graph-node')) return;
    setIsPanning(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (draggedNode) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      // Convert screen coords to SVG viewBox coords
      const newX = (e.clientX - svgRect.left - pan.x) / zoom;
      const newY = (e.clientY - svgRect.top - pan.y) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggedNode]: { x: Math.round(newX), y: Math.round(newY) },
      }));
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(Math.max(z * zoomFactor, 0.5), 2.5));
  };

  const getNodeCoord = (id) => {
    if (nodePositions[id]) return nodePositions[id];
    const n = rawNodes.find((item) => item.id === id);
    return n ? { x: n.x, y: n.y } : { x: 500, y: 400 };
  };

  // Determine active/highlighted path or connections
  const activeNodeId = selectedNode?.id || 'oil_gas_producers';

  const isEdgeHighlighted = (edge) => {
    if (edge.isActive) return true;
    if (hoveredEdge === edge) return true;
    if (hoveredNode && (edge.from === hoveredNode || edge.to === hoveredNode)) return true;
    if (activeNodeId && (edge.from === activeNodeId || edge.to === activeNodeId)) return true;
    return false;
  };

  const isNodeHighlighted = (nodeId) => {
    if (nodeId === activeNodeId || nodeId === 'crude_oil') return true;
    if (hoveredNode === nodeId) return true;
    if (hoveredNode) {
      return rawEdges.some(
        (e) => (e.from === hoveredNode && e.to === nodeId) || (e.to === hoveredNode && e.from === nodeId)
      );
    }
    if (activeNodeId) {
      return rawEdges.some(
        (e) => (e.from === activeNodeId && e.to === nodeId) || (e.to === activeNodeId && e.from === nodeId)
      );
    }
    return false;
  };

  const getNodeColor = (type) => {
    switch (type) {
      case 'event_class':
        return { fill: '#a7f3d0', stroke: '#6ee7b7', text: '#064e3b' }; // mint green
      case 'commodity':
        return { fill: '#fef08a', stroke: '#f59e0b', text: '#854d0e' }; // warm yellow/amber
      case 'indicator':
        return { fill: '#ddd6fe', stroke: '#c084fc', text: '#581c87' }; // lavender/purple
      case 'sector':
        return { fill: '#bae6fd', stroke: '#38bdf8', text: '#0369a1' }; // sky blue
      case 'company':
      case 'instrument':
      case 'index':
      default:
        return { fill: '#e2e8f0', stroke: '#cbd5e1', text: '#334155' }; // slate grey
    }
  };

  return (
    <div
      className="graph-canvas-wrapper"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ userSelect: 'none', position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <svg
        ref={svgRef}
        className="graph-canvas-svg"
        viewBox="0 0 1080 870"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block', background: '#fcfdfd' }}
      >
        <defs>
          {/* Active Highlight Arrow (Solid Black) */}
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="22"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#09090b" />
          </marker>

          {/* Positive Transmission Arrow (Green) */}
          <marker
            id="arrow-pos"
            viewBox="0 0 10 10"
            refX="21"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#34d399" />
          </marker>

          {/* Negative Transmission Arrow (Coral Red) */}
          <marker
            id="arrow-neg"
            viewBox="0 0 10 10"
            refX="21"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f43f5e" />
          </marker>

          {/* Light Grid Pattern (Subtle Graph Paper Texture) */}
          <pattern id="graph-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </pattern>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Subtle Grid Canvas */}
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#graph-grid)" />

          {/* ===================== EDGES (BEZIER SPLINES) ===================== */}
          <g className="graph-edges-layer">
            {rawEdges.map((edge, idx) => {
              const p1 = getNodeCoord(edge.from);
              const p2 = getNodeCoord(edge.to);

              // Calculate smooth cubic horizontal bezier control points
              const dx = Math.abs(p2.x - p1.x);
              const cx1 = p1.x + Math.max(dx * 0.45, 25);
              const cy1 = p1.y;
              const cx2 = p2.x - Math.max(dx * 0.45, 25);
              const cy2 = p2.y;
              const pathData = `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;

              const isHighlighted = isEdgeHighlighted(edge);
              const isPositive = edge.sign > 0;

              let strokeColor = isPositive ? '#34d399' : '#f43f5e';
              let strokeWidth = 1.8;
              let opacity = 0.45;
              let markerEnd = isPositive ? 'url(#arrow-pos)' : 'url(#arrow-neg)';

              // Special styling for the active causal path (e.g. Crude Oil -> Oil & Gas Producers)
              if (edge.isActive) {
                strokeColor = '#09090b';
                strokeWidth = 3.6;
                opacity = 1.0;
                markerEnd = 'url(#arrow-active)';
              } else if (isHighlighted) {
                strokeWidth = 2.4;
                opacity = 0.85;
              } else if (hoveredNode || activeNodeId) {
                opacity = 0.14; // Dim unrelated edges
              }

              return (
                <path
                  key={`edge-${edge.from}-${edge.to}-${idx}`}
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeOpacity={opacity}
                  markerEnd={markerEnd}
                  style={{
                    cursor: 'pointer',
                    transition: 'stroke-opacity 0.2s ease, stroke-width 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    setHoveredEdge(edge);
                    const rect = svgRef.current?.getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - (rect?.left || 0) + 12,
                      y: e.clientY - (rect?.top || 0) - 12,
                      title: `${edge.from.replace('_', ' ').toUpperCase()} → ${edge.to.replace('_', ' ').toUpperCase()}`,
                      mechanism: edge.mechanism || (isPositive ? 'Positive Transmission (+)' : 'Negative Transmission (-)'),
                      strength: edge.strength,
                      lag: edge.lag != null ? `${edge.lag}d lag` : null,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredEdge(null);
                    setTooltip(null);
                  }}
                  onClick={() => {
                    const src = rawNodes.find((n) => n.id === edge.from);
                    if (src) onSelectNode(src);
                  }}
                />
              );
            })}
          </g>

          {/* ===================== NODES ===================== */}
          <g className="graph-nodes-layer">
            {rawNodes.map((node) => {
              const pos = getNodeCoord(node.id);
              const isSelected = selectedNode?.id === node.id || (node.id === 'oil_gas_producers' && !selectedNode);
              const isAnchor = node.isAnchor || node.id === 'crude_oil';
              const isHighlighted = isNodeHighlighted(node.id);
              const colors = getNodeColor(node.type);

              const opacity = (hoveredNode || activeNodeId) && !isHighlighted ? 0.35 : 1.0;

              return (
                <g
                  key={node.id}
                  className="graph-node"
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: 'pointer', opacity, transition: 'opacity 0.2s ease' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggedNode(node.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(node);
                  }}
                  onMouseEnter={(e) => {
                    setHoveredNode(node.id);
                    const rect = svgRef.current?.getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - (rect?.left || 0) + 14,
                      y: e.clientY - (rect?.top || 0) - 14,
                      title: node.fullName || node.label,
                      category: node.category || node.type,
                      change: node.change,
                      confidence: node.confidence ? `${Math.round(node.confidence * 100)}%` : null,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredNode(null);
                    setTooltip(null);
                  }}
                >
                  {/* Anchor Double Black Ring (Observed in Article) - Matches Crude Oil in Screenshot */}
                  {isAnchor && (
                    <circle
                      r={22}
                      fill="none"
                      stroke="#000000"
                      strokeWidth="3.2"
                    />
                  )}

                  {/* Selected Active Blue Ring - Matches Oil & Gas Producers in Screenshot */}
                  {isSelected && (
                    <circle
                      r={22}
                      fill="none"
                      stroke="#09090b"
                      strokeWidth="3.2"
                    />
                  )}

                  {/* Dashed Outer Ring (e.g. Airlines Sector, USD/INR) */}
                  {node.isDashed && !isSelected && (
                    <circle
                      r={21}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.6"
                      strokeDasharray="3,3"
                    />
                  )}

                  {/* Concentric Outer Ring (e.g. US Dollar Index) */}
                  {node.isConcentric && !isSelected && (
                    <circle
                      r={22}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Primary Node Circle */}
                  <circle
                    r={isSelected ? 15 : isAnchor ? 14 : 14}
                    fill={isSelected ? '#0284c7' : colors.fill}
                    stroke={isSelected ? '#0369a1' : colors.stroke}
                    strokeWidth={isSelected ? 2 : 1.8}
                    filter="drop-shadow(0 1px 3px rgba(0,0,0,0.06))"
                  />

                  {/* Mixed Signals Badge (±) on bottom-right of node */}
                  {node.hasMixedSignals && (
                    <g transform="translate(10, 8)">
                      <circle r={6.5} fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2" />
                      <text
                        textAnchor="middle"
                        dy="2.5"
                        fontSize="9"
                        fontWeight="700"
                        fill="#ffffff"
                      >
                        ±
                      </text>
                    </g>
                  )}

                  {/* Node Label (Below Circle) */}
                  <text
                    y={node.col === 4 ? 4 : 26}
                    x={node.col === 4 ? 20 : 0}
                    textAnchor={node.col === 4 ? 'start' : 'middle'}
                    fontSize={node.col === 4 ? '11' : '11.5'}
                    fontWeight={isSelected || isAnchor ? '700' : '500'}
                    fill={isSelected || isAnchor ? '#09090b' : '#334155'}
                    letterSpacing="-0.1px"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* ===================== FLOATING HOVER TOOLTIP ===================== */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x, 820),
            top: Math.max(tooltip.y, 16),
            background: 'rgba(15, 23, 42, 0.94)',
            color: '#f8fafc',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: 'none',
            zIndex: 30,
            boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
            maxWidth: 280,
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#ffffff', marginBottom: 2 }}>
            {tooltip.title}
          </div>
          {tooltip.mechanism && (
            <div style={{ color: '#cbd5e1', fontSize: 11.5, marginTop: 3 }}>
              {tooltip.mechanism}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
            {tooltip.change && <span style={{ color: '#4ade80', fontWeight: 600 }}>{tooltip.change}</span>}
            {tooltip.category && <span>{tooltip.category}</span>}
            {tooltip.lag && <span>{tooltip.lag}</span>}
            {tooltip.confidence && <span>Conf: {tooltip.confidence}</span>}
          </div>
        </div>
      )}

      {/* ===================== EVIDENCE TIERS LEGEND (Matches Screenshot Verbatim) ===================== */}
      <div
        className="evidence-tiers-legend"
        style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '14px 18px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)',
          fontFamily: 'inherit',
          zIndex: 10,
          minWidth: 260,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.8px',
            color: '#94a3b8',
            marginBottom: 10,
            textTransform: 'uppercase',
          }}
        >
          EVIDENCE TIERS LEGEND
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: '#334155' }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '2.5px solid #000000',
              background: 'transparent',
              flexShrink: 0,
            }}
          />
          <span>Observed in Article (Anchor Ring)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: '#334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: 16, height: 8 }}>
            <div style={{ width: 12, height: 2.5, background: '#34d399' }} />
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: '3.5px solid transparent',
                borderBottom: '3.5px solid transparent',
                borderLeft: '5px solid #34d399',
              }}
            />
          </div>
          <span>Positive Transmission (+)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: '#334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: 16, height: 8 }}>
            <div style={{ width: 12, height: 2.5, background: '#f43f5e' }} />
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: '3.5px solid transparent',
                borderBottom: '3.5px solid transparent',
                borderLeft: '5px solid #f43f5e',
              }}
            />
          </div>
          <span>Negative Transmission (-)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#334155' }}>
          <div
            style={{
              width: 15,
              height: 15,
              borderRadius: '50%',
              background: '#f59e0b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            ±
          </div>
          <span>Mixed Signals Flagged (≥30%)</span>
        </div>
      </div>

      {/* ===================== ZOOM & FIT CONTROLS ===================== */}
      <div
        className="graph-zoom-controls"
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: 5,
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.06)',
          zIndex: 10,
        }}
      >
        <button
          className="graph-zoom-btn"
          onClick={handleZoomIn}
          title="Zoom In"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 6,
            color: '#334155',
          }}
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="graph-zoom-btn"
          onClick={handleZoomOut}
          title="Zoom Out"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 6,
            color: '#334155',
          }}
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="graph-zoom-btn"
          onClick={handleResetZoom}
          title="Reset Zoom & Fit View"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 6,
            color: '#334155',
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}
