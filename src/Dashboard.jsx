import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { Book, Plus, LogOut, Trash2, FileUp, Loader2, Crown } from 'lucide-react'; // Added Crown icon
import { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";

// --- Ant Design Imports ---
import { Modal, message } from 'antd';

// --- PDF Worker ---
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// --- R2 CONFIGURATION ---
const R2_BUCKET_NAME = "varapage";
const R2_PUBLIC_DOMAIN = "https://files.btechified.in"; 

const Dashboard = ({ session }) => {
  const [notebooks, setNotebooks] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(''); 
  
  // -- NEW: State for Premium Status --
  const [isPremium, setIsPremium] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
        // 1. Fetch Notebooks
        const { data: notes, error: notesError } = await supabase
        .from('notebooks')
        .select('*')
        .order('created_at', { ascending: false });
        
        if (!notesError) setNotebooks(notes);

        // 2. Fetch Premium Status
        const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', session.user.id)
        .single();

        if (!profileError && profile) {
            setIsPremium(profile.is_premium);
        }

    } catch (error) {
        console.error("Error fetching data", error);
    } finally {
        setLoadingInitial(false);
    }
  };

  // --- HELPER: CHECK LIMIT ---
  const checkLimit = () => {
    if (isPremium) return true; // Premium users have no limit
    if (notebooks.length >= 3) {
        Modal.warning({
            title: 'Limit Reached (3/3)',
            content: (
                <div>
                    <p>You have reached the limit of 3 free notebooks.</p>
                    <p className="font-bold mt-2">Upgrade to Premium to create unlimited notebooks!</p>
                </div>
            ),
            okText: 'Upgrade Now',
            maskClosable: true,
            onOk: () => {
                // Logic to redirect to payment page goes here
                window.open('https://your-payment-link.com', '_blank');
            }
        });
        return false;
    }
    return true;
  };

  const createNotebook = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    // 1. Check Limit
    if (!checkLimit()) return;

    const { data: notebook } = await supabase.from('notebooks').insert([{ user_id: session.user.id, title: newTitle }]).select().single();
    await supabase.from('pages').insert([{ notebook_id: notebook.id, page_number: 1, drawing_data: [] }]);
    setNewTitle('');
    
    // Refresh list
    const { data } = await supabase.from('notebooks').select('*').order('created_at', { ascending: false });
    setNotebooks(data);
    
    messageApi.success("New notebook created");
  };

  const deleteNotebook = (notebookId) => {
    Modal.confirm({
      title: 'Delete this notebook?',
      content: 'This action will permanently delete the notebook and all its pages.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        try {
          const response = await fetch('/api/delete-notebook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              userId: session.user.id, 
              notebookId: notebookId 
            }),
          });

          if (!response.ok) throw new Error("Failed to delete files");

          await supabase.from('notebooks').delete().eq('id', notebookId);
          
          // Refresh list manually to avoid full reload
          const { data } = await supabase.from('notebooks').select('*').order('created_at', { ascending: false });
          setNotebooks(data);
          
          messageApi.success('Notebook deleted successfully');
        } catch (error) {
          console.error("Error deleting notebook:", error);
          messageApi.error("Failed to delete notebook fully.");
        }
      }
    });
  };

  const uploadToR2 = async (blob, fileName) => {
    try {
      const response = await fetch('/api/sign-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, fileType: 'image/jpeg' }),
      });
      if (!response.ok) throw new Error('Failed to get signed URL');
      const { url } = await response.json();
      await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      return `${R2_PUBLIC_DOMAIN}/${fileName}`;
    } catch (error) {
      console.error("Upload Error:", error);
      throw error;
    }
  };

  const handlePdfImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Check Limit BEFORE doing any heavy processing
    if (!checkLimit()) {
        e.target.value = null; // Reset file input
        return;
    }

    setIsImporting(true);
    setImportProgress('Initializing...');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      
      const { data: notebook } = await supabase
        .from('notebooks')
        .insert([{ user_id: session.user.id, title: file.name.replace('.pdf', '') }])
        .select()
        .single();

      const totalPages = pdf.numPages;
      const pagesPayload = [];

      for (let i = 1; i <= totalPages; i++) {
        setImportProgress(`Processing page ${i} of ${totalPages}...`);
        
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        const fileBuffer = await blob.arrayBuffer();
        const bodyPayload = new Uint8Array(fileBuffer);

        const fileName = `${session.user.id}/${notebook.id}/page-${i}.jpg`;
        const publicUrl = await uploadToR2(bodyPayload, fileName);

        pagesPayload.push({
          notebook_id: notebook.id,
          page_number: i,
          drawing_data: [],
          background_data_url: publicUrl 
        });
      }

      setImportProgress('Saving to database...');
      await supabase.from('pages').insert(pagesPayload);
      
      // Refresh list
      const { data } = await supabase.from('notebooks').select('*').order('created_at', { ascending: false });
      setNotebooks(data);
      
      messageApi.success('PDF Imported successfully!');

    } catch (err) {
      messageApi.error("Error importing PDF: " + err.message);
      console.error(err);
    } finally {
      setIsImporting(false);
      setImportProgress('');
      if(fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] p-6 sm:p-10 font-sans text-slate-900">
      {contextHolder}

      {/* --- INITIAL LOADING SCREEN --- */}
      {loadingInitial && (
         <div className="fixed inset-0 z-[100] bg-[#F5F5F7] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
               <Loader2 className="animate-spin text-gray-600" size={48} />
               <p className="text-gray-500 font-medium animate-pulse tracking-wide">Loading Library...</p>
            </div>
         </div>
      )}

      <div className="max-w-[1200px] mx-auto">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
          <div>
            {/* --- LOGO --- */}
            <div className="h-16 w-16 flex items-center justify-center text-white font-bold text-xs select-none mb-2">
                <img src='/introos.svg' alt='logo' className="w-full h-full object-contain"/>
            </div>

            <div className="flex items-center gap-3">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1a1a1a] tracking-tight mb-1">Library</h1>
                {isPremium && (
                    <span className="bg-gradient-to-r from-yellow-400 to-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <Crown size={10} fill="currentColor" /> Premium
                    </span>
                )}
            </div>
            
            {/* LIMIT INDICATOR (Only for Free users) */}
            {!isPremium && (
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-gray-500 font-medium">Free Plan: {notebooks.length} / 3 Notebooks used</p>
                    {notebooks.length >= 3 && <span className="text-red-500 text-xs font-bold bg-red-50 px-2 py-0.5 rounded-md">Limit Reached</span>}
                </div>
            )}
          </div>
          
          <button 
            onClick={() => supabase.auth.signOut()} 
            className="bg-[#1a1a1a] hover:bg-black text-white px-5 py-2.5 rounded-lg transition-all flex items-center gap-2 font-medium text-sm shadow-sm active:scale-95 flex-shrink-0"
          >
            <LogOut size={18} className="flex-shrink-0" /> <span>Sign Out</span>
          </button>
        </div>

        {/* CONTROLS SECTION */}
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          
          {/* Create New Group */}
          <form onSubmit={createNotebook} className="flex-1 bg-white p-2 rounded-2xl shadow-sm border border-gray-200/60 flex items-center gap-2">
            <input
              type="text"
              placeholder="Untitled Notebook"
              className="flex-1 px-4 py-2 bg-transparent outline-none text-gray-800 placeholder:text-gray-400 font-medium min-w-0"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button 
              type="submit" 
              // Disable visually if limit reached (optional, since logic blocks it anyway)
              className={`px-6 py-2.5 rounded-xl transition-colors font-semibold flex items-center gap-2 text-sm shadow-sm whitespace-nowrap flex-shrink-0 ${!isPremium && notebooks.length >= 3 ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              <Plus size={20} className="flex-shrink-0" /> New
            </button>
          </form>

          {/* Import Button */}
          <div className="md:w-auto w-full">
            <input type="file" accept="application/pdf" ref={fileInputRef} className="hidden" onChange={handlePdfImport} />
            <button 
              onClick={() => fileInputRef.current.click()}
              disabled={isImporting}
              className={`w-full h-full px-6 py-3 border rounded-2xl flex items-center justify-center gap-2.5 transition-all font-semibold text-sm shadow-sm whitespace-nowrap ${!isPremium && notebooks.length >= 3 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
            >
              {isImporting ? (
                <Loader2 className="animate-spin text-blue-600 flex-shrink-0" size={20}/>
              ) : (
                <FileUp size={20} className="flex-shrink-0" />
              )}
              <span>{isImporting ? importProgress : "Import PDF"}</span>
            </button>
          </div>
        </div>

        {/* GRID SECTION */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {notebooks.map((book) => (
            <div 
              key={book.id} 
              onClick={() => navigate(`/notebook/${book.id}`)}
              className="group relative bg-white rounded-2xl p-4 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer border border-gray-100 flex flex-col aspect-[3/4]"
            >
              {/* Icon Container */}
              <div className="flex-1 bg-blue-50/50 rounded-xl mb-4 flex items-center justify-center group-hover:bg-blue-50 transition-colors relative overflow-hidden">
                <Book size={48} className="text-blue-300 group-hover:text-blue-500 transition-colors duration-300 flex-shrink-0" />
              </div>
              
              {/* Footer Info */}
              <div className="flex justify-between items-end">
                <div className="flex-1 min-w-0 mr-2">
                  <h3 className="font-bold text-gray-900 truncate text-sm leading-tight mb-1">{book.title || "Untitled"}</h3>
                  <p className="text-[11px] text-gray-400 font-medium">{new Date(book.created_at).toLocaleDateString()}</p>
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteNotebook(book.id); }} 
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                  title="Delete Notebook"
                >
                  <Trash2 size={18} className="flex-shrink-0" />
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;