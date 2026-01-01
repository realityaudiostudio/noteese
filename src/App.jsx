import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import Whiteboard from './Whiteboard';
import { message } from 'antd';
import { Loader2 } from 'lucide-react';
import Profile from './Profile';
import Controller from './Controller';

// --- SPLASH SCREEN COMPONENT (Unchanged) ---
const SplashScreen = () => {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#F5F5F7] flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="h-24 w-24 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-4 overflow-hidden border border-gray-100">
           <img src='/introos.svg' alt='Logo' className="w-16 h-16 object-contain" />
        </div>
        <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-[#1a1a1a] tracking-tight">Noteese</h1>
            <div className="flex items-center justify-center gap-2">
                <span className="h-px w-6 bg-gray-300"></span>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">By Btechified</p>
                <span className="h-px w-6 bg-gray-300"></span>
            </div>
        </div>
      </div>
      <div className="absolute bottom-10 flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-gray-400" size={20} />
          <p className="text-[10px] text-gray-400 font-medium">Loading your workspace...</p>
      </div>
    </div>
  );
};

// -- LOGIN COMPONENT (With Native CSS Fade Animation) --
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
    // --- ADDED: style prop for native animation ---
    <div 
      className="flex h-screen w-full bg-white overflow-hidden"
      style={{ animation: 'fadeIn 1.2s ease-out forwards' }}
    >
      {/* --- ADDED: Keyframes definition --- */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
          }
        `}
      </style>

      {contextHolder}
      
      {/* --- LEFT SIDE: FORM --- */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-12 lg:px-24 relative z-10">
        
        {/* Top Left Brand */}
        <div className="absolute top-10 left-10 flex items-center gap-2">
             <img src='/introos.svg' alt='logo' className="h-6 w-6 object-contain"/>
             <span className="font-bold text-lg tracking-tight text-gray-900">Noteese</span>
        </div>

        <div className="max-w-sm w-full mx-auto">
            
            {/* Centered Logo Icon */}
            <div className="flex justify-center mb-8">
                <img src='/introos.svg' alt='logo' className="h-10 w-10 object-contain"/>
            </div>

            <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
                <p className="text-gray-400 text-sm mt-2">Please enter your details to continue.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-4">
                    <input 
                        type="email" 
                        placeholder="Enter email or username" 
                        className="w-full px-6 py-4 bg-transparent border border-gray-200 rounded-full outline-none focus:border-black focus:ring-1 focus:ring-black transition-all text-gray-800 placeholder:text-gray-400 font-medium" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required
                    />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        className="w-full px-6 py-4 bg-transparent border border-gray-200 rounded-full outline-none focus:border-black focus:ring-1 focus:ring-black transition-all text-gray-800 placeholder:text-gray-400 font-medium" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required
                    />
                </div>

                <button 
                    disabled={loading} 
                    className="w-full py-4 mt-6 text-white bg-[#0f0f0f] hover:bg-black rounded-full font-bold text-sm tracking-wide shadow-xl shadow-gray-200/50 hover:shadow-2xl hover:scale-[1.01] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : 'Continue'}
                </button>
                
                {/* Subtle disclaimer */}
                <p className="text-center text-[10px] text-gray-300 mt-8">
                   Protected by Supabase Secure Auth
                </p>
            </form>
        </div>
      </div>

      {/* --- RIGHT SIDE: VISUAL --- */}
      <div className="hidden lg:block w-1/2 p-4 bg-[#bbbdb4]"> 
         <div className="w-full h-full rounded-3xl overflow-hidden relative shadow-inner">
             <img 
                src="https://images.unsplash.com/photo-1726594703316-fc9f35c7d80f?q=80&w=2564&auto=format&fit=crop" 
                alt="Abstract Login Visual" 
                className="w-full h-full object-cover"
             />
             <div className="absolute inset-0 bg-black/5 pointer-events-none"></div>
         </div>
      </div>
    </div>
  );
};

// -- MAIN APP SHELL (Unchanged) --
const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      // Keep splash screen for at least 2 seconds
      const minLoadTime = new Promise((resolve) => setTimeout(resolve, 2000));
      const sessionCheck = supabase.auth.getSession();
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
<Route 
  path="/profile" 
  element={session ? <Profile session={session} /> : <Navigate to="/login" />} 
/>
<Route path="/controller/:code" element={<Controller />} />
      </Routes>
    </Router>
  );
};

export default App;