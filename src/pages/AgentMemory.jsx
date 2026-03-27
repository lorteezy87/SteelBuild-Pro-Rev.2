import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function AgentMemory() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMemory, setNewMemory] = useState('');
  const [category, setCategory] = useState('general');
  const [adding, setAdding] = useState(false);

  const fetchMemories = async () => {
    try {
      const { data } = await base44.functions.invoke('agentMemory', {});
      setMemories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleAddMemory = async () => {
    if (!newMemory.trim()) return;
    setAdding(true);
    try {
      await base44.functions.invoke('agentMemory', {
        method: 'POST',
        content: newMemory,
        category: category
      });
      setNewMemory('');
      setCategory('general');
      fetchMemories();
    } catch (err) {
      console.error('Failed to add memory:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    try {
      await base44.functions.invoke('agentMemory', {
        method: 'DELETE',
        memoryId
      });
      fetchMemories();
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, color: 'var(--text-primary)', marginBottom: 4 }}>Agent Memory</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Manage persistent knowledge and context for the agent
        </p>
      </div>

      {/* Add Memory Form */}
      <div style={{
        background: 'var(--bg-surface-low)',
        border: '1px solid var(--accent-border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20
      }}>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FF9A60', letterSpacing: '0.08em', marginBottom: 8, display: 'block', textTransform: 'uppercase' }}>
          Add Memory Item
        </label>
        <textarea
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="Enter knowledge to persist..."
          style={{
            width: '100%',
            minHeight: 60,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: 10,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            resize: 'vertical',
            marginBottom: 10
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '8px 10px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12
            }}
          >
            <option value="general">General</option>
            <option value="project">Project</option>
            <option value="policy">Policy</option>
            <option value="decision">Decision</option>
          </select>
          <button
            onClick={handleAddMemory}
            disabled={adding || !newMemory.trim()}
            style={{
              flex: 1,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              color: 'white',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: adding || !newMemory.trim() ? 0.5 : 1
            }}
          >
            {adding ? 'Adding...' : '+ Add Memory'}
          </button>
        </div>
      </div>

      {/* Memory List */}
      <div>
        <h2 style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Stored Items ({memories.length})
        </h2>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(160,175,210,0.4)' }}>Loading...</div>
        ) : memories.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface-low)',
            border: '1px dashed var(--accent-border)',
            borderRadius: 8,
            padding: 20,
            textAlign: 'center',
            color: 'rgba(160,175,210,0.5)'
          }}>
            No memories stored yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memories.map((mem) => (
              <div
                key={mem.id}
                style={{
                  background: 'var(--bg-surface-low)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    marginBottom: 6
                  }}>
                    {mem.content || mem.text}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                    {mem.category && (
                      <span style={{
                        background: 'var(--accent-muted)',
                        color: 'var(--accent)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {mem.category}
                      </span>
                    )}
                    <span style={{ color: 'rgba(160,175,210,0.4)' }}>
                      {mem.created_at ? new Date(mem.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteMemory(mem.id)}
                  style={{
                    background: 'var(--danger-muted)',
                    border: '1px solid var(--danger-border)',
                    color: 'var(--status-error)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
