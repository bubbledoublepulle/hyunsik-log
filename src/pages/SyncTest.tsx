import { useState, useEffect } from 'react';
import { AdminPanel } from '../components/AdminPanel';
import VisitorView from '../components/VisitorView';

export default function SyncTest() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('siklog_admin_token');
    if (token) setIsAdmin(true);
  }, []);

  const login = async () => {
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const result = await res.json();
      if (result.success && result.token) {
        localStorage.setItem('siklog_admin_token', result.token);
        setIsAdmin(true); setError('');
      } else { setError('密码错误'); }
    } catch { setError('登录失败'); }
  };

  const logout = () => { localStorage.removeItem('siklog_admin_token'); setIsAdmin(false); };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8 p-4 bg-white rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">🌊 实时同步测试</h1>
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${isAdmin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {isAdmin ? '🛡️ 管理员模式' : '👁️ 访客模式'}
          </span>
          {isAdmin ? (
            <button onClick={logout} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition">退出管理</button>
          ) : (
            <div className="flex gap-2">
              <input type="password" placeholder="管理员密码" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={login} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">登录</button>
            </div>
          )}
        </div>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">{error}</div>}
      <AdminPanel tableName="music" isAdmin={isAdmin} onLogout={logout} />
      <VisitorView tableName="music" />
    </div>
  );
}
