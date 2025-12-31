import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStroke } from 'perfect-freehand';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import { message, Modal } from 'antd';
import { Pen, Eraser, Highlighter, Save, ArrowLeft, Download, ChevronLeft, ChevronRight, PlusCircle, Loader2, Eye, EyeOff, Zap } from 'lucide-react';

// -- SHARED HELPERS --

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
    
    // -- UPDATED: Handle Opacity for Fading --
    ctx.globalAlpha = opacity; 
    
    if (isHighlighter) { 
        ctx.globalAlpha = 0.3 * opacity; 
        ctx.globalCompositeOperation = 'multiply'; 
    } else { 
        ctx.globalCompositeOperation = 'source-over'; 
    }
    
    const path = new Path2D(pathData);
    ctx.fill(path);
    
    // Reset context
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
};

const Whiteboard = ({ session }) => {
  const { notebookId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // -- STATE --
  const [lines, setLines] = useState([]);
  const [currentPoints, setCurrentPoints] = useState(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1e1e1e');
  const [size, setSize] = useState(6);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // -- LASER STATE --
  const [laserLines, setLaserLines] = useState([]);

  // -- UNSAVED CHANGES STATE --
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  
  // -- NOTEBOOK STATE --
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [animClass, setAnimClass] = useState('');
  const [backgroundImage, setBackgroundImage] = useState(null);

  const [uiVisible, setUiVisible] = useState(true);

  // -- INITIAL LOAD & RESIZE --
  useEffect(() => {
    fetchPages();
    
    const handleResize = () => {
       if(canvasRef.current && containerRef.current) {
           const dpr = window.devicePixelRatio || 1;
           const rect = containerRef.current.getBoundingClientRect();
           canvasRef.current.width = rect.width * dpr;
           canvasRef.current.height = rect.height * dpr;
           setLines(prev => [...prev]); 
       }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [notebookId]);

  // -- UPDATED: LASER FADE ANIMATION LOOP --
  useEffect(() => {
    let animationTimer;
    
    // Only run the loop if we have laser lines to fade
    if (laserLines.length > 0) {
        animationTimer = setInterval(() => {
            setLaserLines(prevLines => {
                // Reduce opacity of every line by 0.02 (approx 50 frames to fade completely)
                const fadedLines = prevLines.map(line => ({
                    ...line,
                    opacity: line.opacity - 0.02
                }));

                // Remove invisible lines
                const visibleLines = fadedLines.filter(line => line.opacity > 0);
                
                // Stop the loop if everything is gone
                if (visibleLines.length === 0 && prevLines.length === 0) return prevLines;
                
                return visibleLines;
            });
        }, 20); // Run every 20ms for smooth 50fps animation
    }

    return () => clearInterval(animationTimer);
  }, [laserLines.length]); // Dependency on length ensures it starts when a new line is added

  // -- KEYBOARD SHORTCUTS --
  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;
        switch(e.key.toLowerCase()) {
            case 'p': setTool('pen'); message.info("Pen"); break;
            case 'e': setTool('eraser'); message.info("Eraser"); break;
            case 'h': setTool('highlighter'); message.info("Highlighter"); break;
            case 'l': setTool('laser'); message.info("Laser Pointer"); break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchPages = async () => {
    try {
        const { data } = await supabase
          .from('pages')
          .select('id, page_number')
          .eq('notebook_id', notebookId)
          .order('page_number', { ascending: true });

        if (data && data.length > 0) {
          setPages(data);
          await loadPageData(data[0].id);
        }
    } catch (error) {
        console.error("Error fetching pages:", error);
    } finally {
        setLoadingInitial(false);
    }
  };

  const loadPageData = async (pageId) => {
    setSaving(true);
    const { data } = await supabase.from('pages').select('drawing_data, background_data_url').eq('id', pageId).single();
    
    if (data) {
        setLines(data.drawing_data || []);
        if (data.background_data_url) {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = data.background_data_url;
            img.onload = () => setBackgroundImage(img);
        } else {
            setBackgroundImage(null);
        }
    }
    setSaving(false);
    setHasUnsavedChanges(false); 
  };

  const saveCurrentPage = async (silent = false) => {
    if (pages.length === 0) return;
    setSaving(true);
    const currentPageId = pages[currentPageIndex].id;
    const { error } = await supabase.from('pages').update({ drawing_data: lines }).eq('id', currentPageId);
    setSaving(false);
    if (error) {
        message.error("Failed to save.");
    } else {
        if (!silent) message.success("Saved");
        setHasUnsavedChanges(false);
    }
  };

  const handleGoBack = () => {
    if (!hasUnsavedChanges) {
        navigate('/dashboard');
        return;
    }

    Modal.confirm({
        title: 'Unsaved Changes',
        content: 'You have unsaved changes. Do you want to save them before leaving?',
        okText: 'Save & Leave',
        cancelText: 'Leave without saving',
        centered: true,
        closable: true,
        onOk: async () => {
            await saveCurrentPage(true);
            navigate('/dashboard');
        },
        onCancel: (e) => {
            if (!e?.triggerCancel) {
                navigate('/dashboard'); 
            }
        }
    });
  };

  const triggerPageTransition = async (direction, callback) => {
    await saveCurrentPage(true);
    
    const exitClass = direction === 'next' ? '-translate-x-full' : 'translate-x-full';
    setAnimClass(`${exitClass} transition-transform duration-300 ease-in-out`);

    setTimeout(() => {
        callback();
        const entryStartClass = direction === 'next' ? 'translate-x-full' : '-translate-x-full';
        setAnimClass(`${entryStartClass} transition-none`);

        requestAnimationFrame(() => {
             requestAnimationFrame(() => {
                setAnimClass('translate-x-0 transition-transform duration-300 ease-out');
             });
        });
    }, 300);
  };

  const handleNextPage = () => {
    if (currentPageIndex < pages.length - 1) {
        triggerPageTransition('next', () => {
            setCurrentPageIndex(prev => prev + 1);
            loadPageData(pages[currentPageIndex + 1].id);
        });
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
        triggerPageTransition('prev', () => {
            setCurrentPageIndex(prev => prev - 1);
            loadPageData(pages[currentPageIndex - 1].id);
        });
    }
  };

  const handleAddPage = async () => {
    await saveCurrentPage(true);
    const newPageNumber = pages.length + 1;
    const { data } = await supabase.from('pages').insert([{ notebook_id: notebookId, page_number: newPageNumber, drawing_data: [] }]).select().single();
    if (data) {
        triggerPageTransition('next', () => {
            setPages([...pages, data]);
            setCurrentPageIndex(pages.length); 
            setLines([]); 
            setBackgroundImage(null);
        });
    }
  };

  const downloadAllPagesPDF = async () => {
    if (exporting) return;
    setExporting(true);
    message.loading({ content: "Exporting PDF...", key: 'pdfGen' });
    await saveCurrentPage(true); 

    try {
        const { data: allPages } = await supabase
            .from('pages')
            .select('drawing_data, page_number, background_data_url')
            .eq('notebook_id', notebookId)
            .order('page_number', { ascending: true });

        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const pdf = new jsPDF(width > height ? 'l' : 'p', 'px', [width, height]);
        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.width = width;
        hiddenCanvas.height = height;
        const ctx = hiddenCanvas.getContext('2d');

        for (let i = 0; i < allPages.length; i++) {
            const page = allPages[i];
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff'; 
            ctx.fillRect(0, 0, width, height);
            
            if (page.background_data_url) {
                const img = await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.crossOrigin = "Anonymous"; 
                    image.onload = () => resolve(image);
                    image.onerror = reject;
                    image.src = page.background_data_url;
                });
                ctx.drawImage(img, 0, 0, width, height);
            }

            (page.drawing_data || []).forEach(line => renderStroke(ctx, line.points, line.color, line.size, line.isHighlighter));
            
            if (i > 0) pdf.addPage([width, height]);
            pdf.addImage(hiddenCanvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, width, height);
        }
        pdf.save('MyNotebook.pdf');
        message.success({ content: "Export Complete!", key: 'pdfGen' });
    } catch (err) {
        message.error({ content: "Export Failed: " + err.message, key: 'pdfGen' });
        console.error(err);
    } finally {
        setExporting(false);
    }
  };

  // -- RENDER LOOP --
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.clearRect(0, 0, width, height);

    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, width, height);
    }

    // 1. Render Normal Lines
    lines.forEach(line => renderStroke(ctx, line.points, line.color, line.size, line.isHighlighter));
    
    // 2. Render Normal Active Stroke
    if (currentPoints && tool !== 'laser') {
        renderStroke(ctx, currentPoints, color, size, tool === 'highlighter');
    }

    // 3. Render Laser Lines (With Glow & Opacity)
    if (laserLines.length > 0 || (tool === 'laser' && currentPoints)) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ef4444'; // Red glow
        
        // Render fading laser trails
        // Note: passing line.opacity to the render function
        laserLines.forEach(line => renderStroke(ctx, line.points, '#ef4444', 6, false, line.opacity));
        
        // Render active laser stroke (full opacity)
        if (tool === 'laser' && currentPoints) {
            renderStroke(ctx, currentPoints, '#ef4444', 6, false, 1);
        }
        ctx.restore();
    }

  }, [lines, currentPoints, color, size, tool, animClass, uiVisible, backgroundImage, laserLines]);

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
  };

  const handlePointerDown = (e) => {
    e.target.setPointerCapture(e.pointerId);
    const { x, y, pressure } = getPoint(e);
    if (tool === 'eraser') {
        setLines(prev => prev.filter(line => !checkCollision(line.points, x, y)));
        setHasUnsavedChanges(true); 
    }
    else setCurrentPoints([[x, y, pressure]]);
  };

  const handlePointerMove = (e) => {
    if (e.buttons !== 1) return;
    const { x, y } = getPoint(e);
    if (tool === 'eraser') {
        setLines(prev => prev.filter(line => !checkCollision(line.points, x, y)));
        setHasUnsavedChanges(true); 
    }
    else {
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        const newPoints = events.map(ev => { const { x, y, pressure } = getPoint(ev); return [x, y, pressure]; });
        if (currentPoints) setCurrentPoints(prev => [...prev, ...newPoints]);
    }
  };

  const handlePointerUp = () => {
    if (currentPoints) {
      if (tool === 'laser') {
         // --- LASER LOGIC: Add with starting opacity 1 ---
         setLaserLines(prev => [...prev, { points: currentPoints, opacity: 1 }]);
      } else {
         setLines([...lines, { points: currentPoints, color, size, isHighlighter: tool === 'highlighter' }]);
         setHasUnsavedChanges(true);
      }
      setCurrentPoints(null);
    }
  };

  const pencilCursorStyle = {
    cursor: tool === 'laser' 
      ? 'crosshair' 
      : `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>') 0 24, auto`
  };

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', backgroundColor: '#e0e0e0', touchAction: 'none' }}>
      
      {loadingInitial && (
         <div className="fixed inset-0 z-[100] bg-[#e0e0e0] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
               <Loader2 className="animate-spin text-gray-600" size={48} />
               <p className="text-gray-500 font-medium animate-pulse tracking-wide">Loading Canvas...</p>
            </div>
         </div>
      )}

      <div 
        className={`fixed top-6 left-6 z-[60] transition-all duration-500 ${uiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}
      >
        <div className="h-16 w-16 flex items-center justify-center text-white font-bold text-xs select-none">
                <img src='/introos.svg' alt='logo'/>
        </div>
      </div>

      {/* 1. FLOATING TOOLBAR */}
      <div className={`absolute top-6 left-0 right-0 z-50 flex justify-center transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${uiVisible ? 'translate-y-0 opacity-100' : '-translate-y-32 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-4 px-5 py-3 bg-white/80 backdrop-blur-xl shadow-2xl rounded-2xl border border-white/40 ring-1 ring-black/5 overflow-x-auto no-scrollbar">
            
            {/* Navigation */}
            <div className="flex items-center gap-2 pr-4 border-r border-gray-300/50">
                 <button onClick={handleGoBack} className="p-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition"><ArrowLeft size={20} /></button>
                 <div className="flex bg-gray-100/50 rounded-lg p-1">
                     <button onClick={handlePrevPage} disabled={currentPageIndex === 0} className="p-1.5 rounded-md text-gray-500 hover:bg-white hover:shadow-sm disabled:opacity-30 transition"><ChevronLeft size={18} /></button>
                     <span className="font-medium text-xs w-12 flex items-center justify-center text-gray-600 select-none">{currentPageIndex + 1} / {pages.length}</span>
                     <button onClick={handleNextPage} disabled={currentPageIndex === pages.length - 1} className="p-1.5 rounded-md text-gray-500 hover:bg-white hover:shadow-sm disabled:opacity-30 transition"><ChevronRight size={18} /></button>
                 </div>
                 <button onClick={handleAddPage} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"><PlusCircle size={20} /></button>
            </div>

            {/* Tools */}
            <div className="flex gap-1 pr-4 border-r border-gray-300/50">
                <button title="Pencil (P)" className={`p-2.5 rounded-xl transition-all ${tool === 'pen' ? 'bg-black text-white shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setTool('pen')}><Pen size={20} /></button>
                <button title="Highlighter (H)" className={`p-2.5 rounded-xl transition-all ${tool === 'highlighter' ? 'bg-yellow-100 text-yellow-600 shadow-sm scale-105 ring-1 ring-yellow-200' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setTool('highlighter')}><Highlighter size={20} /></button>
                
                {/* --- LASER BUTTON --- */}
                <button title="Laser Pointer (L)" className={`p-2.5 rounded-xl transition-all ${tool === 'laser' ? 'bg-red-100 text-red-600 shadow-sm scale-105 ring-1 ring-red-200' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setTool('laser')}><Zap size={20} /></button>
                
                <button title="Eraser (E)" className={`p-2.5 rounded-xl transition-all ${tool === 'eraser' ? 'bg-pink-100 text-pink-600 shadow-sm scale-105 ring-1 ring-pink-200' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setTool('eraser')}><Eraser size={20} /></button>
            </div>

            {/* Properties */}
            <div className="flex items-center gap-4 pr-4 border-r border-gray-300/50">
                 <input type="range" min={2} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-20 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-black" />
                 <div className="flex gap-1.5">
                    {['#1e1e1e', '#ef4444', '#3b82f6', '#10b981'].map(c => (
                        <button key={c} className={`w-6 h-6 rounded-full border border-black/10 transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-300' : 'hover:scale-110'}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} />
                    ))}
                    <label className="relative w-6 h-6 rounded-full border border-black/10 cursor-pointer overflow-hidden bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 hover:scale-110 transition shadow-inner">
                        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
                    </label>
                 </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1">
                <button onClick={() => saveCurrentPage(false)} className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition">{saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />}</button>
                <button onClick={downloadAllPagesPDF} className="p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition" disabled={exporting}>{exporting ? <Loader2 className="animate-spin" size={20}/> : <Download size={20} />}</button>
            </div>
        </div>
      </div>

      {/* 2. FOCUS MODE TOGGLE */}
      <button 
        onClick={() => setUiVisible(!uiVisible)} 
        className={`absolute top-6 right-6 z-[60] p-3 rounded-full shadow-xl transition-all duration-300 ${uiVisible ? 'bg-white text-gray-400 hover:text-gray-800' : 'bg-black text-white hover:bg-gray-800 rotate-180'}`}
      >
        {uiVisible ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>

      {/* 3. CANVAS CONTAINER (ABSOLUTE FULL SCREEN) */}
      <div 
        ref={containerRef}
        className={`absolute inset-0 bg-white shadow-2xl origin-center transform will-change-transform ${animClass}`}
      >
         <canvas
           ref={canvasRef}
           style={pencilCursorStyle}
           className="touch-none block bg-white w-full h-full"
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
         />
      </div>
    </div>
  );
};

export default Whiteboard;