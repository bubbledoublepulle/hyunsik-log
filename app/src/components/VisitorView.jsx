import React, { useState, useEffect, useRef } from 'react';
import { useRealtimeData } from '../hooks/useRealtimeData';

export function VisitorView({ tableName = 'music' }) {
  const { data, loading, error, isSubscribed } = useRealtimeData(tableName);
  const [flash, setFlash] = useState(false);
  const prevLen = useRef(data.length);

  useEffect(() => {
    if (data.length !== prevLen.current || JSON.stringify(data) !== JSON.stringify(prevLen.current === data.length ? data : null)) {
      if (prevLen.current !== 0) setFlash(true);
      prevLen.current = data.length;
      const t = setTimeout(() => setFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>⏳ 加载中...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>⚠️ {error}</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📋 {tableName}</h2>
        <span style={{ fontSize: '14px', color: isSubscribed ? '#22c55e' : '#f59e0b' }}>
          {isSubscribed ? '🟢 实时同步中' : '🟡 连接中...'}
        </span>
      </div>

      {flash && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', background: '#22c55e', color: 'white',
          padding: '10px 20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000, animation: 'fadeIn 0.3s ease',
        }}>
          ✨ 内容已更新
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>暂无数据</div>
        ) : (
          data.map((item) => (
            <div key={item.id} style={{
              padding: '20px', background: 'white', borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'all 0.3s',
              border: flash ? '2px solid #22c55e' : '2px solid transparent',
            }}>
              {item.title && <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>{item.title}</h3>}
              {item.artist && <p style={{ color: '#4b5563', marginBottom: '4px' }}>🎤 {item.artist}</p>}
              {item.platform && <p style={{ color: '#3b82f6', fontWeight: 500, marginBottom: '4px' }}>📱 {item.platform}</p>}
              {item.content && <p style={{ color: '#374151', lineHeight: 1.6, marginBottom: '8px' }}>{item.content}</p>}
              {item.venue && <p style={{ color: '#6b7280', marginBottom: '4px' }}>📍 {item.venue}</p>}
              {item.date && <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>
                📅 {new Date(item.date).toLocaleDateString('zh-CN')}
              </p>}
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
                  查看链接 →
                </a>
              )}
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
