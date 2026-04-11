import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';

export default function AgentMemory() {
  const qc = useQueryClient();
  const [newMemory, setNewMemory] = useState('');
  const [category, setCategory] = useState('general');

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ['agent-memory'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('agentMemory', {});
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const addMut = useMutation({
    mutationFn: ({ content, category }) =>
      base44.functions.invoke('agentMemory', { method: 'POST', content, category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-memory'] });
      setNewMemory('');
      setCategory('general');
      toast.success('Memory added');
    },
    onError: (err) => toast.error('Failed to add memory: ' + (err?.message || 'Unknown error')),
  });

  const deleteMut = useMutation({
    mutationFn: (memoryId) =>
      base44.functions.invoke('agentMemory', { method: 'DELETE', memoryId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-memory'] });
      toast.success('Memory deleted');
    },
    onError: (err) => toast.error('Failed to delete memory: ' + (err?.message || 'Unknown error')),
  });

  const handleAdd = () => {
    if (!newMemory.trim()) return;
    addMut.mutate({ content: newMemory, category });
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
            marginBottom: 10,
            boxSizing: 'border-box',
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
            onClick={handleAdd}
            disabled={addMut.isPending || !newMemory.trim()}
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
              opacity: addMut.isPending || !newMemory.trim() ? 0.5 : 1
            }}
          >
            {addMut.isPending ? 'Adding...' : '+ Add Memory'}
          </button>
        </div>
      </div>

      {/* Memory List */}
      <div>
        <h2 style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Stored Items ({memories.length})
        </h2>

        {isLoading ? (
          <LoadingSkeleton variant="table" rows={3} />
        ) : memories.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface-low)',
            border: '1px dashed var(--accent-border)',
            borderRadius: 8,
            padding: 20,
            textAlign: 'center',
            color: 'var(--text-muted)',
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
                    <span style={{ color: 'var(--text-muted)' }}>
                      {mem.created_at ? new Date(mem.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteMut.mutate(mem.id)}
                  disabled={deleteMut.isPending}
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
