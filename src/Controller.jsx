import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStroke } from 'perfect-freehand';
import Peer from 'peerjs'; 
import { Pen, Eraser, Highlighter, Zap, Move, ArrowLeft, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';

function getSvgPathFromStroke(stroke) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

const isPointNearStroke = (strokePoints, screenX, screenY, transform) => {
  const threshold = 20; 
  return strokePoints.some(p => {
     const wx = Array.isArray(p) ? p[0] : p.x;
     const wy = Array.isArray(p) ? p[1] : p.y;
     const sx = wx * transform.k + transform.x;
     const sy = wy * transform.k + transform.y;
     return Math.hypot(sx - screenX, sy - screenY) < threshold;
  });
};

const Controller = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Connecting to Local Network...');

  const [tool, setTool] = useState('pen'); 
  const [color, setColor] = useState('#1e1e1e');
  const [size, setSize] = useState(6); 
  const [uiVisible, setUiVisible] = useState(true); 
  
  const backgroundRef = useRef(null); 
  const [bgLoaded, setBgLoaded] = useState(false); 

  // -- VIRTUAL DIMENSIONS (Synced from PC) --
  const remoteSizeRef = useRef({ w: 1000, h: 1000 }); 

  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const strokesRef = useRef([]); 
  const laserLinesRef = useRef([]);
  const currentStrokeRef = useRef([]);
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const lastSentRef = useRef(0);

  const gesture = useRef({
     active: false, mode: 'IDLE', startPointers: [],
     startTransform: { x:0, y:0, k:1 }, startCenter: { x:0, y:0 }, startDist: 0
  });

  useEffect(() => {
    if (!code) { navigate('/dashboard'); return; }

    const peer = new Peer(); 
    peerRef.current = peer;

    peer.on('open', () => {
        const conn = peer.connect(`wb-app-${code}`);
        conn.on('open', () => {
            setStatus('Connected (Local)');
            connRef.current = conn;
        });

        conn.on('data', (data) => {
            // A. SYNC CONTENT
            if (data.type === 'sync_board') {
                const { strokes, backgroundImage, tool, color, size, zoom, pan, dimensions } = data.payload;
                
                strokesRef.current = strokes || [];
                if (tool) setTool(tool);
                if (color) setColor(color);
                if (size) setSize(size);
                
                if (zoom) transformRef.current.k = zoom;
                if (pan) { transformRef.current.x = pan.x; transformRef.current.y = pan.y; }
                
                // --- SYNC DIMENSIONS (FIXES GAP) ---
                if (dimensions) {
                    remoteSizeRef.current = dimensions;
                }

                if (backgroundImage) {
                    const img = new Image(); img.src = backgroundImage;
                    img.onload = () => { backgroundRef.current = img; setBgLoaded(true); requestAnimationFrame(renderCanvas); };
                }
                requestAnimationFrame(renderCanvas);
            }

            // B. SYNC TOOLS
            if (data.type === 'sync_tools') {
                const { tool, color, size } = data.payload;
                if(tool) setTool(tool);
                if(color) setColor(color);
                if(size) setSize(size);
            }
        });

        conn.on('close', () => setStatus('Disconnected'));
        conn.on('error', () => setStatus('Connection Failed'));
    });

    const handleResize = () => requestAnimationFrame(renderCanvas);
    window.addEventListener('resize', handleResize);
    
    const laserInterval = setInterval(() => {
        if(laserLinesRef.current.length > 0) {
            laserLinesRef.current = laserLinesRef.current
                .map(l => ({...l, opacity: l.opacity - 0.05})).filter(l => l.opacity > 0);
            requestAnimationFrame(renderCanvas);
        }
    }, 30);

    return () => { if(peerRef.current) peerRef.current.destroy(); window.removeEventListener('resize', handleResize); clearInterval(laserInterval); };
  }, [code, navigate]);

  const toWorld = (sx, sy) => ({ x: (sx - transformRef.current.x) / transformRef.current.k, y: (sy - transformRef.current.y) / transformRef.current.k });
  const toScreen = (wx, wy) => ({ x: wx * transformRef.current.k + transformRef.current.x, y: wy * transformRef.current.k + transformRef.current.y });

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
    
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, rect.width, rect.height);

    // --- RENDER BACKGROUND MATCHING PC DIMENSIONS ---
    if (backgroundRef.current) {
        ctx.save();
        const img = backgroundRef.current;
        // PC simply stretches img to fill "containerWidth x containerHeight".
        // We simulate that "container" here as "remoteSizeRef".
        // World coordinates are pixels relative to that PC container.
        
        const renderW = remoteSizeRef.current.w * transformRef.current.k;
        const renderH = remoteSizeRef.current.h * transformRef.current.k;
        
        const renderX = transformRef.current.x; 
        const renderY = transformRef.current.y;

        ctx.drawImage(img, renderX, renderY, renderW, renderH);
        ctx.restore();
    }
    
    strokesRef.current.forEach(s => drawStroke(ctx, s));
    laserLinesRef.current.forEach(l => drawStroke(ctx, {...l, color: '#ef4444', isLaser: true}));
    
    if (currentStrokeRef.current.length > 0) {
        drawStroke(ctx, {
            points: currentStrokeRef.current,
            color: tool === 'eraser' ? 'rgba(255,0,0,0.1)' : (tool === 'laser' ? '#ef4444' : color),
            size: size, tool: tool, isHighlighter: tool === 'highlighter', isLaser: tool === 'laser'
        });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
  };

  const drawStroke = (ctx, stroke) => {
      if (stroke.points.length < 2) return;
      const screenPoints = stroke.points.map(p => {
          const px = Array.isArray(p) ? p[0] : p.x;
          const py = Array.isArray(p) ? p[1] : p.y;
          const pr = Array.isArray(p) ? p[2] : (p.pressure || 0.5);
          const s = toScreen(px, py);
          return [s.x, s.y, pr];
      });
      const renderSize = stroke.size * transformRef.current.k;
      const outlinePoints = getStroke(screenPoints, { size: renderSize, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last: stroke.points.length === 1 });
      const pathData = getSvgPathFromStroke(outlinePoints);
      ctx.save();
      if (stroke.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,1)'; } 
      else if (stroke.isLaser) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = stroke.color; ctx.globalAlpha = stroke.opacity ?? 1; ctx.shadowColor = stroke.color; ctx.shadowBlur = 15; } 
      else if (stroke.isHighlighter || stroke.tool === 'highlighter') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = stroke.color; ctx.globalAlpha = 0.5; } 
      else { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = stroke.color; ctx.globalAlpha = 1; }
      const path = new Path2D(pathData); ctx.fill(path); ctx.restore();
  };

  const sendSocket = (type, x, y, pressure) => {
     if (!connRef.current) return;
     const now = Date.now();
     if (type === 'move' && now - lastSentRef.current < 16) return;
     lastSentRef.current = now;
     connRef.current.send({ type, x, y, pressure, color, size, tool });
  };

  const handleTouchStart = (e) => {
      e.preventDefault();
      const touches = Array.from(e.touches);
      const rect = containerRef.current.getBoundingClientRect();
      const t = transformRef.current;
      if (touches.length === 2) {
          gesture.current.mode = 'ZOOM'; gesture.current.active = true;
          const cX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
          const cY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
          const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
          gesture.current.startDist = dist; gesture.current.startCenter = { x: cX, y: cY };
          gesture.current.startTransform = { ...t }; currentStrokeRef.current = []; return;
      }
      if (touches.length === 1) {
          const touch = touches[0]; const px = touch.clientX - rect.left; const py = touch.clientY - rect.top;
          if (tool === 'pan') {
              gesture.current.mode = 'PAN'; gesture.current.active = true;
              gesture.current.startCenter = { x: px, y: py }; gesture.current.startTransform = { ...t };
          } else {
              gesture.current.mode = 'DRAW'; gesture.current.active = true;
              const worldPos = toWorld(px, py); const pressure = touch.force || 0.5;
              if (tool === 'eraser') {
                  const initialCount = strokesRef.current.length;
                  strokesRef.current = strokesRef.current.filter(s => !isPointNearStroke(s.points, px, py, transformRef.current));
                  if (strokesRef.current.length !== initialCount) renderCanvas();
              }
              // Send Raw World Coordinates
              sendSocket('start', worldPos.x, worldPos.y, pressure);
              currentStrokeRef.current = [{x: worldPos.x, y: worldPos.y, pressure}];
              renderCanvas();
          }
      }
  };

  const handleTouchMove = (e) => {
      e.preventDefault();
      if (!gesture.current.active) return;
      const touches = Array.from(e.touches);
      const rect = containerRef.current.getBoundingClientRect();
      if (gesture.current.mode === 'ZOOM' && touches.length === 2) {
          const cX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
          const cY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
          const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
          const { startDist, startTransform, startCenter } = gesture.current;
          const scaleChange = dist / startDist; const newK = Math.max(0.1, Math.min(startTransform.k * scaleChange, 10));
          const mouseInWorldX = (startCenter.x - startTransform.x) / startTransform.k;
          const mouseInWorldY = (startCenter.y - startTransform.y) / startTransform.k;
          const newX = cX - (mouseInWorldX * newK); const newY = cY - (mouseInWorldY * newK);
          transformRef.current = { x: newX, y: newY, k: newK };
          renderCanvas();
      } else if (gesture.current.mode === 'PAN' && touches.length === 1) {
          const px = touches[0].clientX - rect.left; const py = touches[0].clientY - rect.top;
          const dx = px - gesture.current.startCenter.x; const dy = py - gesture.current.startCenter.y;
          transformRef.current = { ...transformRef.current, x: gesture.current.startTransform.x + dx, y: gesture.current.startTransform.y + dy };
          renderCanvas();
      } else if (gesture.current.mode === 'DRAW' && touches.length === 1) {
          const t = touches[0]; const px = t.clientX - rect.left; const py = t.clientY - rect.top;
          const pressure = t.force || 0.5; const worldPos = toWorld(px, py);
          if (tool === 'eraser') { strokesRef.current = strokesRef.current.filter(s => !isPointNearStroke(s.points, px, py, transformRef.current)); }
          
          sendSocket('move', worldPos.x, worldPos.y, pressure);
          currentStrokeRef.current.push({x: worldPos.x, y: worldPos.y, pressure});
          renderCanvas();
      }
  };

  const handleTouchEnd = (e) => {
      e.preventDefault();
      if (gesture.current.mode === 'DRAW' && currentStrokeRef.current.length > 0) {
          if (tool === 'laser') { laserLinesRef.current.push({points: currentStrokeRef.current, color: '#ef4444', size: 6, opacity: 1, isLaser: true}); } 
          else if (tool !== 'eraser') { strokesRef.current.push({points: currentStrokeRef.current, color, size, tool, isHighlighter: tool === 'highlighter'}); }
          sendSocket('end', 0, 0, 0);
      }
      currentStrokeRef.current = [];
      renderCanvas();
      if (e.touches.length === 0) { gesture.current.active = false; gesture.current.mode = 'IDLE'; } 
      else { gesture.current.active = false; }
  };

  const manualZoom = (factor) => {
      const t = transformRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const centerW = rect.width / 2; const centerH = rect.height / 2;
      const newK = Math.max(0.1, Math.min(t.k * factor, 10));
      const worldCenterX = (centerW - t.x) / t.k; const worldCenterY = (centerH - t.y) / t.k;
      const newX = centerW - worldCenterX * newK; const newY = centerH - worldCenterY * newK;
      transformRef.current = { k: newK, x: newX, y: newY };
      renderCanvas(); 
  };
  const handleToolChange = (t) => { setTool(t); if(connRef.current) connRef.current.send({ type: 'tool_change', tool: t }); };
  const handleColorChange = (c) => { setColor(c); if(connRef.current) connRef.current.send({ type: 'tool_change', color: c }); };

  return (
    <div className="fixed inset-0 bg-[#1a1a1a] text-white flex flex-col touch-none overscroll-none">
      {uiVisible && (
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800 bg-[#111] z-20">
              <button onClick={() => navigate('/dashboard')} className="text-gray-400"><ArrowLeft /></button>
              <div className="flex flex-col items-center">
                  <span className="font-mono font-bold tracking-widest text-green-500">{code}</span>
                  <span className="text-[10px] text-gray-500 uppercase">{status}</span>
              </div>
              <div className="flex gap-3 items-center">
                <button onClick={() => { transformRef.current = {x:0,y:0,k:1}; renderCanvas(); }} className="text-xs text-gray-400 border border-gray-700 px-2 py-1 rounded">Reset</button>
                <div className={`w-3 h-3 rounded-full ${status.includes('Connected') ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <button onClick={() => setUiVisible(false)} className="text-gray-400 ml-2"><EyeOff size={20} /></button>
              </div>
          </div>
      )}
      {!uiVisible && <button onClick={() => setUiVisible(true)} className="fixed top-4 right-4 z-50 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/10"><Eye size={20} /></button>}
      <div ref={containerRef} className="flex-1 bg-white relative overflow-hidden" style={{ touchAction: 'none' }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          {tool === 'pan' && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 text-black"><Move size={64} /></div>}
          <canvas ref={canvasRef} className="absolute inset-0 block pointer-events-none origin-top-left"/>
      </div>
      {uiVisible && (
          <div className="bg-[#111] border-t border-gray-800 pb-6 pt-3 px-4 flex flex-col gap-4 z-20">
              <div className="flex items-center justify-between h-8">
                {tool === 'pan' ? (
                    <div className="flex w-full justify-center gap-6">
                        <button onClick={() => manualZoom(0.8)} className="flex items-center gap-2 px-4 py-1 bg-gray-800 rounded-full text-sm"><ZoomOut size={16}/> Out</button>
                        <button onClick={() => manualZoom(1.2)} className="flex items-center gap-2 px-4 py-1 bg-gray-800 rounded-full text-sm"><ZoomIn size={16}/> In</button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 flex-1">
                            <input type="range" min={1} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                        </div>
                        <div className="flex gap-2 ml-4">
                            {['#1e1e1e', '#ef4444', '#3b82f6', '#10b981', '#ffffff'].map(c => <button key={c} onClick={() => handleColorChange(c)} className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white scale-125' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}
                        </div>
                    </>
                )}
              </div>
              <div className="flex justify-between items-center px-1">
                  <ToolBtn icon={<Pen />} active={tool === 'pen'} onClick={() => handleToolChange('pen')} label="Pen" />
                  <ToolBtn icon={<Highlighter />} active={tool === 'highlighter'} onClick={() => handleToolChange('highlighter')} label="Hi-Lite" />
                  <ToolBtn icon={<Zap />} active={tool === 'laser'} onClick={() => handleToolChange('laser')} label="Laser" />
                  <ToolBtn icon={<Eraser />} active={tool === 'eraser'} onClick={() => handleToolChange('eraser')} label="Erase" />
                  <div className="w-px h-8 bg-gray-800 mx-1"></div>
                  <ToolBtn icon={<Move />} active={tool === 'pan'} onClick={() => handleToolChange('pan')} label="Move" />
              </div>
          </div>
      )}
    </div>
  );
};

const ToolBtn = ({ icon, active, onClick, label }) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
        {React.cloneElement(icon, { size: 22 })} <span className="text-[10px] font-medium">{label}</span>
    </button>
);

export default Controller;