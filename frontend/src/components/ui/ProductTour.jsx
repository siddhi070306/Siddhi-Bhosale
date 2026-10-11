import React, { useState, useEffect } from 'react';

const TOUR_STEPS = [
  { tab: 'chat', el: '.chat-input-box', fallback: '.chat-input-container', title: "1. The News Input", desc: "Paste any financial news article here, or select a sample event. You can also fetch live headlines to start analyzing." },
  { tab: 'event-analysis', el: '.page-header', fallback: '.sidebar', title: "2. Extraction & Tags", desc: "Apex Zenith uses an LLM to read the article, extracting entities (companies, sectors, commodities) and tagging them as 'Observed' or 'Expected' events." },
  { tab: 'impact-graph', el: '.page-header', fallback: '.sidebar', title: "3. Layered Causal Graph", desc: "This interactive graph models the cascading effects of the event. It dynamically maps shocks from specific assets to broader sectors based on historical knowledge." },
  { tab: 'asset-impact', el: '.page-header', fallback: '.sidebar', title: "4. Results Tabs", desc: "View the most affected assets, exact causal paths, and read LLM-generated explanations that verify whether each causal link makes economic sense." },
  { tab: 'home', el: '.live-time-badge', fallback: '.header-right', title: "5. Live Market Data", desc: "Toggle this to fetch real-time stock prices (via Yahoo Finance/FRED). The system will overlay live market movements directly onto the causal graph." }
];

export default function ProductTour({ isActive, onComplete, setActiveTab, setHasAnalyzed }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Reset step to 0 whenever tour is opened
  useEffect(() => {
    if (isActive) {
      setStep(0);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    const currentStep = TOUR_STEPS[step];
    
    // Switch to the correct tab for this step
    if (step > 0) setHasAnalyzed(true);
    setActiveTab(currentStep.tab);

    let timeout;
    const findElement = () => {
      let target = document.querySelector(currentStep.el);
      if (!target && currentStep.fallback) target = document.querySelector(currentStep.fallback);
      
      if (target) {
        setRect(target.getBoundingClientRect());
      } else {
        // Fallback to center screen if element totally missing
        setRect({ top: window.innerHeight/2 - 50, left: window.innerWidth/2 - 50, width: 100, height: 100, right: window.innerWidth/2 + 50, bottom: window.innerHeight/2 + 50 });
      }
    };

    // Give React time to unmount/mount the new page, then find the element
    timeout = setTimeout(findElement, 250);

    window.addEventListener('resize', findElement);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', findElement);
    };
  }, [isActive, step, setActiveTab, setHasAnalyzed]);

  if (!isActive || !rect) return null;

  const currentStep = TOUR_STEPS[step];

  let pTop = rect.top + rect.height/2 - 80;
  let pLeft = rect.right + 25;
  if (pLeft + 320 > window.innerWidth) pLeft = rect.left - 345;
  if (pLeft < 0) { pLeft = rect.left + 25; pTop = rect.bottom + 25; }
  if (pTop < 15) pTop = 15;
  if (pTop + 200 > window.innerHeight) pTop = window.innerHeight - 200;

  return (
    <>
      <div style={{
        position: 'fixed', zIndex: 9998,
        border: '2px dashed #09090b', borderRadius: 8,
        boxShadow: '0 0 0 9999px rgba(9, 9, 11, 0.4)',
        pointerEvents: 'none', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        top: rect.top - 8, left: rect.left - 8,
        width: rect.width + 16, height: rect.height + 16
      }} />

      <div style={{
        position: 'fixed', zIndex: 10000,
        background: '#ffffff', border: '1px solid #09090b', borderRadius: 12,
        padding: 20, width: 340, color: '#09090b',
        boxShadow: '0 12px 32px rgba(0,0,0,0.15), 0 0 0 1px #09090b',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        top: pTop, left: pLeft
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{currentStep.title}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#52525b', lineHeight: 1.5 }}>{currentStep.desc}</p>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 16 : 6, height: 6, borderRadius: 4,
                background: i === step ? '#09090b' : '#e4e4e7',
                transition: 'all 0.3s ease'
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={onComplete} style={{ padding: '6px 12px', fontSize: 12.5 }}>Skip</button>
            {step > 0 && (
              <button className="btn btn-outline" onClick={() => setStep(s => s - 1)} style={{ padding: '6px 12px', fontSize: 12.5 }}>Back</button>
            )}
            <button className="btn btn-black" onClick={() => {
              if (step === TOUR_STEPS.length - 1) onComplete();
              else setStep(s => s + 1);
            }} style={{ padding: '6px 12px', fontSize: 12.5 }}>
              {step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
