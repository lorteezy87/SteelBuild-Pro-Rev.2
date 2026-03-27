import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePMA } from '../usePMAContext';
import { useProjectContext } from '../../shared/useProjectContext';
import { getEscalationLevel, getEscalationStyle, countEscalations } from '../utils/escalationLogic';

export default function PMATasks() {
  const { tasks, setTasks } = usePMA();
  const { activeProject } = useProjectContext();
  const [actionItems, setActionItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [risks, setRisks] = useState([]);

  // Load action items from entity
  useEffect(() => {
    if (!activeProject?.id) return;
    const loadItems = async () => {
      try {
        setIsLoading(true);
        const items = await base44.entities.ActionItem.filter({ project_id: activeProject.id });
        setActionItems(items || []);
      } catch (e) {
        console.error('Failed to load action items:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadItems();
  }, [activeProject]);

  // Filter entity-backed tasks
  const openActionItems = actionItems.filter((a) => a.status === 'Open' || a.status === 'In Progress');
  const completedActionItems = actionItems.filter((a) => a.status === 'Complete');
  const completedTasks = tasks.filter((t) => t.completed);
  const pendingTasks = tasks.filter((t) => !t.completed);

  const updateActionItemStatus = async (id, status) => {
    try {
      await base44.entities.ActionItem.update(id, { status });
      setActionItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } catch (e) {
      console.error('Failed to update action item:', e);
    }
  };

  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const removeTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const escalationCount = countEscalations(actionItems, risks);

  if ((tasks.length === 0 && actionItems.length === 0) || isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(160,175,210,0.4)' }}>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {isLoading ? 'Loading action items...' : 'No tasks yet'}
        </div>
        <div style={{ fontSize: 10 }}>
          {isLoading ? 'Please wait' : 'Create tasks by typing "assign X to Y" or "due date Z"'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Escalation summary */}
      {escalationCount > 0 && (
        <div style={{
          background: 'rgba(255,61,61,0.10)',
          border: '1px solid rgba(255,61,61,0.25)',
          borderRadius: 8,
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          color: '#FF3D3D',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          ⚡ {escalationCount} item{escalationCount > 1 ? 's' : ''} need escalation
        </div>
      )}

      {/* Action Items from entity */}
      {openActionItems.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: '#FF9A60',
              letterSpacing: '0.08em',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            ⚑ Active ({openActionItems.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {openActionItems.map((item) => {
              const escalation = getEscalationLevel(item, risks);
              const escalationStyle = getEscalationStyle(escalation);
              return (
                <div
                  key={item.id}
                  style={{
                    background: escalationStyle.label ? escalationStyle.bg : 'rgba(255,122,47,0.06)',
                    border: escalationStyle.label ? escalationStyle.border : '1px solid rgba(255,122,47,0.15)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    animation: escalationStyle.pulse ? 'pulse 2s infinite' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={item.status === 'Complete'}
                      onChange={() =>
                        updateActionItemStatus(
                          item.id,
                          item.status === 'Complete' ? 'Open' : 'Complete'
                        )
                      }
                      style={{ marginTop: 4, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 11,
                          color: '#F2F4F8',
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          fontSize: 8,
                          marginBottom: 4,
                          color: 'rgba(160,175,210,0.5)',
                        }}
                      >
                        {item.assigned_to && (
                          <div>👤 {item.assigned_to}</div>
                        )}
                        {item.due_date && (
                          <div>📅 {new Date(item.due_date).toLocaleDateString()}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 7,
                            background:
                              item.priority === 'Critical' || item.priority === 'High'
                                ? 'rgba(255,61,61,0.2)'
                                : 'rgba(255,176,32,0.2)',
                            color:
                              item.priority === 'Critical' || item.priority === 'High'
                                ? '#FF3D3D'
                                : '#FFB020',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                          }}
                        >
                          {item.priority || 'NORMAL'}
                        </span>
                        {escalationStyle.label && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 7,
                              background: escalationStyle.bg,
                              color: escalationStyle.color,
                              border: escalationStyle.border,
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {escalationStyle.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
            </div>
            )}

      {/* Pending local tasks */}
      {pendingTasks.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: '#A78BFA',
              letterSpacing: '0.08em',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            ✦ Pending ({pendingTasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.15)',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(task.id)}
                    style={{ marginTop: 4, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: '#F2F4F8',
                        fontWeight: 500,
                        marginBottom: 4,
                      }}
                    >
                      {task.title}
                    </div>
                    {task.dueDate && (
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8,
                          color: 'rgba(160,175,210,0.5)',
                          marginBottom: 4,
                        }}
                      >
                        Due {new Date(task.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    {task.priority && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 7,
                          background:
                            task.priority === 'HIGH' ? 'rgba(255,61,61,0.2)' : 'rgba(255,176,32,0.2)',
                          color:
                            task.priority === 'HIGH' ? '#FF3D3D' : '#FFB020',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        {task.priority}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeTask(task.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(160,175,210,0.4)',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed action items */}
      {completedActionItems.length > 0 && (
        <details>
          <summary
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: 'rgba(160,175,210,0.4)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            ✓ Completed ({completedActionItems.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {completedActionItems.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(0, 214, 143, 0.06)',
                  border: '1px solid rgba(0, 214, 143, 0.15)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  opacity: 0.6,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => updateActionItemStatus(item.id, 'Open')}
                    style={{ marginTop: 4, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: '#F2F4F8',
                        textDecoration: 'line-through',
                        marginBottom: 4,
                      }}
                    >
                      {item.title}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Completed local tasks */}
      {completedTasks.length > 0 && (
        <details>
          <summary
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              color: 'rgba(160,175,210,0.4)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            ✓ Completed ({completedTasks.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {completedTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  background: 'rgba(0, 214, 143, 0.06)',
                  border: '1px solid rgba(0, 214, 143, 0.15)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  opacity: 0.6,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(task.id)}
                    style={{ marginTop: 4, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: '#F2F4F8',
                        textDecoration: 'line-through',
                        marginBottom: 4,
                      }}
                    >
                      {task.title}
                    </div>
                  </div>
                  <button
                    onClick={() => removeTask(task.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(160,175,210,0.4)',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}