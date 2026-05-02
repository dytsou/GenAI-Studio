import { useMemo, useState } from 'react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { SchemaField } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { Plus, Trash2, Download, Table2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import './SchemaWorkspace.css';

export function SchemaWorkspace({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { schemaFields, setSchemaFields } = useSettingsStore();
  const { chats, activeChatId } = useChatStore();

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages;

  const [editDraft, setEditDraft] = useState<SchemaField | null>(null);

  const handleAddField = () => {
    setSchemaFields([...schemaFields, {
      id: uuidv4(),
      name: `field_${schemaFields.length + 1}`,
      type: 'string',
      required: false,
      description: ''
    }]);
  };

  const handleUpdateField = (id: string, updates: Partial<SchemaField>) => {
    setSchemaFields(schemaFields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleDeleteField = (id: string) => {
    setSchemaFields(schemaFields.filter(f => f.id !== id));
  };

  const openEdit = (field: SchemaField) => {
    setEditDraft({ ...field });
  };

  const closeEdit = () => setEditDraft(null);

  const saveEdit = () => {
    if (!editDraft) return;
    const { id, ...updates } = editDraft;
    handleUpdateField(id, updates);
    closeEdit();
  };

  const generatedSchema = useMemo(() => {
    type JsonSchemaProperty = {
      type: SchemaField['type'];
      description: string;
      items?: { type: 'string' };
    };

    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    schemaFields.forEach(field => {
      properties[field.name] = {
        type: field.type,
        description: field.description
      };
      if (field.type === 'array') {
        properties[field.name].items = { type: 'string' }; // simple fallback
      }
      if (field.required) {
        required.push(field.name);
      }
    });

    return {
      type: "json_schema",
      json_schema: {
        name: "user_defined_schema",
        strict: true,
        schema: {
          type: "object",
          properties,
          required,
          additionalProperties: false
        }
      }
    };
  }, [schemaFields]);

  // Find last assistant message to determine exportability
  const lastAssistantMessage = useMemo(() => {
    const msgs = messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i];
    }
    return null;
  }, [messages]);

  const parsedJson = useMemo(() => {
    if (!lastAssistantMessage) return null;
    try {
      return JSON.parse(lastAssistantMessage.content);
    } catch {
      return null;
    }
  }, [lastAssistantMessage]);

  const isArrayResponse = Array.isArray(parsedJson);
  const hasFormattingError = lastAssistantMessage && !parsedJson && lastAssistantMessage.content.trim() !== '';

  const exportJson = () => {
    if (!parsedJson) return;
    const blob = new Blob([JSON.stringify(parsedJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.json';
    a.click();
  };

  const exportCsv = () => {
    if (!isArrayResponse || !parsedJson || parsedJson.length === 0) return;
    const rows = parsedJson as Array<Record<string, unknown>>;
    const keys = Object.keys(rows[0] || {});
    const csvRows = [
      keys.join(','),
      ...rows.map((row) => keys.map((k: string) => JSON.stringify(row[k] ?? '')).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.csv';
    a.click();
  };

  return (
    <div className="schema-workspace">
      <div className="schema-header">
        <h3 className="schema-title">{t('schema.title')}</h3>
        <button
          className="schema-close-btn"
          onClick={onClose}
          aria-label={t('schema.close')}
          type="button"
        >
          <X size={16} />
        </button>
        <button className="add-field-btn" onClick={handleAddField}>
          <Plus size={16} /> {t('schema.addField')}
        </button>
      </div>

      <div className="schema-table-container">
        <table className="schema-table">
          <thead>
            <tr>
              <th>{t('schema.property')}</th>
              <th>{t('schema.type')}</th>
              <th>{t('schema.req')}</th>
              <th>{t('schema.desc')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {schemaFields.map(field => (
              <tr key={field.id}>
                <td>
                  <input 
                    type="text" 
                    value={field.name}
                    onChange={e => handleUpdateField(field.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <select 
                    value={field.type}
                    onChange={e => handleUpdateField(field.id, { type: e.target.value as SchemaField['type'] })}
                  >
                    <option value="string">Str</option>
                    <option value="number">Num</option>
                    <option value="boolean">Bool</option>
                    <option value="array">Arr</option>
                    <option value="object">Obj</option>
                  </select>
                </td>
                <td>
                  <input 
                    type="checkbox" 
                    checked={field.required}
                    onChange={e => handleUpdateField(field.id, { required: e.target.checked })}
                  />
                </td>
                <td>
                  <input 
                    type="text" 
                    value={field.description}
                    onChange={e => handleUpdateField(field.id, { description: e.target.value })}
                  />
                </td>
                <td>
                  <button className="delete-field-btn" onClick={() => handleDeleteField(field.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="schema-mobile-list">
        {schemaFields.map((field) => (
          <div key={field.id} className="schema-mobile-row">
            <div className="schema-mobile-meta">
              <div className="schema-mobile-name" title={field.name}>
                {field.name}
              </div>
              <div className="schema-mobile-sub">
                <span className="schema-pill">{field.type}</span>
                <span className="schema-pill">
                  {field.required ? t('schema.required') : t('schema.optional')}
                </span>
              </div>
            </div>
            <button type="button" className="schema-edit-btn" onClick={() => openEdit(field)}>
              {t('schema.edit')}
            </button>
          </div>
        ))}
      </div>

      <div className="schema-preview">
        <h4>{t('schema.jsonPreview')}</h4>
        <pre>{JSON.stringify(generatedSchema.json_schema.schema, null, 2)}</pre>
      </div>

      <div className="schema-exports">
        <h4>{t('schema.outputs')}</h4>
        {hasFormattingError && <div className="validation-error">{t('schema.invalidJson')}</div>}
        <div className="export-buttons">
          <button className="export-btn" disabled={!parsedJson} onClick={exportJson}>
            <Download size={14} /> JSON
          </button>
          <button
            className="export-btn"
            disabled={!isArrayResponse}
            onClick={exportCsv}
            title={!isArrayResponse ? t('schema.onlyArrayCsv') : ''}
          >
            <Table2 size={14} /> CSV
          </button>
        </div>
      </div>

      {editDraft && (
        <div
          className="schema-edit-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeEdit}
        >
          <div className="schema-edit-popout" onClick={(e) => e.stopPropagation()}>
            <div className="schema-edit-header">
              <h4>{t('schema.editProperty')}</h4>
              <button
                className="schema-edit-close"
                onClick={closeEdit}
                aria-label={t('schema.closeEdit')}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveEdit();
              }}
              className="schema-edit-form"
            >
              <label className="schema-edit-label">
                {t('schema.property')}
                <input
                  type="text"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                />
              </label>

              <label className="schema-edit-label">
                {t('schema.type')}
                <select
                  value={editDraft.type}
                  onChange={(e) =>
                    setEditDraft((prev) =>
                      prev ? { ...prev, type: e.target.value as SchemaField['type'] } : prev
                    )
                  }
                >
                  <option value="string">Str</option>
                  <option value="number">Num</option>
                  <option value="boolean">Bool</option>
                  <option value="array">Arr</option>
                  <option value="object">Obj</option>
                </select>
              </label>

              <label className="schema-edit-label schema-edit-checkbox">
                <input
                  type="checkbox"
                  checked={editDraft.required}
                  onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, required: e.target.checked } : prev))}
                />
                {t('schema.required')}
              </label>

              <label className="schema-edit-label">
                {t('schema.description')}
                <input
                  type="text"
                  value={editDraft.description}
                  onChange={(e) =>
                    setEditDraft((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                />
              </label>

              <div className="schema-edit-actions">
                <button
                  type="button"
                  className="schema-delete-edit-btn"
                  onClick={() => {
                    handleDeleteField(editDraft.id);
                    closeEdit();
                  }}
                >
                  <Trash2 size={14} /> {t('schema.delete')}
                </button>

                <div className="schema-edit-actions-right">
                  <button type="button" className="schema-cancel-edit-btn" onClick={closeEdit}>
                    {t('schema.cancel')}
                  </button>
                  <button type="submit" className="schema-save-edit-btn">
                    {t('schema.save')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
