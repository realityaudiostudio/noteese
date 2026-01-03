import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getStroke } from 'perfect-freehand';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import { message, Modal } from 'antd'; 
import Peer from 'peerjs'; 
import { Pen, Eraser, Highlighter, Save, ArrowLeft, Download, ChevronLeft, ChevronRight, PlusCircle, Loader2, Eye, EyeOff, Zap, Monitor, ZoomIn, ZoomOut, Smartphone, Image as ImageIcon } from 'lucide-react';

// --- SHARED HELPERS ---
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

const checkCollision = (linePoints, ex, ey) => {
  return linePoints.some(p => Math.hypot(p[0] - ex, p[1] - ey) < 20);
};

const renderStroke = (ctx, points, color, size, isHighlighter, opacity = 1) => {
    if (points.length < 2) return;
    const options = { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true };
    const outlinePoints = getStroke(points, options);
    const pathData = getSvgPathFromStroke(outlinePoints);
    
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity; 
    
    if (isHighlighter) { 
        ctx.globalAlpha = 0.3 * opacity; 
        ctx.globalCompositeOperation = 'multiply'; 
    } else { 
        ctx.globalCompositeOperation = 'source-over'; 
    }
    
    const path = new Path2D(pathData);
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
};

const Whiteboard = ({ session }) => {
  const { notebookId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPresenter = searchParams.get('mode') === 'presenter';

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // -- PEER JS STATE --
  const peerRef = useRef(null);
  const [connectionCode, setConnectionCode] = useState(null);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState('Waiting for connection...');

  // -- APP STATE --
  const [lines, setLines] = useState([]);
  const linesRef = useRef([]); 
  
  const [currentPoints, setCurrentPoints] = useState(null);
  const [tool, setTool] = useState('pen');
  const toolRef = useRef('pen');

  const [color, setColor] = useState('#1e1e1e');
  const colorRef = useRef('#1e1e1e');

  const [size, setSize] = useState(6);
  const sizeRef = useRef(6);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });

  const [laserLines, setLaserLines] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [animClass, setAnimClass] = useState('');
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [uiVisible, setUiVisible] = useState(true);
  
  const channelRef = useRef(null);

  // -- SYNC REFS --
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // -- 1. BROADCAST TOOLS --
  useEffect(() => {
    if (!peerRef.current) return;
    const connections = peerRef.current.connections;
    Object.keys(connections).forEach(key => {
        connections[key].forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: 'sync_tools',
                    payload: { tool, color, size }
                });
            }
        });
    });
  }, [tool, color, size]);

  // -- 1.5 BROADCAST BOARD STATE (FIX: Syncs Page Changes & PC Drawing) --
  useEffect(() => {
    if (!peerRef.current) return;
    
    // Safety check for container
    const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { width: 1000, height: 1000 };
    const bgData = backgroundImage ? backgroundImage.src : null;

    const payload = {
        type: 'sync_board',
        payload: { 
            strokes: lines, // Send current lines
            backgroundImage: bgData, // Send current BG
            tool: tool, 
            color: color, 
            size: size,
            zoom: zoom, 
            pan: pan,
            dimensions: { w: rect.width, h: rect.height }
        }
    };

    const connections = peerRef.current.connections;
    Object.keys(connections).forEach(key => {
        connections[key].forEach(conn => {
            if (conn.open) {
                conn.send(payload);
            }
        });
    });
  }, [lines, backgroundImage, zoom, pan]); // Triggers on Page Change (lines/bg update) or PC Drawing (lines update)

  // -- 2. PEERJS SETUP (LOCAL WIFI) --
  const startLocalConnection = () => {
      const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
      setConnectionCode(uniqueId);
      setIsPhoneModalOpen(true);
      setPhoneStatus('Waiting for connection...');

      if (peerRef.current) peerRef.current.destroy();

      const peer = new Peer(`wb-app-${uniqueId}`);
      
      peer.on('open', (id) => { console.log('Host ID:', id); });

      peer.on('connection', (conn) => {
          // --- CHANGE: Capture Connected Peer ID ---
          setPhoneStatus(`Connected to: ${conn.peer}`);
          message.success('Phone Connected!');
          setIsPhoneModalOpen(false); 

          // SEND INITIAL STATE
          setTimeout(() => {
              if(conn.open) {
                  const rect = containerRef.current.getBoundingClientRect();
                  const bgData = backgroundImage ? backgroundImage.src : null;
                  conn.send({
                      type: 'sync_board',
                      payload: { 
                          strokes: linesRef.current,
                          backgroundImage: bgData,
                          tool: toolRef.current, 
                          color: colorRef.current, 
                          size: sizeRef.current,
                          zoom: zoomRef.current, 
                          pan: panRef.current,
                          dimensions: { w: rect.width, h: rect.height } 
                      }
                  });
              }
          }, 500);

          conn.on('data', (data) => handleRemoteInput(data));
          conn.on('close', () => setPhoneStatus('Disconnected'));
      });

      peerRef.current = peer;
  };

  const handleRemoteInput = (data) => {
     if (data.type === 'command') {
         if (data.command === 'zoomIn') setZoom(z => Math.min(z + 0.1, 3));
         if (data.command === 'zoomOut') setZoom(z => Math.max(z - 0.1, 0.5));
         if (data.command === 'resetZoom') { setZoom(1); setPan({x:0, y:0}); }
         return;
     }
     
     if (data.type === 'pan') {
         if (!canvasRef.current) return;
         const rect = canvasRef.current.getBoundingClientRect();
         setPan(prev => ({ x: prev.x + (data.dx * rect.width), y: prev.y + (data.dy * rect.height) }));
         return;
     }

     if (data.tool) setTool(data.tool);
     if (data.color) setColor(data.color);
     if (data.size) setSize(data.size);

     const worldX = data.x;
     const worldY = data.y;
     const pressure = data.pressure || 0.5;

     if (data.type === 'start') {
         if (data.tool === 'eraser') {
             setLines(prev => prev.filter(line => !checkCollision(line.points, worldX, worldY)));
             setHasUnsavedChanges(true);
         } else {
             setCurrentPoints([[worldX, worldY, pressure]]);
         }
     } 
     else if (data.type === 'move') {
         if (data.tool === 'eraser') {
             setLines(prev => prev.filter(line => !checkCollision(line.points, worldX, worldY)));
             setHasUnsavedChanges(true);
         } else {
             setCurrentPoints(prev => prev ? [...prev, [worldX, worldY, pressure]] : [[worldX, worldY, pressure]]);
         }
     } 
     else if (data.type === 'end') {
         setCurrentPoints(prev => {
             if (!prev) return null;
             if (data.tool === 'laser') {
                 setLaserLines(existing => [...existing, { points: prev, opacity: 1 }]);
             } else {
                 setLines(existing => [...existing, { points: prev, color: data.color, size: data.size, isHighlighter: data.tool === 'highlighter' }]);
                 setHasUnsavedChanges(true);
             }
             return null;
         });
     }
  };

  useEffect(() => {
      return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  // -- 3. STANDARD LOGIC --
  useEffect(() => {
    const channelName = `whiteboard_sync_${notebookId}`;
    channelRef.current = new BroadcastChannel(channelName);
    if (isPresenter) {
        channelRef.current.onmessage = (event) => {
            const { type, payload } = event.data;
            if (type === 'SYNC_STATE') {
                setLines(payload.lines); setLaserLines(payload.laserLines); setCurrentPoints(payload.currentPoints);
                setTool(payload.tool); setColor(payload.color); setSize(payload.size);
                if (payload.zoom) setZoom(payload.zoom);
                if (payload.pan) setPan(payload.pan);
                if (payload.backgroundImageSrc) {
                      const img = new Image(); img.crossOrigin = "Anonymous";
                      img.src = payload.backgroundImageSrc; img.onload = () => setBackgroundImage(img);
                } else setBackgroundImage(null);
            }
        };
        setLoadingInitial(false);
    }
    return () => { if (channelRef.current) channelRef.current.close(); };
  }, [notebookId, isPresenter]);

  useEffect(() => {
    if (!isPresenter && channelRef.current) {
        channelRef.current.postMessage({
            type: 'SYNC_STATE',
            payload: { lines, laserLines, currentPoints, tool, color, size, zoom, pan, backgroundImageSrc: backgroundImage ? backgroundImage.src : null }
        });
    }
  }, [lines, laserLines, currentPoints, backgroundImage, isPresenter, tool, color, size, zoom, pan]);

  useEffect(() => {
    if (!isPresenter) fetchPages();
    const handleResize = () => {
       if(canvasRef.current && containerRef.current) {
           const dpr = window.devicePixelRatio || 1;
           const rect = containerRef.current.getBoundingClientRect();
           canvasRef.current.width = rect.width * dpr; canvasRef.current.height = rect.height * dpr;
           setLines(prev => [...prev]); 
       }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [notebookId]);

  useEffect(() => {
    if (isPresenter) return; 
    let animationTimer;
    if (laserLines.length > 0) {
        animationTimer = setInterval(() => {
            setLaserLines(prevLines => {
                const fadedLines = prevLines.map(line => ({ ...line, opacity: line.opacity - 0.02 }));
                const visibleLines = fadedLines.filter(line => line.opacity > 0);
                if (visibleLines.length === 0 && prevLines.length === 0) return prevLines;
                return visibleLines;
            });
        }, 20); 
    }
    return () => clearInterval(animationTimer);
  }, [laserLines.length, isPresenter]); 

  useEffect(() => {
    if (isPresenter) return; 
    const handleKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;
        switch(e.key.toLowerCase()) {
            case 'p': setTool('pen'); message.info("Pen"); break;
            case 'e': setTool('eraser'); message.info("Eraser"); break;
            case 'h': setTool('highlighter'); message.info("Highlighter"); break;
            case 'l': setTool('laser'); message.info("Laser Pointer"); break;
            case '=': setZoom(z => Math.min(z + 0.1, 3)); break;
            case '-': setZoom(z => Math.max(z - 0.1, 0.5)); break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresenter]);

  const fetchPages = async () => {
    try {
        const { data } = await supabase.from('pages').select('id, page_number').eq('notebook_id', notebookId).order('page_number', { ascending: true });
        if (data && data.length > 0) { setPages(data); await loadPageData(data[0].id); }
    } catch (error) { console.error(error); } finally { setLoadingInitial(false); }
  };

  const loadPageData = async (pageId) => {
    setSaving(true);
    const { data } = await supabase.from('pages').select('drawing_data, background_data_url').eq('id', pageId).single();
    if (data) {
        setLines(data.drawing_data || []);
        if (data.background_data_url) {
            const img = new Image(); img.crossOrigin = "Anonymous";
            img.src = data.background_data_url; img.onload = () => setBackgroundImage(img);
        } else setBackgroundImage(null);
    }
    setSaving(false); setHasUnsavedChanges(false); 
  };

  const saveCurrentPage = async (silent = false) => {
    if (pages.length === 0) return;
    setSaving(true);
    const currentPageId = pages[currentPageIndex].id;
    const { error } = await supabase.from('pages').update({ drawing_data: lines }).eq('id', currentPageId);
    setSaving(false);
    if (error) { message.error("Failed to save."); } else { if (!silent) message.success("Saved"); setHasUnsavedChanges(false); }
  };

  const handleImageUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
          const dataUrl = event.target.result;
          const img = new Image(); img.src = dataUrl; img.onload = () => setBackgroundImage(img);
          const currentPageId = pages[currentPageIndex].id;
          await supabase.from('pages').update({ background_data_url: dataUrl }).eq('id', currentPageId);
          message.success("Background Set!");
      };
      reader.readAsDataURL(file);
  };
  
  const handleAddPage = async () => {
    await saveCurrentPage(true);
    const newPageNumber = pages.length + 1;
    const { data } = await supabase.from('pages').insert([{ notebook_id: notebookId, page_number: newPageNumber, drawing_data: [] }]).select().single();
    if (data) {
        triggerPageTransition('next', () => {
            setPages([...pages, data]); setCurrentPageIndex(pages.length); 
            setLines([]); setBackgroundImage(null);
        });
    }
  };
  
  const handleNextPage = () => { if (currentPageIndex < pages.length - 1) triggerPageTransition('next', () => { setCurrentPageIndex(p=>p+1); loadPageData(pages[currentPageIndex+1].id); }) };
  const handlePrevPage = () => { if (currentPageIndex > 0) triggerPageTransition('prev', () => { setCurrentPageIndex(p=>p-1); loadPageData(pages[currentPageIndex-1].id); }) };
  
  const triggerPageTransition = async (direction, callback) => {
    await saveCurrentPage(true);
    setAnimClass(`${direction === 'next' ? '-translate-x-full' : 'translate-x-full'} transition-transform duration-300 ease-in-out`);
    setTimeout(() => { callback(); setAnimClass(`${direction === 'next' ? 'translate-x-full' : '-translate-x-full'} transition-none`); requestAnimationFrame(() => requestAnimationFrame(() => setAnimClass('translate-x-0 transition-transform duration-300 ease-out'))); }, 300);
  };
  
  const handleGoBack = () => {
     if (!hasUnsavedChanges) { navigate('/dashboard'); return; }
     Modal.confirm({ title: 'Unsaved Changes', content: 'Save before leaving?', okText: 'Save', onOk: async () => { await saveCurrentPage(true); navigate('/dashboard'); }, onCancel: (e) => { if (!e?.triggerCancel) navigate('/dashboard'); } });
  };

  const downloadAllPagesPDF = async () => {
    if (exporting) return;
    setExporting(true);
    message.loading({ content: "Exporting PDF...", key: 'pdfGen' });
    await saveCurrentPage(true); 
    try {
        const { data: allPages } = await supabase.from('pages').select('drawing_data, page_number, background_data_url').eq('notebook_id', notebookId).order('page_number', { ascending: true });
        const width = window.innerWidth; const height = window.innerHeight;
        const pdf = new jsPDF(width > height ? 'l' : 'p', 'px', [width, height]);
        const hiddenCanvas = document.createElement('canvas'); hiddenCanvas.width = width; hiddenCanvas.height = height;
        const ctx = hiddenCanvas.getContext('2d');
        for (let i = 0; i < allPages.length; i++) {
            const page = allPages[i];
            ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
            if (page.background_data_url) {
                const img = await new Promise((resolve) => { const image = new Image(); image.crossOrigin = "Anonymous"; image.onload = () => resolve(image); image.src = page.background_data_url; });
                ctx.drawImage(img, 0, 0, width, height);
            }
            (page.drawing_data || []).forEach(line => renderStroke(ctx, line.points, line.color, line.size, line.isHighlighter));
            if (i > 0) pdf.addPage([width, height]);
            pdf.addImage(hiddenCanvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, width, height);
        }
        pdf.save('MyNotebook.pdf'); message.success({ content: "Export Complete!", key: 'pdfGen' });
    } catch (err) { message.error({ content: "Export Failed", key: 'pdfGen' }); } finally { setExporting(false); }
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = '100%'; canvas.style.height = '100%';
    
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.scale(dpr, dpr); ctx.translate(pan.x, pan.y); ctx.scale(zoom, zoom);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (backgroundImage) ctx.drawImage(backgroundImage, 0, 0, width, height);

    lines.forEach(line => renderStroke(ctx, line.points, line.color, line.size, line.isHighlighter));
    if (currentPoints && tool !== 'laser') renderStroke(ctx, currentPoints, color, size, tool === 'highlighter');

    if (laserLines.length > 0 || (tool === 'laser' && currentPoints)) {
        ctx.save();
        ctx.shadowBlur = 15; ctx.shadowColor = '#ef4444'; 
        laserLines.forEach(line => renderStroke(ctx, line.points, '#ef4444', 6, false, line.opacity));
        if (tool === 'laser' && currentPoints) renderStroke(ctx, currentPoints, '#ef4444', 6, false, 1);
        ctx.restore();
    }
  }, [lines, currentPoints, color, size, tool, animClass, uiVisible, backgroundImage, laserLines, zoom, pan]);
  
  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom, pressure: e.pressure || 0.5 };
  };
  const handlePointerDown = (e) => {
    if (isPresenter) return; 
    e.target.setPointerCapture(e.pointerId);
    const { x, y, pressure } = getPoint(e);
    if (tool === 'eraser') { setLines(prev => prev.filter(line => !checkCollision(line.points, x, y))); setHasUnsavedChanges(true); } 
    else setCurrentPoints([[x, y, pressure]]);
  };
  const handlePointerMove = (e) => {
    if (isPresenter) return; 
    if (e.buttons !== 1) return;
    const { x, y } = getPoint(e);
    if (tool === 'eraser') { setLines(prev => prev.filter(line => !checkCollision(line.points, x, y))); setHasUnsavedChanges(true); } 
    else { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; const pts = evs.map(ev => { const { x, y, pressure } = getPoint(ev); return [x, y, pressure]; }); if (currentPoints) setCurrentPoints(prev => [...prev, ...pts]); }
  };
  const handlePointerUp = () => {
    if (isPresenter) return; 
    if (currentPoints) {
      if (tool === 'laser') setLaserLines(prev => [...prev, { points: currentPoints, opacity: 1 }]);
      else { setLines([...lines, { points: currentPoints, color, size, isHighlighter: tool === 'highlighter' }]); setHasUnsavedChanges(true); }
      setCurrentPoints(null);
    }
  };

  const pencilCursorStyle = { cursor: isPresenter ? 'none' : (tool === 'laser' ? 'crosshair' : `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>') 0 24, auto`) };

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', backgroundColor: '#e0e0e0', touchAction: 'none' }}>
      <Modal title="Connect Smartphone (Local Network)" open={isPhoneModalOpen} onCancel={() => setIsPhoneModalOpen(false)} footer={null} centered>
        <div className="text-center py-6">
            <p className="text-gray-500 mb-4">Enter this code on your phone:</p>
            <div className="text-5xl font-mono font-bold tracking-widest text-[#1a1a1a] mb-6">{connectionCode}</div>
        </div>
      </Modal>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
      {!isPresenter && (
      <>
        <div className={`fixed left-6 z-[60] transition-all duration-500 bottom-6 md:top-6 md:bottom-auto ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="h-16 w-16 flex items-center justify-center"><img src='/introos.svg' alt='logo'/></div>
        </div>
        <div className={`absolute top-6 left-0 right-0 z-50 flex justify-center transition-all duration-500 ${uiVisible ? 'translate-y-0 opacity-100' : '-translate-y-32 opacity-0 pointer-events-none'}`}>
            <div className="flex items-center gap-4 px-5 py-3 bg-white/80 backdrop-blur-xl shadow-2xl rounded-2xl border border-white/40 ring-1 ring-black/5 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-2 pr-4 border-r border-gray-300/50">
                    <button onClick={handleGoBack} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-xl"><ArrowLeft size={20} /></button>
                    <div className="flex bg-gray-100/50 rounded-lg p-1">
                        <button onClick={handlePrevPage} disabled={currentPageIndex === 0} className="p-1.5 rounded-md text-gray-500 disabled:opacity-30"><ChevronLeft size={18} /></button>
                        <span className="font-medium text-xs w-12 flex items-center justify-center text-gray-600">{currentPageIndex + 1} / {pages.length}</span>
                        <button onClick={handleNextPage} disabled={currentPageIndex === pages.length - 1} className="p-1.5 rounded-md text-gray-500 disabled:opacity-30"><ChevronRight size={18} /></button>
                    </div>
                    <button onClick={handleAddPage} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl"><PlusCircle size={20} /></button>
                </div>
                <div className="flex gap-1 pr-4 border-r border-gray-300/50">
                    <button onClick={() => setTool('pen')} className={`p-2.5 rounded-xl ${tool === 'pen' ? 'bg-black text-white' : 'text-gray-500'}`}><Pen size={20} /></button>
                    <button onClick={() => setTool('highlighter')} className={`p-2.5 rounded-xl ${tool === 'highlighter' ? 'bg-yellow-100 text-yellow-600' : 'text-gray-500'}`}><Highlighter size={20} /></button>
                    <button onClick={() => setTool('laser')} className={`p-2.5 rounded-xl ${tool === 'laser' ? 'bg-red-100 text-red-600' : 'text-gray-500'}`}><Zap size={20} /></button>
                    <button onClick={() => setTool('eraser')} className={`p-2.5 rounded-xl ${tool === 'eraser' ? 'bg-pink-100 text-pink-600' : 'text-gray-500'}`}><Eraser size={20} /></button>
                </div>
                <div className="flex items-center gap-4 pr-4 border-r border-gray-300/50">
                    <input type="range" min={2} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-20 h-1.5 bg-gray-200 rounded-full accent-black" />
                    <div className="flex gap-1.5">
                        {['#1e1e1e', '#ef4444', '#3b82f6', '#10b981'].map(c => <button key={c} className={`w-6 h-6 rounded-full border border-black/10 ${color === c ? 'scale-125 ring-2 ring-gray-300' : ''}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} />)}
                        <label className="relative w-6 h-6 rounded-full border border-black/10 cursor-pointer overflow-hidden bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500">
                            <input type="color" className="absolute inset-0 opacity-0" value={color} onChange={(e) => setColor(e.target.value)} />
                        </label>
                    </div>
                </div>
                <div className="flex items-center gap-1 pr-4 border-r border-gray-300/50">
                    <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-xl"><ZoomOut size={18}/></button>
                    <span className="text-xs font-medium w-8 text-center text-gray-600">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(z + 0.1, 3))} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-xl"><ZoomIn size={18}/></button>
                </div>
                <div className="flex gap-1">
                    {/* --- UPDATED SMARTPHONE BUTTON --- */}
                    <button 
                        onClick={startLocalConnection} 
                        title={phoneStatus.includes('Connected') ? phoneStatus : "Connect Phone (Tablet Mode)"} 
                        className={`p-2.5 rounded-xl transition-all ${phoneStatus.includes('Connected') ? 'text-green-600 bg-green-50 ring-1 ring-green-200' : 'text-gray-500 hover:text-purple-600 hover:bg-purple-50'}`}
                    >
                        <Smartphone size={20} />
                    </button>
                    <button onClick={() => window.open(`${window.location.origin}/notebook/${notebookId}?mode=presenter`,'Presenter','width=800,height=600')} title="Presenter View" className="p-2.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"><Monitor size={20} /></button>
                    <button onClick={() => saveCurrentPage(false)} className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl">{saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />}</button>
                    <button onClick={downloadAllPagesPDF} className="p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl"><Download size={20} /></button>
                </div>
            </div>
        </div>
        <button onClick={() => setUiVisible(!uiVisible)} className={`absolute top-6 right-6 z-[60] p-3 rounded-full shadow-xl transition-all ${uiVisible ? 'bg-white text-gray-400' : 'bg-black text-white rotate-180'}`}>{uiVisible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </>
      )}
      <div ref={containerRef} className={`absolute inset-0 bg-white shadow-2xl origin-center transform will-change-transform ${animClass}`}>
         <canvas ref={canvasRef} style={pencilCursorStyle} className="touch-none block bg-white w-full h-full"
           onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}/>
      </div>
    </div>
  );
};

export default Whiteboard;