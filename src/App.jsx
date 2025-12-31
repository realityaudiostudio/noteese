import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import Whiteboard from './Whiteboard';
import { message } from 'antd';
import { Loader2 } from 'lucide-react';

// --- NEW: SPLASH SCREEN COMPONENT ---
const SplashScreen = () => {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#F5F5F7] flex flex-col items-center justify-center transition-opacity duration-700">
      <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-700">
        
        {/* Logo Animation */}
        <div className="h-24 w-24 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-4 overflow-hidden border border-gray-100">
           <img src='/introos.svg' alt='Logo' className="w-16 h-16 object-contain animate-pulse" />
        </div>

        {/* Brand Text */}
        <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-[#1a1a1a] tracking-tight">Noteese</h1>
            <div className="flex items-center justify-center gap-2">
                <span className="h-px w-6 bg-gray-300"></span>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">By Btechified</p>
                <span className="h-px w-6 bg-gray-300"></span>
            </div>
        </div>

      </div>
      
      {/* Footer / Loader */}
      <div className="absolute bottom-10 flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-gray-400" size={20} />
          <p className="text-[10px] text-gray-400 font-medium">Loading your workspace...</p>
      </div>
    </div>
  );
};

// -- LOGIN COMPONENT --
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // 1. Try to Login
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      // 2. If Login fails, try to Sign Up (Auto-creation logic)
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      
      if (signUpError) {
        messageApi.error(signUpError.message);
      } else {
        messageApi.success("Account created! Check your email.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#F5F5F7]">
      {contextHolder}
      <form onSubmit={handleLogin} className="p-10 bg-white rounded-2xl shadow-xl w-96 border border-gray-100">
        
        {/* LOGO PLACEHOLDER (Login Screen Version) */}
        <div className="flex justify-center mb-8">
            <div className="h-16 w-16 flex items-center justify-center text-white font-bold text-xs select-none">
                <img src='/introos.svg' alt='logo'/>
            </div>
        </div>

        <h2 className="mb-2 text-2xl font-extrabold text-gray-900 text-center">Welcome Back</h2>
        <p className="mb-8 text-gray-500 text-center text-sm">Enter your details to access your notebooks.</p>
        
        <div className="space-y-4">
            <input 
                type="email" 
                placeholder="Email address" 
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-700 placeholder:text-gray-400" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
            />
            <input 
                type="password" 
                placeholder="Password" 
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-700 placeholder:text-gray-400" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
            />
        </div>

        <button 
            disabled={loading} 
            className="w-full mt-8 p-3.5 text-white bg-[#1a1a1a] hover:bg-black rounded-xl font-bold shadow-lg shadow-gray-200 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Continue'}
        </button>
      </form>
    </div>
  );
};

// -- MAIN APP SHELL --
const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      // 1. Start the minimum timer (2 seconds for splash screen)
      const minLoadTime = new Promise((resolve) => setTimeout(resolve, 2000));
      
      // 2. Start the Session Check
      const sessionCheck = supabase.auth.getSession();

      // 3. Wait for BOTH to finish
      // This ensures the splash screen shows for at least 2 seconds, even if auth is instant.
      const [_, { data }] = await Promise.all([minLoadTime, sessionCheck]);

      setSession(data.session);
      setLoading(false);
    };

    initApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- SHOW SPLASH SCREEN WHILE LOADING ---
  if (loading) {
      return <SplashScreen />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={session ? <Dashboard session={session} /> : <Navigate to="/login" />} />
        <Route path="/notebook/:notebookId" element={session ? <Whiteboard session={session} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  );
};

export default App;