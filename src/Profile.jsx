import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { message, Modal } from 'antd'; // Added Modal
import { User, Phone, FileText, ArrowLeft, Save, Loader2, Edit2, X, Crown, CreditCard } from 'lucide-react'; // Added Crown, CreditCard

const Profile = ({ session }) => {
  const navigate = useNavigate();
  
  if (!session) {
    return <div className="h-screen w-full flex items-center justify-center text-gray-500">Loading user session...</div>;
  }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // New state for Premium status
  const [isPremium, setIsPremium] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    bio: ''
  });

  // Fetch Profile Data
  useEffect(() => {
    const getProfile = async () => {
      try {
        setLoading(true);
        // Added is_premium to selection
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone, bio, is_premium')
          .eq('id', session.user.id)
          .single();

        if (error) throw error;
        if (data) {
            setFormData({
                full_name: data.full_name || '',
                phone: data.phone || '',
                bio: data.bio || ''
            });
            setIsPremium(data.is_premium);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };

    getProfile();
  }, [session]);

  // Handle Upgrade Button Click
  const handleUpgrade = () => {
    Modal.confirm({
        title: 'Upgrade to Premium?',
        icon: <Crown className="text-yellow-500" />,
        content: (
            <div className="pt-2">
                <p>Unlock unlimited notebooks and advanced features for just <strong>$5/month</strong>.</p>
                <ul className="list-disc list-inside mt-2 text-gray-500 text-sm">
                    <li>Unlimited Notebooks</li>
                    <li>Priority Support</li>
                    <li>Cloud Backup</li>
                </ul>
            </div>
        ),
        okText: 'Pay Now',
        cancelText: 'Maybe Later',
        centered: true,
        onOk: () => {
            // REPLACE THIS WITH YOUR ACTUAL PAYMENT LINK (Stripe/Razorpay)
            window.open('https://buy.stripe.com/test_placeholder', '_blank');
        }
    });
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
            full_name: formData.full_name,
            phone: formData.phone,
            bio: formData.bio,
        })
        .eq('id', session.user.id);

      if (error) throw error;
      message.success('Profile updated successfully!');
      setIsEditing(false);
    } catch (error) {
      message.error('Error updating profile!');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#F5F5F7]">
            <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] p-4 sm:p-12 font-sans text-slate-900 flex justify-center items-center">
      
      <div className="w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-500">
        
        {/* HEADER */}
        <div className="bg-gray-50/50 p-6 sm:p-8 border-b border-gray-100 flex flex-row items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-sm">
            <div className="flex items-center gap-3 sm:gap-4">
                <button 
                    onClick={() => navigate('/dashboard')} 
                    className="p-2 bg-white border border-gray-200 hover:bg-gray-100 rounded-full transition-all text-gray-500 hover:text-gray-900 shadow-sm active:scale-95"
                >
                    <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
                </button>
                <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-[#1a1a1a] leading-tight">
                        {isEditing ? 'Edit Profile' : 'My Profile'}
                    </h1>
                    <p className="text-xs text-gray-400 font-medium mt-0.5 hidden sm:block">
                        {isEditing ? 'Update your personal details' : 'Manage your account information'}
                    </p>
                </div>
            </div>

            {!isEditing && (
                <button 
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl hover:bg-black transition-all text-sm font-semibold shadow-md active:scale-95 whitespace-nowrap"
                >
                    <Edit2 size={16} /> <span className="hidden sm:inline">Edit</span>
                </button>
            )}
        </div>

        {/* CONTENT */}
        <div className="p-6 sm:p-10">
            
            {!isEditing ? (
                <div className="space-y-8">
                    {/* Avatar & Plan Badge */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 pb-6 sm:pb-8 border-b border-gray-100 text-center sm:text-left">
                        <div className="relative">
                            <div className="h-24 w-24 sm:h-20 sm:w-20 rounded-full bg-gradient-to-tr from-gray-100 to-gray-200 flex items-center justify-center text-3xl font-bold text-gray-400 shadow-inner ring-4 ring-white">
                                {formData.full_name ? formData.full_name.charAt(0).toUpperCase() : <User size={32} />}
                            </div>
                            {/* Premium Badge on Avatar */}
                            {isPremium && (
                                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-white p-1.5 rounded-full ring-4 ring-white shadow-sm" title="Premium Member">
                                    <Crown size={14} fill="currentColor" />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1">
                            <h2 className="text-2xl sm:text-xl font-bold text-gray-900">{formData.full_name || "Unnamed User"}</h2>
                            <p className="text-gray-400 text-sm font-medium">{session.user.email}</p>
                            
                            {/* SUBSCRIPTION STATUS BADGE */}
                            <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-full">
                                    {session.user.app_metadata?.provider || 'Email'} User
                                </span>
                                {isPremium ? (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-amber-200">
                                        <Crown size={12} fill="currentColor" /> Premium Plan
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider rounded-full">
                                        Free Plan
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                        <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 sm:bg-transparent sm:p-0 sm:border-0">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                                <Phone size={14} /> Phone Number
                            </label>
                            <p className="text-gray-800 font-medium text-lg truncate">
                                {formData.phone || <span className="text-gray-300 italic text-sm">Not set</span>}
                            </p>
                        </div>

                        <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 sm:bg-transparent sm:p-0 sm:border-0">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                                <FileText size={14} /> Bio
                            </label>
                            <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                                {formData.bio || <span className="text-gray-300 italic">No bio added yet.</span>}
                            </p>
                        </div>
                    </div>

                    {/* SUBSCRIPTION UPGRADE SECTION (Only visible if NOT Premium) */}
                    {!isPremium && (
                        <div className="mt-8 p-6 bg-gradient-to-br from-gray-900 to-black rounded-2xl shadow-lg text-white flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
                            {/* Decorative Background blob */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
                            
                            <div className="relative z-10 text-center sm:text-left">
                                <h3 className="text-lg font-bold flex items-center justify-center sm:justify-start gap-2">
                                    <Crown size={20} className="text-yellow-400" /> Upgrade to Premium
                                </h3>
                                <p className="text-gray-400 text-sm mt-1 max-w-sm">
                                    Create unlimited notebooks, get priority support, and unlock advanced drawing tools.
                                </p>
                            </div>
                            
                            <button 
                                onClick={handleUpgrade}
                                className="relative z-10 px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all shadow-md active:scale-95 flex items-center gap-2 whitespace-nowrap"
                            >
                                <CreditCard size={18} /> Pay Now
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                /* EDIT FORM (Unchanged) */
                <form onSubmit={updateProfile} className="space-y-5 sm:space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 ml-1">
                            <User size={14} /> Full Name
                        </label>
                        <input 
                            type="text" 
                            placeholder="e.g. John Doe"
                            value={formData.full_name}
                            onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                            className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all font-medium text-gray-800 placeholder:text-gray-400 text-sm sm:text-base"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 ml-1">
                            <Phone size={14} /> Phone Number
                        </label>
                        <input 
                            type="tel" 
                            placeholder="e.g. +91 98765 43210"
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all font-medium text-gray-800 placeholder:text-gray-400 text-sm sm:text-base"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 ml-1">
                            <FileText size={14} /> Bio / About
                        </label>
                        <textarea 
                            rows={4}
                            placeholder="Tell us a little about yourself..."
                            value={formData.bio}
                            onChange={(e) => setFormData({...formData, bio: e.target.value})}
                            className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all font-medium text-gray-800 placeholder:text-gray-400 resize-none text-sm sm:text-base"
                        />
                    </div>
                    <div className="pt-6 flex flex-col sm:flex-row justify-end gap-3 border-t border-gray-50 mt-4">
                        <button 
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="w-full sm:w-auto px-6 py-3.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
                        >
                            <X size={18} /> Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={saving}
                            className="w-full sm:w-auto px-8 py-3.5 bg-[#1a1a1a] hover:bg-black text-white rounded-xl font-bold shadow-lg shadow-gray-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 text-sm sm:text-base"
                        >
                            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            <span>Save Changes</span>
                        </button>
                    </div>
                </form>
            )}
        </div>
      </div>
    </div>
  );
};

export default Profile;