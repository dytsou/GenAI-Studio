import { useMemo } from 'react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { SchemaField } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { Plus, Trash2, Download, Table2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import './SchemaWorkspace.css';

export function SchemaWorkspace() {
  const { schemaFields, setSchemaFields } = useSettingsStore();
  const { chats, activeChatId } = useChatStore();

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

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
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
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
        <h3>Schema Builder</h3>
        <button className="add-field-btn" onClick={handleAddField}>
          <Plus size={16} /> Add Field
        </button>
      </div>

      <div className="schema-table-container">
        <table className="schema-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Type</th>
              <th>Req</th>
              <th>Desc</th>
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

      <div className="schema-preview">
        <h4>JSON Preview</h4>
        <pre>{JSON.stringify(generatedSchema.json_schema.schema, null, 2)}</pre>
      </div>

      <div className="schema-exports">
        <h4>Outputs</h4>
        {hasFormattingError && <div className="validation-error">Last response is not valid JSON.</div>}
        <div className="export-buttons">
          <button className="export-btn" disabled={!parsedJson} onClick={exportJson}>
            <Download size={14} /> JSON
          </button>
          <button className="export-btn" disabled={!isArrayResponse} onClick={exportCsv} title={!isArrayResponse ? 'Only available when array' : ''}>
            <Table2 size={14} /> CSV
          </button>
        </div>
      </div>
    </div>
  );
}
