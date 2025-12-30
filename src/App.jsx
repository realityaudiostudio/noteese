import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import Whiteboard from './Whiteboard';
import { message } from 'antd';
import { Loader2 } from 'lucide-react';

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
      return (
         <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F5F5F7] gap-4">
            <Loader2 className="animate-spin text-gray-800" size={40} />
            <p className="text-gray-500 font-medium animate-pulse">Initializing App...</p>
         </div>
      );
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