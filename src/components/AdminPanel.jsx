import React, { useState } from 'react';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { supabase } from '../supabaseClient';

export function AdminPanel({ tableName = 'music', isAdmin = false, onLogout }) {
  const { data, loading, error, refresh, isSubscribed } = useRealtimeData(tableName);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  if (!isAdmin) return null;

  const save = async () => {
    if (!editingId) return;
    setSubmitting(true); setMsg('');
    try {
      const { error: e } = await supabase.from(tableName).update(editForm).eq('id', editingId);
      if (e) throw e;
      setMsg('✅ 保存成功！访客自动同步'); setEditingId(null);
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSubmitting(false); setTimeout(() => setMsg(''), 3000); }
  };

  const del = async (id) => {
    if (!confirm('确定删除？')) return;
    try {
      const { error: e } = await supabase.from(tableName).delete().eq('id', id);
      if (e) throw e;
      setMsg('✅ 已删除');
    } catch (e) { setMsg(`❌ ${e.message}`); }
    setTimeout(() => setMsg(''), 3000);
  };

  const add = async () => {
    setSubmitting(true);
    const defs = tableName === 'music' ? { title: '新歌', artist: '', url: '' } : { title: '新演出', date: new Date().toISOString(), venue: '' };
    try {
      const { error: e } = await supabase.from(tableName).insert([defs]);
      if (e) throw e;
      setMsg('✅ 已新增');
    } catch (e) { setMsg(`❌ ${e.message}`); }
    setSubmitting(false); setTimeout(() => setMsg(''), 3000);
  };

  const b = (bg, c = 'white') => ({ padding: '6px 12px', background: bg, color: c, border: 'none', borderRadius: '6px', cursor: 'pointer' });

  return (
    <div style={{ padding: 20, background: '#f8f9fa', borderRadius: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>🛡️ 管理员 — {tableName}</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: isSubscribed ? '#22c55e' : '#ef4444' }}>● 实时 {isSubscribed ? '已连接' : '连接中'}</span>
          <button onClick={refresh} disabled={loading} style={b('#3b82f6')}>{loading ? '🔄' : '🔄 强制刷新'}</button>
          {onLogout && <button onClick={onLogout} style={b('#6b7280')}>退出</button>}
        </div>
      </div>
      {msg && <div style={{ padding: 10, background: '#dcfce7', color: '#166534', borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, marginBottom: 12 }}>{error}</div>}
      <button onClick={add} disabled={submitting} style={{ ...b('#10b981'), marginBottom: 16 }}>+ 新增</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map(item => (
          <div key={item.id} style={{ padding: 16, background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            {editingId === item.id ? (
              <div>
                {Object.keys(editForm).map(k => k !== 'id' && k !== 'created_at' && (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: '#6b7280' }}>{k}</label>
                    <input value={editForm[k] || ''} onChange={e => setEditForm({ ...editForm, [k]: e.target.value })} style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4, width: '100%' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={save} disabled={submitting} style={b('#10b981')}>{submitting ? '保存中' : '💾 保存'}</button>
                  <button onClick={() => setEditingId(null)} style={{ ...b('#e5e7eb'), color: '#374151' }}>取消</button>
                </div>
              </div>
            ) : (
              <div>
                <pre style={{ fontSize: 12, overflow: 'auto', background: '#f3f4f6', padding: 10, borderRadius: 4, marginBottom: 10 }}>{JSON.stringify(item, null, 2)}</pre>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setEditingId(item.id); setEditForm({ ...item }); }} style={b('#f59e0b')}>编辑</button>
                  <button onClick={() => del(item.id)} style={b('#ef4444')}>删除</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
