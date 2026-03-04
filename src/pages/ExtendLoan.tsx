import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CalendarCheck, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

export default function ExtendLoan() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  useEffect(() => {
    const extend = async () => {
      try {
        const res = await fetch(`/api/extend/${token}`);
        const data = await res.json();
        
        if (res.ok) {
          setStatus('success');
          setMessage(data.message);
          setNewDueDate(new Date(data.new_due_date).toLocaleDateString('en-AU', { 
            day: 'numeric', 
            month: 'numeric', 
            year: 'numeric' 
          }));
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to extend loan.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('A network error occurred.');
      }
    };

    if (token) {
      extend();
    }
  }, [token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center"
      >
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-[#1a202c] animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">Extending your loan...</h2>
            <p className="text-slate-500">Please wait while we update our records.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CalendarCheck className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Loan Extended!</h2>
              <p className="text-slate-600">{message}</p>
            </div>
            
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">New Due Date</p>
              <p className="text-lg font-bold text-emerald-900">{newDueDate}</p>
            </div>

            <Link 
              to="/"
              className="inline-flex items-center gap-2 text-[#1a202c] font-bold hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Catalogue
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Extension Failed</h2>
              <p className="text-slate-600">{message}</p>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-500">
              If you believe this is an error, please contact the library administrator.
            </div>

            <Link 
              to="/"
              className="inline-flex items-center gap-2 text-[#1a202c] font-bold hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Catalogue
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
