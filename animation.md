# Prompt: Add Smooth, Professional Animations to the Existing Financial Network Graph

Act as a senior frontend developer specializing in interactive financial data visualization, graph animations, and premium UI/UX.

I already have a financial network graph similar to the provided reference image. It contains connected nodes such as Gold, Risk Aversion, Inflation Expectations, Consumer Spending, Interest Rates, US Dollar, Real Estate, Autos, Banks, Gold Miners, and market assets such as S&P 500, Nifty 50, GLD, TLT, and bank stocks.

Your task is to **add smooth, realistic, visually appealing animations to the existing graph while preserving its current layout, node positions, connections, labels, colors, and functionality.**

## 1. Animate the Connection Lines

- Add smooth, flowing particle animations along the existing edges.
- Small glowing particles should travel from one node to another, following the actual path of each connection.
- Use the edge's existing direction to determine particle movement.
- Use green particles for positive relationships, red particles for negative relationships, and neutral cyan particles for informational or neutral connections.
- Animate the particles continuously, with different speeds and starting delays to avoid a mechanical appearance.
- Add a subtle traveling glow along selected edges.
- Use curved paths that follow the existing connection geometry.
- Avoid making every edge glow simultaneously; prioritize important connections.
- Ensure particles remain clipped to their paths and never jump between unrelated edges.

## 2. Animate the Nodes

Add subtle animations to nodes without changing their positions.

- **Default state:** A gentle, slow breathing glow with minimal scale variation.
- **On hover:** Smoothly enlarge the node slightly, brighten its border, and display a soft outer glow.
- **On selection:** Add a clear highlight ring and a smooth pulsing animation.
- **Connected nodes:** When a node is hovered or selected, softly highlight its directly connected nodes.
- **Unrelated nodes:** Reduce their opacity slightly to make the active network easier to understand.
- **Important nodes:** Use a slightly stronger glow to distinguish key economic indicators from market assets.

Do not allow nodes to move, bounce, shake, or drift from their original positions.

## 3. Add Interactive Relationship Highlighting

When the user hovers over or selects a node:

1. Highlight the selected node.
2. Highlight all directly connected edges.
3. Animate particles along those highlighted edges.
4. Highlight the connected nodes.
5. Dim unrelated edges and nodes without hiding them completely.
6. Restore the original appearance smoothly when the hover ends.

If the existing graph supports clicking a node to select it, preserve that behavior. Do not replace existing interactions.

## 4. Add a Subtle Ambient Animation

Create a premium, understated animated atmosphere:

- Add very subtle, slow-moving light along the network connections.
- Use soft cyan, mint green, and restrained red highlights.
- Keep the background clean, light, and similar to the existing reference.
- Maintain excellent text readability.
- Use restrained glow effects rather than strong neon or large blurred shadows.
- Make the graph feel alive, responsive, and analytical rather than decorative.

The ambient animation must not distract from the financial relationships.

## 5. Animate Data Changes (If Supported)

If the graph receives live or changing financial data:

- Animate changes in edge color smoothly.
- Transition node highlights when values change.
- Update particle speed or density only when meaningful data changes.
- Avoid restarting all animations whenever new data arrives.
- If a node's value changes, display the updated value through the existing UI, if applicable.

Do not fabricate financial data or change the meaning of the graph's relationships.

## 6. Technical Implementation Requirements

Before modifying anything:

1. Inspect the existing project structure.
2. Identify the graph visualization library or rendering method being used.
3. Locate the node, edge, styling, and interaction components.
4. Understand how edge directions, relationship colors, and node positions are currently defined.
5. Implement animations using the existing technology wherever possible.

Implementation guidelines:

- If the graph uses SVG, prefer SVG paths, `stroke-dasharray`, `stroke-dashoffset`, SVG circles animated along paths, and CSS animations where appropriate.
- If the graph uses Canvas, implement an efficient animation loop using `requestAnimationFrame`.
- If it uses React Flow, D3, Cytoscape.js, or another graph library, use compatible native capabilities where practical.
- Use Framer Motion only if it is already installed or provides a clear benefit.
- Do not introduce unnecessary dependencies.
- Use stable node and edge identifiers.
- Preserve all existing node coordinates and edge geometry.
- Avoid unnecessary React re-renders on every animation frame.
- Clean up animation frames, timers, and event listeners when components unmount.
- Respect `prefers-reduced-motion`.
- Pause or reduce expensive animations when the graph is not visible, where practical.
- Keep animations smooth at approximately 60 FPS on typical laptops.

## 7. Animation Timing

Use these as starting guidelines and adjust them to fit the existing implementation:

- Node breathing cycle: 3–5 seconds.
- Hover transitions: 180–300 milliseconds.
- Selection pulse: 1.8–2.5 seconds per cycle.
- Particle travel: approximately 1.5–4 seconds per edge, depending on edge length.
- Relationship highlight fade: 200–350 milliseconds.
- Ambient glow: slow and subtle, without noticeable flashing.

Use ease-in-out transitions for node interactions and smooth, continuous motion for traveling particles.

## 8. Visual Quality Requirements

The final graph should look like a premium financial intelligence platform with:

- Smooth flowing relationship animations.
- Clearly distinguishable positive and negative connections.
- Interactive node highlighting.
- Subtle glowing particles.
- Stable node positioning.
- Readable labels.
- Minimal visual clutter.
- No flickering, sudden jumps, animation resets, or excessive glow.

Keep the existing light background, graph structure, and visual identity.

## 9. Important Restrictions

- Do not redesign the graph.
- Do not rearrange, reposition, or resize the existing nodes by default.
- Do not remove or rename nodes, edges, or labels.
- Do not change the underlying relationship data.
- Do not replace the current graph with a static image or mockup.
- Do not rebuild working components unnecessarily.
- Do not break zoom, pan, drag, click, selection, tooltips, or other existing interactions.
- Do not animate the entire graph with a single global scale or rotation.
- Do not add excessive particles that obscure labels or overwhelm the screen.

## 10. Implementation and Verification

Implement the changes directly in the existing project.

After implementation:

1. Run the project and inspect the graph.
2. Verify that particle animations follow the correct connection paths.
3. Test hover and selection behavior.
4. Confirm that positive and negative edge colors remain correct.
5. Verify that node positions and existing interactions are unchanged.
6. Check for console errors and performance problems.
7. Fix any regressions before finishing.

Finally, provide a concise summary of the files changed, the animation techniques used, and how to run the updated graph.

**Priority: Smooth animations, stable layout, clear financial relationships, and production-quality performance.**