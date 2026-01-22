import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, CreditCard, CheckCircle, User, UserCheck, Settings, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DEMO_ACCOUNTS = [
  {
    email: 'sarah.johnson@demo.spendguard.com',
    password: 'demo123',
    name: 'Sarah Johnson',
    role: 'Employee',
    department: 'Marketing',
    description: 'Submit and track purchase requests',
    icon: User,
    color: 'bg-blue-500',
  },
  {
    email: 'merrill.raman@demo.spendguard.com',
    password: 'demo123',
    name: 'Merrill Raman',
    role: 'Approver',
    department: 'Department Head',
    description: 'Review and approve requests',
    icon: UserCheck,
    color: 'bg-emerald-500',
  },
  {
    email: 'ryan.greene@demo.spendguard.com',
    password: 'demo123',
    name: 'Ryan Greene',
    role: 'Admin',
    department: 'Finance Director',
    description: 'Full system access & reports',
    icon: Settings,
    color: 'bg-amber-500',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setError('');
    setDemoLoading(demoEmail);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });
      if (error) throw error;
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setDemoLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/dashboard');
      } else {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        navigate('/profile-setup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900">
      <div className="min-h-screen flex">
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">SpendGuard</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            P-Card Pre-Approval
            <span className="block text-blue-300">Made Simple</span>
          </h1>

          <p className="text-lg text-blue-100/80 mb-10 max-w-md">
            Streamline your purchasing card approvals with digital signatures and complete audit trails.
          </p>

          <div className="space-y-4">
            <FeatureItem text="Submit requests before charging" />
            <FeatureItem text="Digital signature capture" />
            <FeatureItem text="Multi-level approval workflows" />
            <FeatureItem text="Complete audit trail" />
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
              <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">SpendGuard</span>
            </div>

            <div className="bg-white rounded-2xl shadow-2xl p-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CreditCard className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-slate-800">
                  {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
              </div>
              <p className="text-center text-slate-500 text-sm mb-6">
                {isLogin
                  ? 'Sign in to manage your P-Card requests'
                  : 'Register to start submitting requests'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-800 placeholder-slate-400"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-800 placeholder-slate-400"
                    placeholder="Enter your password"
                  />
                </div>

                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-800 placeholder-slate-400"
                      placeholder="Confirm your password"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
                >
                  {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {isLogin
                    ? "Don't have an account? Register"
                    : 'Already have an account? Sign In'}
                </button>
              </div>
            </div>

            <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h3 className="text-white font-semibold text-center mb-1">Try Demo Accounts</h3>
              <p className="text-blue-200/70 text-xs text-center mb-4">
                Explore the system with pre-configured test accounts
              </p>
              <div className="space-y-3">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    onClick={() => handleDemoLogin(account.email, account.password)}
                    disabled={demoLoading !== null}
                    className="w-full flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className={`w-10 h-10 ${account.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      {demoLoading === account.email ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <account.icon className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm">{account.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          account.role === 'Admin' ? 'bg-amber-500/20 text-amber-300' :
                          account.role === 'Approver' ? 'bg-emerald-500/20 text-emerald-300' :
                          'bg-blue-500/20 text-blue-300'
                        }`}>
                          {account.role}
                        </span>
                      </div>
                      <p className="text-blue-200/60 text-xs">{account.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-6 text-center text-blue-200/60 text-xs">
              Secure P-Card pre-approval and compliance management
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
        <CheckCircle className="w-4 h-4 text-blue-300" />
      </div>
      <span className="text-blue-100">{text}</span>
    </div>
  );
}
