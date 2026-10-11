import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Play, Zap } from 'lucide-react';

// Closed-form cubic Bezier curve evaluation for smooth, exact path tracking
function evalCubicBezier(p1, cx1, cy1, cx2, cy2, p2, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p1.x + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * p2.x,
    y: mt3 * p1.y + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * p2.y,
  };
}

// Extract primary start-to-end causal pipeline sequence for animated shock cascade
function extractCausalPipeline(nodes, edges, pathways = [], selectedNode = null, selectedEdge = null, centerNode = null) {
  if (!nodes || nodes.length === 0) return { pathNodes: [], pathEdges: [], pipelineTitle: '' };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeList = edges || [];

  const findEdge = (fromId, toId) => {
    return edgeList.find((e) => e.from === fromId && e.to === toId) ||
           edgeList.find((e) => (e.from === fromId && e.to === toId) || (e.to === fromId && e.from === toId));
  };

  // 1. Identify Root / Origin Node (Column 0 or Anchor node)
  const anchorNode = nodes.find((n) => n.isAnchor) ||
                     (centerNode?.id && nodeMap.get(centerNode.id)) ||
                     nodes.find((n) => n.col === 0) ||
                     nodes.find((n) => n.col === 1 && (n.type === 'commodity' || n.type === 'event_class')) ||
                     nodes[0];
  const rootId = anchorNode?.id;

  // 2. Check if curated pathways are provided in data.pathways
  if (Array.isArray(pathways) && pathways.length > 0) {
    let chosenPathway = pathways[0];
    if (selectedNode) {
      const match = pathways.find((p) => {
        if (p.endId === selectedNode.id || p.end === selectedNode.id) return true;
        if (Array.isArray(p.nodes) && p.nodes.includes(selectedNode.id)) return true;
        if (Array.isArray(p.steps) && p.steps.some((s) => s.from === selectedNode.id || s.to === selectedNode.id)) return true;
        return false;
      });
      if (match) chosenPathway = match;
    }

    let candidateNodes = [];
    if (Array.isArray(chosenPathway.nodes) && chosenPathway.nodes.length >= 2) {
      candidateNodes = chosenPathway.nodes;
    } else if (Array.isArray(chosenPathway.steps) && chosenPathway.steps.length > 0) {
      candidateNodes = [chosenPathway.steps[0].from, ...chosenPathway.steps.map((s) => s.to)];
    }

    const validNodes = candidateNodes.filter((id) => nodeMap.has(id));
    if (validNodes.length >= 2) {
      const pathEdges = [];
      for (let i = 0; i < validNodes.length - 1; i++) {
        const e = findEdge(validNodes[i], validNodes[i + 1]);
        if (e) pathEdges.push(e);
      }
      if (pathEdges.length === validNodes.length - 1) {
        return {
          pathNodes: validNodes,
          pathEdges,
          pipelineTitle: chosenPathway.path || 'Curated Causal Pipeline',
        };
      }
    }
  }

  // 3. Determine target terminal node for start-to-end pipeline
  let targetId = null;
  if (selectedNode && selectedNode.id !== rootId) {
    // If selectedNode is in Col 3 (sector), check if it extends into Col 4 (company/asset)
    const outToCol4 = edgeList
      .filter((e) => e.from === selectedNode.id)
      .map((e) => nodeMap.get(e.to))
      .filter((n) => n && n.col === 4);
    if (outToCol4.length > 0 && (selectedNode.col == null || selectedNode.col < 4)) {
      targetId = outToCol4[0].id;
    } else {
      targetId = selectedNode.id;
    }
  }

  // Check active edges (e.g. Autos -> Tata Motors)
  if (!targetId) {
    const active = edgeList.filter((e) => e.isActive);
    if (active.length > 0) {
      targetId = active[active.length - 1].to;
    }
  }

  // Fallback to downstream terminal node in highest column (Col 4 company/asset)
  if (!targetId) {
    const col4Nodes = nodes.filter((n) => n.col === 4);
    if (col4Nodes.length > 0) {
      col4Nodes.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      targetId = col4Nodes[0].id;
    } else {
      const col3Nodes = nodes.filter((n) => n.col === 3);
      if (col3Nodes.length > 0) targetId = col3Nodes[0].id;
    }
  }

  // 4. Backward Trace from Target back to Root
  if (targetId && targetId !== rootId) {
    const incoming = new Map();
    edgeList.forEach((e) => {
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      incoming.get(e.to).push(e);
    });

    const queue = [{ curr: targetId, path: [targetId] }];
    const visited = new Set();
    let bestBackPath = null;

    while (queue.length > 0) {
      const { curr, path } = queue.shift();
      if (curr === rootId) {
        bestBackPath = path;
        break;
      }
      visited.add(curr);

      const inEdges = incoming.get(curr) || [];
      // Prioritize active edges, then higher strength
      inEdges.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (b.strength || 0) - (a.strength || 0);
      });

      for (const e of inEdges) {
        if (!visited.has(e.from) && !path.includes(e.from)) {
          queue.push({ curr: e.from, path: [...path, e.from] });
        }
      }
    }

    if (bestBackPath && bestBackPath.length >= 2) {
      const pathNodes = [...bestBackPath].reverse();
      const pathEdges = [];
      let valid = true;
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const e = findEdge(pathNodes[i], pathNodes[i + 1]);
        if (e) pathEdges.push(e);
        else { valid = false; break; }
      }
      if (valid && pathEdges.length === pathNodes.length - 1) {
        return { pathNodes, pathEdges, pipelineTitle: 'Multi-Hop Transmission Pipeline' };
      }
    }
  }

  // 5. Forward DAG Progression from Root to Terminal
  const pathNodes = [rootId];
  const pathEdges = [];
  let currentId = rootId;

  for (let c = (anchorNode?.col || 0) + 1; c <= 4; c++) {
    const candidates = edgeList.filter((e) => e.from === currentId);
    let chosenEdge = candidates.find((e) => {
      const target = nodeMap.get(e.to);
      return target && target.col === c && (e.isActive || (targetId && e.to === targetId));
    });
    if (!chosenEdge) {
      chosenEdge = candidates.find((e) => {
        const target = nodeMap.get(e.to);
        return target && target.col === c;
      });
    }
    if (!chosenEdge && candidates.length > 0) {
      chosenEdge = candidates[0];
    }
    if (chosenEdge && !pathNodes.includes(chosenEdge.to)) {
      pathEdges.push(chosenEdge);
      pathNodes.push(chosenEdge.to);
      currentId = chosenEdge.to;
    } else {
      break;
    }
  }

  return { pathNodes, pathEdges, pipelineTitle: 'End-to-End Causal Pipeline' };
}

export default function InteractiveGraph({
  data,
  selectedNode,
  onSelectNode,
  selectedEdge = null,
  onSelectEdge = null,
  onResetDefaults = null,
  isResetting = false,
}) {
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

  // Re-sync positions when data updates or graph is reset
  useEffect(() => {
    const initialPos = {};
    (data?.nodes || []).forEach((n) => {
      initialPos[n.id] = { x: n.x, y: n.y };
    });
    setNodePositions(initialPos);
  }, [data]);

  // Extract guaranteed start-to-end causal pipeline sequence
  const causalPath = useMemo(() => {
    return extractCausalPipeline(
      rawNodes,
      rawEdges,
      data?.pathways || [],
      selectedNode,
      selectedEdge,
      data?.centerNode
    );
  }, [rawNodes, rawEdges, data?.pathways, selectedNode, selectedEdge, data?.centerNode]);

  // Start-to-End simulation state & shockwave progression refs
  const [isSimulating, setIsSimulating] = useState(true);
  const isSimulatingRef = useRef(true);
  const simStartTimeRef = useRef(performance.now());
  const simPhotonPartsRef = useRef({});
  const [currentSimHop, setCurrentSimHop] = useState(0);
  const currentSimHopRef = useRef(0);

  // Automatically trigger start-to-end simulation whenever new graph/event or pipeline loads
  useEffect(() => {
    if (causalPath.pathEdges.length > 0) {
      simStartTimeRef.current = performance.now();
      isSimulatingRef.current = true;
      currentSimHopRef.current = 0;
      setCurrentSimHop(0);
      setIsSimulating(true);
    }
  }, [data, causalPath.pathNodes.join('-')]);

  const handleRestartSimulation = () => {
    simStartTimeRef.current = performance.now();
    isSimulatingRef.current = true;
    currentSimHopRef.current = 0;
    setCurrentSimHop(0);
    setIsSimulating(true);
  };

  const [draggedNode, setDraggedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const svgRef = useRef(null);

  // High-performance direct DOM references for 60 FPS RAF particle animation
  const particleElsRef = useRef({});
  const arrivalRingRefs = useRef({});
  const activeArrivalsRef = useRef({});
  const rafIdRef = useRef(null);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 20, y: 10 });
  };

  // Canvas Pan Handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.graph-node')) return;
    setIsPanning(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (draggedNode) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
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
  const activeNodeId = selectedNode?.id || data?.centerNode?.id || null;

  const isEdgeHighlighted = (edge) => {
    if (causalPath.pathEdges.some((pe) => pe.from === edge.from && pe.to === edge.to)) return true;
    if (edge.isActive) return true;
    if (hoveredEdge === edge) return true;
    if (hoveredNode && (edge.from === hoveredNode || edge.to === hoveredNode)) return true;
    if (activeNodeId && (edge.from === activeNodeId || edge.to === activeNodeId)) return true;
    return false;
  };

  const isNodeHighlighted = (nodeId) => {
    if (causalPath.pathNodes.includes(nodeId)) return true;
    if (nodeId === activeNodeId || rawNodes.find((n) => n.id === nodeId)?.isAnchor) return true;
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

  // Store interactive states in refs so RAF animation loop reads real-time interaction without re-attaching
  const hoveredNodeRef = useRef(hoveredNode);
  const activeNodeIdRef = useRef(activeNodeId);
  const selectedEdgeRef = useRef(selectedEdge);
  const hoveredEdgeRef = useRef(hoveredEdge);

  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
  }, [hoveredNode]);

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId;
  }, [activeNodeId]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdge;
  }, [selectedEdge]);

  useEffect(() => {
    hoveredEdgeRef.current = hoveredEdge;
  }, [hoveredEdge]);

  // Compute all directional particle descriptors along exact cubic Bezier edge trajectories
  const particlesList = useMemo(() => {
    const list = [];
    rawEdges.forEach((edge, idx) => {
      const p1 = getNodeCoord(edge.from);
      const p2 = getNodeCoord(edge.to);
      const isPos = edge.sign > 0;
      const isNeg = edge.sign < 0;
      const isEdgeSelected = selectedEdge && selectedEdge.from === edge.from && selectedEdge.to === edge.to;
      const isPipelineEdge = causalPath.pathEdges.some((pe) => pe.from === edge.from && pe.to === edge.to);

      let pColor = isPos ? '#10b981' : isNeg ? '#f43f5e' : '#06b6d4';
      if (isEdgeSelected || edge.isActive || isPipelineEdge) {
        pColor = '#2563eb';
      }

      const dx = Math.abs(p2.x - p1.x);
      const cx1 = p1.x + Math.max(dx * 0.45, 25);
      const cy1 = p1.y;
      const cx2 = p2.x - Math.max(dx * 0.45, 25);
      const cy2 = p2.y;

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      // Speed guidelines: short ~1.4s, med ~2.2s, long ~3.2s
      const duration = Math.max(1.3, Math.min(3.4, 1.1 + (dist / 190)));
      const gap = 0.85 + ((idx % 4) * 0.22);
      const period = duration + gap;

      // Progressive network flow stagger based on source node causal layer/column
      const srcNode = rawNodes.find((n) => n.id === edge.from);
      const col = srcNode?.col != null ? srcNode.col : 1;
      const baseStagger = (col * 0.38) + ((idx * 0.17) % 0.4);

      // Primary particle
      list.push({
        id: `pt-${edge.from}-${edge.to}-0`,
        edge,
        from: edge.from,
        to: edge.to,
        p1,
        p2,
        cx1,
        cy1,
        cx2,
        cy2,
        color: pColor,
        duration,
        gap,
        period,
        stagger: baseStagger,
        isSecondary: false,
      });

      // Secondary particle for active / pipeline / selected / highlighted pathways for rich stream density
      if (isEdgeSelected || edge.isActive || isPipelineEdge || isEdgeHighlighted(edge)) {
        list.push({
          id: `pt-${edge.from}-${edge.to}-1`,
          edge,
          from: edge.from,
          to: edge.to,
          p1,
          p2,
          cx1,
          cy1,
          cx2,
          cy2,
          color: pColor,
          duration,
          gap,
          period,
          stagger: baseStagger + (period * 0.5),
          isSecondary: true,
        });
      }
    });
    return list;
  }, [rawEdges, rawNodes, nodePositions, selectedEdge, hoveredEdge, hoveredNode, activeNodeId, causalPath.pathEdges]);

  // High-performance 60 FPS requestAnimationFrame Particle & Destination Ripple Animation Engine
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let isRunning = true;
    const startTime = performance.now();
    const arrivalTracker = {};

    const loop = (now) => {
      if (!isRunning) return;

      const nowSec = (now - startTime) / 1000;
      const hNode = hoveredNodeRef.current;
      const aNode = activeNodeIdRef.current;
      const sEdge = selectedEdgeRef.current;
      const hEdge = hoveredEdgeRef.current;

      // 1. Update traveling particles along exact Bezier paths
      for (let i = 0; i < particlesList.length; i++) {
        const pt = particlesList[i];
        const dom = particleElsRef.current[pt.id];
        if (!dom || !dom.group) continue;

        // Check if this connection is highlighted
        const isConn = (hNode && (pt.from === hNode || pt.to === hNode)) ||
                       (aNode && (pt.from === aNode || pt.to === aNode)) ||
                       (sEdge && sEdge.from === pt.from && sEdge.to === pt.to) ||
                       (hEdge && hEdge.from === pt.from && hEdge.to === pt.to) ||
                       pt.edge.isActive;

        let baseOpacity = 0.90;
        if (hNode || aNode) {
          baseOpacity = isConn ? 1.0 : 0.08;
        } else if (pt.edge.isActive || (sEdge && sEdge.from === pt.from && sEdge.to === pt.to)) {
          baseOpacity = 1.0;
        }

        // Relative cycle time
        let relTime = (nowSec - pt.stagger) % pt.period;
        if (relTime < 0) relTime += pt.period;

        if (relTime < pt.duration) {
          const t = relTime / pt.duration;

          // Smooth fade-in at source endpoint, smooth fade-out at destination endpoint
          const fade = t < 0.08 ? (t / 0.08) : (t > 0.93 ? ((1 - t) / 0.07) : 1.0);
          const finalOpacity = (baseOpacity * fade).toFixed(3);

          // Calculate parametric positions along exact cubic Bezier spline
          const pos = evalCubicBezier(pt.p1, pt.cx1, pt.cy1, pt.cx2, pt.cy2, pt.p2, t);
          const t1 = Math.max(0, t - 0.038);
          const pos1 = evalCubicBezier(pt.p1, pt.cx1, pt.cy1, pt.cx2, pt.cy2, pt.p2, t1);
          const t2 = Math.max(0, t - 0.076);
          const pos2 = evalCubicBezier(pt.p1, pt.cx1, pt.cy1, pt.cx2, pt.cy2, pt.p2, t2);

          // Direct hardware-accelerated transforms
          if (dom.head) dom.head.setAttribute('transform', `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
          if (dom.tail1) dom.tail1.setAttribute('transform', `translate(${pos1.x.toFixed(1)}, ${pos1.y.toFixed(1)})`);
          if (dom.tail2) dom.tail2.setAttribute('transform', `translate(${pos2.x.toFixed(1)}, ${pos2.y.toFixed(1)})`);

          dom.group.style.opacity = finalOpacity;
          dom.group.style.display = 'inline';

          // Trigger Phase 3 Destination Node Arrival Ripple
          if (t >= 0.94 && !arrivalTracker[pt.id]) {
            arrivalTracker[pt.id] = true;
            const existing = activeArrivalsRef.current[pt.to];
            if (!existing || (now - existing.startTime > 160)) {
              activeArrivalsRef.current[pt.to] = {
                startTime: now,
                color: pt.color,
                duration: 440,
              };
            }
          }
        } else {
          // Gap resting period before next repeated particle
          arrivalTracker[pt.id] = false;
          dom.group.style.display = 'none';
        }
      }

      // 1b. Animate Start-to-End Causal Pipeline Simulation Shockwave
      if (isSimulatingRef.current && causalPath.pathEdges.length > 0) {
        const simElapsed = (now - simStartTimeRef.current) / 1000;
        const hopDuration = 1.45;
        const totalHops = causalPath.pathEdges.length;
        const totalSimTime = totalHops * hopDuration;

        if (simElapsed < totalSimTime) {
          const hopIdx = Math.floor(simElapsed / hopDuration);
          const hopProgress = (simElapsed % hopDuration) / hopDuration;
          const currentEdge = causalPath.pathEdges[hopIdx];

          if (hopIdx !== currentSimHopRef.current) {
            currentSimHopRef.current = hopIdx;
            setCurrentSimHop(hopIdx);
          }

          if (currentEdge) {
            const p1 = getNodeCoord(currentEdge.from);
            const p2 = getNodeCoord(currentEdge.to);
            const dx = Math.abs(p2.x - p1.x);
            const cx1 = p1.x + Math.max(dx * 0.45, 25);
            const cy1 = p1.y;
            const cx2 = p2.x - Math.max(dx * 0.45, 25);
            const cy2 = p2.y;

            // Direct Bézier shockwave position along the active hop
            const sPos = evalCubicBezier(p1, cx1, cy1, cx2, cy2, p2, hopProgress);
            const sTail1 = evalCubicBezier(p1, cx1, cy1, cx2, cy2, p2, Math.max(0, hopProgress - 0.045));
            const sTail2 = evalCubicBezier(p1, cx1, cy1, cx2, cy2, p2, Math.max(0, hopProgress - 0.090));

            const simDom = simPhotonPartsRef.current;
            if (simDom && simDom.group) {
              simDom.group.style.display = 'inline';
              if (simDom.head) simDom.head.setAttribute('transform', `translate(${sPos.x.toFixed(1)}, ${sPos.y.toFixed(1)})`);
              if (simDom.tail1) simDom.tail1.setAttribute('transform', `translate(${sTail1.x.toFixed(1)}, ${sTail1.y.toFixed(1)})`);
              if (simDom.tail2) simDom.tail2.setAttribute('transform', `translate(${sTail2.x.toFixed(1)}, ${sTail2.y.toFixed(1)})`);
            }

            // Trigger Destination Node arrival ripple upon impact
            if (hopProgress >= 0.88 && !arrivalTracker[`sim-hop-${hopIdx}`]) {
              arrivalTracker[`sim-hop-${hopIdx}`] = true;
              activeArrivalsRef.current[currentEdge.to] = {
                startTime: now,
                color: '#2563eb',
                duration: 550,
              };
            }
          }
        } else {
          isSimulatingRef.current = false;
          setIsSimulating(false);
          currentSimHopRef.current = totalHops;
          setCurrentSimHop(totalHops);
          const simDom = simPhotonPartsRef.current;
          if (simDom && simDom.group) {
            simDom.group.style.display = 'none';
          }
        }
      } else {
        const simDom = simPhotonPartsRef.current;
        if (simDom && simDom.group) {
          simDom.group.style.display = 'none';
        }
      }

      // 2. Update Destination Node Arrival Ripple Effects (Phase 3)
      for (const nodeId in activeArrivalsRef.current) {
        const arrival = activeArrivalsRef.current[nodeId];
        const elapsed = now - arrival.startTime;
        const el = arrivalRingRefs.current[nodeId];
        if (elapsed < arrival.duration) {
          const progress = elapsed / arrival.duration;
          // Cubic ease-out expansion
          const ease = 1 - Math.pow(1 - progress, 3);
          const r = (15 + ease * 14).toFixed(1);
          const strokeW = (2.4 * (1 - ease * 0.5)).toFixed(1);
          const op = ((1 - ease) * 0.78).toFixed(2);
          if (el) {
            el.setAttribute('r', r);
            el.setAttribute('stroke', arrival.color);
            el.setAttribute('stroke-width', strokeW);
            el.style.opacity = op;
          }
        } else {
          if (el) el.style.opacity = '0';
          delete activeArrivalsRef.current[nodeId];
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      } else {
        rafIdRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isRunning = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [particlesList, causalPath]);

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
      {/* Floating Start-to-End Causal Pipeline Simulation HUD Bar */}
      {causalPath.pathNodes.length >= 2 && (
        <div
          className="graph-sim-hud"
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: isSimulating ? '1.5px solid #60a5fa' : '1px solid #e2e8f0',
            boxShadow: isSimulating ? '0 6px 24px rgba(37, 99, 235, 0.20)' : '0 2px 10px rgba(0, 0, 0, 0.05)',
            borderRadius: 30,
            padding: '5px 16px 5px 8px',
            transition: 'all 0.25s ease',
            pointerEvents: 'auto',
            maxWidth: '92%',
          }}
        >
          <button
            className="btn btn-black btn-sm"
            onClick={handleRestartSimulation}
            style={{
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: isSimulating ? '#1d4ed8' : '#09090b',
              boxShadow: isSimulating ? '0 0 10px rgba(37, 99, 235, 0.4)' : 'none',
              flexShrink: 0,
            }}
          >
            <Play size={12} fill="currentColor" />
            <span>{isSimulating ? 'Restart' : 'Replay Pipeline'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'nowrap', overflow: 'hidden' }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: isSimulating ? '#2563eb' : '#10b981',
                boxShadow: isSimulating ? '0 0 10px #2563eb' : '0 0 6px #10b981',
                flexShrink: 0,
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                {isSimulating ? (
                  <span style={{ color: '#2563eb' }}>
                    Pipeline Step {Math.min(currentSimHop + 1, causalPath.pathEdges.length)}/{causalPath.pathEdges.length}:
                  </span>
                ) : (
                  <span style={{ color: '#059669' }}>Pipeline Delivered:</span>
                )}
              </span>

              {/* Start-to-End Pipeline Node Breadcrumbs */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                {causalPath.pathNodes.map((id, nIdx) => {
                  const node = rawNodes.find((n) => n.id === id);
                  const label = node?.label || id;
                  const isCurrentActive = isSimulating && (nIdx === currentSimHop || nIdx === currentSimHop + 1);
                  const isCompleted = isSimulating ? nIdx <= currentSimHop : true;

                  return (
                    <React.Fragment key={id}>
                      {nIdx > 0 && (
                        <span style={{
                          color: isSimulating && nIdx - 1 === currentSimHop ? '#2563eb' : '#94a3b8',
                          fontWeight: isSimulating && nIdx - 1 === currentSimHop ? 700 : 400,
                          fontSize: 11,
                        }}>
                          →
                        </span>
                      )}
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: isCurrentActive ? 700 : isCompleted ? 600 : 500,
                          backgroundColor: isCurrentActive
                            ? 'rgba(37, 99, 235, 0.12)'
                            : isCompleted
                            ? 'rgba(241, 245, 249, 0.8)'
                            : 'transparent',
                          color: isCurrentActive
                            ? '#1d4ed8'
                            : isCompleted
                            ? '#0f172a'
                            : '#94a3b8',
                          border: isCurrentActive ? '1px solid #93c5fd' : '1px solid transparent',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
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

          {/* Keyframe animations and graph motion styling */}
          <style>{`
            @keyframes nodeAmbientBreathe {
              0%, 100% {
                transform: scale(1);
                opacity: 0.20;
              }
              50% {
                transform: scale(1.30);
                opacity: 0.46;
              }
            }
            @keyframes nodeAnchorBreathe {
              0%, 100% {
                transform: scale(1);
                opacity: 0.28;
              }
              50% {
                transform: scale(1.36);
                opacity: 0.58;
              }
            }
            @keyframes nodeAnchorPulse {
              0% {
                transform: scale(1);
                opacity: 0.65;
              }
              50% {
                transform: scale(1.32);
                opacity: 0.20;
              }
              100% {
                transform: scale(1.55);
                opacity: 0;
              }
            }
            @keyframes nodeSelectedPulse {
              0% {
                transform: scale(0.96);
                opacity: 0.90;
              }
              60% {
                transform: scale(1.30);
                opacity: 0.22;
              }
              100% {
                transform: scale(1.52);
                opacity: 0;
              }
            }
            @keyframes nodeNeighborRotate {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
            @keyframes edgeFlowDash {
              to {
                stroke-dashoffset: -36;
              }
            }
            .edge-traveling-dash {
              animation: edgeFlowDash 1.6s linear infinite;
            }
            @keyframes pipelineFluidFlow {
              to {
                stroke-dashoffset: -40;
              }
            }
            .pipeline-fluid-pulse {
              animation: pipelineFluidFlow 1.3s linear infinite;
            }
            .graph-node {
              transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .graph-node:hover .node-primary-circle {
              filter: drop-shadow(0 4px 14px rgba(99, 102, 241, 0.45)) !important;
            }
            @media (prefers-reduced-motion: reduce) {
              .graph-edge-particle, .edge-traveling-dash, .pipeline-fluid-pulse {
                display: none !important;
              }
              .node-ambient-ring, .node-selected-ring, .node-anchor-ring, .node-neighbor-ring, .node-pipeline-ring {
                animation: none !important;
              }
            }
          `}</style>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Subtle Grid Canvas */}
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#graph-grid)" />

          {/* ===================== CAUSAL PIPELINE CONDUIT UNDERLAY ===================== */}
          {causalPath.pathEdges.length > 0 && (
            <g className="graph-pipeline-conduit-layer">
              {causalPath.pathEdges.map((edge, pIdx) => {
                const p1 = getNodeCoord(edge.from);
                const p2 = getNodeCoord(edge.to);
                const dx = Math.abs(p2.x - p1.x);
                const cx1 = p1.x + Math.max(dx * 0.45, 25);
                const cy1 = p1.y;
                const cx2 = p2.x - Math.max(dx * 0.45, 25);
                const cy2 = p2.y;
                const pathData = `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;

                const isCurrentHop = isSimulating && pIdx === currentSimHop;
                const isPastHop = isSimulating ? pIdx < currentSimHop : true;

                return (
                  <g key={`pipeline-conduit-${edge.from}-${edge.to}-${pIdx}`}>
                    {/* Glowing outer conduit tube */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={isCurrentHop ? '#2563eb' : isPastHop ? '#38bdf8' : '#93c5fd'}
                      strokeWidth={isCurrentHop ? 9 : 6.5}
                      strokeOpacity={isCurrentHop ? 0.45 : isPastHop ? 0.28 : 0.16}
                      strokeLinecap="round"
                      style={{
                        pointerEvents: 'none',
                        transition: 'all 0.3s ease',
                      }}
                    />
                    {/* Directional fluid pulse along the pipeline tube */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={isCurrentHop ? '#60a5fa' : '#38bdf8'}
                      strokeWidth={isCurrentHop ? 3.8 : 2.4}
                      strokeOpacity={isCurrentHop ? 0.95 : 0.65}
                      strokeDasharray={isCurrentHop ? '14 20' : '8 26'}
                      className="pipeline-fluid-pulse"
                      style={{ pointerEvents: 'none' }}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* ===================== EDGES (BEZIER SPLINES) ===================== */}
          {/* Tier headers: the graph reads left to right through the four tiers of the hierarchy */}
          <g className="graph-tier-headers" style={{ pointerEvents: 'none' }}>
            {[
              [0, 150, 'Tier 0', 'EVENTS & POLICY'],
              [1, 340, 'Tier 1', 'COMMODITIES'],
              [2, 510, 'Tier 1', 'INDICATORS'],
              [3, 680, 'Tier 2', 'SECTORS'],
              [4, 850, 'Tier 3', 'ASSETS'],
            ].filter(([c]) => rawNodes.some((n) => n.col === c)).map(([c, x, tier, name]) => (
              <g key={`tier-${c}`}>
                <text x={x} y={30} textAnchor="middle" fontSize="9.5" fill="#a1a1aa" letterSpacing="0.6px">{tier}</text>
                <text x={x} y={45} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#52525b" letterSpacing="0.4px">{name}</text>
              </g>
            ))}
          </g>

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
              const isNegative = edge.sign < 0;
              const isEdgeSelected = selectedEdge && selectedEdge.from === edge.from && selectedEdge.to === edge.to;
              const isPipelineEdge = causalPath.pathEdges.some((pe) => pe.from === edge.from && pe.to === edge.to);
              const pipelineHopIndex = causalPath.pathEdges.findIndex((pe) => pe.from === edge.from && pe.to === edge.to);

              let strokeColor = isPositive ? '#10b981' : '#f43f5e';
              let strokeWidth = 2.0;
              let opacity = 0.52;
              let markerEnd = isPositive ? 'url(#arrow-pos)' : 'url(#arrow-neg)';

              // High-visibility glowing particle styling based on relationship & state
              let particleColor = isPositive ? '#10b981' : isNegative ? '#f43f5e' : '#06b6d4';
              let particleRadius = 3.6;
              let haloRadius = 8.5;
              let particleOpacity = 0.90;

              // Special styling for the active causal path or selected edge
              if (isEdgeSelected) {
                strokeColor = '#2563eb';
                strokeWidth = 4.4;
                opacity = 1.0;
                markerEnd = 'url(#arrow-active)';
                particleColor = '#2563eb';
                particleRadius = 4.8;
                haloRadius = 11.0;
                particleOpacity = 1.0;
              } else if (isPipelineEdge) {
                const isCurrentHop = isSimulating && pipelineHopIndex === currentSimHop;
                strokeColor = isCurrentHop ? '#2563eb' : (isSimulating && pipelineHopIndex < currentSimHop ? '#0284c7' : '#09090b');
                strokeWidth = isCurrentHop ? 4.6 : 3.8;
                opacity = 1.0;
                markerEnd = 'url(#arrow-active)';
                particleColor = '#2563eb';
                particleRadius = 4.6;
                haloRadius = 11.0;
                particleOpacity = 1.0;
              } else if (edge.isActive) {
                strokeColor = '#09090b';
                strokeWidth = 3.8;
                opacity = 1.0;
                markerEnd = 'url(#arrow-active)';
                particleColor = '#2563eb';
                particleRadius = 4.4;
                haloRadius = 10.0;
                particleOpacity = 1.0;
              } else if (isHighlighted) {
                strokeWidth = 3.2;
                opacity = 0.95;
                particleRadius = 4.2;
                haloRadius = 9.5;
                particleOpacity = 1.0;
              } else if (hoveredNode || activeNodeId) {
                opacity = 0.10; // Dim unrelated edges
                particleOpacity = 0.08; // Fade unrelated particles
              }

              // Dynamic distance-based speed & offset delay to prevent mechanical synchronized flow
              const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              const duration = Math.max(1.8, Math.min(3.8, (dist / 170) + ((idx % 4) * 0.28)));
              const delay1 = -((idx * 0.61) % duration);
              const delay2 = -(delay1 + duration * 0.5);

              return (
                <g key={`edge-group-${edge.from}-${edge.to}-${idx}`}>
                  {/* Wide invisible hit area for easy edge selection */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectEdge) {
                        onSelectEdge(edge);
                      } else {
                        const src = rawNodes.find((n) => n.id === edge.from);
                        if (src) onSelectNode(src);
                      }
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
                        weight: (edge.sign || 1) * (edge.strength || 0.5),
                        lag: edge.lag != null ? `${edge.lag}d lag` : null,
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredEdge(null);
                      setTooltip(null);
                    }}
                  />

                  {/* Visible styled edge */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    markerEnd={markerEnd}
                    style={{
                      cursor: 'pointer',
                      transition: 'stroke-opacity 0.25s ease, stroke-width 0.25s ease, stroke 0.25s ease',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* High-visibility continuous traveling light stream along the connection */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth + (isHighlighted ? 2.6 : 1.2)}
                    strokeOpacity={isHighlighted ? 0.75 : 0.35}
                    strokeDasharray={isHighlighted ? '14 22' : '8 32'}
                    className="edge-traveling-dash"
                    style={{ pointerEvents: 'none' }}
                  />

                  </g>
              );
            })}
          </g>

          {/* ===================== TRAVELING PARTICLES LAYER (60 FPS DIRECTIONAL MOTION) ===================== */}
          <g className="graph-particles-layer">
            {particlesList.map((pt) => (
              <g
                key={pt.id}
                id={pt.id}
                ref={(el) => {
                  if (el) {
                    particleElsRef.current[pt.id] = {
                      group: el,
                      head: el.querySelector('.pt-head'),
                      tail1: el.querySelector('.pt-tail1'),
                      tail2: el.querySelector('.pt-tail2'),
                    };
                  } else {
                    delete particleElsRef.current[pt.id];
                  }
                }}
                className="particle-track-group"
                style={{ pointerEvents: 'none', opacity: 0 }}
              >
                {/* Luminous Comet Tail 2 (Farthest behind, smaller and softer) */}
                <circle
                  className="pt-tail2"
                  cx="0"
                  cy="0"
                  r="1.9"
                  fill={pt.color}
                  opacity="0.32"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Luminous Comet Tail 1 (Midway behind, medium brightness) */}
                <circle
                  className="pt-tail1"
                  cx="0"
                  cy="0"
                  r="2.8"
                  fill={pt.color}
                  opacity="0.62"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Primary Traveling Photon Head */}
                <g className="pt-head" style={{ pointerEvents: 'none' }}>
                  {/* Soft luminous aura halo */}
                  <circle
                    className="pt-halo"
                    cx="0"
                    cy="0"
                    r={pt.isSecondary || pt.color === '#2563eb' ? 12 : 9.0}
                    fill={pt.color}
                    opacity="0.38"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* High-contrast vibrant colored core */}
                  <circle
                    className="pt-core"
                    cx="0"
                    cy="0"
                    r={pt.isSecondary || pt.color === '#2563eb' ? 4.8 : 3.9}
                    fill={pt.color}
                    opacity="1.0"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Specular pure white photon spark */}
                  <circle
                    className="pt-specular"
                    cx="0"
                    cy="0"
                    r="1.7"
                    fill="#ffffff"
                    opacity="0.96"
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              </g>
            ))}

            {/* High-Energy Start-to-End Simulation Shockwave Photon */}
            <g
              id="sim-shockwave-group"
              ref={(el) => {
                if (el) {
                  simPhotonPartsRef.current = {
                    group: el,
                    head: el.querySelector('.sim-shock-head'),
                    tail1: el.querySelector('.sim-shock-tail1'),
                    tail2: el.querySelector('.sim-shock-tail2'),
                  };
                } else {
                  simPhotonPartsRef.current = {};
                }
              }}
              style={{ display: 'none', pointerEvents: 'none' }}
            >
              {/* Shockwave Trail 2 */}
              <circle
                className="sim-shock-tail2"
                cx="0"
                cy="0"
                r="3.5"
                fill="#38bdf8"
                opacity="0.45"
                style={{ pointerEvents: 'none' }}
              />
              {/* Shockwave Trail 1 */}
              <circle
                className="sim-shock-tail1"
                cx="0"
                cy="0"
                r="5.2"
                fill="#2563eb"
                opacity="0.75"
                style={{ pointerEvents: 'none' }}
              />
              {/* Primary Shockwave Head */}
              <g className="sim-shock-head" style={{ pointerEvents: 'none' }}>
                <circle
                  cx="0"
                  cy="0"
                  r="16"
                  fill="#2563eb"
                  opacity="0.45"
                  style={{ pointerEvents: 'none' }}
                />
                <circle
                  cx="0"
                  cy="0"
                  r="6.5"
                  fill="#0284c7"
                  opacity="1.0"
                  style={{ pointerEvents: 'none' }}
                />
                <circle
                  cx="0"
                  cy="0"
                  r="2.6"
                  fill="#ffffff"
                  opacity="1.0"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            </g>
          </g>

          {/* ===================== NODES ===================== */}
          <g className="graph-nodes-layer">
            {rawNodes.map((node) => {
              const pos = getNodeCoord(node.id);
              const isSelected = selectedNode?.id === node.id;
              const isAnchor = !!node.isAnchor;
              const isHighlighted = isNodeHighlighted(node.id);
              const isHovered = hoveredNode === node.id;
              const colors = getNodeColor(node.type);

              const opacity = (hoveredNode || activeNodeId) && !isHighlighted ? 0.22 : 1.0;
              const pipelineNodeIdx = causalPath.pathNodes.indexOf(node.id);
              const isPipelineNode = pipelineNodeIdx !== -1;
              const isPipelineStart = isPipelineNode && pipelineNodeIdx === 0;
              const isPipelineEnd = isPipelineNode && pipelineNodeIdx === causalPath.pathNodes.length - 1;
              const isPipelineCurrent = isSimulating && (pipelineNodeIdx === currentSimHop || pipelineNodeIdx === currentSimHop + 1);
              const isPipelineCompleted = isSimulating ? pipelineNodeIdx <= currentSimHop : isPipelineNode;

              return (
                <g
                  key={node.id}
                  className={`graph-node ${isHovered ? 'is-hovered' : ''}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{
                    cursor: 'pointer',
                    opacity,
                    transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
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
                  {/* Destination Node Particle Arrival Ripple (Phase 3) */}
                  <circle
                    ref={(el) => {
                      if (el) arrivalRingRefs.current[node.id] = el;
                      else delete arrivalRingRefs.current[node.id];
                    }}
                    className="node-arrival-ripple"
                    r="15"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.4"
                    style={{ opacity: 0, pointerEvents: 'none', transformOrigin: '0px 0px' }}
                  />

                  {/* Luminous Pipeline Corridor Node Ring & Pulsing */}
                  {isPipelineNode && (
                    <circle
                      className="node-pipeline-ring"
                      r={isPipelineStart || isPipelineEnd ? 26 : 22}
                      fill="none"
                      stroke={isPipelineCurrent ? '#2563eb' : isPipelineCompleted ? '#0284c7' : '#38bdf8'}
                      strokeWidth={isPipelineCurrent ? 3.0 : 1.8}
                      strokeDasharray={isPipelineCurrent ? 'none' : '4 3'}
                      opacity={isPipelineCurrent ? 1.0 : isPipelineCompleted ? 0.75 : 0.45}
                      style={{
                        pointerEvents: 'none',
                        transformOrigin: '0px 0px',
                        animation: isPipelineCurrent ? 'nodeAnchorPulse 1.5s ease-out infinite' : 'none',
                      }}
                    />
                  )}

                  {/* Pipeline Stage Badge Tag: START, STEP 1, STEP 2, END */}
                  {isPipelineNode && (
                    <g transform="translate(0, -23)" style={{ pointerEvents: 'none' }}>
                      <rect
                        x="-23"
                        y="-12"
                        width="46"
                        height="14"
                        rx="7"
                        fill={isPipelineStart ? '#f59e0b' : isPipelineEnd ? '#2563eb' : '#0284c7'}
                        opacity={isPipelineCurrent ? 1.0 : 0.88}
                      />
                      <text
                        x="0"
                        y="-2"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="8.5"
                        fontWeight="700"
                        letterSpacing="0.04em"
                      >
                        {isPipelineStart ? 'START' : isPipelineEnd ? 'END' : `STEP ${pipelineNodeIdx}`}
                      </text>
                    </g>
                  )}
                  {/* High-Visibility Ambient Breathing Glow Ring (All Nodes) */}
                  <circle
                    className="node-ambient-ring"
                    r={isAnchor ? 24 : 20}
                    fill={colors.stroke}
                    opacity={isAnchor ? 0.36 : 0.22}
                    style={{
                      transformOrigin: '0px 0px',
                      pointerEvents: 'none',
                      animation: isAnchor
                        ? 'nodeAnchorBreathe 3.2s ease-in-out infinite'
                        : 'nodeAmbientBreathe 3.8s ease-in-out infinite',
                      animationDelay: `${(rawNodes.indexOf(node) * 0.38) % 3.5}s`,
                    }}
                  />

                  {/* Connected Direct Neighbor Ring (Soft Highlight Rotating Aura) */}
                  {isHighlighted && !isSelected && !isAnchor && (
                    <circle
                      className="node-neighbor-ring"
                      r={20.5}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth="2.2"
                      strokeDasharray="5 3"
                      opacity="0.9"
                      style={{
                        transformOrigin: '0px 0px',
                        animation: 'nodeNeighborRotate 10s linear infinite',
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {/* Anchor Double Black Ring with Ambient Breathing Pulse */}
                  {isAnchor && (
                    <>
                      <circle
                        r={22}
                        fill="none"
                        stroke="#000000"
                        strokeWidth="3.4"
                      />
                      <circle
                        className="node-anchor-ring"
                        r={27}
                        fill="none"
                        stroke="#09090b"
                        strokeWidth="1.6"
                        opacity="0.55"
                        style={{
                          transformOrigin: '0px 0px',
                          animation: 'nodeAnchorPulse 2.6s ease-in-out infinite',
                          pointerEvents: 'none',
                        }}
                      />
                    </>
                  )}

                  {/* Selected Active Blue Ring with Expanding Pulse Ripple */}
                  {isSelected && (
                    <>
                      <circle
                        r={22}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3.4"
                      />
                      <circle
                        className="node-selected-ring"
                        r={28}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2.2"
                        style={{
                          transformOrigin: '0px 0px',
                          animation: 'nodeSelectedPulse 2.0s cubic-bezier(0.25, 1, 0.5, 1) infinite',
                          pointerEvents: 'none',
                        }}
                      />
                    </>
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

                  {/* Primary Node Circle (Smooth Interactive Hover & Scale) */}
                  <circle
                    className="node-primary-circle"
                    r={isHovered ? 15.0 : isSelected ? 14.8 : isAnchor ? 14 : 14}
                    fill={isSelected ? '#0284c7' : colors.fill}
                    stroke={isHovered ? '#4338ca' : isSelected ? '#0369a1' : colors.stroke}
                    strokeWidth={isHovered ? 2.6 : isSelected ? 2.2 : 1.8}
                    strokeDasharray={node.isHypothesis && !isSelected ? '3,2' : undefined}
                    opacity={node.isHypothesis && !isSelected ? 0.8 : 1}
                    filter={
                      isHovered
                        ? 'drop-shadow(0 4px 10px rgba(99, 102, 241, 0.35))'
                        : isSelected
                        ? 'drop-shadow(0 2px 8px rgba(37, 99, 235, 0.35))'
                        : 'drop-shadow(0 1px 3px rgba(0,0,0,0.06))'
                    }
                    style={{
                      transition: 'r 0.22s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.22s ease, stroke-width 0.22s ease',
                    }}
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
                    fontWeight={isSelected || isAnchor || isHovered ? '700' : '500'}
                    fill={isSelected || isAnchor ? '#09090b' : isHovered ? '#1e1b4b' : '#334155'}
                    letterSpacing="-0.1px"
                    style={{
                      transition: 'fill 0.2s ease, font-weight 0.2s ease',
                      userSelect: 'none',
                    }}
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

      {/* ===================== EVIDENCE TIERS LEGEND ===================== */}
      <div
        className="evidence-tiers-legend"
        style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.85)',
          borderRadius: 14,
          padding: '14px 18px',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12, color: '#334155' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px dashed #64748b', flexShrink: 0 }} />
          <span>Hypothesis: possible driver / context (not in the article)</span>
        </div>
      </div>

      {/* ===================== ZOOM & FIT CONTROLS (Glassmorphic) ===================== */}
      <div
        className="graph-zoom-controls"
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.85)',
          borderRadius: 12,
          padding: 6,
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
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
          <Maximize2 size={15} />
        </button>
        {onResetDefaults && (
          <button
            className="graph-zoom-btn"
            onClick={onResetDefaults}
            disabled={isResetting}
            title="Reset Graph to Baseline Defaults (Undo all demo edits & edge overrides)"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: isResetting ? 'not-allowed' : 'pointer',
              borderRadius: 6,
              color: isResetting ? '#94a3b8' : '#e11d48',
            }}
          >
            <RotateCcw size={14} className={isResetting ? 'spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}
